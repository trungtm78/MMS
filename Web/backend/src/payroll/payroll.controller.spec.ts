import { Test, TestingModule } from '@nestjs/testing';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockPayrollService = {
  listPeriods: jest.fn(),
  getKpiScores: jest.fn(),
  adjustKpi: jest.fn(),
  exportHtml: jest.fn(),
  calculateAllowances: jest.fn(),
  createPeriod: jest.fn(),
  reopenPeriod: jest.fn(),
  lockPeriod: jest.fn(),
};

const adminReq = { user: { sub: 'admin-1', username: 'admin', role: 'system_admin', unitScope: null } };

describe('PayrollController', () => {
  let controller: PayrollController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollController],
      providers: [{ provide: PayrollService, useValue: mockPayrollService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PayrollController>(PayrollController);
    jest.clearAllMocks();
  });

  describe('listPeriods', () => {
    it('returns array of periods directly', async () => {
      const periods = [{ id: 'p1', year: 2025, month: 1 }];
      mockPayrollService.listPeriods.mockResolvedValueOnce({ data: periods, total: 1 });

      const result = await controller.listPeriods(1, 20);

      expect(result).toEqual(periods);
      expect(mockPayrollService.listPeriods).toHaveBeenCalledWith(1, 20);
    });

    it('returns empty array when no periods exist', async () => {
      mockPayrollService.listPeriods.mockResolvedValueOnce({ data: [], total: 0 });

      const result = await controller.listPeriods(1, 20);

      expect(result).toEqual([]);
    });
  });

  describe('getKpiScores', () => {
    it('returns KPI scores for a period', async () => {
      const kpi = { data: [{ militiaId: 'mp-1', score: 85 }], total: 1 };
      mockPayrollService.getKpiScores.mockResolvedValueOnce(kpi);

      const result = await controller.getKpiScores('p-1', 1, 20);

      expect(result).toEqual(kpi);
      expect(mockPayrollService.getKpiScores).toHaveBeenCalledWith('p-1', 1, 20);
    });

    it('returns empty result for unknown period', async () => {
      mockPayrollService.getKpiScores.mockResolvedValueOnce({ data: [], total: 0 });

      const result = await controller.getKpiScores('bad', 1, 20);

      expect(result.data).toHaveLength(0);
    });
  });

  describe('adjustKpi', () => {
    it('adjusts KPI score and returns updated record', async () => {
      const updated = { militiaId: 'mp-1', adjustedScore: 90 };
      mockPayrollService.adjustKpi.mockResolvedValueOnce(updated);

      const result = await controller.adjustKpi(
        'mp-1',
        'p-1',
        { adjustedScore: 90, adjustmentNote: 'Manual override' },
        adminReq,
      );

      expect(result).toEqual(updated);
      expect(mockPayrollService.adjustKpi).toHaveBeenCalledWith(
        'mp-1',
        'p-1',
        90,
        'Manual override',
        'admin-1',
      );
    });

    it('uses dto.periodId when query periodId missing', async () => {
      mockPayrollService.adjustKpi.mockResolvedValueOnce({});

      await controller.adjustKpi(
        'mp-1',
        '',
        { adjustedScore: 80, adjustmentNote: 'Note', periodId: 'p-from-body' },
        adminReq,
      );

      expect(mockPayrollService.adjustKpi).toHaveBeenCalledWith(
        'mp-1',
        'p-from-body',
        80,
        'Note',
        'admin-1',
      );
    });
  });

  describe('calculate', () => {
    it('triggers allowance calculation and returns result', async () => {
      const calcResult = { calculated: 42, period: 'p-1' };
      mockPayrollService.calculateAllowances.mockResolvedValueOnce(calcResult);

      const result = await controller.calculate('p-1');

      expect(result).toEqual(calcResult);
      expect(mockPayrollService.calculateAllowances).toHaveBeenCalledWith('p-1');
    });

    it('propagates error when period locked', async () => {
      mockPayrollService.calculateAllowances.mockRejectedValueOnce(new Error('period_locked'));

      await expect(controller.calculate('locked-p')).rejects.toThrow('period_locked');
    });
  });

  describe('createPeriod', () => {
    it('creates a new payroll period', async () => {
      const period = { id: 'p-new', year: 2025, month: 3 };
      mockPayrollService.createPeriod.mockResolvedValueOnce(period);

      const result = await controller.createPeriod({ year: 2025, month: 3 });

      expect(result).toEqual(period);
      expect(mockPayrollService.createPeriod).toHaveBeenCalledWith(2025, 3);
    });

    it('propagates error on duplicate period', async () => {
      mockPayrollService.createPeriod.mockRejectedValueOnce(new Error('period_exists'));

      await expect(controller.createPeriod({ year: 2025, month: 1 })).rejects.toThrow('period_exists');
    });
  });

  describe('lockPeriod', () => {
    it('locks period and returns result', async () => {
      const locked = { id: 'p-1', status: 'locked' };
      mockPayrollService.lockPeriod.mockResolvedValueOnce(locked);

      const result = await controller.lockPeriod('p-1', adminReq);

      expect(result).toEqual(locked);
      expect(mockPayrollService.lockPeriod).toHaveBeenCalledWith('p-1', adminReq.user);
    });
  });

  describe('reopenPeriod', () => {
    it('reopens locked period and returns result', async () => {
      const reopened = { id: 'p-1', status: 'open' };
      mockPayrollService.reopenPeriod.mockResolvedValueOnce(reopened);

      const result = await controller.reopenPeriod('p-1', adminReq);

      expect(result).toEqual(reopened);
    });
  });
});
