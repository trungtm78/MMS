import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuthStateService } from '../auth/auth-state.service';
import type { JwtPayload } from '../auth/auth.service';

const mockManager = { query: jest.fn() };

const mockDataSource = {
  query: jest.fn(),
  transaction: jest.fn(),
};

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];
const sqlOf = (mock: jest.Mock, call: number) => String(callsOf(mock)[call][0]);
const paramsOf = (mock: jest.Mock, call: number) =>
  callsOf(mock)[call][1] as unknown[];

const systemAdmin: JwtPayload = {
  sub: 'admin-id',
  username: 'admin',
  role: 'system_admin',
  unitScope: null,
};

const officeStaff: JwtPayload = {
  sub: 'staff-id',
  username: 'staff',
  role: 'office_staff',
  unitScope: 'UNIT_001',
};

// scope_codes: one entry per user_unit_scopes row, '*' for a ward-wide ('all') scope
const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  username: 'john',
  full_name: 'John Doe',
  email: 'john@test.com',
  phone: null,
  status: 'active',
  created_at: new Date().toISOString(),
  role_codes: ['dqtv'],
  unit_code: 'UNIT_001',
  scope_codes: ['UNIT_001'],
  ...overrides,
});

const ROLE_IDS: Record<string, string> = {
  dqtv: 'role-dqtv',
  office_staff: 'role-office',
};

// A mutation transaction: the target row is locked and re-read before anything is written
function transactionTarget(row: Record<string, unknown> | null) {
  mockManager.query.mockImplementation(
    (sql: string, params: unknown[] = []) => {
      if (/SELECT id FROM users WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return Promise.resolve(row ? [{ id: row.id }] : []);
      }
      if (/FROM users u[\s\S]*WHERE u\.id = \$1/.test(sql)) {
        return Promise.resolve(row ? [row] : []);
      }
      if (/SELECT id FROM roles WHERE code = \$1/.test(sql)) {
        const id = ROLE_IDS[params[0] as string];
        return Promise.resolve(id ? [{ id }] : []);
      }
      return Promise.resolve([]);
    },
  );
}

const executed = () => callsOf(mockManager.query).map((c) => String(c[0]));
const indexOf = (pattern: RegExp) =>
  executed().findIndex((s) => pattern.test(s));
const WRITES = /^\s*(UPDATE|DELETE|INSERT)/;

