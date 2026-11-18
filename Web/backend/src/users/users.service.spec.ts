// Unit tests for UsersService
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { AuthStateService } from '../auth/auth-state.service';
import { ContactPolicy } from './contact-policy';

const CURRENT_PW = 'Current@123';
const NEW_PW = 'NewPass@456';
const CURRENT_HASH = bcrypt.hashSync(CURRENT_PW, 10);

const mockContacts = { scopeOf: jest.fn() };

describe('UsersService', () => {
  let service: UsersService;

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AuthStateService, useValue: { invalidateUser: jest.fn() } },
        { provide: ContactPolicy, useValue: mockContacts },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ── searchUsers ───────────────────────────────────────────────────────
  // The chat "new conversation" picker and the leave replacement picker: only people the
  // caller may reach (ContactPolicy, shared with ChatService.createConversation)
  describe('searchUsers', () => {
    const staff = { sub: 'staff-1', role: 'office_staff', unitScope: 'KV2' };
    const searchSql = () =>
      String((mockDataSource.query.mock.calls as unknown[][])[0][0]);
    const searchParams = () =>
      (mockDataSource.query.mock.calls as unknown[][])[0][1] as unknown[];

    beforeEach(() => {
      mockContacts.scopeOf.mockReset();
      mockContacts.scopeOf.mockResolvedValue({ units: ['KV2'], userIds: [] });
    });

    it('limits the results to the caller contact scope, active accounts and never the caller', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.searchUsers(staff, 'Tran', 20);

      expect(mockContacts.scopeOf).toHaveBeenCalledWith(staff);
      const sql = searchSql();
      expect(sql).toMatch(/u\.status = 'active'/);
      expect(sql).toMatch(/u\.id <> \$1/);
      expect(sql).toMatch(/unnest\(\$3::text\[\]\) AS cu\(code\)/);
      expect(sql).toMatch(/u\.id = ANY\(\$4::uuid\[\]\)/);
      expect(searchParams().slice(0, 4)).toEqual([
        'staff-1',
        '%Tran%',
        ['KV2'],
        [],
      ]);
    });

    it('passes a ward-wide scope as a null unit list', async () => {
      mockContacts.scopeOf.mockResolvedValueOnce({ units: null, userIds: [] });
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.searchUsers(
        { sub: 'w', role: 'police_ward', unitScope: null },
        'Tran',
      );

      expect(searchParams()[2]).toBeNull();
    });

    it('never selects password, MFA or other credential columns', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.searchUsers(staff, 'Tran');

      expect(searchSql()).not.toMatch(/password|mfa|totp|secret|\bu\.\*/i);
    });

    // A person holding several roles is one row: the primary role first, then the others
    it('returns one row per person with the primary role and every role', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'u-1',
          username: 'tranb',
          fullName: 'Trần Văn B',
          status: 'active',
          roleCodes: ['dqtv', 'police_area'],
        },
        {
          id: 'u-2',
          username: 'noroles',
          fullName: 'Không Vai Trò',
          status: 'active',
          roleCodes: [],
        },
      ]);

      await expect(service.searchUsers(staff, 'Tran')).resolves.toEqual([
        {
          id: 'u-1',
          username: 'tranb',
          fullName: 'Trần Văn B',
          status: 'active',
          role: 'police_area',
          roles: ['police_area', 'dqtv'],
        },
        {
          id: 'u-2',
          username: 'noroles',
          fullName: 'Không Vai Trò',
          status: 'active',
          role: null,
          roles: [],
        },
      ]);
      expect(searchSql()).toMatch(/GROUP BY u\.id/);
    });

    // % and _ typed by a user are text, not LIKE wildcards
    it('escapes LIKE wildcards in the query', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.searchUsers(staff, ' 50%_a\\b ');

      expect(searchParams()[1]).toBe('%50\\%\\_a\\\\b%');
      expect(searchSql()).toMatch(/ESCAPE '\\'/);
    });

    it.each([[''], ['  '], [' a ']])(
      'rejects a query shorter than two characters (%j) without querying',
      async (q) => {
        await expect(service.searchUsers(staff, q)).rejects.toThrow(
          new BadRequestException('search_query_too_short'),
        );
        expect(mockDataSource.query).not.toHaveBeenCalled();
        expect(mockContacts.scopeOf).not.toHaveBeenCalled();
      },
    );

    it('bounds the number of rows to between 1 and 50', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.searchUsers(staff, 'Tran', 500);
      await service.searchUsers(staff, 'Tran', 0);

      const calls = mockDataSource.query.mock.calls as unknown[][];
      expect((calls[0][1] as unknown[]).at(-1)).toBe(50);
      expect((calls[1][1] as unknown[]).at(-1)).toBe(1);
    });

    it('propagates a scope refusal without querying users', async () => {
      mockContacts.scopeOf.mockRejectedValueOnce(
        new ForbiddenException('no_unit_scope'),
      );

      await expect(
        service.searchUsers(
          { sub: 'p', role: 'police_area', unitScope: null },
          'Tran',
        ),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  // ── getProfile ────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns user data when user exists', async () => {
      const fakeUser = {
        id: 'user-1',
        username: 'nguyenvana',
        fullName: 'Nguyen Van A',
        email: 'a@example.com',
        phone: '0900000001',
        status: 'active',
        roleCodes: ['dqtv_member'],
        unitScope: 'UNIT_001',
      };
      mockDataSource.query.mockResolvedValueOnce([fakeUser]);

      const result = await service.getProfile('user-1');
      expect(result).toEqual({
        id: 'user-1',
        username: 'nguyenvana',
        fullName: 'Nguyen Van A',
        email: 'a@example.com',
        phone: '0900000001',
        status: 'active',
        role: 'dqtv_member',
        roles: ['dqtv_member'],
        unitScope: 'UNIT_001',
      });
    });

    // Same role and scope the auth token carries, one row however many roles/scopes exist
    it('aggregates every role with the primary first and resolves one unit scope', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'user-1',
          username: 'x',
          roleCodes: ['dqtv', 'police_area'],
          unitScope: 'KV1',
        },
      ]);

      const result = await service.getProfile('user-1');

      expect(result).toMatchObject({
        role: 'police_area',
        roles: ['police_area', 'dqtv'],
      });
      expect(result).not.toHaveProperty('roleCodes');
      const sql = String(
        (mockDataSource.query.mock.calls as unknown[][])[0][0],
      );
      expect(sql).toMatch(/array_agg\(DISTINCT r\.code\)/);
      expect(sql).toMatch(/GROUP BY u\.id/);
      expect(sql).toMatch(/ORDER BY CASE uus\.scope_type/);
    });

    it('reports a null role for an account without roles', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: 'user-1', username: 'x', roleCodes: [], unitScope: null },
      ]);

      await expect(service.getProfile('user-1')).resolves.toMatchObject({
        role: null,
        roles: [],
      });
    });

    it('throws NotFoundException when user not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.getProfile('unknown-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getPoliceProfile ──────────────────────────────────────────────────

  describe('getPoliceProfile', () => {
    it('returns badge/rank/station/department fields', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          badge_number: 'CA-001',
          rank: 'Thiếu tá',
          station: 'Công an phường X',
          department: 'Đội PCCC',
          username: 'police1',
          full_name: 'Tran Van B',
        },
      ]);

      const result = await service.getPoliceProfile('user-1');
      expect(result.badgeNumber).toBe('CA-001');
      expect(result.rank).toBe('Thiếu tá');
      expect(result.station).toBe('Công an phường X');
      expect(result.department).toBe('Đội PCCC');
      expect(result.username).toBe('police1');
      expect(result.fullName).toBe('Tran Van B');
    });

    it('returns null fields when police columns are null', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          badge_number: null,
          rank: null,
          station: null,
          department: null,
          username: 'police2',
          full_name: 'Le Van C',
        },
      ]);

      const result = await service.getPoliceProfile('user-2');
      expect(result.badgeNumber).toBeNull();
      expect(result.rank).toBeNull();
    });

    it('throws NotFoundException when user not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.getPoliceProfile('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── changePassword ─────────────────────────────────────────────────────
  // The whole change runs in one transaction holding the account row, and ends with
  // every session and open MFA challenge of the account ending (Codex round 3: a
  // challenge opened with the old password survived the change)
  describe('changePassword', () => {
    const mockManager = { query: jest.fn() };
    const mockAuthState = { invalidateUser: jest.fn() };
    let history: { password_hash: string }[];
    let historyCount: string;
    let user: { password_hash: string } | null;

    const managerSql = () =>
      (mockManager.query.mock.calls as unknown[][]).map((c) => String(c[0]));

    beforeEach(async () => {
      history = [];
      historyCount = '1';
      user = { password_hash: CURRENT_HASH };
      mockManager.query.mockReset();
      mockManager.query.mockImplementation((sql: string) => {
        if (
          /SELECT password_hash FROM users WHERE id = \$1 FOR UPDATE/.test(sql)
        ) {
          return Promise.resolve(user ? [user] : []);
        }
        if (/SELECT password_hash FROM user_password_history/.test(sql)) {
          return Promise.resolve(history);
        }
        if (/SELECT COUNT\(\*\)/.test(sql)) {
          return Promise.resolve([{ count: historyCount }]);
        }
        return Promise.resolve([]);
      });
      mockAuthState.invalidateUser.mockReset();
      mockAuthState.invalidateUser.mockResolvedValue(2);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          {
            provide: getDataSourceToken(),
            useValue: {
              ...mockDataSource,
              transaction: jest.fn(
                (work: (mgr: typeof mockManager) => unknown) =>
                  work(mockManager),
              ),
            },
          },
          { provide: AuthStateService, useValue: mockAuthState },
          { provide: ContactPolicy, useValue: mockContacts },
        ],
      }).compile();
      service = module.get<UsersService>(UsersService);
    });

    test('test_changePassword_throws_BadRequest_for_wrong_current_password', async () => {
      await expect(
        service.changePassword('uid-1', 'WrongPass!1', NEW_PW),
      ).rejects.toThrow(new BadRequestException('invalid_credentials'));
      expect(mockAuthState.invalidateUser).not.toHaveBeenCalled();
    });

    test('test_changePassword_throws_NotFound_for_missing_user', async () => {
      user = null;

      await expect(
        service.changePassword('uid-missing', CURRENT_PW, NEW_PW),
      ).rejects.toThrow(NotFoundException);
    });

    test('test_changePassword_throws_BadRequest_for_complexity_failure', async () => {
      // Too short, no uppercase, no special char
      await expect(
        service.changePassword('uid-1', CURRENT_PW, 'short1'),
      ).rejects.toThrow(new BadRequestException('password_complexity'));
    });

    test('test_changePassword_throws_BadRequest_for_password_reuse', async () => {
      history = [{ password_hash: bcrypt.hashSync(NEW_PW, 6) }];

      await expect(
        service.changePassword('uid-1', CURRENT_PW, NEW_PW),
      ).rejects.toThrow(new BadRequestException('password_reuse'));
      expect(mockAuthState.invalidateUser).not.toHaveBeenCalled();
    });

    test('changes the password under the account row lock and records it in the history', async () => {
      await service.changePassword('uid-1', CURRENT_PW, NEW_PW);

      const sql = managerSql();
      const lock = sql.findIndex((s) => /FOR UPDATE/.test(s));
      const update = sql.findIndex((s) =>
        /UPDATE users SET password_hash = \$1, updated_at = NOW\(\) WHERE id = \$2/.test(
          s,
        ),
      );
      const insert = sql.findIndex((s) =>
        /INSERT INTO user_password_history/.test(s),
      );
      expect(lock).toBe(0);
      expect(update).toBeGreaterThan(lock);
      expect(insert).toBeGreaterThan(update);
    });

    test('ends every session and open MFA challenge of the account once changed', async () => {
      await service.changePassword('uid-1', CURRENT_PW, NEW_PW);

      expect(mockAuthState.invalidateUser).toHaveBeenCalledWith(
        mockManager,
        'uid-1',
      );
      const updateOrder =
        mockManager.query.mock.invocationCallOrder[
          managerSql().findIndex((s) =>
            /UPDATE users SET password_hash/.test(s),
          )
        ];
      expect(
        mockAuthState.invalidateUser.mock.invocationCallOrder[0],
      ).toBeGreaterThan(updateOrder);
    });

    test('test_changePassword_deletes_oldest_history_when_count_exceeds_5', async () => {
      historyCount = '6';

      await service.changePassword('uid-1', CURRENT_PW, NEW_PW);

      expect(
        managerSql().some((s) => /DELETE FROM user_password_history/.test(s)),
      ).toBe(true);
    });
  });
});
