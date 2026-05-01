import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { getDataSourceToken } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BadRequestException } from '@nestjs/common';

const mockAdminService = {
  listUsers: jest.fn(),
  getUserById: jest.fn(),
  createUser: jest.fn(),
  updateStatus: jest.fn(),
  updateRole: jest.fn(),
  resetPassword: jest.fn(),
};

const mockDataSource = {
  query: jest.fn(),
};

const adminReq = { user: { sub: 'admin-1', role: 'system_admin', unitScope: null } };

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
    jest.clearAllMocks();
  });

  describe('listUsers', () => {
    it('returns paginated user list', () => {
      const users = { data: [{ id: 'u1', username: 'staff1' }], total: 1 };
      mockAdminService.listUsers.mockReturnValueOnce(users);

      const result = controller.listUsers(adminReq as any, 1, 20, undefined, undefined);

      expect(result).toEqual(users);
      expect(mockAdminService.listUsers).toHaveBeenCalledWith(adminReq.user, 1, 20, undefined, undefined);
    });

    it('clamps limit to 100', () => {
      mockAdminService.listUsers.mockReturnValueOnce({ data: [], total: 0 });

      controller.listUsers(adminReq as any, 1, 999, undefined, undefined);

      expect(mockAdminService.listUsers).toHaveBeenCalledWith(adminReq.user, 1, 100, undefined, undefined);
    });
  });

  describe('getUserById', () => {
    it('returns user by id', () => {
      const user = { id: 'u1', username: 'staff1' };
      mockAdminService.getUserById.mockReturnValueOnce(user);

      const result = controller.getUserById(adminReq as any, 'u1');

      expect(result).toEqual(user);
    });
  });

  describe('createUser', () => {
    it('creates and returns user', () => {
      const dto = { username: 'newstaff', password: 'Pass123', role: 'office_staff' };
      const created = { id: 'u-new', ...dto };
      mockAdminService.createUser.mockReturnValueOnce(created);

      const result = controller.createUser(adminReq as any, dto as any);

      expect(result).toEqual(created);
    });
  });

  describe('getSystemSettings', () => {
    it('returns settings as key-value record', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { key: 'session_timeout_minutes', value: '60', description: 'Session timeout' },
        { key: 'password_min_length', value: '8', description: 'Min password length' },
      ]);

      const result = await controller.getSystemSettings();

      expect(result).toEqual({ session_timeout_minutes: '60', password_min_length: '8' });
    });
  });

  describe('updateSystemSettings', () => {
    it('updates allowed settings and returns count', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await controller.updateSystemSettings(adminReq as any, {
        session_timeout_minutes: '120',
      });

      expect(result).toEqual({ updated: 1 });
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO system_settings'),
        ['session_timeout_minutes', '120', 'admin-1'],
      );
    });

    it('throws BadRequestException for non-editable keys', async () => {
      await expect(
        controller.updateSystemSettings(adminReq as any, { secret_key: 'value' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
