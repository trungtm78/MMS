import { Test } from '@nestjs/testing';
import { ParseUUIDPipe } from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { TrainingPlansController } from './training-plans.controller';
import { TrainingPlansService } from './training-plans.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../auth/auth.service';

const mockPlans = {
  listPlans: jest.fn(),
  getPlan: jest.fn(),
  createPlan: jest.fn(),
  updatePlanStatus: jest.fn(),
  listSessions: jest.fn(),
  getSession: jest.fn(),
  createSession: jest.fn(),
  sessionMembers: jest.fn(),
  recordAttendance: jest.fn(),
};

const user = {
  sub: 'u-1',
  role: 'police_area',
  unitScope: 'KV1',
} as JwtPayload;
const req = { user };
const ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';

const usesUuidPipe = (method: string) =>
  Object.values(
    (Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TrainingPlansController,
      method,
    ) ?? {}) as Record<string, { pipes?: unknown[] }>,
  ).some((arg) => arg.pipes?.includes(ParseUUIDPipe));

describe('TrainingPlansController', () => {
  let controller: TrainingPlansController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TrainingPlansController],
      providers: [{ provide: TrainingPlansService, useValue: mockPlans }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(TrainingPlansController);
    jest.resetAllMocks();
  });

  describe('access control', () => {
    it('requires authentication and the training manager roles on every route', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, TrainingPlansController),
      ).toEqual([JwtAuthGuard, RolesGuard]);
      expect(Reflect.getMetadata(ROLES_KEY, TrainingPlansController)).toEqual([
        'system_admin',
        'police_ward',
        'police_area',
      ]);
    });

    it.each([
      'getPlan',
      'updatePlanStatus',
      'getSession',
      'sessionMembers',
      'recordAttendance',
    ])('parses the id of %s as a UUID', (method) => {
      expect(usesUuidPipe(method)).toBe(true);
    });
  });

  it('delegates plan routes', async () => {
    await controller.listPlans(req, { year: 2026 });
    await controller.getPlan(req, ID);
    await controller.createPlan(req, {
      year: 2026,
      type: 'military',
      requiredDays: 15,
    });
    await controller.updatePlanStatus(req, ID, { status: 'active' });

    expect(mockPlans.listPlans).toHaveBeenCalledWith(user, { year: 2026 });
    expect(mockPlans.getPlan).toHaveBeenCalledWith(user, ID);
    expect(mockPlans.createPlan).toHaveBeenCalledWith(user, {
      year: 2026,
      type: 'military',
      requiredDays: 15,
    });
    expect(mockPlans.updatePlanStatus).toHaveBeenCalledWith(user, ID, 'active');
  });

  it('delegates session routes', async () => {
    const session = {
      planId: ID,
      name: 'Đợt 1',
      startDate: '2026-10-01',
      endDate: '2026-10-05',
      location: 'Thao trường',
      daysCount: 5,
    };
    const attendance = [{ memberId: ID, attended: true }];

    await controller.listSessions(req, { planId: ID });
    await controller.getSession(req, ID);
    await controller.createSession(req, session);
    await controller.sessionMembers(req, ID);
    await controller.recordAttendance(req, ID, { attendance });

    expect(mockPlans.listSessions).toHaveBeenCalledWith(user, { planId: ID });
    expect(mockPlans.getSession).toHaveBeenCalledWith(user, ID);
    expect(mockPlans.createSession).toHaveBeenCalledWith(user, session);
    expect(mockPlans.sessionMembers).toHaveBeenCalledWith(user, ID);
    expect(mockPlans.recordAttendance).toHaveBeenCalledWith(
      user,
      ID,
      attendance,
    );
  });
});
