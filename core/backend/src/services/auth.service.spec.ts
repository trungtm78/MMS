import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  login,
  logout,
  logoutAllDevices,
  refreshAccessToken,
  setupMfa,
  issueMfaTempToken,
  verifyMfaAndLogin,
} from './auth.service';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../utils/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed'),
  verifyPassword: vi.fn(),
}));

vi.mock('../utils/jwt', () => ({
  generateAccessToken: vi.fn().mockReturnValue('access-token'),
  generateRefreshToken: vi.fn().mockReturnValue('refresh-token'),
  verifyRefreshToken: vi.fn(),
}));

vi.mock('speakeasy', () => ({
  default: {
    generateSecret: vi.fn().mockReturnValue({
      base32: 'TOTP_SECRET',
      otpauth_url: 'otpauth://totp/TestApp:user?secret=TOTP_SECRET',
    }),
    totp: {
      verify: vi.fn(),
    },
    otpauthURL: vi.fn().mockReturnValue('otpauth://totp/TestApp:user'),
  },
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,xxx'),
}));

vi.mock('uuid', () => ({ v4: vi.fn().mockReturnValue('mock-uuid') }));

// ─── Imports after mocking ────────────────────────────────────────────────────

import { queryOne, queryMany, transaction } from '../db/pool';
import { verifyPassword } from '../utils/password';
import { verifyRefreshToken } from '../utils/jwt';
import speakeasy from 'speakeasy';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);
const mockTransaction = vi.mocked(transaction);
const mockVerifyPassword = vi.mocked(verifyPassword);
const mockVerifyRefreshToken = vi.mocked(verifyRefreshToken);
const mockTotpVerify = vi.mocked(speakeasy.totp.verify);

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    const activeUser = {
      id: 'user-1',
      username: 'testuser',
      password_hash: 'hash',
      full_name: 'Test User',
      email: 'test@example.com',
      status: 'active',
      mfa_enabled: false,
      totp_secret: 'SECRET',
    };

    it('returns requiresMfaSetup when totp_secret is null', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...activeUser, totp_secret: null });
      mockVerifyPassword.mockResolvedValueOnce(true);
      mockQueryMany
        .mockResolvedValueOnce([{ code: 'militia' }]) // roles
        .mockResolvedValueOnce([]);                   // unit scopes

      const result = await login('testuser', 'password', undefined, '127.0.0.1', 'agent');

      expect(result).not.toBeNull();
      expect(result!.requiresMfaSetup).toBe(true);
    });

    it('returns requiresMfa when mfa_enabled is true', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...activeUser, mfa_enabled: true, totp_secret: 'SECRET' });
      mockVerifyPassword.mockResolvedValueOnce(true);
      mockQueryMany
        .mockResolvedValueOnce([{ code: 'militia' }])
        .mockResolvedValueOnce([]);

      const result = await login('testuser', 'password', undefined, '127.0.0.1', 'agent');

      expect(result!.requiresMfa).toBe(true);
    });

    it('returns null when user not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await login('unknown', 'password', undefined, '127.0.0.1', 'agent');

      expect(result).toBeNull();
    });

    it('returns null when user is inactive', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...activeUser, status: 'inactive' });

      const result = await login('testuser', 'password', undefined, '127.0.0.1', 'agent');

      expect(result).toBeNull();
    });

    it('returns null when password is wrong', async () => {
      mockQueryOne.mockResolvedValueOnce(activeUser);
      mockVerifyPassword.mockResolvedValueOnce(false);

      const result = await login('testuser', 'wrongpassword', undefined, '127.0.0.1', 'agent');

      expect(result).toBeNull();
    });

    it('creates session and returns tokens when login is complete', async () => {
      // User with totp_secret set but mfa_enabled=false means "setup done, mfa active"
      // Actually with totp_secret != null AND mfa_enabled = false → falls through to session creation
      mockQueryOne
        .mockResolvedValueOnce({ ...activeUser, mfa_enabled: false, totp_secret: 'SECRET' })
        .mockResolvedValueOnce(null)     // no existing device
        .mockResolvedValueOnce({ id: 'device-1' }) // insert device
        .mockResolvedValueOnce(undefined) // insert session
        .mockResolvedValueOnce(undefined); // update last_login
      mockVerifyPassword.mockResolvedValueOnce(true);
      mockQueryMany
        .mockResolvedValueOnce([{ code: 'militia' }])
        .mockResolvedValueOnce([]);

      const result = await login(
        'testuser',
        'password',
        { fingerprint: 'fp-1', name: 'My Phone', platform: 'android' },
        '127.0.0.1',
        'agent'
      );

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe('access-token');
      expect(result!.refreshToken).toBe('refresh-token');
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('revokes the session', async () => {
      mockQueryOne.mockResolvedValueOnce(undefined);

      await logout('user-1', 'session-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions'),
        ['session-1', 'user-1']
      );
    });
  });

  // ─── logoutAllDevices ────────────────────────────────────────────────────────

  describe('logoutAllDevices', () => {
    it('revokes all active sessions for the user', async () => {
      mockQueryOne.mockResolvedValueOnce(undefined);

      await logoutAllDevices('user-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions'),
        ['user-1']
      );
    });
  });

  // ─── refreshAccessToken ──────────────────────────────────────────────────────

  describe('refreshAccessToken', () => {
    it('returns new tokens when refresh token is valid', async () => {
      mockVerifyRefreshToken.mockReturnValueOnce({ userId: 'user-1', sessionId: 'sess-1', version: 0 });
      mockQueryOne
        .mockResolvedValueOnce({
          id: 'sess-1',
          user_id: 'user-1',
          refresh_token_hash: 'hash',
          revoked_at: null,
          expires_at: new Date(Date.now() + 86400000),
        })
        .mockResolvedValueOnce({ id: 'user-1', status: 'active' });
      mockVerifyPassword.mockResolvedValueOnce(true);
      mockTransaction.mockImplementation(async (fn) => fn({ query: vi.fn() }));

      const result = await refreshAccessToken('old-refresh-token', '127.0.0.1', 'agent');

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe('access-token');
      expect(result!.refreshToken).toBe('refresh-token');
    });

    it('returns null when token is invalid', async () => {
      mockVerifyRefreshToken.mockReturnValueOnce(null);

      const result = await refreshAccessToken('bad-token', '127.0.0.1', 'agent');

      expect(result).toBeNull();
    });

    it('returns null when session is revoked', async () => {
      mockVerifyRefreshToken.mockReturnValueOnce({ userId: 'user-1', sessionId: 'sess-1', version: 0 });
      mockQueryOne.mockResolvedValueOnce({
        id: 'sess-1',
        user_id: 'user-1',
        refresh_token_hash: 'hash',
        revoked_at: new Date(),
        expires_at: new Date(Date.now() + 86400000),
      });

      const result = await refreshAccessToken('token', '127.0.0.1', 'agent');

      expect(result).toBeNull();
    });
  });

  // ─── setupMfa ──────────────────────────────────────────────────────────────

  describe('setupMfa', () => {
    it('returns secret, qr code and recovery codes', async () => {
      mockQueryOne.mockResolvedValueOnce({ username: 'testuser', full_name: 'Test User' });
      mockTransaction.mockImplementation(async (fn) => fn({ query: vi.fn() }));

      const result = await setupMfa('user-1');

      expect(result.secret).toBe('TOTP_SECRET');
      expect(result.qrCodeDataUrl).toContain('data:image/png');
      expect(result.recoveryCodes).toHaveLength(10);
    });

    it('throws when user not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      await expect(setupMfa('nonexistent')).rejects.toThrow('User not found');
    });
  });

  // ─── issueMfaTempToken ──────────────────────────────────────────────────────

  describe('issueMfaTempToken', () => {
    it('returns a composite token in format userId:token', async () => {
      mockQueryOne.mockResolvedValueOnce(undefined);

      const token = await issueMfaTempToken('user-1');

      expect(token).toMatch(/^user-1:.+/);
    });
  });

  // ─── verifyMfaAndLogin ──────────────────────────────────────────────────────

  describe('verifyMfaAndLogin', () => {
    it('returns null when temp token is invalid', async () => {
      // validateMfaTempToken → splits token, queries DB → returns null
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await verifyMfaAndLogin('bad:token', '123456', '127.0.0.1', 'agent');

      expect(result).toBeNull();
    });

    it('returns null when TOTP code is wrong', async () => {
      // validateMfaTempToken succeeds
      mockQueryOne
        .mockResolvedValueOnce({ id: 'tmp-1', token_hash: 'hash', expires_at: new Date(Date.now() + 60000), used_at: null })
        .mockResolvedValueOnce(undefined) // mark used
        .mockResolvedValueOnce({ totp_secret: 'SECRET', mfa_enabled: true, status: 'active' });
      mockVerifyPassword.mockResolvedValueOnce(true);
      mockTotpVerify.mockReturnValueOnce(false);

      const result = await verifyMfaAndLogin('user-1:token', 'wrongcode', '127.0.0.1', 'agent');

      expect(result).toBeNull();
    });
  });
});
