import { ParseUUIDPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateTaskDto,
  TasksController,
  UpdateProgressDto,
} from './tasks.controller';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

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

const ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';
const adminReq = {
  user: { sub: 'admin-1', role: 'system_admin', unitScope: null },
};
const dqtvReq = {
  user: { sub: 'dqtv-1', role: 'dqtv_member', unitScope: 'UNIT_001' },
};

const usesUuidPipe = (method: keyof TasksController) =>
  Object.values(
    (Reflect.getMetadata(ROUTE_ARGS_METADATA, TasksController, method) ??
      {}) as Record<string, { pipes?: unknown[] }>,
  ).some((arg) => arg.pipes?.includes(ParseUUIDPipe));

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

  // POST /tasks attachmentIds: the manager's uploads (POST /files/upload) linked to the task
  describe('CreateTaskDto attachments', () => {
    const FILE_ID = '0a3f6c1e-2b4d-4e8f-9a1b-3c5d7e9f1a2b';
    const base = { title: 'Tuần tra', assigneeMilitiaId: ID };
    const propertiesWithErrors = async (body: object) =>
      (await validate(plainToInstance(CreateTaskDto, body))).map(
        (error) => error.property,
      );

    it('accepts a task without attachments, or with up to ten distinct file ids', async () => {
      await expect(propertiesWithErrors(base)).resolves.toEqual([]);
      await expect(
        propertiesWithErrors({ ...base, attachmentIds: [FILE_ID] }),
      ).resolves.toEqual([]);
    });

    it.each([
      ['not a list', 'f-1'],
      ['an id that is not a UUID', ['f-1']],
      ['the same file twice', [FILE_ID, FILE_ID]],
      [
        'more than ten files',
        Array.from(
          { length: 11 },
          (_, i) =>
            `0a3f6c1e-2b4d-4e8f-9a1b-3c5d7e9f1a${String(i).padStart(2, '0')}`,
        ),
      ],
    ])('refuses attachmentIds that are %s', async (_label, attachmentIds) => {
      await expect(
        propertiesWithErrors({ ...base, attachmentIds }),
      ).resolves.toEqual(['attachmentIds']);
    });
  });

  // Every route acts as the caller: their scope decides which tasks they reach
  describe('acting as the caller', () => {
    it('lists the tasks of the caller scope with the status and unit filters', async () => {
      const page = { data: [], total: 0, page: 2, limit: 10 };
      mockTasksService.listTasksPaginated.mockResolvedValueOnce(page);

      await expect(
        controller.listTasks(dqtvReq as never, 'overdue', 'KV-A', 2, 10),
      ).resolves.toEqual(page);
      expect(mockTasksService.listTasksPaginated).toHaveBeenCalledWith(
        dqtvReq.user,
        { status: 'overdue', unitCode: 'KV-A', page: 2, limit: 10 },
      );
    });

    it('creates a task as the caller', async () => {
      const dto = { title: 'Night Patrol', assigneeMilitiaId: ID };
      mockTasksService.createTask.mockResolvedValueOnce({ id: 't-new' });

      await expect(controller.create(adminReq as never, dto)).resolves.toEqual({
        id: 't-new',
      });
      expect(mockTasksService.createTask).toHaveBeenCalledWith(
        adminReq.user,
        dto,
      );
    });

    it('reads a task as the caller', async () => {
      mockTasksService.getTaskById.mockResolvedValueOnce({ id: ID });

      await controller.getById(dqtvReq as never, ID);

      expect(mockTasksService.getTaskById).toHaveBeenCalledWith(
        dqtvReq.user,
        ID,
      );
    });

    it('accepts, reports progress and submits a report as the assignee', async () => {
      const report = { description: 'Patrol completed', location: 'Zone A' };

      await controller.accept(dqtvReq as never, ID);
      await controller.updateProgress(dqtvReq as never, ID, { progress: 50 });
      await controller.submitReport(dqtvReq as never, ID, report);

      expect(mockTasksService.acceptTask).toHaveBeenCalledWith(
        dqtvReq.user,
        ID,
      );
      expect(mockTasksService.updateProgress).toHaveBeenCalledWith(
        dqtvReq.user,
        ID,
        { progress: 50 },
      );
      expect(mockTasksService.submitReport).toHaveBeenCalledWith(
        dqtvReq.user,
        ID,
        report,
      );
    });

    it('edits and cancels a task as the manager', async () => {
      mockTasksService.cancelTask.mockResolvedValueOnce(undefined);

      await controller.updateTask(adminReq as never, ID, { title: 'New' });
      await expect(
        controller.cancelTask(adminReq as never, ID, {
          reason: 'No longer needed',
        }),
      ).resolves.toBeUndefined();

      expect(mockTasksService.updateTask).toHaveBeenCalledWith(
        adminReq.user,
        ID,
        { title: 'New' },
      );
      expect(mockTasksService.cancelTask).toHaveBeenCalledWith(
        adminReq.user,
        ID,
        'No longer needed',
      );
    });
  });

  // A malformed id reached PostgreSQL as $1::uuid and answered 500
  it.each([
    'getById',
    'accept',
    'updateProgress',
    'submitReport',
    'updateTask',
    'cancelTask',
  ] as const)('validates the task id of %s as a UUID', (method) => {
    expect(usesUuidPipe(method)).toBe(true);
  });

  // Flutter agent: a progress update could set any status. An assignee only starts a
  // task this way; completing it takes a report, cancelling it a manager
  describe('UpdateProgressDto', () => {
    const errorsOf = async (body: Record<string, unknown>) =>
      (await validate(plainToInstance(UpdateProgressDto, body))).map(
        (e) => e.property,
      );

    it('accepts progress alone or with the in_progress status', async () => {
      expect(await errorsOf({ progress: 50 })).toEqual([]);
      expect(await errorsOf({ progress: 50, status: 'in_progress' })).toEqual(
        [],
      );
    });

    it.each<[Record<string, unknown>, string]>([
      [{ progress: 100, status: 'completed' }, 'status'],
      [{ progress: 0, status: 'cancelled' }, 'status'],
      [{ progress: 0, status: 'pending' }, 'status'],
      [{ progress: 101 }, 'progress'],
    ])('refuses %j', async (body, property) => {
      expect(await errorsOf(body)).toEqual([property]);
    });
  });
});
