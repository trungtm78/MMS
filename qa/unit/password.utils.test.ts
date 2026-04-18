import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../src/utils/password';

describe('Password Utils', () => {
  describe('hashPassword', () => {
    it('should hash password successfully', async () => {
      const password = 'test123456';
      const hash = await hashPassword(password);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'test123456';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'test123456';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('wrongpassword', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should accept password with 6+ characters', () => {
      const result = validatePasswordStrength('123456');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password with less than 6 characters', () => {
      const result = validatePasswordStrength('12345');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mật khẩu phải có ít nhất 6 ký tự');
    });

    it('should reject password with more than 100 characters', () => {
      const result = validatePasswordStrength('a'.repeat(101));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mật khẩu không được vượt quá 100 ký tự');
    });
  });
});
