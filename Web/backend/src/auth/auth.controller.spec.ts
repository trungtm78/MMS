import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa/mfa.service';
import { LOGIN_THROTTLE } from './auth-throttle';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockAuthService = {
  validateUser: jest.fn(),
  refreshTokens: jest.fn(),
  logout: jest.fn(),
  getUserById: jest.fn(),
};

const mockMfaService = {
  beginLogin: jest.fn(),
};

const mockUser = {
  id: 'user-1',
  username: 'admin',
  role: 'system_admin',
  unitScope: null,
  passwordHash: 'hash',
  mfaEnabled: false,
};

const request = { ip: '10.0.0.7', headers: { 'user-agent': 'jest' } };

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: MfaService, useValue: mockMfaService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('checks the password, then lets the MFA policy decide what the caller receives', async () => {
      const outcome = { status: 'SUCCESS', user: { id: 'user-1' }, tokens: {} };
      mockAuthService.validateUser.mockResolvedValueOnce(mockUser);
      mockMfaService.beginLogin.mockResolvedValueOnce(outcome);

      await expect(
        controller.login({ username: 'admin', password: 'pass' }, request),
      ).resolves.toBe(outcome);

      expect(mockAuthService.validateUser).toHaveBeenCalledWith(
        'admin',
        'pass',
      );
      expect(mockMfaService.beginLogin).toHaveBeenCalledWith(
        { id: 'user-1', username: 'admin', mfaEnabled: false },
        { ip: '10.0.0.7', userAgent: 'jest' },
      );
    });

    it('tells the MFA policy the account is enrolled', async () => {
      mockAuthService.validateUser.mockResolvedValueOnce({
        ...mockUser,
        mfaEnabled: true,
      });
      mockMfaService.beginLogin.mockResolvedValueOnce({
        status: 'MFA_REQUIRED',
      });

      await controller.login({ username: 'admin', password: 'pass' }, request);

      expect(mockMfaService.beginLogin).toHaveBeenCalledWith(
        expect.objectContaining({ mfaEnabled: true }),
        expect.anything(),
      );
    });

    it('is rate limited per client as a password route', () => {
      const handler = Reflect.get(AuthController.prototype, 'login') as object;

      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(
        LOGIN_THROTTLE.default.limit,
      );
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(
        LOGIN_THROTTLE.default.ttl,
      );
    });

    it('opens no MFA challenge when the password is wrong', async () => {
      mockAuthService.validateUser.mockRejectedValueOnce(
        new UnauthorizedException('invalid_credentials'),
      );

      await expect(
        controller.login({ username: 'admin', password: 'bad' }, request),
      ).rejects.toThrow('invalid_credentials');
      expect(mockMfaService.beginLogin).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('returns new token pair', async () => {
      const tokens = { accessToken: 'new-at', refreshToken: 'new-rt' };
      mockAuthService.refreshTokens.mockResolvedValueOnce(tokens);

      const result = await controller.refresh(
        { refreshToken: 'old-rt' },
        request,
      );

      expect(result).toEqual(tokens);
      // The rotated session records where the refresh came from
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith('old-rt', {
        ip: '10.0.0.7',
        userAgent: 'jest',
      });
    });

    it('propagates error when token invalid', async () => {
      mockAuthService.refreshTokens.mockRejectedValueOnce(
        new Error('invalid_token'),
      );

      await expect(
        controller.refresh({ refreshToken: 'bad' }, request),
      ).rejects.toThrow('invalid_token');
    });
  });

  describe('logout', () => {
    it('calls logout and returns undefined (204)', async () => {
      mockAuthService.logout.mockResolvedValueOnce(undefined);

      const result = await controller.logout({ user: { sub: 'user-1' } });

      expect(result).toBeUndefined();
      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1');
    });
  });

  describe('me', () => {
    it('returns current user data', async () => {
      const profile = { id: 'user-1', username: 'admin', role: 'system_admin' };
      mockAuthService.getUserById.mockResolvedValueOnce(profile);

      const result = await controller.me({ user: { sub: 'user-1' } });

      expect(result).toEqual(profile);
      expect(mockAuthService.getUserById).toHaveBeenCalledWith('user-1');
    });

    it('propagates NotFoundException when user not found', async () => {
      mockAuthService.getUserById.mockRejectedValueOnce(new Error('not_found'));

      await expect(controller.me({ user: { sub: 'unknown' } })).rejects.toThrow(
        'not_found',
      );
    });
  });
});
