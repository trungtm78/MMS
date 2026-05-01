import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

const mockTasksService = {
  listTasksPaginated: jest.fn(),
  createTask: jest.fn(),
  getTaskById: jest.fn(),
  acceptTask: jest.fn(),
  updateProgress: jest.fn(),
  submitReport: jest.fn(),
  updateTask: jest.fn(),
  cancelTask: jest.fn(),
};

const adminReq = { user: { sub: 'admin-1', role: 'system_admin', unitScope: null } };
const dqtvReq = { user: { sub: 'dqtv-1', role: 'dqtv_member', unitScope: 'UNIT_001' } };

describe('TasksController', () => {
  let controller: TasksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: mockTasksService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TasksController>(TasksController);
    jest.clearAllMocks();
  });

  describe('listTasks', () => {
    it('returns paginated task list', async () => {
      const paginated = { data: [{ id: 't1', title: 'Patrol' }], total: 1, page: 1, limit: 20 };
      mockTasksService.listTasksPaginated.mockResolvedValueOnce(paginated);

      const result = await controller.listTasks(undefined, 1, 20);

      expect(result).toEqual(paginated);
      expect(mockTasksService.listTasksPaginated).toHaveBeenCalledWith({ status: undefined, page: 1, limit: 20 });
    });

    it('filters by status when provided', async () => {
      mockTasksService.listTasksPaginated.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });

      await controller.listTasks('pending', 1, 20);

      expect(mockTasksService.listTasksPaginated).toHaveBeenCalledWith({ status: 'pending', page: 1, limit: 20 });
    });

    it('returns empty list when no tasks', async () => {
      mockTasksService.listTasksPaginated.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });

      const result = await controller.listTasks(undefined, 1, 20);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('create', () => {
    const dto = {
      title: 'Night Patrol',
      type: 'patrol',
      priority: 'high',
      assigneeMilitiaId: 'mp-1',
    };

    it('creates task and returns it with 201', async () => {
      const created = { id: 't-new', ...dto, status: 'pending' };
      mockTasksService.createTask.mockResolvedValueOnce(created);

      const result = await controller.create(dto as any, adminReq);

      expect(result).toEqual(created);
      expect(mockTasksService.createTask).toHaveBeenCalledWith({
        ...dto,
        createdByUserId: 'admin-1',
      });
    });

    it('propagates error from service', async () => {
      mockTasksService.createTask.mockRejectedValueOnce(new Error('assignee_not_found'));

      await expect(controller.create(dto as any, adminReq)).rejects.toThrow('assignee_not_found');
    });
  });

  describe('getById', () => {
    it('returns task for valid id', async () => {
      const task = { id: 't1', title: 'Patrol', status: 'pending' };
      mockTasksService.getTaskById.mockResolvedValueOnce(task);

      const result = await controller.getById('t1');

      expect(result).toEqual(task);
      expect(mockTasksService.getTaskById).toHaveBeenCalledWith('t1');
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockTasksService.getTaskById.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.getById('bad')).rejects.toThrow(NotFoundException);
    });

    it('propagates error when task not found', async () => {
      mockTasksService.getTaskById.mockRejectedValueOnce(new NotFoundException('task_not_found'));

      await expect(controller.getById('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('accept', () => {
    it('returns accepted task', async () => {
      const task = { id: 't1', status: 'in_progress' };
      mockTasksService.acceptTask.mockResolvedValueOnce(task);

      const result = await controller.accept('t1', dqtvReq);

      expect(result).toEqual(task);
      expect(mockTasksService.acceptTask).toHaveBeenCalledWith('t1', 'dqtv-1');
    });

    it('propagates ForbiddenException if not assignee', async () => {
      mockTasksService.acceptTask.mockRejectedValueOnce(new ForbiddenException());

      await expect(controller.accept('t1', adminReq)).rejects.toThrow(ForbiddenException);
    });

    it('propagates NotFoundException for unknown task', async () => {
      mockTasksService.acceptTask.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.accept('bad', dqtvReq)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProgress', () => {
    it('updates progress and returns updated task', async () => {
      const task = { id: 't1', status: 'in_progress', progress: 50 };
      mockTasksService.updateProgress.mockResolvedValueOnce(task);

      const result = await controller.updateProgress(
        't1',
        { progress: 50 },
        dqtvReq,
      );

      expect(result).toEqual(task);
      expect(mockTasksService.updateProgress).toHaveBeenCalledWith('t1', { progress: 50 }, 'dqtv-1');
    });

    it('propagates error when progress out of range', async () => {
      mockTasksService.updateProgress.mockRejectedValueOnce(new Error('invalid_progress'));

      await expect(
        controller.updateProgress('t1', { progress: 150 }, dqtvReq),
      ).rejects.toThrow('invalid_progress');
    });
  });

  describe('submitReport', () => {
    const reportDto = { description: 'Patrol completed', location: 'Zone A' };

    it('creates report and returns it', async () => {
      const report = { id: 'rep-1', ...reportDto, taskId: 't1' };
      mockTasksService.submitReport.mockResolvedValueOnce(report);

      const result = await controller.submitReport('t1', reportDto as any, dqtvReq);

      expect(result).toEqual(report);
      expect(mockTasksService.submitReport).toHaveBeenCalledWith('t1', reportDto, 'dqtv-1');
    });

    it('propagates error from service', async () => {
      mockTasksService.submitReport.mockRejectedValueOnce(new ForbiddenException());

      await expect(controller.submitReport('t1', reportDto as any, adminReq)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateTask', () => {
    it('updates task details and returns updated task', async () => {
      const updated = { id: 't1', title: 'New Title', status: 'pending' };
      mockTasksService.updateTask.mockResolvedValueOnce(updated);

      const result = await controller.updateTask(
        't1',
        { title: 'New Title' } as any,
        adminReq,
      );

      expect(result).toEqual(updated);
      expect(mockTasksService.updateTask).toHaveBeenCalledWith('t1', { title: 'New Title' }, 'admin-1');
    });

    it('propagates NotFoundException for unknown task', async () => {
      mockTasksService.updateTask.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.updateTask('bad', { title: 'X' } as any, adminReq)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cancelTask', () => {
    it('cancels task and returns void (204)', async () => {
      mockTasksService.cancelTask.mockResolvedValueOnce(undefined);

      await expect(
        controller.cancelTask('t1', { reason: 'No longer needed' } as any, adminReq),
      ).resolves.toBeUndefined();

      expect(mockTasksService.cancelTask).toHaveBeenCalledWith('t1', 'No longer needed', 'admin-1');
    });

    it('propagates NotFoundException for unknown task', async () => {
      mockTasksService.cancelTask.mockRejectedValueOnce(new NotFoundException());

      await expect(
        controller.cancelTask('bad', { reason: 'x' } as any, adminReq),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
