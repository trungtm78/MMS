import { Test } from '@nestjs/testing';
import { ParseUUIDPipe } from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { DisciplineController } from './discipline.controller';
import { DisciplineService } from './discipline.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../auth/auth.service';

const mockDiscipline = {
  list: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  fileAppeal: jest.fn(),
  decideAppeal: jest.fn(),
};

const user = {
  sub: 'u-1',
  role: 'office_staff',
  unitScope: 'KV1',
} as JwtPayload;
const req = { user, ip: '10.0.0.1', headers: { 'user-agent': 'jest' } };
const origin = { ip: '10.0.0.1', userAgent: 'jest' };
const ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';

const STAFF = ['system_admin', 'police_ward', 'office_staff'];

const usesUuidPipe = (method: string) =>
  Object.values(
    (Reflect.getMetadata(ROUTE_ARGS_METADATA, DisciplineController, method) ??
      {}) as Record<string, { pipes?: unknown[] }>,
  ).some((arg) => arg.pipes?.includes(ParseUUIDPipe));

describe('DisciplineController', () => {
  let controller: DisciplineController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DisciplineController],
      providers: [{ provide: DisciplineService, useValue: mockDiscipline }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(DisciplineController);
    jest.resetAllMocks();
  });

  describe('access control', () => {
    const rolesOf = (method: keyof DisciplineController) =>
      Reflect.getMetadata(
        ROLES_KEY,
        DisciplineController.prototype[method],
      ) as unknown;

    it('requires authentication and role checks on every route', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, DisciplineController),
      ).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('lets staff and DQTV members read and appeal, DQTV only their own', () => {
      expect(Reflect.getMetadata(ROLES_KEY, DisciplineController)).toEqual([
        ...STAFF,
        'dqtv',
        'dqtv_member',
      ]);
      expect(rolesOf('fileAppeal')).toBeUndefined();
    });

    it('lets only staff record decisions and decide appeals', () => {
      expect(rolesOf('create')).toEqual(STAFF);
      expect(rolesOf('decideAppeal')).toEqual(STAFF);
    });

    it.each(['findOne', 'fileAppeal', 'decideAppeal'])(
      'parses the decision id of %s as a UUID',
      (method) => {
        expect(usesUuidPipe(method)).toBe(true);
      },
    );
  });

  it('delegates reads', async () => {
    mockDiscipline.list.mockResolvedValueOnce([]);
    mockDiscipline.findOne.mockResolvedValueOnce({ id: ID });

    await controller.list(req, { status: 'appealed' });
    await controller.findOne(req, ID);

    expect(mockDiscipline.list).toHaveBeenCalledWith(user, {
      status: 'appealed',
    });
    expect(mockDiscipline.findOne).toHaveBeenCalledWith(user, ID);
  });

  it('passes the request origin with every decision it records', async () => {
    const create = {
      militiaId: ID,
      disciplineType: 'canh_cao' as const,
      violation: 'Vắng trực',
      decisionDate: '2026-04-02',
    };
    const appeal = { reason: 'Khiếu nại' };
    const decision = { outcome: 'upheld' as const, resolution: 'Giữ nguyên' };

    await controller.create(req, create);
    await controller.fileAppeal(req, ID, appeal);
    await controller.decideAppeal(req, ID, decision);

    expect(mockDiscipline.create).toHaveBeenCalledWith(user, create, origin);
    expect(mockDiscipline.fileAppeal).toHaveBeenCalledWith(
      user,
      ID,
      appeal,
      origin,
    );
    expect(mockDiscipline.decideAppeal).toHaveBeenCalledWith(
      user,
      ID,
      decision,
      origin,
    );
  });
});
