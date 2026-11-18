import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { getDataSourceToken } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateUserBodyDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './admin.dto';

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

const adminReq = {
  user: { sub: 'admin-1', role: 'system_admin', unitScope: null },
};

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

      const result = controller.listUsers(
        adminReq as never,
        1,
        20,
        undefined,
        undefined,
      );

      expect(result).toEqual(users);
      expect(mockAdminService.listUsers).toHaveBeenCalledWith(
        adminReq.user,
        1,
        20,
        undefined,
        undefined,
      );
    });

    it('clamps limit to 100', async () => {
      mockAdminService.listUsers.mockReturnValueOnce({ data: [], total: 0 });

      await controller.listUsers(
        adminReq as never,
        1,
        999,
        undefined,
        undefined,
      );

      expect(mockAdminService.listUsers).toHaveBeenCalledWith(
        adminReq.user,
        1,
        100,
        undefined,
        undefined,
      );
    });
  });

  describe('getUserById', () => {
    it('returns user by id', () => {
      const user = { id: 'u1', username: 'staff1' };
      mockAdminService.getUserById.mockReturnValueOnce(user);

      const result = controller.getUserById(adminReq as never, 'u1');

      expect(result).toEqual(user);
    });
  });

  describe('createUser', () => {
    it('creates and returns user', () => {
      const dto: CreateUserBodyDto = {
        username: 'newstaff',
        fullName: 'New Staff',
        role: 'office_staff',
      };
      const created = { id: 'u-new', ...dto };
      mockAdminService.createUser.mockReturnValueOnce(created);

      const result = controller.createUser(adminReq as never, dto);

      expect(result).toEqual(created);
    });
  });

  describe('updateStatus / updateRole', () => {
    it('passes the validated status to the service', async () => {
      await controller.updateStatus(adminReq as never, 'u1', {
        status: 'suspended',
      });

      expect(mockAdminService.updateStatus).toHaveBeenCalledWith(
        adminReq.user,
        'u1',
        'suspended',
      );
    });

    it('passes the validated role to the service', async () => {
      await controller.updateRole(adminReq as never, 'u1', {
        role: 'office_staff',
      });

      expect(mockAdminService.updateRole).toHaveBeenCalledWith(
        adminReq.user,
        'u1',
        'office_staff',
      );
    });
  });

  // Same options as the global pipe in main.ts
  describe('request validation', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const validate = (metatype: new () => object, value: unknown) =>
      pipe.transform(value, { type: 'body', metatype }) as Promise<unknown>;
    const newUser = {
      username: 'dqtv02',
      fullName: 'Lê Văn C',
      email: 'c@example.vn',
      phone: '0909 123 456',
      role: 'dqtv',
      unitCode: 'KV1',
    };

    it('accepts a well-formed new user', async () => {
      await expect(
        validate(CreateUserBodyDto, newUser),
      ).resolves.toBeInstanceOf(CreateUserBodyDto);
    });

    it.each([
      ['an unknown role', { role: 'superuser' }],
      ['a client-chosen password', { password: 'Pass123' }],
      ['a malformed email', { email: 'not-an-email' }],
      ['a username with spaces', { username: 'bad name' }],
      ['a blank full name', { fullName: '   ' }],
    ])('rejects a new user with %s', async (_label, patch) => {
      await expect(
        validate(CreateUserBodyDto, { ...newUser, ...patch }),
      ).rejects.toThrow(BadRequestException);
    });

    it.each(['active', 'inactive', 'suspended'])(
      'accepts status %s',
      async (status) => {
        await expect(
          validate(UpdateUserStatusDto, { status }),
        ).resolves.toEqual({ status });
      },
    );

    it('rejects an unknown status', async () => {
      await expect(
        validate(UpdateUserStatusDto, { status: 'deleted' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown role on a role change', async () => {
      await expect(
        validate(UpdateUserRoleDto, { role: 'root' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSystemSettings', () => {
    it('returns settings as key-value record', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          key: 'session_timeout_minutes',
          value: '60',
          description: 'Session timeout',
        },
        {
          key: 'password_min_length',
          value: '8',
          description: 'Min password length',
        },
      ]);

      const result = await controller.getSystemSettings();

      expect(result).toEqual({
        session_timeout_minutes: '60',
        password_min_length: '8',
      });
    });
  });

  describe('updateSystemSettings', () => {
    it('updates allowed settings and returns count', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await controller.updateSystemSettings(adminReq as never, {
        session_timeout_minutes: '120',
      });

      expect(result).toEqual({ updated: 1 });
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringMatching(
          /INSERT INTO system_settings[\s\S]*ON CONFLICT \(tenant_id, key\) DO UPDATE/,
        ),
        ['session_timeout_minutes', '120', 'admin-1'],
      );
    });

    it('throws BadRequestException for non-editable keys', async () => {
      await expect(
        controller.updateSystemSettings(adminReq as never, {
          secret_key: 'value',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