// Codex round 3: revoking refresh sessions left issued access tokens and open MFA
// challenges working; the account version is bumped instead, in the same transaction
const mockAuthState = { invalidateUser: jest.fn() };
function expectInvalidatedAfter(write: RegExp) {
  const index = indexOf(write);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(mockAuthState.invalidateUser).toHaveBeenCalledTimes(1);
  expect(mockAuthState.invalidateUser).toHaveBeenCalledWith(
    mockManager,
    'user-1',
  );
  expect(
    mockAuthState.invalidateUser.mock.invocationCallOrder[0],
  ).toBeGreaterThan(mockManager.query.mock.invocationCallOrder[index]);
}

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AuthStateService, useValue: mockAuthState },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.resetAllMocks();
    mockDataSource.transaction.mockImplementation(
      (work: (mgr: typeof mockManager) => unknown) => work(mockManager),
    );
    mockAuthState.invalidateUser.mockResolvedValue(1);
  });

  describe('listUsers', () => {
    it('system_admin can see all users regardless of unit', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([]);
      await expect(
        service.listUsers(systemAdmin, 1, 20),
      ).resolves.toMatchObject({ total: 5 });
      expect(paramsOf(mockDataSource.query, 0)).toEqual([]);
    });

    // The list shows exactly the accounts the caller may open: scoped to their unit and
    // to no other unit, and not ward-wide
    it('office_staff lists only accounts that belong to their unit alone', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '3' }])
        .mockResolvedValueOnce([]);
      await service.listUsers(officeStaff, 1, 20, 'UNIT_999');
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['UNIT_001']);
      expect(sqlOf(mockDataSource.query, 0)).toMatch(
        /EXISTS \([\s\S]*fu\.code = \$1[\s\S]*NOT EXISTS \([\s\S]*scope_type = 'all' OR ou\.code <> \$1/,
      );
    });

    it('office_staff without a unit scope cannot list users', async () => {
      await expect(
        service.listUsers({ ...officeStaff, unitScope: null }, 1, 20),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('reports every role with the primary role first', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([
          userRow({ role_codes: ['dqtv', 'police_area'] }),
        ]);

      const { data } = await service.listUsers(systemAdmin, 1, 20);

      expect(data[0]).toMatchObject({
        role: 'police_area',
        roles: ['police_area', 'dqtv'],
      });
    });
  });

  describe('getUserById', () => {
    it('returns user successfully', async () => {
      mockDataSource.query.mockResolvedValueOnce([userRow()]);
      const result = await service.getUserById(systemAdmin, 'user-1');
      expect(result.id).toBe('user-1');
      expect(result.fullName).toBe('John Doe');
    });

    it('throws NotFoundException for unknown id', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.getUserById(systemAdmin, 'unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns an account scoped to the caller unit to office_staff', async () => {
      mockDataSource.query.mockResolvedValueOnce([userRow()]);
      await expect(
        service.getUserById(officeStaff, 'user-1'),
      ).resolves.toMatchObject({ id: 'user-1' });
    });

    // Out-of-scope accounts are indistinguishable from accounts that do not exist
    it.each([
      ['of another unit', ['UNIT_999']],
      ['without any unit scope', []],
      ['that also belongs to another unit', ['UNIT_001', 'UNIT_999']],
      ['with a ward-wide scope', ['*']],
    ])(
      'conceals an account %s from office_staff',
      async (_label, scopeCodes) => {
        mockDataSource.query.mockResolvedValueOnce([
          userRow({
            scope_codes: scopeCodes,
            unit_code: scopeCodes[0] ?? null,
          }),
        ]);
        await expect(
          service.getUserById(officeStaff, 'user-1'),
        ).rejects.toThrow(new NotFoundException('user_not_found'));
      },
    );
  });

  describe('createUser', () => {
    const dto = {
      username: 'dqtv02',
      fullName: 'Lê Văn C',
      role: 'dqtv',
      unitCode: 'UNIT_001',
    };

    it('rejects an unknown role before creating anything', async () => {
      mockManager.query.mockResolvedValueOnce([]); // role lookup

      await expect(
        service.createUser(systemAdmin, { ...dto, role: 'ghost_role' }),
      ).rejects.toThrow(new BadRequestException('unknown_role'));
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it('rejects an unknown unit before creating anything', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'role-dqtv' }]) // role lookup
        .mockResolvedValueOnce([]); // unit lookup

      await expect(service.createUser(systemAdmin, dto)).rejects.toThrow(
        new BadRequestException('unknown_unit'),
      );
      expect(mockManager.query).toHaveBeenCalledTimes(2);
    });

    it('maps a duplicate username to 409', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'role-dqtv' }])
        .mockResolvedValueOnce([{ id: 'unit-1' }])
        .mockRejectedValueOnce({
          code: '23505',
          constraint: 'users_username_key',
        });

      await expect(service.createUser(systemAdmin, dto)).rejects.toThrow(
        new ConflictException('username_taken'),
      );
    });

    it('maps a duplicate email to 409', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'role-dqtv' }])
        .mockResolvedValueOnce([{ id: 'unit-1' }])
        .mockRejectedValueOnce({
          code: '23505',
          constraint: 'users_email_key',
        });

      await expect(service.createUser(systemAdmin, dto)).rejects.toThrow(
        new ConflictException('email_taken'),
      );
    });

    it('creates the user, its role and its unit scope in one transaction', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'role-dqtv' }]) // role lookup
        .mockResolvedValueOnce([{ id: 'unit-1' }]) // unit lookup
        .mockResolvedValueOnce([{ id: 'user-new' }]) // INSERT users
        .mockResolvedValue([]);
      mockDataSource.query.mockResolvedValueOnce([userRow({ id: 'user-new' })]);

      const result = await service.createUser(systemAdmin, dto);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(sqlOf(mockManager.query, 3)).toMatch(
        /INSERT INTO user_roles \(user_id, role_id\) VALUES \(\$1, \$2\)/,
      );
      expect(paramsOf(mockManager.query, 3)).toEqual(['user-new', 'role-dqtv']);
      expect(sqlOf(mockManager.query, 4)).toMatch(
        /INSERT INTO user_unit_scopes \(user_id, unit_id, scope_type\) VALUES \(\$1, \$2, 'unit'\)/,
      );
      expect(paramsOf(mockManager.query, 4)).toEqual(['user-new', 'unit-1']);
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    });

    it('places accounts created by office_staff in their own unit', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'role-dqtv' }])
        .mockResolvedValueOnce([{ id: 'unit-1' }])
        .mockResolvedValueOnce([{ id: 'user-new' }])
        .mockResolvedValue([]);
      mockDataSource.query.mockResolvedValueOnce([userRow({ id: 'user-new' })]);

      await service.createUser(officeStaff, { ...dto, unitCode: undefined });

      expect(paramsOf(mockManager.query, 1)).toEqual(['UNIT_001']);
    });

    it('office_staff cannot create an account in another unit', async () => {
      await expect(
        service.createUser(officeStaff, { ...dto, unitCode: 'UNIT_999' }),
      ).rejects.toThrow(new ForbiddenException('unit_scope_violation'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('office_staff cannot assign privileged roles', async () => {
      await expect(
        service.createUser(officeStaff, { ...dto, role: 'system_admin' }),
      ).rejects.toThrow(new ForbiddenException('role_not_assignable'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('locks the account, updates its status and ends everything issued to it, atomically', async () => {
      transactionTarget(userRow());

      await service.updateStatus(systemAdmin, 'user-1', 'suspended');

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      const lock = indexOf(/SELECT id FROM users WHERE id = \$1 FOR UPDATE/);
      const update = indexOf(
        /UPDATE users SET status = \$2, updated_at = now\(\) WHERE id = \$1/,
      );
      expect(lock).toBeGreaterThanOrEqual(0);
      expect(update).toBeGreaterThan(lock);
      expect(paramsOf(mockManager.query, update)).toEqual([
        'user-1',
        'suspended',
      ]);
      expectInvalidatedAfter(/UPDATE users SET status/);
    });

    it('re-activating an account keeps its sessions', async () => {
      transactionTarget(userRow({ status: 'inactive' }));

      await service.updateStatus(systemAdmin, 'user-1', 'active');

      expect(indexOf(/UPDATE users SET status/)).toBeGreaterThanOrEqual(0);
      expect(mockAuthState.invalidateUser).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown account without writing', async () => {
      transactionTarget(null);

      await expect(
        service.updateStatus(systemAdmin, 'user-1', 'suspended'),
      ).rejects.toThrow(new NotFoundException('user_not_found'));
      expect(executed().filter((s) => WRITES.test(s))).toEqual([]);
    });

    it('throws BadRequestException for invalid status', async () => {
      await expect(
        service.updateStatus(systemAdmin, 'user-1', 'invalid' as never),
      ).rejects.toThrow(BadRequestException);
    });

    it("refuses to change the caller's own status", async () => {
      await expect(
        service.updateStatus(systemAdmin, 'admin-id', 'suspended'),
      ).rejects.toThrow(new ForbiddenException('cannot_change_own_account'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('sets a new temporary password and ends existing sessions', async () => {
      transactionTarget(userRow());

      const result = await service.resetPassword(systemAdmin, 'user-1');

      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);
      const update = indexOf(
        /UPDATE users SET password_hash = \$2, updated_at = now\(\) WHERE id = \$1/,
      );
      expect(update).toBeGreaterThan(
        indexOf(/SELECT id FROM users WHERE id = \$1 FOR UPDATE/),
      );
      // Including MFA challenges opened with the old password
      expectInvalidatedAfter(/UPDATE users SET password_hash/);
    });
  });

  describe('updateRole', () => {
    it('rejects an unknown role code without touching the current roles', async () => {
      transactionTarget(userRow());

      await expect(
        service.updateRole(systemAdmin, 'user-1', 'ghost_role'),
      ).rejects.toThrow(new BadRequestException('unknown_role'));
      expect(executed().filter((s) => WRITES.test(s))).toEqual([]);
    });

    it('replaces the role and revokes sessions in one transaction', async () => {
      transactionTarget(userRow());

      await service.updateRole(systemAdmin, 'user-1', 'office_staff');

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      const remove = indexOf(/DELETE FROM user_roles WHERE user_id = \$1/);
      const insert = indexOf(
        /INSERT INTO user_roles \(user_id, role_id\) VALUES \(\$1, \$2\)/,
      );
      expect(remove).toBeGreaterThan(
        indexOf(/SELECT id FROM users WHERE id = \$1 FOR UPDATE/),
      );
      expect(insert).toBeGreaterThan(remove);
      // No token keeps the old roles
      expectInvalidatedAfter(/INSERT INTO user_roles/);
      expect(paramsOf(mockManager.query, insert)).toEqual([
        'user-1',
        'role-office',
      ]);
    });

    it('office_staff cannot assign privileged roles', async () => {
      await expect(
        service.updateRole(officeStaff, 'user-1', 'police_ward'),
      ).rejects.toThrow(new ForbiddenException('role_not_assignable'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it("refuses to change the caller's own role", async () => {
      await expect(
        service.updateRole(systemAdmin, 'admin-id', 'dqtv'),
      ).rejects.toThrow(new ForbiddenException('cannot_change_own_account'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });

  const mutations: [string, (s: AdminService) => Promise<unknown>][] = [
    ['updateStatus', (s) => s.updateStatus(officeStaff, 'user-1', 'suspended')],
    ['updateRole', (s) => s.updateRole(officeStaff, 'user-1', 'dqtv')],
    ['resetPassword', (s) => s.resetPassword(officeStaff, 'user-1')],
  ];

  // A status change, role change or password reset on a privileged account would
  // let office staff take it over
  describe('privileged accounts', () => {
    it.each(mutations)(
      'office_staff cannot %s an account holding a role they cannot assign',
      async (_name, act) => {
        transactionTarget(userRow({ role_codes: ['dqtv', 'police_ward'] }));

        await expect(act(service)).rejects.toThrow(
          new ForbiddenException('role_not_assignable'),
        );
        expect(executed().filter((s) => WRITES.test(s))).toEqual([]);
        expect(mockAuthState.invalidateUser).not.toHaveBeenCalled();
      },
    );
  });

  // The scope is checked on the locked row inside the transaction that writes, so an
  // account outside the caller's unit is never changed
  describe('accounts outside the caller unit', () => {
    const outOfScope: [string, string[]][] = [
      ['of another unit', ['UNIT_999']],
      ['without any unit scope', []],
      ['that also belongs to another unit', ['UNIT_001', 'UNIT_999']],
      ['with a ward-wide scope', ['*']],
    ];

    describe.each(mutations)('%s', (_name, act) => {
      it.each(outOfScope)(
        'answers 404 for an account %s without writing',
        async (_label, scopeCodes) => {
          transactionTarget(
            userRow({
              scope_codes: scopeCodes,
              unit_code: scopeCodes[0] ?? null,
            }),
          );

          await expect(act(service)).rejects.toThrow(
            new NotFoundException('user_not_found'),
          );
          expect(executed().filter((s) => WRITES.test(s))).toEqual([]);
          expect(mockAuthState.invalidateUser).not.toHaveBeenCalled();
        },
      );
    });

    it('lets office_staff manage an account that belongs to their unit alone', async () => {
      transactionTarget(userRow());

      await service.updateStatus(officeStaff, 'user-1', 'suspended');

      expect(indexOf(/UPDATE users SET status/)).toBeGreaterThanOrEqual(0);
    });
  });
});
