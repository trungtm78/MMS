// Unit tests for UsersService
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';

const CURRENT_PW = 'Current@123';
const NEW_PW = 'NewPass@456';
const CURRENT_HASH = bcrypt.hashSync(CURRENT_PW, 10);

describe('UsersService', () => {
  let service: UsersService;

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ── getProfile ────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns user data when user exists', async () => {
      const fakeUser = {
        id: 'user-1', username: 'nguyenvana', fullName: 'Nguyen Van A',
        email: 'a@example.com', phone: '0900000001', status: 'active',
        role: 'dqtv_member', unitScope: 'UNIT_001',
      };
      mockDataSource.query.mockResolvedValueOnce([fakeUser]);

      const result = await service.getProfile('user-1');
      expect(result).toEqual(fakeUser);
    });

    it('throws NotFoundException when user not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.getProfile('unknown-user')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getPoliceProfile ──────────────────────────────────────────────────

  describe('getPoliceProfile', () => {
    it('returns badge/rank/station/department fields', async () => {
      mockDataSource.query.mockResolvedValueOnce([{
        badge_number: 'CA-001',
        rank: 'Thiếu tá',
        station: 'Công an phường X',
        department: 'Đội PCCC',
        username: 'police1',
        full_name: 'Tran Van B',
      }]);

      const result = await service.getPoliceProfile('user-1');
      expect(result.badgeNumber).toBe('CA-001');
      expect(result.rank).toBe('Thiếu tá');
      expect(result.station).toBe('Công an phường X');
      expect(result.department).toBe('Đội PCCC');
      expect(result.username).toBe('police1');
      expect(result.fullName).toBe('Tran Van B');
    });

    it('returns null fields when police columns are null', async () => {
      mockDataSource.query.mockResolvedValueOnce([{
        badge_number: null, rank: null, station: null, department: null,
        username: 'police2', full_name: 'Le Van C',
      }]);

      const result = await service.getPoliceProfile('user-2');
      expect(result.badgeNumber).toBeNull();
      expect(result.rank).toBeNull();
    });

    it('throws NotFoundException when user not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.getPoliceProfile('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  test('test_changePassword_throws_BadRequest_for_wrong_current_password', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ password_hash: CURRENT_HASH }]);

    await expect(
      service.changePassword('uid-1', 'WrongPass!1', NEW_PW),
    ).rejects.toThrow(new BadRequestException('invalid_credentials'));
  });

  test('test_changePassword_throws_NotFoundException_when_user_not_found', async () => {
    mockDataSource.query.mockResolvedValueOnce([]); // no user row

    await expect(
      service.changePassword('uid-missing', CURRENT_PW, NEW_PW),
    ).rejects.toThrow(NotFoundException);
  });

  test('test_changePassword_throws_BadRequest_for_complexity_failure', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ password_hash: CURRENT_HASH }]);

    // Too short, no uppercase, no special char
    await expect(
      service.changePassword('uid-1', CURRENT_PW, 'short1'),
    ).rejects.toThrow(new BadRequestException('password_complexity'));
  });

  test('test_changePassword_throws_BadRequest_for_password_reuse', async () => {
    const newPwHash = bcrypt.hashSync(NEW_PW, 6);

    mockDataSource.query
      .mockResolvedValueOnce([{ password_hash: CURRENT_HASH }]) // fetch user
      .mockResolvedValueOnce([{ password_hash: newPwHash }]); // history has new pw

    await expect(
      service.changePassword('uid-1', CURRENT_PW, NEW_PW),
    ).rejects.toThrow(new BadRequestException('password_reuse'));
  });

  test('test_changePassword_updates_password_and_inserts_history_on_success', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ password_hash: CURRENT_HASH }]) // fetch user
      .mockResolvedValueOnce([]) // history: no reuse
      .mockResolvedValueOnce(undefined) // UPDATE users
      .mockResolvedValueOnce(undefined) // INSERT history
      .mockResolvedValueOnce([{ count: '1' }]); // COUNT history

    await service.changePassword('uid-1', CURRENT_PW, NEW_PW);

    // UPDATE users was called
    const updateCall = mockDataSource.query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE users'),
    );
    expect(updateCall).toBeDefined();

    // INSERT into user_password_history was called
    const insertCall = mockDataSource.query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO user_password_history'),
    );
    expect(insertCall).toBeDefined();
  });

  test('test_changePassword_deletes_oldest_history_when_count_exceeds_5', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ password_hash: CURRENT_HASH }]) // fetch user
      .mockResolvedValueOnce([]) // history: no reuse
      .mockResolvedValueOnce(undefined) // UPDATE users
      .mockResolvedValueOnce(undefined) // INSERT history
      .mockResolvedValueOnce([{ count: '6' }]) // COUNT = 6 > 5
      .mockResolvedValueOnce(undefined); // DELETE oldest

    await service.changePassword('uid-1', CURRENT_PW, NEW_PW);

    // DELETE was called to trim history
    const deleteCall = mockDataSource.query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM user_password_history'),
    );
    expect(deleteCall).toBeDefined();
  });
});
