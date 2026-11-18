import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { AssignmentsService } from '../assignments/assignments.service';
import type { JwtPayload } from '../auth/auth.service';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';

const mockQuery = jest.fn();
const mockDs = { query: mockQuery };

const mockExcelExportService = {};
const mockAssignmentsService = { getAssignedDqtvIds: jest.fn() };

const adminUser: JwtPayload = {
  sub: 'admin-1',
  username: 'admin',
  role: 'system_admin',
  unitScope: null,
};
const policeWard: JwtPayload = {
  sub: 'pw-1',
  username: 'pw',
  role: 'police_ward',
  unitScope: null,
};
const policeArea: JwtPayload = {
  sub: 'pa-1',
  username: 'pa',
  role: 'police_area',
  unitScope: 'UNIT_001',
};

async function build() {
  const mod = await Test.createTestingModule({
    providers: [
      DashboardService,
      { provide: getDataSourceToken(), useValue: mockDs },
      { provide: ExcelExportService, useValue: mockExcelExportService },
      { provide: AssignmentsService, useValue: mockAssignmentsService },
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

  describe('getStats business date', () => {
    useUtcServerClock(VN_1_OCTOBER_0130);

    it("counts today's attendance for the Vietnamese date", async () => {
      mockQuery.mockResolvedValueOnce([{}]);

      await service.getStats(adminUser);

      expect((mockQuery.mock.calls as unknown[][])[0][1]).toEqual([
        '2026-10-01',
        null,
        null,
      ]);
    });
  });

  it('1. getStats returns all 5 counters', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        total_militia: '42',
        active_today: '10',
        pending_tasks: '3',
        pending_approvals: '2',
        active_sos: '1',
      },
    ]);

    const result = await service.getStats(adminUser);

    expect(result.totalMilitia).toBe(42);
    expect(result.activeToday).toBe(10);
    expect(result.pendingTasks).toBe(3);
    expect(result.pendingApprovals).toBe(2);
    expect(result.activeSosAlerts).toBe(1);
  });

  it('2. Empty DB returns all zeros', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        total_militia: '0',
        active_today: '0',
        pending_tasks: '0',
        pending_approvals: '0',
        active_sos: '0',
      },
    ]);

    const result = await service.getStats(adminUser);

    expect(result).toEqual({
      totalMilitia: 0,
      activeToday: 0,
      pendingTasks: 0,
      pendingApprovals: 0,
      activeSosAlerts: 0,
    });
  });

  it('3. Single CTE query issued (1 round trip)', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        total_militia: '5',
        active_today: '2',
        pending_tasks: '1',
        pending_approvals: '0',
        active_sos: '0',
      },
    ]);

    await service.getStats(adminUser);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = (mockQuery.mock.calls as unknown[][])[0][0] as string;
    expect(sql).toContain('total_militia');
    expect(sql).toContain('active_today');
    expect(sql).toContain('pending_tasks');
    expect(sql).toContain('pending_approvals');
    expect(sql).toContain('active_sos');
  });

  // Codex round 2: every signed-in user, DQTV members included, saw ward-wide counters
  describe('getStats scope', () => {
    const params = () => (mockQuery.mock.calls as unknown[][])[0][1];
    const sql = () => String((mockQuery.mock.calls as unknown[][])[0][0]);

    beforeEach(() => {
      mockQuery.mockResolvedValueOnce([{}]);
      mockAssignmentsService.getAssignedDqtvIds.mockReset();
    });

    it('counts the whole ward for ward-wide roles', async () => {
      await service.getStats(policeWard);

      expect((params() as unknown[]).slice(1)).toEqual([null, null]);
    });

    it('limits every counter of a unit-scoped officer to their unit', async () => {
      await service.getStats(policeArea);

      expect((params() as unknown[]).slice(1)).toEqual(['UNIT_001', null]);
      expect(sql().match(/\$2::text IS NULL OR/g)).toHaveLength(5);
      // Leave requests and SOS reports belong to the unit of the person who filed them
      expect(sql()).toMatch(/uis\.user_id = lr\.requester_id/);
      expect(sql()).toMatch(/uis\.user_id = i\.reporter_id/);
    });

    it('gives a DQTV member counters about their own records only', async () => {
      await service.getStats({
        sub: 'dq-1',
        username: 'dqtv01',
        role: 'dqtv',
        unitScope: null,
      });

      expect((params() as unknown[]).slice(1)).toEqual([null, ['dq-1']]);
      expect(sql()).toMatch(/mp\.user_id = ANY\(\$3::uuid\[\]\)/);
      expect(sql()).toMatch(/ta\.assignee_id = ANY\(\$3::uuid\[\]\)/);
      expect(sql()).toMatch(/lr\.requester_id = ANY\(\$3::uuid\[\]\)/);
      expect(sql()).toMatch(/i\.reporter_id = ANY\(\$3::uuid\[\]\)/);
    });

    it('gives a member who also holds a staff role the staff counters', async () => {
      await service.getStats({
        ...policeArea,
        role: 'office_staff',
        roles: ['office_staff', 'dqtv'],
      });

      expect((params() as unknown[]).slice(1)).toEqual(['UNIT_001', null]);
    });

    it('limits a CA officer to the DQTV members assigned to them', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([
        'u-a',
        'u-b',
      ]);

      await service.getStats({
        sub: 'ca-1',
        username: 'ca',
        role: 'ca_officer',
        unitScope: 'UNIT_001',
      });

      expect(mockAssignmentsService.getAssignedDqtvIds).toHaveBeenCalledWith(
        'ca-1',
      );
      expect((params() as unknown[]).slice(1)).toEqual([
        'UNIT_001',
        ['u-a', 'u-b'],
      ]);
    });

    it('refuses an area role without a unit scope', async () => {
      mockQuery.mockReset();

      await expect(
        service.getStats({ ...policeArea, unitScope: null }),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ── getComplianceStats ─────────────────────────────────────────────────

  describe('getMau03Bc', () => {
    const highestPlaceholder = (sql: string) =>
      Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    const stubFourQueries = () => {
      for (let i = 0; i < 4; i++) mockQuery.mockResolvedValueOnce([{}]);
    };

    // Postgres rejects a bind message whose parameter count differs from the
    // placeholders ("bind message supplies 1 parameters, but prepared statement requires 0")
    it.each([
      ['all units', undefined],
      ['one unit', 'KV1'],
    ])(
      'binds exactly the parameters each query uses (%s)',
      async (_label, unitCode) => {
        stubFourQueries();

        await service.getMau03Bc(adminUser, 2026, unitCode);

        const calls = mockQuery.mock.calls as unknown[][];
        expect(calls).toHaveLength(4);
        for (const [sql, params] of calls) {
          expect(params as unknown[]).toHaveLength(
            highestPlaceholder(String(sql)),
          );
        }
      },
    );

    it('scopes every query to the unit a wide role requests', async () => {
      stubFourQueries();

      await service.getMau03Bc(adminUser, 2026, 'KV1');

      for (const [, params] of mockQuery.mock.calls as unknown[][]) {
        expect(params).toContain('KV1');
      }
    });

    // Personnel, discipline and payroll totals of other units must not leak
    it('locks unit-scoped callers to their own unit whatever they request', async () => {
      stubFourQueries();

      await service.getMau03Bc(policeArea, 2026, 'OTHER_UNIT');

      for (const [, params] of mockQuery.mock.calls as unknown[][]) {
        expect(params).toContain('UNIT_001');
        expect(params).not.toContain('OTHER_UNIT');
      }
    });

    it('refuses an area role without a unit scope', async () => {
      await expect(
        service.getMau03Bc({ ...policeArea, unitScope: null }, 2026),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    // Rows as node-postgres answers them: COUNT is BIGINT text, SUM over NUMERIC a number
    // (src/database/pg-types.ts). Training days come in halves.
    it('reports counts as integers and training days and salaries with their fractions', async () => {
      mockQuery
        .mockResolvedValueOnce([
          { total_active: '12', total_inactive: '1', total_female: '3' },
        ])
        .mockResolvedValueOnce([
          { trained_count: '5', total_training_days: 37.5 },
        ])
        .mockResolvedValueOnce([{ reward_count: '2', discipline_count: '1' }])
        .mockResolvedValueOnce([{ total_salary: 12345678.5 }]);

      await expect(service.getMau03Bc(adminUser, 2026)).resolves.toMatchObject({
        militia: { totalActive: 12, totalInactive: 1, totalFemale: 3 },
        training: { trainedCount: 5, totalTrainingDays: 37.5 },
        discipline: { rewardCount: 2, disciplineCount: 1 },
        budget: { totalSalary: 12345678.5 },
      });
    });
  });

  describe('getCharts', () => {
    it('fills every month of the year and reads the counts as integers', async () => {
      mockQuery
        .mockResolvedValueOnce([
          { month: 3, assigned: '5', completed: '4', overdue: '1' },
          { month: 9, assigned: '16', completed: '6', overdue: '2' },
        ])
        .mockResolvedValueOnce([
          { unit_code: 'KP1', unit_name: 'Khu phố 1', headcount: '8' },
        ]);

      const result = await service.getCharts(adminUser, 2026);

      expect(result.year).toBe(2026);
      expect(result.tasks).toHaveLength(12);
      expect(result.tasks[0]).toEqual({
        month: 1,
        assigned: 0,
        completed: 0,
        overdue: 0,
      });
      expect(result.tasks[2]).toEqual({
        month: 3,
        assigned: 5,
        completed: 4,
        overdue: 1,
      });
      expect(result.tasks[8]).toEqual({
        month: 9,
        assigned: 16,
        completed: 6,
        overdue: 2,
      });
      expect(result.areas).toEqual([
        { unitCode: 'KP1', unitName: 'Khu phố 1', headcount: 8 },
      ]);
    });

    it('buckets tasks by the Vietnamese month they were created in', async () => {
      mockQuery.mockResolvedValue([]);
      await service.getCharts(adminUser, 2026);

      const sql = (mockQuery.mock.calls as unknown[][])[0][0] as string;
      expect(sql).toMatch(/t\.created_at AT TIME ZONE 'Asia\/Ho_Chi_Minh'/);
      expect(sql).toMatch(/t\.status = 'completed'/);
      // Late: finished after the deadline, or still open past it
      expect(sql).toMatch(/t\.completed_at > t\.deadline/);
      expect(sql).toMatch(
        /t\.status NOT IN \('completed', 'cancelled'\)\s+AND t\.deadline < now\(\)/,
      );
    });

    it('counts the active members of each unit', async () => {
      mockQuery.mockResolvedValue([]);
      await service.getCharts(adminUser, 2026);

      const sql = (mockQuery.mock.calls as unknown[][])[1][0] as string;
      expect(sql).toMatch(/mp\.status = 'active'/);
      expect(sql).toMatch(/GROUP BY u\.code, u\.name/);
    });

    it('limits both charts to the scope of the counters', async () => {
      mockQuery.mockResolvedValue([]);
      await service.getCharts(policeArea, 2025);

      const calls = mockQuery.mock.calls as unknown[][];
      expect(calls[0][1]).toEqual([2025, 'UNIT_001', null]);
      expect(calls[1][1]).toEqual(['UNIT_001', null]);
    });

    it('limits a CA officer to the DQTV members assigned to them', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce(['d-1']);
      mockQuery.mockResolvedValue([]);
      await service.getCharts(
        { sub: 'ca-1', username: 'ca', role: 'ca_officer', unitScope: 'KP1' },
        2026,
      );

      const calls = mockQuery.mock.calls as unknown[][];
      expect(calls[0][1]).toEqual([2026, 'KP1', ['d-1']]);
      expect(calls[1][1]).toEqual(['KP1', ['d-1']]);
    });
  });

  describe('getComplianceStats', () => {
    // COUNT is BIGINT text; ROUND over NUMERIC is a number (src/database/pg-types.ts)
    const mockRow = {
      total_active: '50',
      training_compliant: '40',
      attendance_pct: 88.5,
      avg_kpi_score: 7.8,
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

    // The current month is still being evaluated: the figure is the latest period that
    // already has scores for the scope, never a future one
    it('averages kpi_scores.total_score of the latest scored KPI period up to this month', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(adminUser);

      const sql = (mockQuery.mock.calls as unknown[][])[0][0] as string;
      expect(sql).toMatch(/AVG\(ks\.total_score\)/);
      expect(sql).toMatch(/\(kp\.year, kp\.month\) <= \(\$2::int, \$3::int\)/);
      expect(sql).toMatch(
        /EXISTS \(\s*SELECT 1 FROM kpi_scores ks\s+JOIN scope s ON s\.militia_id = ks\.militia_id\s+WHERE ks\.period_id = kp\.id\)/,
      );
      expect(sql).toMatch(/ORDER BY kp\.year DESC, kp\.month DESC\s+LIMIT 1/);
      expect(sql).not.toMatch(/ks\.score|ks\.created_at/);
    });

    it('names the KPI period it averaged', async () => {
      mockQuery.mockResolvedValueOnce([
        { ...mockRow, kpi_year: 2026, kpi_month: 8 },
      ]);
      const result = await service.getComplianceStats(adminUser);
      expect(result.avgKpiScore).toBe(7.8);
      expect(result.kpiPeriod).toEqual({ year: 2026, month: 8 });
    });

    it('reports no KPI average and no period when no member has a score yet', async () => {
      mockQuery.mockResolvedValueOnce([
        { ...mockRow, avg_kpi_score: null, kpi_year: null, kpi_month: null },
      ]);
      const result = await service.getComplianceStats(adminUser);
      expect(result.avgKpiScore).toBeNull();
      expect(result.kpiPeriod).toBeNull();
    });

    // A scalar subquery with GROUP BY returns one row per militia member and fails
    // with "more than one row returned by a subquery" once two members qualify.
    it('counts training-compliant members over a derived table, not a grouped scalar subquery', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(adminUser);

      const sql = (mockQuery.mock.calls as unknown[][])[0][0] as string;
      expect(sql).toMatch(
        /\(SELECT COUNT\(\*\)\s+FROM \(\s*SELECT tr\.militia_id\s+FROM training_records tr/,
      );
      expect(sql).not.toMatch(/COUNT\(DISTINCT tr\.militia_id\)/);
    });

    it('counts only active exemptions expiring within 30 days', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(adminUser);

      const sql = (mockQuery.mock.calls as unknown[][])[0][0] as string;
      expect(sql).toMatch(/ex\.status = 'active'/);
      expect(sql).toMatch(/ex\.expiry_date BETWEEN/);
      // Members, not decision rows: one member must count once
      expect(sql).toMatch(/COUNT\(DISTINCT ex\.militia_id\)/);
      expect(sql).not.toMatch(/end_date/);
    });

    it('single CTE query — 1 round trip', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(adminUser);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('police_area locked to unitScope', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(policeArea);
      const params = (mockQuery.mock.calls as unknown[][])[0][1] as unknown[];
      expect(params[0]).toBe('UNIT_001');
    });

    it('system_admin uses null filter (all units)', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(adminUser);
      const params = (mockQuery.mock.calls as unknown[][])[0][1] as unknown[];
      expect(params[0]).toBeNull();
    });

    it('system_admin can filter by unitCode param', async () => {
      mockQuery.mockResolvedValueOnce([mockRow]);
      await service.getComplianceStats(adminUser, 'UNIT_002');
      const params = (mockQuery.mock.calls as unknown[][])[0][1] as unknown[];
      expect(params[0]).toBe('UNIT_002');
    });

    it('handles zero totalActive without division by zero', async () => {
      mockQuery.mockResolvedValueOnce([
        { ...mockRow, total_active: '0', training_compliant: '0' },
      ]);
      const result = await service.getComplianceStats(adminUser);
      expect(result.trainingCompliancePct).toBe(0);
    });
  });
});
