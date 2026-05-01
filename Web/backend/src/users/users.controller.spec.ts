import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockUsersService = {
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  changePassword: jest.fn(),
  searchUsers: jest.fn(),
  getPoliceProfile: jest.fn(),
};

const userReq = { user: { sub: 'user-1', role: 'office_staff', unitScope: 'UNIT_001' } };

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    jest.clearAllMocks();
  });

  describe('getMe', () => {
    it('returns current user profile', async () => {
      const profile = { id: 'user-1', username: 'staff1', role: 'office_staff' };
      mockUsersService.getProfile.mockResolvedValueOnce(profile);

      const result = await controller.getMe(userReq as any);

      expect(result).toEqual(profile);
      expect(mockUsersService.getProfile).toHaveBeenCalledWith('user-1');
    });

    it('propagates error when user not found', async () => {
      mockUsersService.getProfile.mockRejectedValueOnce(new Error('not_found'));

      await expect(controller.getMe(userReq as any)).rejects.toThrow('not_found');
    });
  });

  describe('updateMe', () => {
    it('updates and returns updated profile', async () => {
      const updated = { id: 'user-1', fullName: 'New Name', email: 'new@email.com' };
      mockUsersService.updateProfile.mockResolvedValueOnce(updated);

      const result = await controller.updateMe(userReq as any, { fullName: 'New Name', email: 'new@email.com' });

      expect(result).toEqual(updated);
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith('user-1', {
        fullName: 'New Name',
        email: 'new@email.com',
      });
    });

    it('propagates error on invalid email', async () => {
      mockUsersService.updateProfile.mockRejectedValueOnce(new Error('invalid_email'));

      await expect(controller.updateMe(userReq as any, { email: 'bad' })).rejects.toThrow(
        'invalid_email',
      );
    });

    it('partial update (phone only) delegates correctly', async () => {
      const updated = { id: 'user-1', phone: '0901234567' };
      mockUsersService.updateProfile.mockResolvedValueOnce(updated);

      const result = await controller.updateMe(userReq as any, { phone: '0901234567' });

      expect(result).toEqual(updated);
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith('user-1', { phone: '0901234567' });
    });
  });

  describe('changePassword', () => {
    it('changes password and returns void (204)', async () => {
      mockUsersService.changePassword.mockResolvedValueOnce(undefined);

      const result = await controller.changePassword(userReq as any, {
        currentPassword: 'old',
        newPassword: 'new-secure',
      });

      expect(result).toBeUndefined();
      expect(mockUsersService.changePassword).toHaveBeenCalledWith('user-1', 'old', 'new-secure');
    });

    it('propagates error when current password wrong', async () => {
      mockUsersService.changePassword.mockRejectedValueOnce(new Error('invalid_password'));

      await expect(
        controller.changePassword(userReq as any, { currentPassword: 'wrong', newPassword: 'new' }),
      ).rejects.toThrow('invalid_password');
    });
  });

  describe('searchUsers', () => {
    it('returns matching users', async () => {
      const users = [{ id: 'u1', username: 'admin' }];
      mockUsersService.searchUsers.mockResolvedValueOnce(users);

      const result = await controller.searchUsers({ q: 'admin', limit: 10 } as any);

      expect(result).toEqual(users);
      expect(mockUsersService.searchUsers).toHaveBeenCalledWith('admin', 10);
    });

    it('uses defaults when query params omitted', async () => {
      mockUsersService.searchUsers.mockResolvedValueOnce([]);

      await controller.searchUsers({} as any);

      expect(mockUsersService.searchUsers).toHaveBeenCalledWith('', 20);
    });

    it('returns empty array when no match', async () => {
      mockUsersService.searchUsers.mockResolvedValueOnce([]);

      const result = await controller.searchUsers({ q: 'zzz' } as any);

      expect(result).toHaveLength(0);
    });
  });

  describe('getProfile', () => {
    it('delegates to getProfile with user sub', async () => {
      const profile = { id: 'user-1', username: 'staff1' };
      mockUsersService.getProfile.mockResolvedValueOnce(profile);

      const result = await controller.getProfile(userReq as any);

      expect(result).toEqual(profile);
      expect(mockUsersService.getProfile).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getPoliceProfile', () => {
    it('returns police-specific profile', async () => {
      const profile = { id: 'user-1', badgeNumber: 'CA001', rank: 'Trung úy' };
      mockUsersService.getPoliceProfile.mockResolvedValueOnce(profile);

      const result = await controller.getPoliceProfile(userReq as any);

      expect(result).toEqual(profile);
      expect(mockUsersService.getPoliceProfile).toHaveBeenCalledWith('user-1');
    });

    it('propagates error when police profile not found', async () => {
      mockUsersService.getPoliceProfile.mockRejectedValueOnce(new Error('not_found'));

      await expect(controller.getPoliceProfile(userReq as any)).rejects.toThrow('not_found');
    });
  });
});
