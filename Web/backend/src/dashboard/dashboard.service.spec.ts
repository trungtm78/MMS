import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import type { JwtPayload } from '../auth/auth.service';

const mockQuery = jest.fn();
const mockDs = { query: mockQuery };

const mockExcelExportService = {};

const adminUser: JwtPayload = { sub: 'admin-1', username: 'admin', role: 'system_admin', unitScope: null };
const policeWard: JwtPayload = { sub: 'pw-1', username: 'pw', role: 'police_ward', unitScope: null };
const policeArea: JwtPayload = { sub: 'pa-1', username: 'pa', role: 'police_area', unitScope: 'UNIT_001' };

async function build() {
  const mod = await Test.createTestingModule({
    providers: [
      DashboardService,
      { provide: getDataSourceToken(), useValue: mockDs },
      { provide: ExcelExportService, useValue: mockExcelExportService },
    ],
  }).compile();
  return mod.get(DashboardService);
}

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    service = await build();
    mockQuery.mockReset();
  });

  it('1. getStats returns all 5 counters', async () => {
    mockQuery.mockResolvedValueOnce([{
      total_militia: '42',
      active_today: '10',
      pending_tasks: '3',
      pending_approvals: '2',
      active_sos: '1',
    }]);

    const result = await service.getStats();

    expect(result.totalMilitia).toBe(42);
    expect(result.activeToday).toBe(10);
    expect(result.pendingTasks).toBe(3);
    expect(result.pendingApprovals).toBe(2);
    expect(result.activeSosAlerts).toBe(1);
  });

  it('2. Empty DB returns all zeros', async () => {
    mockQuery.mockResolvedValueOnce([{
      total_militia: '0', active_today: '0',
      pending_tasks: '0', pending_approvals: '0', active_sos: '0',
    }]);

    const result = await service.getStats();

    expect(result).toEqual({
      totalMilitia: 0, activeToday: 0, pendingTasks: 0, pendingApprovals: 0, activeSosAlerts: 0,
    });
  });

  it('3. Single CTE query issued (1 round trip)', async () => {
    mockQuery.mockResolvedValueOnce([{
      total_militia: '5', active_today: '2', pending_tasks: '1', pending_approvals: '0', active_sos: '0',
    }]);

    await service.getStats();

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('total_militia');
    expect(sql).toContain('active_today');
    expect(sql).toContain('pending_tasks');
    expect(sql).toContain('pending_approvals');
    expect(sql).toContain('active_sos');
  });

  // ── getComplianceStats ─────────────────────────────────────────────────

  describe('getComplianceStats', () => {
    const mockRow = {
      total_active: '50',
      training_compliant: '40',
      attendance_pct: '88.5',
      avg_kpi_score: '7.8',
      expiring_exemptions: '3',
    };

    it('returns parsed compliance stats', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      const result = await service.getComplianceStats(adminUser);

      expect(result.totalActive).toBe(50);
      expect(result.trainingCompliant).toBe(40);
      expect(result.trainingCompliancePct).toBe(80);
      expect(result.attendancePct).toBe(88.5);
      expect(result.avgKpiScore).toBe(7.8);
      expect(result.expiringExemptions).toBe(3);
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });

    it('single CTE query — 1 round trip', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(adminUser);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('police_area locked to unitScope', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(policeArea);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('UNIT_001');
    });

    it('system_admin uses null filter (all units)', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(adminUser);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBeNull();
    });

    it('system_admin can filter by unitCode param', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(adminUser, 'UNIT_002');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('UNIT_002');
    });

    it('handles zero totalActive without division by zero', async () => {
      mockQuery.mockResolvedValueOnce([{ ...mockRow, total_active: '0', training_compliant: '0' }]);
      const result = await service.getComplianceStats(adminUser);
      expect(result.trainingCompliancePct).toBe(0);
    });
  });
});
