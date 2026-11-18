import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DeviceSessionsService } from './device-sessions.service';

const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
const manager = { query };
const dataSource = {
  query,
  transaction: jest.fn((work: (m: typeof manager) => unknown) => work(manager)),
};

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const user = { sub: 'u-1', role: 'dqtv', unitScope: null, sid: 's-current' };
const admin = {
  sub: 'admin-1',
  role: 'system_admin',
  unitScope: null,
  sid: 's-admin',
};
const origin = { ip: '10.0.0.1', userAgent: 'jest' };

const createdAt = new Date('2026-09-14T01:00:00Z');
const expiresAt = new Date('2026-09-21T01:00:00Z');
const row = (id: string, change: Record<string, unknown> = {}) => ({
  id,
  userId: 'u-1',
  userName: 'Nguyễn Văn An',
  ip: '10.0.0.1',
  userAgent: CHROME_WINDOWS,
  amr: ['pwd'],
  createdAt,
  expiresAt,
  ...change,
});

// TypeORM answers UPDATE ... RETURNING with [rows, rowCount]
const updated = (ids: string[]) => [ids.map((id) => ({ id })), ids.length];

describe('DeviceSessionsService', () => {
  let service: DeviceSessionsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeviceSessionsService,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(DeviceSessionsService);
    query.mockReset();
    dataSource.transaction.mockClear();
  });

  describe('list', () => {
    it('lists the caller live sessions, the current one marked and first', async () => {
      query.mockResolvedValueOnce([{ total: 2 }]).mockResolvedValueOnce([
        row('s-current'),
        row('s-phone', {
          userAgent: 'Dart/3.5 (dart:io)',
          amr: ['pwd', 'otp', 'mfa'],
          ip: null,
        }),
      ]);

      const result = await service.list(user, { page: 1, limit: 20 });

      expect(query.mock.calls[0][1]).toEqual(['u-1']);
      const [sql, params] = query.mock.calls[1] as [string, unknown[]];
      expect(params).toEqual(['u-1', 's-current', 20, 0]);
      expect(sql).toContain('s.revoked_at IS NULL');
      expect(sql).toContain('s.expires_at > now()');
      expect(sql).toMatch(/ORDER BY \(s\.id = \$2::uuid\) IS TRUE DESC/);
      expect(result).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        data: [
          {
            id: 's-current',
            userId: 'u-1',
            userName: 'Nguyễn Văn An',
            ip: '10.0.0.1',
            userAgent: CHROME_WINDOWS,
            deviceType: 'desktop',
            deviceName: 'Chrome – Windows',
            browser: 'Chrome',
            os: 'Windows',
            amr: ['pwd'],
            mfa: false,
            createdAt,
            lastActiveAt: createdAt,
            expiresAt,
            current: true,
          },
          {
            id: 's-phone',
            userId: 'u-1',
            userName: 'Nguyễn Văn An',
            ip: null,
            userAgent: 'Dart/3.5 (dart:io)',
            deviceType: 'mobile',
            deviceName: 'Ứng dụng MMS',
            browser: 'Ứng dụng MMS',
            os: null,
            amr: ['pwd', 'otp', 'mfa'],
            mfa: true,
            createdAt,
            lastActiveAt: createdAt,
            expiresAt,
            current: false,
          },
        ],
      });
    });

    it('refuses another user sessions to anyone but a system admin', async () => {
      await expect(service.list(user, { userId: 'u-2' })).rejects.toThrow(
        new ForbiddenException('insufficient_role'),
      );
      expect(query).not.toHaveBeenCalled();
    });

    it('lets a caller name themselves', async () => {
      query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
      await service.list(user, { userId: 'u-1' });
      expect(query.mock.calls[0][1]).toEqual(['u-1']);
    });

    it.each([
      ['a system admin', admin],
      [
        'a user holding system_admin among other roles',
        {
          ...admin,
          role: 'police_ward',
          roles: ['police_ward', 'system_admin'],
        },
      ],
    ])('lets %s read another user sessions', async (_label, actor) => {
      query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([row('s-x', { userId: 'u-2' })]);

      const result = await service.list(actor, { userId: 'u-2' });

      expect(query.mock.calls[0][1]).toEqual(['u-2']);
      expect(query.mock.calls[1][1]).toEqual(['u-2', 's-admin', 20, 0]);
      expect(result.data[0].current).toBe(false);
    });

    it('clamps paging', async () => {
      query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
      const result = await service.list(user, { page: -1, limit: 999 });
      expect(query.mock.calls[1][1]).toEqual(['u-1', 's-current', 100, 0]);
      expect(result).toMatchObject({ page: 1, limit: 100 });
    });
  });

  describe('revoke', () => {
    it('revokes one of the caller sessions and audits it in the same transaction', async () => {
      query
        .mockResolvedValueOnce(updated(['s-phone']))
        .mockResolvedValueOnce(undefined);

      await service.revoke(user, 's-phone', origin);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/UPDATE sessions SET revoked_at = now\(\)/);
      expect(sql).toMatch(
        /WHERE id = \$1 AND user_id = \$2 AND revoked_at IS NULL/,
      );
      expect(params).toEqual(['s-phone', 'u-1']);
      const [auditSql, auditParams] = query.mock.calls[1] as [
        string,
        unknown[],
      ];
      expect(auditSql).toMatch(/INSERT INTO audit_logs/);
      expect(auditParams).toEqual([
        'u-1',
        'session.revoked',
        'session',
        's-phone',
        JSON.stringify({ userId: 'u-1', current: false }),
        '10.0.0.1',
        'jest',
      ]);
    });

    it('answers 404 for a session that is not the caller, already revoked or unknown', async () => {
      query.mockResolvedValueOnce(updated([]));
      await expect(service.revoke(user, 's-other', origin)).rejects.toThrow(
        new NotFoundException('session_not_found'),
      );
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('lets the caller end the session they are using', async () => {
      query
        .mockResolvedValueOnce(updated(['s-current']))
        .mockResolvedValueOnce(undefined);
      await service.revoke(user, 's-current', origin);
      expect(query.mock.calls[1][1]).toContain(
        JSON.stringify({ userId: 'u-1', current: true }),
      );
    });
  });

  describe('revokeOthers', () => {
    it('revokes every other live session of the caller and audits the ids', async () => {
      query
        .mockResolvedValueOnce(updated(['s-a', 's-b']))
        .mockResolvedValueOnce(undefined);

      await expect(service.revokeOthers(user, origin)).resolves.toEqual({
        revoked: 2,
      });

      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('id <> $2::uuid');
      expect(sql).toContain('expires_at > now()');
      expect(params).toEqual(['u-1', 's-current']);
      expect(query.mock.calls[1][1]).toEqual([
        'u-1',
        'session.others_revoked',
        'user',
        'u-1',
        JSON.stringify({
          keptSessionId: 's-current',
          sessionIds: ['s-a', 's-b'],
          count: 2,
        }),
        '10.0.0.1',
        'jest',
      ]);
    });

    it('writes no audit row when nothing was revoked', async () => {
      query.mockResolvedValueOnce(updated([]));
      await expect(service.revokeOthers(user, origin)).resolves.toEqual({
        revoked: 0,
      });
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('refuses a token that names no session rather than ending all of them', async () => {
      await expect(
        service.revokeOthers({ ...user, sid: undefined }, origin),
      ).rejects.toThrow(new UnauthorizedException('invalid_token'));
      expect(query).not.toHaveBeenCalled();
    });
  });
});
