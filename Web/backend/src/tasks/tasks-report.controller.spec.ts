import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

const tasks = { getTaskReport: jest.fn() };

describe('TasksController.getReport', () => {
  useUtcServerClock(VN_1_OCTOBER_0130);

  let controller: TasksController;
  const req = {
    user: {
      sub: 'staff-1',
      username: 's',
      role: 'office_staff',
      unitScope: 'KV-A',
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: tasks }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(TasksController);
    tasks.getTaskReport.mockReset().mockResolvedValue({});
  });

  // Express matches routes in registration order: /tasks/:id declared first would take
  // /tasks/report and fail on the uuid cast
  it('registers /tasks/report before /tasks/:id', () => {
    const methods = Object.getOwnPropertyNames(TasksController.prototype);
    expect(methods.indexOf('getReport')).toBeGreaterThan(-1);
    expect(methods.indexOf('getReport')).toBeLessThan(
      methods.indexOf('getById'),
    );
  });

  it('is open to the task readers', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      Object.getOwnPropertyDescriptor(TasksController.prototype, 'getReport')
        ?.value as object,
    ) as string[];
    expect([...roles].sort()).toEqual(
      [
        'ca_officer',
        'dqtv',
        'dqtv_member',
        'office_staff',
        'system_admin',
      ].sort(),
    );
  });

  it('defaults to the twelve business months ending today in Vietnam', async () => {
    await controller.getReport(req);
    expect(tasks.getTaskReport).toHaveBeenCalledWith(req.user, {
      from: '2025-11-01',
      to: '2026-10-01',
      unitCode: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('passes an explicit range, unit and paging', async () => {
    await controller.getReport(req, '2026-01-01', '2026-06-30', 'KV-B', 2, 10);
    expect(tasks.getTaskReport).toHaveBeenCalledWith(req.user, {
      from: '2026-01-01',
      to: '2026-06-30',
      unitCode: 'KV-B',
      page: 2,
      limit: 10,
    });
  });

  it('refuses a range longer than 366 days', async () => {
    await expect(
      controller.getReport(req, '2025-01-01', '2026-06-30'),
    ).rejects.toThrow(new BadRequestException('date_range_too_long'));
    expect(tasks.getTaskReport).not.toHaveBeenCalled();
  });
});
