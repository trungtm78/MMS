// A login or enrolment challenge: an opaque single-use token bound to one user and one
// purpose, short-lived, and closed after a handful of wrong codes
import { HttpStatus } from '@nestjs/common';
import { createHmac } from 'crypto';
import {
  CHALLENGE_TTL_SECONDS,
  MAX_CHALLENGE_ATTEMPTS,
  MfaChallengeService,
} from './mfa-challenge.service';

const KEY = Buffer.from('d'.repeat(64), 'hex');
const ID = '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d';
const NOW = new Date('2026-10-01T02:00:00Z');

const mgr = { query: jest.fn() };
const ds = { query: jest.fn() };
const sqlOf = (mock: jest.Mock, call: number) =>
  String((mock.mock.calls as unknown[][])[call][0]);
const paramsOf = (mock: jest.Mock, call: number) =>
  (mock.mock.calls as unknown[][])[call][1] as unknown[];
const hashOf = (secret: string) =>
  createHmac('sha256', KEY).update(secret).digest('hex');

async function expectHttpError(
  promise: Promise<unknown>,
  status: number,
  message: string,
) {
  await expect(promise).rejects.toMatchObject({
    message,
    status,
  });
}

describe('MfaChallengeService', () => {
  let service: MfaChallengeService;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'queueMicrotask',
      ],
    });
    service = new MfaChallengeService(ds as never, KEY);
  });
  afterEach(() => jest.useRealTimers());

  describe('issue', () => {
    it.each([
      ['verify', CHALLENGE_TTL_SECONDS.verify],
      ['setup', CHALLENGE_TTL_SECONDS.setup],
    ] as const)(
      'stores only a keyed hash of a %s token and returns id.secret',
      async (purpose, ttl) => {
        ds.query.mockResolvedValueOnce([{ id: ID }]);

        const { token, expiresAt } = await service.issue('user-1', purpose, {
          pendingSecret: purpose === 'setup' ? 'v1:encrypted' : undefined,
        });

        const [id, secret] = token.split('.');
        expect(id).toBe(ID);
        expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(expiresAt).toEqual(new Date(NOW.getTime() + ttl * 1000));
        expect(sqlOf(ds.query, 0)).toMatch(/INSERT INTO auth_challenges/);
        expect(paramsOf(ds.query, 0)).toEqual([
          'user-1',
          purpose,
          hashOf(secret),
          purpose === 'setup' ? 'v1:encrypted' : null,
          expiresAt,
        ]);
        expect(JSON.stringify(ds.query.mock.calls)).not.toContain(secret);
      },
    );

    it('keeps the verify window short and the setup window long enough to scan a QR code', () => {
      expect(CHALLENGE_TTL_SECONDS).toEqual({ verify: 300, setup: 600 });
      expect(MAX_CHALLENGE_ATTEMPTS).toBe(5);
    });
  });

  describe('load', () => {
    const SECRET = 'A'.repeat(43);
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: ID,
      user_id: 'user-1',
      purpose: 'verify',
      secret_hash: hashOf(SECRET),
      pending_totp_secret: null,
      attempts: 0,
      expires_at: new Date(NOW.getTime() + 60_000),
      consumed_at: null,
      ...overrides,
    });

    it('locks the challenge row and returns it for a valid token', async () => {
      mgr.query.mockResolvedValueOnce([row({ attempts: 2 })]);

      await expect(
        service.load(mgr as never, `${ID}.${SECRET}`, 'verify'),
      ).resolves.toEqual({
        id: ID,
        userId: 'user-1',
        pendingSecret: null,
        attempts: 2,
        expiresAt: new Date(NOW.getTime() + 60_000),
      });
      expect(sqlOf(mgr.query, 0)).toMatch(
        /FROM auth_challenges[\s\S]*FOR UPDATE/,
      );
      expect(paramsOf(mgr.query, 0)).toEqual([ID]);
    });

    it.each(['', 'abc', ID, `${ID}.`, `not-a-uuid.${SECRET}`])(
      'rejects the malformed token %p without querying',
      async (token) => {
        await expectHttpError(
          service.load(mgr as never, token, 'verify'),
          HttpStatus.UNAUTHORIZED,
          'mfa_token_invalid',
        );
        expect(mgr.query).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['an unknown id', null],
      ['a different secret', row({ secret_hash: hashOf('B'.repeat(43)) })],
      ['another purpose', row({ purpose: 'setup' })],
      ['an expired challenge', row({ expires_at: new Date(NOW.getTime()) })],
      [
        'a consumed challenge',
        row({ consumed_at: new Date(NOW.getTime() - 1000) }),
      ],
    ])('treats %s as an invalid token', async (_label, stored) => {
      mgr.query.mockResolvedValueOnce(stored ? [stored] : []);

      await expectHttpError(
        service.load(mgr as never, `${ID}.${SECRET}`, 'verify'),
        HttpStatus.UNAUTHORIZED,
        'mfa_token_invalid',
      );
    });

    it('closes a challenge after too many wrong codes', async () => {
      mgr.query.mockResolvedValueOnce([
        row({ attempts: MAX_CHALLENGE_ATTEMPTS }),
      ]);

      await expectHttpError(
        service.load(mgr as never, `${ID}.${SECRET}`, 'verify'),
        HttpStatus.TOO_MANY_REQUESTS,
        'mfa_attempts_exceeded',
      );
    });
  });

  describe('recordFailure', () => {
    it('counts the wrong code and reports the attempts left', async () => {
      mgr.query.mockResolvedValueOnce([[{ attempts: 3 }], 1]);

      await expect(service.recordFailure(mgr as never, ID)).resolves.toBe(
        MAX_CHALLENGE_ATTEMPTS - 3,
      );
      expect(sqlOf(mgr.query, 0)).toMatch(
        /UPDATE auth_challenges SET attempts = attempts \+ 1/,
      );
    });
  });

  describe('setPendingSecret', () => {
    it('replaces the enrolment secret held by an open setup challenge', async () => {
      mgr.query.mockResolvedValueOnce([[{ id: ID }], 1]);

      await service.setPendingSecret(mgr as never, ID, 'v1:new');

      expect(sqlOf(mgr.query, 0)).toMatch(
        /UPDATE auth_challenges SET pending_totp_secret = \$2[\s\S]*purpose = 'setup'[\s\S]*consumed_at IS NULL/,
      );
      expect(paramsOf(mgr.query, 0)).toEqual([ID, 'v1:new']);
    });
  });

  describe('revokeOpen', () => {
    it('closes every open challenge of a user so an MFA change cannot be raced', async () => {
      mgr.query.mockResolvedValueOnce([[], 2]);

      await service.revokeOpen(mgr as never, 'user-1');

      expect(sqlOf(mgr.query, 0)).toMatch(
        /UPDATE auth_challenges SET consumed_at = now\(\)[\s\S]*user_id = \$1 AND consumed_at IS NULL/,
      );
      expect(paramsOf(mgr.query, 0)).toEqual(['user-1']);
    });
  });

  describe('consume', () => {
    it('marks the challenge used exactly once', async () => {
      mgr.query.mockResolvedValueOnce([[{ id: ID }], 1]);

      await expect(service.consume(mgr as never, ID)).resolves.toBeUndefined();
      expect(sqlOf(mgr.query, 0)).toMatch(
        /UPDATE auth_challenges SET consumed_at = now\(\)[\s\S]*consumed_at IS NULL/,
      );
    });

    it('refuses a challenge that was consumed concurrently', async () => {
      mgr.query.mockResolvedValueOnce([[], 0]);

      await expectHttpError(
        service.consume(mgr as never, ID),
        HttpStatus.UNAUTHORIZED,
        'mfa_token_invalid',
      );
    });
  });
});
