import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { User } from '../database/entities/user.entity';
import type { JwtPayload } from '../auth/auth.service';

const mockDataSource = {
  query: jest.fn(),
};

const mockUserRepo = {
  update: jest.fn(),
};

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

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.clearAllMocks();
  });

  describe('assertUnitScope (via listUsers)', () => {
    it('system_admin can see all users regardless of unit', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([]);
      await expect(service.listUsers(systemAdmin, 1, 20)).resolves.toMatchObject({ total: 5 });
      // No unit filter in query params
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
    });

    it('office_staff is scoped to their unit', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '3' }])
        .mockResolvedValueOnce([]);
      await service.listUsers(officeStaff, 1, 20);
      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params).toContain('UNIT_001');
    });
  });

  describe('getUserById', () => {
    const mockUserRow = {
      id: 'user-1',
      username: 'john',
      full_name: 'John Doe',
      email: 'john@test.com',
      phone: null,
      status: 'active',
      created_at: new Date().toISOString(),
      role_code: 'dqtv',
      unit_code: 'UNIT_001',
    };

    it('returns user successfully', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockUserRow]);
      const result = await service.getUserById(systemAdmin, 'user-1');
      expect(result.id).toBe('user-1');
      expect(result.fullName).toBe('John Doe');
    });

    it('throws NotFoundException for unknown id', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.getUserById(systemAdmin, 'unknown')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when office_staff accesses different unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ ...mockUserRow, unit_code: 'UNIT_999' }]);
      await expect(service.getUserById(officeStaff, 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateStatus', () => {
    const mockUserRow = {
      id: 'user-1', username: 'john', full_name: 'John', email: null, phone: null,
      status: 'active', created_at: new Date().toISOString(), role_code: 'dqtv', unit_code: 'UNIT_001',
    };

    it('updates status successfully', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockUserRow]);
      mockUserRepo.update.mockResolvedValueOnce(undefined);
      await expect(service.updateStatus(systemAdmin, 'user-1', 'inactive')).resolves.not.toThrow();
      expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', { status: 'inactive' });
    });

    it('throws BadRequestException for invalid status', async () => {
      await expect(
        service.updateStatus(systemAdmin, 'user-1', 'invalid' as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetPassword', () => {
    const mockUserRow = {
      id: 'user-1', username: 'john', full_name: 'John', email: null, phone: null,
      status: 'active', created_at: new Date().toISOString(), role_code: 'dqtv', unit_code: 'UNIT_001',
    };

    it('returns a temporary password', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockUserRow]);
      mockUserRepo.update.mockResolvedValueOnce(undefined);
      const result = await service.resetPassword(systemAdmin, 'user-1');
      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe('updateRole', () => {
    const mockUserRow = {
      id: 'user-1', username: 'john', full_name: 'John', email: null, phone: null,
      status: 'active', created_at: new Date().toISOString(), role_code: 'dqtv', unit_code: 'UNIT_001',
    };

    it('updates role successfully', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUserRow]) // getUserById
        .mockResolvedValueOnce(undefined)     // DELETE user_roles
        .mockResolvedValueOnce(undefined);    // INSERT user_roles
      await expect(service.updateRole(systemAdmin, 'user-1', 'office_staff')).resolves.not.toThrow();
    });
  });
});
