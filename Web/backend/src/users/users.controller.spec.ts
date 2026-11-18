import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ChangePasswordDto,
  UsersController,
  UserSearchQueryDto,
} from './users.controller';
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

const userReq = {
  user: { sub: 'user-1', role: 'office_staff', unitScope: 'UNIT_001' },
};

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
      const profile = {
        id: 'user-1',
        username: 'staff1',
        role: 'office_staff',
      };
      mockUsersService.getProfile.mockResolvedValueOnce(profile);

      const result = await controller.getMe(userReq as never);

      expect(result).toEqual(profile);
      expect(mockUsersService.getProfile).toHaveBeenCalledWith('user-1');
    });

    it('propagates error when user not found', async () => {
      mockUsersService.getProfile.mockRejectedValueOnce(new Error('not_found'));

      await expect(controller.getMe(userReq as never)).rejects.toThrow(
        'not_found',
      );
    });
  });

  describe('updateMe', () => {
    it('updates and returns updated profile', async () => {
      const updated = {
        id: 'user-1',
        fullName: 'New Name',
        email: 'new@email.com',
      };
      mockUsersService.updateProfile.mockResolvedValueOnce(updated);

      const result = await controller.updateMe(userReq as never, {
        fullName: 'New Name',
        email: 'new@email.com',
      });

      expect(result).toEqual(updated);
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith('user-1', {
        fullName: 'New Name',
        email: 'new@email.com',
      });
    });

    it('propagates error on invalid email', async () => {
      mockUsersService.updateProfile.mockRejectedValueOnce(
        new Error('invalid_email'),
      );

      await expect(
        controller.updateMe(userReq as never, { email: 'bad' }),
      ).rejects.toThrow('invalid_email');
    });

    it('partial update (phone only) delegates correctly', async () => {
      const updated = { id: 'user-1', phone: '0901234567' };
      mockUsersService.updateProfile.mockResolvedValueOnce(updated);

      const result = await controller.updateMe(userReq as never, {
        phone: '0901234567',
      });

      expect(result).toEqual(updated);
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith('user-1', {
        phone: '0901234567',
      });
    });
  });

  describe('changePassword', () => {
    it('changes password and returns void (204)', async () => {
      mockUsersService.changePassword.mockResolvedValueOnce(undefined);

      const result = await controller.changePassword(userReq as never, {
        currentPassword: 'old',
        newPassword: 'new-secure',
      });

      expect(result).toBeUndefined();
      expect(mockUsersService.changePassword).toHaveBeenCalledWith(
        'user-1',
        'old',
        'new-secure',
      );
    });

    it('propagates error when current password wrong', async () => {
      mockUsersService.changePassword.mockRejectedValueOnce(
        new Error('invalid_password'),
      );

      await expect(
        controller.changePassword(userReq as never, {
          currentPassword: 'wrong',
          newPassword: 'new',
        }),
      ).rejects.toThrow('invalid_password');
    });
  });

  describe('searchUsers', () => {
    it('searches as the caller, whose scope decides who is found', async () => {
      const users = [{ id: 'u1', username: 'admin' }];
      mockUsersService.searchUsers.mockResolvedValueOnce(users);

      const result = await controller.searchUsers(userReq as never, {
        q: 'admin',
        limit: 10,
      });

      expect(result).toEqual(users);
      expect(mockUsersService.searchUsers).toHaveBeenCalledWith(
        userReq.user,
        'admin',
        10,
      );
    });

    it('uses 20 rows when no limit is given', async () => {
      mockUsersService.searchUsers.mockResolvedValueOnce([]);

      await controller.searchUsers(userReq as never, { q: 'zzz' });

      expect(mockUsersService.searchUsers).toHaveBeenCalledWith(
        userReq.user,
        'zzz',
        20,
      );
    });
  });

  // GET /users/search?q=&limit= is bounded: a real query and at most 50 rows
  describe('UserSearchQueryDto', () => {
    const errorsOf = async (query: Record<string, unknown>) =>
      (await validate(plainToInstance(UserSearchQueryDto, query))).map(
        (e) => e.property,
      );

    it('accepts a trimmed query of two or more characters and a limit up to 50', async () => {
      const dto = plainToInstance(UserSearchQueryDto, {
        q: '  Tr  ',
        limit: '50',
      });
      expect(await validate(dto)).toEqual([]);
      expect(dto).toEqual({ q: 'Tr', limit: 50 });
    });

    it.each([
      [{}, 'q'],
      [{ q: '' }, 'q'],
      [{ q: ' a ' }, 'q'],
      [{ q: 'x'.repeat(101) }, 'q'],
      [{ q: 'Tran', limit: '51' }, 'limit'],
      [{ q: 'Tran', limit: '0' }, 'limit'],
    ])('rejects %j', async (query, property) => {
      expect(await errorsOf(query)).toEqual([property]);
    });
  });

  // bcrypt reads only the first 72 bytes of a password, so a longer new password would
  // quietly equal every password that shares those bytes (Flutter agent)
  describe('ChangePasswordDto', () => {
    const CURRENT = 'Old-pass1!';
    // U+1EC7 (a Vietnamese letter) takes three bytes in UTF-8
    const THREE_BYTE_LETTER = 'ệ';
    const errorsOf = async (body: Record<string, unknown>) =>
      (await validate(plainToInstance(ChangePasswordDto, body))).map(
        (e) => e.property,
      );

    it.each([
      ['72 ASCII bytes', 'A'.repeat(72)],
      ['24 three-byte letters (72 bytes)', THREE_BYTE_LETTER.repeat(24)],
    ])('accepts a new password of %s', async (_label, newPassword) => {
      expect(await errorsOf({ currentPassword: CURRENT, newPassword })).toEqual(
        [],
      );
    });

    it.each([
      ['73 ASCII bytes', 'A'.repeat(73)],
      ['25 three-byte letters (75 bytes)', THREE_BYTE_LETTER.repeat(25)],
    ])('refuses a new password of %s', async (_label, newPassword) => {
      expect(await errorsOf({ currentPassword: CURRENT, newPassword })).toEqual(
        ['newPassword'],
      );
    });

    it('bounds the current password it compares', async () => {
      expect(
        await errorsOf({
          currentPassword: 'x'.repeat(1025),
          newPassword: 'New-pass1!',
        }),
      ).toEqual(['currentPassword']);
    });
  });

  describe('getProfile', () => {
    it('delegates to getProfile with user sub', async () => {
      const profile = { id: 'user-1', username: 'staff1' };
      mockUsersService.getProfile.mockResolvedValueOnce(profile);

      const result = await controller.getProfile(userReq as never);

      expect(result).toEqual(profile);
      expect(mockUsersService.getProfile).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getPoliceProfile', () => {
    it('returns police-specific profile', async () => {
      const profile = { id: 'user-1', badgeNumber: 'CA001', rank: 'Trung úy' };
      mockUsersService.getPoliceProfile.mockResolvedValueOnce(profile);

      const result = await controller.getPoliceProfile(userReq as never);

      expect(result).toEqual(profile);
      expect(mockUsersService.getPoliceProfile).toHaveBeenCalledWith('user-1');
    });

    it('propagates error when police profile not found', async () => {
      mockUsersService.getPoliceProfile.mockRejectedValueOnce(
        new Error('not_found'),
      );

      await expect(
        controller.getPoliceProfile(userReq as never),
      ).rejects.toThrow('not_found');
    });
  });
});
