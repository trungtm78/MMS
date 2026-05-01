import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockDashboardService = {
  getStats: jest.fn(),
};

describe('DashboardController', () => {
  let controller: DashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: mockDashboardService }],
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
    it('returns dashboard stats', () => {
      const stats = { totalMilitia: 100, activeToday: 80, pendingTasks: 5 };
      mockDashboardService.getStats.mockReturnValueOnce(stats);

      const result = controller.getStats();

      expect(result).toEqual(stats);
      expect(mockDashboardService.getStats).toHaveBeenCalled();
    });

    it('delegates to service without transforming result', () => {
      const stats = { someMetric: 42 };
      mockDashboardService.getStats.mockReturnValueOnce(stats);

      const result = controller.getStats();

      expect(result).toBe(stats);
    });
  });
});
