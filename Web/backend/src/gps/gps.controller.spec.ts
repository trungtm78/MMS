import { ParseUUIDPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { GpsController } from './gps.controller';
import { GpsService } from './gps.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockGpsService = {
  recordLocation: jest.fn(),
  getLive: jest.fn(),
  getHistory: jest.fn(),
};

const MEMBER_ID = '5b0c3f7e-8f6a-4d52-9d8b-2f6f7a1c9e01';
const dqtvUser = { sub: 'dqtv-1', role: 'dqtv_member', unitScope: 'UNIT_001' };
const caUser = { sub: 'ca-1', role: 'ca_officer', unitScope: 'UNIT_001' };

describe('GpsController', () => {
  let controller: GpsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GpsController],
      providers: [{ provide: GpsService, useValue: mockGpsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GpsController>(GpsController);
    jest.clearAllMocks();
  });

  it('records the caller location and answers ok', async () => {
    mockGpsService.recordLocation.mockResolvedValueOnce(undefined);

    await expect(
      controller.record({ user: dqtvUser } as never, { lat: 10.5, lng: 106.5 }),
    ).resolves.toEqual({ ok: true });
    expect(mockGpsService.recordLocation).toHaveBeenCalledWith('dqtv-1', {
      lat: 10.5,
      lng: 106.5,
    });
  });

  // The positions a caller sees follow their scope (GpsService.getLive)
  it.each(['getLive', 'getTeam'] as const)(
    '%s lists the positions the caller may see',
    async (method) => {
      const positions = [{ militiaId: 'mp-1', lat: 10.5, lng: 106.5 }];
      mockGpsService.getLive.mockResolvedValueOnce(positions);

      await expect(
        controller[method]({ user: caUser } as never),
      ).resolves.toEqual(positions);
      expect(mockGpsService.getLive).toHaveBeenCalledWith(caUser);
    },
  );

  it('reads the history of a member as the caller', async () => {
    const history = { data: [], total: 0, page: 1, limit: 50 };
    mockGpsService.getHistory.mockResolvedValueOnce(history);

    await expect(
      controller.getHistory(
        { user: caUser } as never,
        MEMBER_ID,
        '2025-01-01',
        '2025-01-31',
        1,
        50,
      ),
    ).resolves.toEqual(history);
    expect(mockGpsService.getHistory).toHaveBeenCalledWith(
      caUser,
      MEMBER_ID,
      '2025-01-01',
      '2025-01-31',
      1,
      50,
    );
  });

  it('parses the member id of a history as a UUID', () => {
    const args = Object.values(
      (Reflect.getMetadata(ROUTE_ARGS_METADATA, GpsController, 'getHistory') ??
        {}) as Record<string, { pipes?: unknown[] }>,
    );
    expect(args.some((arg) => arg.pipes?.includes(ParseUUIDPipe))).toBe(true);
  });
});
