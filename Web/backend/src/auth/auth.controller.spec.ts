import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockAuthService = {
  validateUser: jest.fn(),
  issueMfaTempToken: jest.fn(),
  issueTokens: jest.fn(),
  verifyMfaAndIssueTokens: jest.fn(),
  setupMfa: jest.fn(),
  confirmMfaSetup: jest.fn(),
  refreshTokens: jest.fn(),
  logout: jest.fn(),
  getUserById: jest.fn(),
};

const mockUser = {
  id: 'user-1',
  username: 'admin',
  role: 'system_admin',
  unitScope: null,
  passwordHash: 'hash',
  mfaEnabled: false,
};

// Helper to make a valid JwtPayload-shaped request user
const makeUser = (overrides: Partial<{ sub: string; username: string; role: string; unitScope: string | null }> = {}) => ({
  sub: 'user-1',
  username: 'admin',
  role: 'system_admin',
  unitScope: null as string | null,
  ...overrides,
});

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
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
    it('returns tokens and user when credentials valid and MFA disabled', async () => {
      mockAuthService.validateUser.mockResolvedValueOnce(mockUser);
      mockAuthService.issueTokens.mockResolvedValueOnce({
        accessToken: 'at',
        refreshToken: 'rt',
      });

      const result = await controller.login({
        username: 'admin',
        password: 'pass',
      });

      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('user');
      expect(result['user']).not.toHaveProperty('passwordHash');
    });

    it('returns mfa_required and tempToken when MFA enabled', async () => {
      mockAuthService.validateUser.mockResolvedValueOnce({
        ...mockUser,
        mfaEnabled: true,
      });
      mockAuthService.issueMfaTempToken.mockResolvedValueOnce('temp-tok');

      const result = await controller.login({
        username: 'admin',
        password: 'pass',
      });

      expect(result).toEqual({ mfa_required: true, tempToken: 'temp-tok' });
      expect(mockAuthService.issueTokens).not.toHaveBeenCalled();
    });

    it('delegates validateUser with correct credentials', async () => {
      mockAuthService.validateUser.mockResolvedValueOnce(mockUser);
      mockAuthService.issueTokens.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt' });

      await controller.login({ username: 'admin', password: 'secret' });

      expect(mockAuthService.validateUser).toHaveBeenCalledWith('admin', 'secret');
    });

    it('strips passwordHash and mfaEnabled from user response', async () => {
      mockAuthService.validateUser.mockResolvedValueOnce(mockUser);
      mockAuthService.issueTokens.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt' });

      const result = await controller.login({ username: 'admin', password: 'pass' });

      expect(result['user']).not.toHaveProperty('passwordHash');
      expect(result['user']).not.toHaveProperty('mfaEnabled');
    });
  });

  describe('mfaLogin', () => {
    it('returns user and tokens on successful MFA verification', async () => {
      mockAuthService.verifyMfaAndIssueTokens.mockResolvedValueOnce({
        user: { id: 'user-1', username: 'admin' },
        accessToken: 'at',
        refreshToken: 'rt',
      });

      const result = await controller.mfaLogin({
        tempToken: 'temp-tok',
        otp: '123456',
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(mockAuthService.verifyMfaAndIssueTokens).toHaveBeenCalledWith('temp-tok', '123456');
    });

    it('propagates errors from verifyMfaAndIssueTokens', async () => {
      mockAuthService.verifyMfaAndIssueTokens.mockRejectedValueOnce(
        new Error('invalid_otp'),
      );

      await expect(
        controller.mfaLogin({ tempToken: 'bad', otp: '000000' }),
      ).rejects.toThrow('invalid_otp');
    });
  });

  describe('mfaSetup', () => {
    it('delegates to authService.setupMfa with user sub', async () => {
      const expected = { secret: 's', qrUri: 'qr', recoveryCodes: [] };
      mockAuthService.setupMfa.mockResolvedValueOnce(expected);

      const result = await controller.mfaSetup({ user: makeUser() });

      expect(result).toEqual(expected);
      expect(mockAuthService.setupMfa).toHaveBeenCalledWith('user-1');
    });
  });

  describe('mfaConfirm', () => {
    it('calls confirmMfaSetup and returns undefined (204)', async () => {
      mockAuthService.confirmMfaSetup.mockResolvedValueOnce(undefined);

      const result = await controller.mfaConfirm(
        { user: makeUser() },
        { otp: '123456' },
      );

      expect(result).toBeUndefined();
      expect(mockAuthService.confirmMfaSetup).toHaveBeenCalledWith('user-1', '123456');
    });

    it('propagates errors from confirmMfaSetup', async () => {
      mockAuthService.confirmMfaSetup.mockRejectedValueOnce(new Error('invalid_otp'));

      await expect(
        controller.mfaConfirm(
          { user: makeUser() },
          { otp: '000000' },
        ),
      ).rejects.toThrow('invalid_otp');
    });
  });

  describe('refresh', () => {
    it('returns new token pair', async () => {
      const tokens = { accessToken: 'new-at', refreshToken: 'new-rt' };
      mockAuthService.refreshTokens.mockResolvedValueOnce(tokens);

      const result = await controller.refresh({ refreshToken: 'old-rt' });

      expect(result).toEqual(tokens);
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith('old-rt');
    });

    it('propagates error when token invalid', async () => {
      mockAuthService.refreshTokens.mockRejectedValueOnce(new Error('invalid_token'));

      await expect(controller.refresh({ refreshToken: 'bad' })).rejects.toThrow(
        'invalid_token',
      );
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
