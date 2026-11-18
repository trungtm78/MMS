// Whether an issued access token still speaks for its account (Codex round 3): the
// session it names must be live and the account unchanged since the token was issued
import { AuthStateService } from './auth-state.service';

const SID = '5d0c7a3e-9f1b-4c2d-8e6f-1a2b3c4d5e6f';
const USER = '11111111-1111-4111-8111-111111111111';

const dataSource = { query: jest.fn() };
const sqlAt = (mock: jest.Mock, call: number) =>
  String((mock.mock.calls as unknown[][])[call][0]);
const paramsAt = (mock: jest.Mock, call: number) =>
  (mock.mock.calls as unknown[][])[call][1] as unknown[];

describe('AuthStateService', () => {
  let service: AuthStateService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AuthStateService(dataSource as never);
  });

  describe('isAccessValid', () => {
    it('accepts a token whose session is live and whose account version is current', async () => {
      dataSource.query.mockResolvedValueOnce([{ ok: true }]);

      await expect(
        service.isAccessValid({ sub: USER, sid: SID, ver: 3 }),
      ).resolves.toBe(true);

      const sql = sqlAt(dataSource.query, 0);
      expect(sql).toMatch(
        /FROM sessions s[\s\S]*JOIN users u ON u\.id = s\.user_id/,
      );
      expect(sql).toMatch(/s\.revoked_at IS NULL/);
      expect(sql).toMatch(/s\.expires_at > now\(\)/);
      expect(sql).toMatch(/u\.status = 'active'/);
      expect(sql).toMatch(/u\.auth_version = \$3/);
      expect(sql).toMatch(/s\.auth_version = \$3/);
      expect(paramsAt(dataSource.query, 0)).toEqual([SID, USER, 3]);
    });

    it('refuses a token whose session was revoked or whose account changed', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.isAccessValid({ sub: USER, sid: SID, ver: 2 }),
      ).resolves.toBe(false);
    });

    // Tokens issued before sessions were named carry neither claim
    it.each([
      ['no session id', { sub: USER, ver: 1 }],
      ['no account version', { sub: USER, sid: SID }],
      ['a malformed session id', { sub: USER, sid: 'abc', ver: 1 }],
      ['a malformed subject', { sub: 'abc', sid: SID, ver: 1 }],
      ['a non-integer version', { sub: USER, sid: SID, ver: 1.5 }],
    ])('refuses a token with %s without querying', async (_label, claims) => {
      await expect(service.isAccessValid(claims)).resolves.toBe(false);
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  // The realtime gateway re-checks every socket it holds in one round trip
  describe('validAccess', () => {
    const SID2 = '6e1d8b4f-0a2c-4d3e-9f70-2b3c4d5e6f70';
    const SID3 = '7f2e9c50-1b3d-4e4f-8a81-3c4d5e6f7081';

    it('answers, in order, which tokens still work, in one query', async () => {
      dataSource.query.mockResolvedValueOnce([{ i: '1' }, { i: '3' }]);

      await expect(
        service.validAccess([
          { sub: USER, sid: SID, ver: 3 },
          { sub: USER, sid: SID2, ver: 2 },
          { sub: USER, sid: SID3, ver: 3 },
        ]),
      ).resolves.toEqual([true, false, true]);

      expect(dataSource.query).toHaveBeenCalledTimes(1);
      const sql = sqlAt(dataSource.query, 0);
      expect(sql).toMatch(
        /unnest\(\$1::uuid\[\], \$2::uuid\[\], \$3::bigint\[\]\) WITH ORDINALITY/,
      );
      // The same conditions as isAccessValid
      expect(sql).toMatch(/s\.revoked_at IS NULL/);
      expect(sql).toMatch(/s\.expires_at > now\(\)/);
      expect(sql).toMatch(/u\.status = 'active'/);
      expect(sql).toMatch(/u\.auth_version = c\.ver/);
      expect(sql).toMatch(/s\.auth_version = c\.ver/);
      expect(paramsAt(dataSource.query, 0)).toEqual([
        [SID, SID2, SID3],
        [USER, USER, USER],
        [3, 2, 3],
      ]);
    });

    it('refuses malformed claims without sending them', async () => {
      dataSource.query.mockResolvedValueOnce([{ i: '1' }]);

      await expect(
        service.validAccess([
          { sub: USER, sid: 'abc', ver: 1 },
          { sub: USER, sid: SID, ver: 3 },
        ]),
      ).resolves.toEqual([false, true]);
      expect(paramsAt(dataSource.query, 0)).toEqual([[SID], [USER], [3]]);
    });

    it('does not query for nothing', async () => {
      await expect(service.validAccess([])).resolves.toEqual([]);
      await expect(
        service.validAccess([{ sub: 'x', sid: SID, ver: 1 }]),
      ).resolves.toEqual([false]);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('checks a large number of tokens in bounded batches', async () => {
      const claims = Array.from({ length: 1_200 }, () => ({
        sub: USER,
        sid: SID,
        ver: 3,
      }));
      dataSource.query
        .mockResolvedValueOnce(
          Array.from({ length: 1_000 }, (_, i) => ({ i: String(i + 1) })),
        )
        .mockResolvedValueOnce([{ i: '200' }]);

      const valid = await service.validAccess(claims);

      expect(dataSource.query).toHaveBeenCalledTimes(2);
      expect(valid.filter(Boolean)).toHaveLength(1_001);
      expect(valid[1_199]).toBe(true);
      expect(valid[1_198]).toBe(false);
    });
  });

  describe('invalidateUser', () => {
    it('bumps the account version, then ends every session and open MFA challenge', async () => {
      const runner = { query: jest.fn() };
      runner.query
        .mockResolvedValueOnce([[{ auth_version: '4' }], 1])
        .mockResolvedValue([[], 0]);

      await expect(service.invalidateUser(runner, USER)).resolves.toBe(4);

      expect(sqlAt(runner.query, 0)).toMatch(
        /UPDATE users SET auth_version = auth_version \+ 1[\s\S]*WHERE id = \$1[\s\S]*RETURNING auth_version/,
      );
      expect(sqlAt(runner.query, 1)).toMatch(
        /UPDATE sessions SET revoked_at = now\(\)[\s\S]*user_id = \$1 AND revoked_at IS NULL/,
      );
      expect(sqlAt(runner.query, 2)).toMatch(
        /UPDATE auth_challenges SET consumed_at = now\(\)[\s\S]*user_id = \$1 AND consumed_at IS NULL/,
      );
      for (const call of [0, 1, 2]) {
        expect(paramsAt(runner.query, call)).toEqual([USER]);
      }
    });
  });
});
