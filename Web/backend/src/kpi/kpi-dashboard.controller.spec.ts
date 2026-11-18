import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import { KpiDashboardController } from './kpi-dashboard.controller';
import { KpiDashboardService } from './kpi-dashboard.service';

const dashboard = { getDashboard: jest.fn() };

describe('KpiDashboardController', () => {
  let controller: KpiDashboardController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [KpiDashboardController],
      providers: [{ provide: KpiDashboardService, useValue: dashboard }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(KpiDashboardController);
    dashboard.getDashboard.mockReset().mockResolvedValue({});
  });

  it('serves GET /kpi/dashboard to the KPI report readers', () => {
    expect(Reflect.getMetadata(PATH_METADATA, KpiDashboardController)).toBe(
      'kpi',
    );
    const handler = Object.getOwnPropertyDescriptor(
      KpiDashboardController.prototype,
      'getDashboard',
    )?.value as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('dashboard');
    const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
    expect([...roles].sort()).toEqual(
      ['office_staff', 'police_area', 'police_ward', 'system_admin'].sort(),
    );
  });

  it('passes the caller, period, unit and bounds', async () => {
    const req = {
      user: {
        sub: 's-1',
        username: 's',
        role: 'office_staff',
        unitScope: 'KV-A',
      },
    };
    await controller.getDashboard(req, undefined, 2026, 9, 'KV-B', 10, 12);
    expect(dashboard.getDashboard).toHaveBeenCalledWith(req.user, {
      periodId: undefined,
      year: 2026,
      month: 9,
      unitCode: 'KV-B',
      top: 10,
      trendMonths: 12,
    });
  });

  it('reads a blank unit as none and applies the default bounds', async () => {
    const req = {
      user: {
        sub: 'a-1',
        username: 'a',
        role: 'system_admin',
        unitScope: null,
      },
    };
    await controller.getDashboard(
      req,
      'a3b1c2d4-0000-4000-8000-000000000001',
      undefined,
      undefined,
      '',
    );
    expect(dashboard.getDashboard).toHaveBeenCalledWith(req.user, {
      periodId: 'a3b1c2d4-0000-4000-8000-000000000001',
      year: undefined,
      month: undefined,
      unitCode: undefined,
      top: 5,
      trendMonths: 6,
    });
  });
});
