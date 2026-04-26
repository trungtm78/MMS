import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { AssignmentsService } from '../assignments/assignments.service';

const mockDataSource = {
  query: jest.fn(),
  transaction: jest.fn((cb: (mgr: typeof mockDataSource) => Promise<unknown>) => cb(mockDataSource)),
};
const mockAssignmentsService = { getAssignedDqtvIds: jest.fn() };

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AssignmentsService, useValue: mockAssignmentsService },
      ],
    }).compile();
    service = module.get<TasksService>(TasksService);
    jest.clearAllMocks();
  });

  describe('createTask', () => {
    const validDto = {
      title: 'Tuần tra khu vực',
      assigneeMilitiaId: 'militia-1',
      createdByUserId: 'user-1',
    };

    it('creates task and assignment successfully', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1', userId: 'user-1', fullName: 'Nguyen Van A', militiaCode: 'DQTV001' }]) // militia lookup
        .mockResolvedValueOnce([{ id: 'task-1' }]) // INSERT task
        .mockResolvedValueOnce(undefined); // INSERT assignment

      const result = await service.createTask(validDto);
      expect(result.id).toBe('task-1');
      expect(result.status).toBe('pending');
      expect(result.assigneeName).toBe('Nguyen Van A');
    });

    it('throws NotFoundException when militia not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.createTask(validDto)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when militia has no user account', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'militia-1', userId: null, fullName: 'X', militiaCode: 'DQTV001' }]);
      await expect(service.createTask(validDto)).rejects.toThrow(BadRequestException);
    });

    it('uses medium priority by default', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1', userId: 'user-1', fullName: 'X', militiaCode: 'DQTV001' }])
        .mockResolvedValueOnce([{ id: 'task-1' }])
        .mockResolvedValueOnce(undefined);

      const result = await service.createTask({ ...validDto, priority: undefined });
      expect(result.priority).toBe('medium');
    });
  });

  // ── CA assignment scope regression tests ──────────────────────────────

  describe('createTask — CA scope enforcement', () => {
    const caDtoBase = {
      title: 'Patrol',
      assigneeMilitiaId: 'militia-1',
      createdByUserId: 'ca-user-1',
      createdByRole: 'ca_officer',
    };

    it('CA creates task for assigned DQTV militia → success', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce(['dqtv-user-1']);
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1', userId: 'dqtv-user-1', fullName: 'A', militiaCode: 'D001' }])
        .mockResolvedValueOnce([{ id: 'task-1' }])
        .mockResolvedValueOnce(undefined);

      const result = await service.createTask(caDtoBase);
      expect(result.id).toBe('task-1');
    });

    it('CA creates task for NON-assigned DQTV militia → ForbiddenException', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce(['other-user']);
      mockDataSource.query.mockResolvedValueOnce([
        { id: 'militia-1', userId: 'dqtv-user-1', fullName: 'A', militiaCode: 'D001' },
      ]);

      await expect(service.createTask(caDtoBase)).rejects.toThrow(ForbiddenException);
    });

    it('CA with zero assignments creates task (fallback) → success', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([]); // no assignments → fallback
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1', userId: 'dqtv-user-1', fullName: 'A', militiaCode: 'D001' }])
        .mockResolvedValueOnce([{ id: 'task-1' }])
        .mockResolvedValueOnce(undefined);

      const result = await service.createTask(caDtoBase);
      expect(result.id).toBe('task-1');
    });
  });

  describe('listTasks', () => {
    it('returns tasks filtered by status', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: '1', code: 'NV-001', title: 'Test', status: 'pending', priority: 'medium', type: 'other',
          deadline: null, createdAt: new Date(), assigneeId: 'u1', assigneeName: 'A', militiaId: 'm1', militiaCode: 'D001' },
      ]);
      const result = await service.listTasks({ status: 'pending', page: 1, limit: 10 });
      expect(result).toHaveLength(1);
      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params[0]).toBe('pending');
    });
  });

  describe('submitReport', () => {
    const reportDto = {
      description: 'Đã hoàn thành tuần tra khu vực đúng lịch.',
      completedAt: '2026-04-19T08:00:00Z',
      location: 'Khu vực 1',
    };

    it('creates report and marks task completed', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'task-1', status: 'in_progress' }]) // task exists
        .mockResolvedValueOnce([{ id: 'assign-1' }]) // assignee verified
        .mockResolvedValueOnce([{ id: 'report-1' }]) // insert report
        .mockResolvedValueOnce(undefined); // update task status
      const result = await service.submitReport('task-1', reportDto, 'user-1');
      expect(result.id).toBe('report-1');
      expect(result.taskId).toBe('task-1');
    });

    it('throws NotFoundException when task not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.submitReport('bad-id', reportDto, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not the assignee', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'task-1', status: 'in_progress' }])
        .mockResolvedValueOnce([]); // not assigned
      await expect(service.submitReport('task-1', reportDto, 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listTasksPaginated', () => {
    it('returns paginated response with total', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '25' }])
        .mockResolvedValueOnce([]);
      const result = await service.listTasksPaginated({ page: 2, limit: 10 });
      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });
  });
});
