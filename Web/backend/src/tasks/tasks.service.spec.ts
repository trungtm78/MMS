import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';

const mockDataSource = { query: jest.fn() };

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
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
