import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getUserById,
  updateUserProfile,
  changePassword,
  getMilitiaProfile,
  getMilitiaProfileById,
  getMilitiaProfileByUserId,
} from './user.service';

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

vi.mock('../utils/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('new-hashed-pw'),
  verifyPassword: vi.fn(),
}));

import { queryOne, queryMany } from '../db/pool';
import { verifyPassword } from '../utils/password';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);
const mockVerifyPassword = vi.mocked(verifyPassword);

const baseUserRow = {
  id: 'user-1',
  username: 'testuser',
  full_name: 'Nguyen Van A',
  email: 'test@example.com',
  phone: '0901234567',
  avatar_url: null,
  status: 'active',
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
};

const baseMilitiaRow = {
  id: 'militia-1',
  user_id: 'user-1',
  militia_code: 'M001',
  full_name: 'Nguyen Van A',
  cccd: '123456789012',
  dob: new Date('1990-01-01'),
  gender: 'male',
  phone: '0901234567',
  address: '123 Main St',
  unit_id: 'unit-1',
  unit_name: 'Unit Alpha',
  position: 'Soldier',
  rank: 'Private',
  join_date: new Date('2020-06-01'),
  status: 'active',
  emergency_contact_name: null,
  emergency_contact_phone: null,
  emergency_contact_relationship: null,
};

describe('user.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getUserById ──────────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('returns UserProfile with roles when user exists', async () => {
      mockQueryOne.mockResolvedValueOnce(baseUserRow);
      mockQueryMany.mockResolvedValueOnce([{ code: 'militia' }, { code: 'commander' }]);

      const result = await getUserById('user-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('user-1');
      expect(result!.fullName).toBe('Nguyen Van A');
      expect(result!.roles).toEqual(['militia', 'commander']);
    });

    it('returns null when user not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getUserById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── updateUserProfile ────────────────────────────────────────────────────

  describe('updateUserProfile', () => {
    it('updates user fields and returns updated profile', async () => {
      mockQueryOne
        .mockResolvedValueOnce(undefined)  // UPDATE users
        .mockResolvedValueOnce(baseUserRow); // getUserById
      mockQueryMany.mockResolvedValueOnce([{ code: 'militia' }]);

      const result = await updateUserProfile('user-1', { fullName: 'New Name', email: 'new@example.com' });

      expect(result).not.toBeNull();
      const updateCall = mockQueryOne.mock.calls[0];
      expect(updateCall[0]).toContain('UPDATE users');
    });

    it('returns current profile without update when no fields provided', async () => {
      mockQueryOne.mockResolvedValueOnce(baseUserRow);
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await updateUserProfile('user-1', {});

      expect(result).not.toBeNull();
      // Should skip the UPDATE and jump directly to getUserById
      expect(mockQueryOne).toHaveBeenCalledTimes(1);
    });
  });

  // ─── changePassword ───────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('changes password when current password is correct', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ password_hash: 'old-hash' }) // SELECT password_hash
        .mockResolvedValueOnce(undefined);                     // UPDATE password
      mockVerifyPassword.mockResolvedValueOnce(true);

      const result = await changePassword('user-1', 'oldpass', 'newpass123');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns error when user not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await changePassword('nonexistent', 'oldpass', 'newpass');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('returns error when current password is incorrect', async () => {
      mockQueryOne.mockResolvedValueOnce({ password_hash: 'old-hash' });
      mockVerifyPassword.mockResolvedValueOnce(false);

      const result = await changePassword('user-1', 'wrongpass', 'newpass');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Current password is incorrect');
    });
  });

  // ─── getMilitiaProfile ────────────────────────────────────────────────────

  describe('getMilitiaProfile', () => {
    it('returns MilitiaProfile when found by userId', async () => {
      mockQueryOne.mockResolvedValueOnce(baseMilitiaRow);

      const result = await getMilitiaProfile('user-1');

      expect(result).not.toBeNull();
      expect(result!.militiaCode).toBe('M001');
      expect(result!.unitName).toBe('Unit Alpha');
    });

    it('returns null when militia profile not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getMilitiaProfile('user-no-profile');

      expect(result).toBeNull();
    });
  });

  // ─── getMilitiaProfileById ────────────────────────────────────────────────

  describe('getMilitiaProfileById', () => {
    it('returns MilitiaProfile when found by militia id', async () => {
      mockQueryOne.mockResolvedValueOnce(baseMilitiaRow);

      const result = await getMilitiaProfileById('militia-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('militia-1');
    });

    it('returns null when militia id not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getMilitiaProfileById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── getMilitiaProfileByUserId ────────────────────────────────────────────

  describe('getMilitiaProfileByUserId', () => {
    it('returns minimal profile object with id when found', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 'militia-1' });

      const result = await getMilitiaProfileByUserId('user-1');

      expect(result).toEqual({ id: 'militia-1' });
    });

    it('returns null when user has no militia profile', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getMilitiaProfileByUserId('user-no-profile');

      expect(result).toBeNull();
    });
  });
});
