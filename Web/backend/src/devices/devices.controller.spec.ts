import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DevicesController } from './devices.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const mockDs = { query: jest.fn() };

const mockUser = { sub: 'user-1', username: 'testuser', role: 'dqtv_member', unitScope: null };

describe('DevicesController', () => {
  let controller: DevicesController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DevicesController],
      providers: [{ provide: DataSource, useValue: mockDs }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(DevicesController);
    jest.clearAllMocks();
  });

  describe('listSessions', () => {
    it('returns active sessions for the current user', async () => {
      const rows = [
        {
          id: 'sess-1',
          userId: 'user-1',
          deviceId: null,
          ip: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          createdAt: '2024-01-01T00:00:00Z',
          expiresAt: '2024-12-31T00:00:00Z',
          revokedAt: null,
        },
      ];
      mockDs.query.mockResolvedValue(rows);

      const result = await controller.listSessions({ user: mockUser });

      expect(result).toEqual(rows);
      expect(mockDs.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['user-1'],
      );
    });

    it('returns empty array when no active sessions', async () => {
      mockDs.query.mockResolvedValue([]);
      const result = await controller.listSessions({ user: mockUser });
      expect(result).toEqual([]);
    });
  });

  describe('revokeSession', () => {
    it('revokes the session by setting revoked_at', async () => {
      mockDs.query.mockResolvedValue({ rowCount: 1 });

      await controller.revokeSession('sess-1', { user: mockUser });

      expect(mockDs.query).toHaveBeenCalledWith(
        expect.stringContaining('SET revoked_at = NOW()'),
        ['sess-1', 'user-1'],
      );
    });

    it('is a no-op for sessions belonging to another user', async () => {
      mockDs.query.mockResolvedValue({ rowCount: 0 });
      await expect(
        controller.revokeSession('sess-other', { user: mockUser }),
      ).resolves.not.toThrow();
      expect(mockDs.query).toHaveBeenCalledWith(
        expect.anything(),
        ['sess-other', 'user-1'],
      );
    });
  });
});
