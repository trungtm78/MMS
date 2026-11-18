import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController, ReportsController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { useUtcServerClock, VN_NEW_YEAR_0030 } from '../../test/support/clock';

const mockDashboardService = {
  getStats: jest.fn(),
  getCharts: jest.fn(),
  getMau03Bc: jest.fn(),
  exportMau03Bc: jest.fn(),
};

describe('DashboardController', () => {
  let controller: DashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DashboardController>(DashboardController);
    jest.clearAllMocks();
  });

  describe('getStats', () => {
    const caller = {
      sub: 'pa-1',
      username: 'pa',
      role: 'police_area',
      unitScope: 'KV1',
    };

    it('returns the counters for the caller, whose scope decides them', () => {
      const stats = { totalMilitia: 100, activeToday: 80, pendingTasks: 5 };
      mockDashboardService.getStats.mockReturnValueOnce(stats);

      const result = controller.getStats({ user: caller });

      expect(result).toEqual(stats);
      expect(mockDashboardService.getStats).toHaveBeenCalledWith(caller);
    });

    it('delegates to service without transforming result', () => {
      const stats = { someMetric: 42 };
      mockDashboardService.getStats.mockReturnValueOnce(stats);

      const result = controller.getStats({ user: caller });

      expect(result).toBe(stats);
    });
  });

  describe('getCharts', () => {
    const caller = {
      sub: 'pa-1',
      username: 'pa',
      role: 'police_area',
      unitScope: 'KV1',
    };

    it('charts the requested year for the caller', () => {
      const charts = { year: 2025, tasks: [], areas: [] };
      mockDashboardService.getCharts.mockReturnValueOnce(charts);

      expect(controller.getCharts({ user: caller }, 2025)).toBe(charts);
      expect(mockDashboardService.getCharts).toHaveBeenCalledWith(caller, 2025);
    });

    describe('default year', () => {
      useUtcServerClock(VN_NEW_YEAR_0030);

      it('charts the Vietnamese year', () => {
        void controller.getCharts({ user: caller });
        expect(mockDashboardService.getCharts).toHaveBeenCalledWith(
          caller,
          2027,
        );
      });
    });
  });
});

describe('ReportsController', () => {
  let controller: ReportsController;
  const user = {
    sub: 'admin-1',
    username: 'admin',
    role: 'system_admin',
    unitScope: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ReportsController);
    jest.clearAllMocks();
  });

  describe('default Mẫu 03-BC year', () => {
    useUtcServerClock(VN_NEW_YEAR_0030);

    it('reports on the Vietnamese year', async () => {
      await controller.getMau03Bc({ user });

      expect(mockDashboardService.getMau03Bc).toHaveBeenCalledWith(
        user,
        2027,
        undefined,
      );
    });

    it('exports the Vietnamese year', async () => {
      const res = {};

      await controller.exportMau03Bc(
        { user },
        undefined,
        undefined,
        res as never,
      );

      expect(mockDashboardService.exportMau03Bc).toHaveBeenCalledWith(
        user,
        2027,
        undefined,
        res,
      );
    });
  });

  // YearPipe has already turned the query string into a number
  it('uses the requested year when given', async () => {
    await controller.getMau03Bc({ user }, 2025, 'KV1');

    expect(mockDashboardService.getMau03Bc).toHaveBeenCalledWith(
      user,
      2025,
      'KV1',
    );
  });
});
