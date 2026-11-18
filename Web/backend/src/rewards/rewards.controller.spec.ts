import { Test } from '@nestjs/testing';
import { ParseUUIDPipe } from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../auth/auth.service';

const mockRewards = { list: jest.fn(), findOne: jest.fn(), create: jest.fn() };

const user = {
  sub: 'u-1',
  role: 'office_staff',
  unitScope: 'KV1',
} as JwtPayload;
const req = { user, ip: '10.0.0.1', headers: { 'user-agent': 'jest' } };
const ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';

// The manageRewards permission of the web app
const STAFF = ['system_admin', 'police_ward', 'office_staff'];

const usesUuidPipe = (controller: object, method: string) =>
  Object.values(
    (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ??
      {}) as Record<string, { pipes?: unknown[] }>,
  ).some((arg) => arg.pipes?.includes(ParseUUIDPipe));

describe('RewardsController', () => {
  let controller: RewardsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [RewardsController],
      providers: [{ provide: RewardsService, useValue: mockRewards }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(RewardsController);
    jest.resetAllMocks();
  });

  describe('access control', () => {
    it('requires authentication and role checks on every route', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, RewardsController)).toEqual([
        JwtAuthGuard,
        RolesGuard,
      ]);
    });

    it('lets staff and DQTV members read, DQTV only their own', () => {
      expect(Reflect.getMetadata(ROLES_KEY, RewardsController)).toEqual([
        ...STAFF,
        'dqtv',
        'dqtv_member',
      ]);
    });

    it('lets only staff record a decision', () => {
      const rolesOf = (method: keyof RewardsController) =>
        Reflect.getMetadata(
          ROLES_KEY,
          RewardsController.prototype[method],
        ) as unknown;
      expect(rolesOf('create')).toEqual(STAFF);
    });

    it('parses the id of a single decision as a UUID', () => {
      expect(usesUuidPipe(RewardsController, 'findOne')).toBe(true);
    });
  });

  it('lists with the query filters', async () => {
    mockRewards.list.mockResolvedValueOnce([]);

    await expect(controller.list(req, { unitCode: 'KV1' })).resolves.toEqual(
      [],
    );
    expect(mockRewards.list).toHaveBeenCalledWith(user, { unitCode: 'KV1' });
  });

  it('reads one decision', async () => {
    mockRewards.findOne.mockResolvedValueOnce({ id: ID });

    await expect(controller.findOne(req, ID)).resolves.toEqual({ id: ID });
    expect(mockRewards.findOne).toHaveBeenCalledWith(user, ID);
  });

  it('records a decision with where the request came from', async () => {
    const dto = {
      militiaId: ID,
      rewardType: 'giay_khen' as const,
      issuingAuthority: 'commune' as const,
      issuedDate: '2026-03-15',
    };
    mockRewards.create.mockResolvedValueOnce({ id: 'rd-1' });

    await expect(controller.create(req, dto)).resolves.toEqual({ id: 'rd-1' });
    expect(mockRewards.create).toHaveBeenCalledWith(user, dto, {
      ip: '10.0.0.1',
      userAgent: 'jest',
    });
  });
});
