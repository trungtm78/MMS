import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';

const mockQuery = jest.fn();
const mockDataSource = { query: mockQuery };

// Bypass guards in unit tests
const mockGuard = { canActivate: () => true };

const fakeUser = { sub: 'user-1', role: 'dqtv_member', unitScope: null };
const fakeReq = { user: fakeUser };

describe('NotificationsController', () => {
  let controller: NotificationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: JwtAuthGuard, useValue: mockGuard },
        { provide: RolesGuard, useValue: mockGuard },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated notifications for user', async () => {
      const fakeNotif = {
        id: 'notif-1', type: 'task', title: 'New task', body: 'You have a new task',
        isRead: false, entityType: 'task', entityId: 'task-1', createdAt: new Date(),
      };
      mockQuery
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([fakeNotif]);

      const result = await controller.list(fakeReq as any, 1, 20);
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('returns empty list when user has no notifications', async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      const result = await controller.list(fakeReq as any, 1, 20);
      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('markRead', () => {
    it('returns ok:true for own notification', async () => {
      mockQuery.mockResolvedValueOnce(undefined);
      const result = await controller.markRead('notif-1', fakeReq as any);
      expect(result).toEqual({ ok: true });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notifications'),
        ['notif-1', 'user-1'],
      );
    });
  });

  describe('readAll', () => {
    it('marks all unread notifications as read and returns count', async () => {
      mockQuery.mockResolvedValueOnce([{ count: '5' }]);
      const result = await controller.readAll(fakeReq as any);
      expect(result).toEqual({ updated: 5 });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notifications'),
        ['user-1'],
      );
    });

    it('returns 0 when no unread notifications', async () => {
      mockQuery.mockResolvedValueOnce([{ count: '0' }]);
      const result = await controller.readAll(fakeReq as any);
      expect(result).toEqual({ updated: 0 });
    });
  });
});
