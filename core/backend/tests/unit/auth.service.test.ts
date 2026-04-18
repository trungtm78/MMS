import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authService from '../../src/services/auth.service';
import * as pool from '../../src/db/pool';
import * as passwordUtils from '../../src/utils/password';
import * as jwtUtils from '../../src/utils/jwt';

// Mock dependencies
vi.mock('../../src/db/pool');
vi.mock('../../src/utils/password');
vi.mock('../../src/utils/jwt');

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should return null for non-existent user', async () => {
      vi.mocked(pool.queryOne).mockResolvedValueOnce(null);
      
      const result = await authService.login('nonexistent', 'password', undefined, '127.0.0.1', 'test');
      
      expect(result).toBeNull();
    });

    it('should return null for inactive user', async () => {
      vi.mocked(pool.queryOne).mockResolvedValueOnce({
        id: 'user-1',
        username: 'test',
        password_hash: 'hash',
        full_name: 'Test',
        email: 'test@test.com',
        status: 'inactive'
      });
      
      const result = await authService.login('test', 'password', undefined, '127.0.0.1', 'test');
      
      expect(result).toBeNull();
    });

    it('should return null for invalid password', async () => {
      vi.mocked(pool.queryOne).mockResolvedValueOnce({
        id: 'user-1',
        username: 'test',
        password_hash: 'hash',
        full_name: 'Test',
        email: 'test@test.com',
        status: 'active'
      });
      vi.mocked(passwordUtils.verifyPassword).mockResolvedValueOnce(false);
      
      const result = await authService.login('test', 'wrongpassword', undefined, '127.0.0.1', 'test');
      
      expect(result).toBeNull();
    });

    it('should return tokens for valid credentials', async () => {
      const mockUser = {
        id: 'user-1',
        username: 'test',
        password_hash: 'hash',
        full_name: 'Test User',
        email: 'test@test.com',
        status: 'active'
      };
      
      vi.mocked(pool.queryOne)
        .mockResolvedValueOnce(mockUser)  // user query
        .mockResolvedValueOnce({ id: 'role-1' })  // device insert
        .mockResolvedValueOnce(null);  // session insert
        
      vi.mocked(passwordUtils.verifyPassword).mockResolvedValueOnce(true);
      vi.mocked(pool.queryMany).mockResolvedValueOnce([{ code: 'militia' }]);
      vi.mocked(jwtUtils.generateAccessToken).mockReturnValue('access-token');
      vi.mocked(jwtUtils.generateRefreshToken).mockReturnValue('refresh-token');
      
      const result = await authService.login('test', 'password', undefined, '127.0.0.1', 'test');
      
      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe('access-token');
      expect(result?.refreshToken).toBe('refresh-token');
    });
  });

  describe('refreshAccessToken', () => {
    it('should return null for invalid refresh token', async () => {
      vi.mocked(jwtUtils.verifyRefreshToken).mockReturnValueOnce(null);
      
      const result = await authService.refreshAccessToken('invalid-token', '127.0.0.1', 'test');
      
      expect(result).toBeNull();
    });
  });
});
