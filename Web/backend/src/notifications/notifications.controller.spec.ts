import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from '../auth/auth.service';

const mockQuery = jest.fn();
const mockDataSource = { query: mockQuery };

// Bypass guards in unit tests
const mockGuard = { canActivate: () => true };

const fakeUser: JwtPayload = {
  sub: 'user-1',
  username: 'dqtv01',
  role: 'dqtv_member',
  unitScope: null,
};
const fakeReq = { user: fakeUser };

// Read state lives in notification_receipts (one row per recipient); the full
// behaviour against a real schema is covered by test/api-contract.e2e-spec.ts.
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
    mockQuery.mockReset();
  });

  describe('list', () => {
    it('returns the caller’s receipts with read state, paginated', async () => {
      const row = {
        id: 'notif-1',
        type: 'task',
        title: 'New task',
        body: 'You have a new task',
        entityType: 'task',
        entityId: 'task-1',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      };
      mockQuery
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([row]);

      const result = await controller.list(fakeReq, 1, 20);

      expect(result).toEqual({ data: [row], total: 1, page: 1, limit: 20 });
      const [countSql, countParams] = mockQuery.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(countSql).toContain('notification_receipts');
      expect(countParams).toEqual(['user-1']);
      const [listSql] = mockQuery.mock.calls[1] as [string];
      expect(listSql).toContain('read_at IS NOT NULL AS "isRead"');
      // Newest first from idx_notification_receipts_user_delivered, stable across pages
      expect(listSql).toMatch(/ORDER BY r\.delivered_at DESC, r\.id DESC/);
    });

    it('filters to unread receipts when read=false', async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await controller.list(fakeReq, 1, 20, false);

      const [countSql] = mockQuery.mock.calls[0] as [string];
      expect(countSql).toContain('r.read_at IS NULL');
    });

    it('filters to read receipts when read=true', async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await controller.list(fakeReq, 1, 20, true);

      const [countSql] = mockQuery.mock.calls[0] as [string];
      expect(countSql).toContain('r.read_at IS NOT NULL');
    });
  });

  // The TypeORM postgres driver resolves UPDATE ... RETURNING with [rows, rowCount];
  // the mocks return that shape so the controller must read rows through queryRows()
  describe('markRead', () => {
    it('marks the caller’s receipt read', async () => {
      mockQuery.mockResolvedValueOnce([[{ notification_id: 'notif-1' }], 1]);

      const result = await controller.markRead('notif-1', fakeReq);

      expect(result).toEqual({ ok: true });
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/^\s*UPDATE notification_receipts/);
      expect(params).toEqual(['notif-1', 'user-1']);
    });

    it('throws NotFoundException when the caller has no receipt for it', async () => {
      mockQuery.mockResolvedValueOnce([[], 0]);

      await expect(
        controller.markRead('someone-elses', fakeReq),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // The mobile inbox lets people dismiss a notification; only their own receipt goes
  describe('remove', () => {
    it("deletes only the caller's receipt", async () => {
      mockQuery.mockResolvedValueOnce([[{ notification_id: 'notif-1' }], 1]);

      await expect(controller.remove('notif-1', fakeReq)).resolves.toEqual({
        ok: true,
      });
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/^\s*DELETE FROM notification_receipts/);
      expect(params).toEqual(['notif-1', 'user-1']);
    });

    it('answers 404 when the caller has no receipt for it', async () => {
      mockQuery.mockResolvedValueOnce([[], 0]);

      await expect(controller.remove('someone-elses', fakeReq)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('readAll', () => {
    it('marks every unread receipt read and returns the count', async () => {
      mockQuery.mockResolvedValueOnce([
        [
          { notification_id: 'a' },
          { notification_id: 'b' },
          { notification_id: 'c' },
        ],
        3,
      ]);

      const result = await controller.readAll(fakeReq);

      expect(result).toEqual({ updated: 3 });
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(
        /^\s*UPDATE notification_receipts[\s\S]*read_at IS NULL/,
      );
      expect(params).toEqual(['user-1']);
    });
  });
});
