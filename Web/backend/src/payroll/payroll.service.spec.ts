import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';

const mockQuery = jest.fn();
const mockMgrQuery = jest.fn();
const mockTransaction = jest.fn(
  async (cb: (mgr: { query: typeof mockMgrQuery }) => Promise<unknown>) => {
    return cb({ query: mockMgrQuery });
  },
);
const mockDataSource = { query: mockQuery, transaction: mockTransaction };
const mockExcelService = {
  createWorkbook: jest.fn(),
  addGovernmentHeader: jest.fn().mockReturnValue(8),
  addStyledTable: jest.fn(),
  addSignatureBlock: jest.fn(),
  addDocumentHash: jest.fn(),
  addLegalReferencesSheet: jest.fn(),
  streamToResponse: jest.fn(),
};

async function buildService(): Promise<PayrollService> {
  const module = await Test.createTestingModule({
    providers: [
      PayrollService,
      { provide: getDataSourceToken(), useValue: mockDataSource },
      { provide: ExcelExportService, useValue: mockExcelService },
    ],
  }).compile();
  return module.get(PayrollService);
}

const actor = {
  sub: 'user-1',
  username: 'admin',
  role: 'system_admin',
  unitScope: null,
};

const mgrSql = (call: number) =>
  String((mockMgrQuery.mock.calls as unknown[][])[call][0]);
const mgrParams = (call: number) =>
  (mockMgrQuery.mock.calls as unknown[][])[call][1] as unknown[];

describe('PayrollService', () => {
  let service: PayrollService;

  beforeEach(async () => {
    service = await buildService();
    mockQuery.mockReset();
    mockMgrQuery.mockReset();
    mockTransaction.mockImplementation(
      async (cb: (mgr: { query: typeof mockMgrQuery }) => Promise<unknown>) =>
        cb({ query: mockMgrQuery }),
    );
  });

  // ── listPeriods ──────────────────────────────────────────────────────────

  it('1. listPeriods returns records sorted by year DESC, month DESC', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '2' }]) // COUNT
      .mockResolvedValueOnce([
        {
          id: 'p-1',
          month: 4,
          year: 2026,
          status: 'draft',
          lockedBy: null,
          lockedAt: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'p-2',
          month: 3,
          year: 2026,
          status: 'locked',
          lockedBy: 'user-1',
          lockedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ]);

    const result = await service.listPeriods(1, 20);

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].month).toBe(4);
    expect(result.data[1].month).toBe(3);
    // Verify ORDER BY is in the SQL
    const sql = (mockQuery.mock.calls as unknown[][])[1][0] as string;
    expect(sql).toContain('ORDER BY year DESC, month DESC');
  });

  it('2. listPeriods with empty table returns {data:[], total:0, page:1, limit:20}', async () => {
    mockQuery.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValueOnce([]);

    const result = await service.listPeriods(1, 20);

    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  // ── getKpiScores ─────────────────────────────────────────────────────────

  it('3. getKpiScores uses COUNT DISTINCT — militia with multiple kpi_evaluations shows correct attendanceDays', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'period-1' }]) // period exists check
      .mockResolvedValueOnce([{ count: '1' }]) // COUNT militia
      .mockResolvedValueOnce([
        {
          id: 'mp-1',
          militiaId: 'mp-1',
          militiaName: 'Nguyễn Văn A',
          periodId: 'period-1',
          attendanceDays: 20, // should not be multiplied by kpi_evaluations count
          taskCompleted: 5,
          taskTotal: 8,
          // ROUND over NUMERIC reaches JavaScript as a number (src/database/pg-types.ts)
          score: 85,
          adjustedScore: null,
          adjustmentNote: null,
          adjustedBy: null,
        },
      ]);

    const result = await service.getKpiScores('period-1', 1, 20);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].attendanceDays).toBe(20);

    // Verify COUNT DISTINCT is in the SQL
    const sql = (mockQuery.mock.calls as unknown[][])[2][0] as string;
    expect(sql).toContain('COUNT(DISTINCT ar.id)');
    expect(sql).toContain("ar.status != 'absent'");
  });

  it('4. getKpiScores with non-existent periodId throws NotFoundException', async () => {
    mockQuery.mockResolvedValueOnce([]); // period exists check returns empty

    await expect(service.getKpiScores('no-such-period', 1, 20)).rejects.toThrow(
      new NotFoundException('period_not_found'),
    );
  });

  // ── lockPeriod ───────────────────────────────────────────────────────────

  it('5. lockPeriod happy path sets status=locked, locked_by, locked_at', async () => {
    const now = new Date();
    // 3 queries inside transaction: SELECT, INSERT, UPDATE RETURNING
    mockMgrQuery
      .mockResolvedValueOnce([{ status: 'draft' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'period-1',
          month: 4,
          year: 2026,
          status: 'locked',
          lockedBy: 'user-1',
          lockedAt: now.toISOString(),
          createdAt: now.toISOString(),
        },
      ]);

    const result = await service.lockPeriod('period-1', actor);

    expect(result.status).toBe('locked');
    expect(result.lockedBy).toBe('user-1');
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('6. lockPeriod called twice throws ConflictException', async () => {
    // SELECT returns status=locked → ConflictException thrown before INSERT/UPDATE
    mockMgrQuery.mockResolvedValueOnce([{ status: 'locked' }]);

    await expect(service.lockPeriod('period-1', actor)).rejects.toThrow(
      new ConflictException('period_already_locked'),
    );
  });

  // ── createPeriod ─────────────────────────────────────────────────────────

  describe('createPeriod', () => {
    it('7. should create a new payroll period and return it', async () => {
      const now = new Date().toISOString();
      mockQuery.mockResolvedValueOnce([
        {
          id: 'p-new',
          year: 2026,
          month: 5,
          status: 'draft',
          createdAt: now,
        },
      ]);

      const result = await service.createPeriod(2026, 5);

      expect(result).toBeDefined();
      expect(result['year']).toBe(2026);
      expect(result['month']).toBe(5);
      expect(result['status']).toBe('draft');
    });

    it('8. should throw ConflictException on duplicate year+month (code 23505)', async () => {
      mockQuery.mockRejectedValueOnce({ code: '23505' });

      await expect(service.createPeriod(2026, 5)).rejects.toThrow(
        ConflictException,
      );
    });

    it('9. should rethrow unknown DB errors', async () => {
      const dbErr = new Error('connection_lost');
      mockQuery.mockRejectedValueOnce(dbErr);

      await expect(service.createPeriod(2026, 5)).rejects.toThrow(
        'connection_lost',
      );
    });
  });

  // ── reopenPeriod ─────────────────────────────────────────────────────────

  // ── getComplianceCheck ───────────────────────────────────────────────────

  describe('getComplianceCheck', () => {
    it('13. flags rows where net < minWage as non-compliant', async () => {
      mockQuery
        .mockResolvedValueOnce([{ month: 4, year: 2026 }]) // period exists
        .mockResolvedValueOnce([{ key: 'min_wage_region_1', value: '4960000' }]) // settings
        .mockResolvedValueOnce([
          {
            militiaId: 'mp-1',
            militiaName: 'Nguyễn Văn A',
            baseSalary: 3000000,
            net: 3200000,
          },
          {
            militiaId: 'mp-2',
            militiaName: 'Trần Thị B',
            baseSalary: 4000000,
            net: 5100000,
          },
        ]);

      const result = await service.getComplianceCheck('period-1');

      expect(result).toHaveLength(2);
      expect(result[0].compliant).toBe(false);
      expect(result[0].diff).toBeLessThan(0);
      expect(result[1].compliant).toBe(true);
      expect(result[1].diff).toBeGreaterThan(0);
    });

    it('14. throws NotFoundException when period does not exist', async () => {
      mockQuery.mockResolvedValueOnce([]); // period not found

      await expect(service.getComplianceCheck('no-such')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reopenPeriod', () => {
    it('10. should reopen a locked period and set status to draft', async () => {
      const now = new Date().toISOString();
      mockMgrQuery
        .mockResolvedValueOnce([{ status: 'locked' }]) // SELECT status
        .mockResolvedValueOnce([
          {
            // UPDATE RETURNING
            id: 'period-1',
            year: 2026,
            month: 4,
            status: 'draft',
            updatedAt: now,
          },
        ])
        .mockResolvedValueOnce([]); // INSERT audit_log

      const result = await service.reopenPeriod('period-1', actor);

      expect(result['status']).toBe('draft');
      expect(mockTransaction).toHaveBeenCalled();
    });

    it('10b. clears locked_by and locked_at so a draft period does not look locked', async () => {
      mockMgrQuery
        .mockResolvedValueOnce([{ status: 'locked' }])
        .mockResolvedValueOnce([{ id: 'period-1', status: 'draft' }])
        .mockResolvedValueOnce([]);

      await service.reopenPeriod('period-1', actor);

      const updateSql = String((mockMgrQuery.mock.calls as unknown[][])[1][0]);
      expect(updateSql).toMatch(/locked_by\s*=\s*NULL/i);
      expect(updateSql).toMatch(/locked_at\s*=\s*NULL/i);
    });

    it('11. should throw BadRequestException if period is not locked', async () => {
      mockMgrQuery.mockResolvedValueOnce([{ status: 'draft' }]);

      await expect(service.reopenPeriod('period-1', actor)).rejects.toThrow(
        new BadRequestException('period_not_locked'),
      );
    });

    it('12. should throw NotFoundException if period does not exist', async () => {
      mockMgrQuery.mockResolvedValueOnce([]); // empty → not found

      await expect(service.reopenPeriod('no-such-id', actor)).rejects.toThrow(
        new NotFoundException('period_not_found'),
      );
    });

    it('returns the same period shape as locking', async () => {
      const now = new Date().toISOString();
      mockMgrQuery
        .mockResolvedValueOnce([{ status: 'locked' }])
        .mockResolvedValueOnce([
          {
            id: 'period-1',
            month: 4,
            year: 2026,
            status: 'draft',
            lockedBy: null,
            lockedAt: null,
            createdAt: now,
          },
        ])
        .mockResolvedValueOnce([]);

      await expect(service.reopenPeriod('period-1', actor)).resolves.toEqual({
        id: 'period-1',
        month: 4,
        year: 2026,
        status: 'draft',
        lockedBy: null,
        lockedAt: null,
        createdAt: new Date(now),
      });
      expect(mgrSql(1)).toMatch(
        /locked_by AS "lockedBy", locked_at AS "lockedAt", created_at AS "createdAt"/,
      );
    });
  });

  // ── lockPeriod concurrency and audit ─────────────────────────────────────

  describe('lockPeriod', () => {
    const lockedRow = () => ({
      id: 'period-1',
      month: 4,
      year: 2026,
      status: 'locked',
      lockedBy: 'user-1',
      lockedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    it('locks the period row before checking it, and only updates a period that is not locked', async () => {
      mockMgrQuery
        .mockResolvedValueOnce([{ status: 'draft' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([lockedRow()])
        .mockResolvedValueOnce([]);

      await service.lockPeriod('period-1', actor);

      expect(mgrSql(0)).toMatch(/FOR UPDATE/);
      expect(mgrSql(2)).toMatch(/WHERE id = \$1 AND status <> 'locked'/);
    });

    it('records the lock in the audit log', async () => {
      mockMgrQuery
        .mockResolvedValueOnce([{ status: 'review' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([lockedRow()])
        .mockResolvedValueOnce([]);

      await service.lockPeriod('period-1', actor);

      expect(mgrSql(3)).toMatch(/INSERT INTO audit_logs/);
      expect(mgrSql(3)).toMatch(/'lock_period', 'payroll_period'/);
      // who, which period, and the status it had before
      expect(mgrParams(3)).toEqual(['user-1', 'period-1', 'review']);
    });

    it('answers 409 when the guarded update finds the period already locked', async () => {
      mockMgrQuery
        .mockResolvedValueOnce([{ status: 'draft' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await expect(service.lockPeriod('period-1', actor)).rejects.toThrow(
        new ConflictException('period_already_locked'),
      );
    });

    it('answers 404 for an unknown period', async () => {
      mockMgrQuery.mockResolvedValueOnce([]);

      await expect(service.lockPeriod('missing', actor)).rejects.toThrow(
        new NotFoundException('period_not_found'),
      );
    });
  });

  // ── calculateAllowances ──────────────────────────────────────────────────

  describe('calculateAllowances', () => {
    it('refuses to recalculate a locked period', async () => {
      mockMgrQuery.mockResolvedValueOnce([
        { month: 4, year: 2026, status: 'locked' },
      ]);

      await expect(service.calculateAllowances('period-1')).rejects.toThrow(
        new ConflictException('period_locked'),
      );
      expect(mgrSql(0)).toMatch(/FOR UPDATE/);
    });

    it('answers 404 for an unknown period', async () => {
      mockMgrQuery.mockResolvedValueOnce([]);

      await expect(service.calculateAllowances('missing')).rejects.toThrow(
        new NotFoundException('period_not_found'),
      );
    });

    // Items used to appear only when a period was locked, so a new draft period had
    // nothing to calculate
    it('adds an item for every active member before calculating', async () => {
      mockMgrQuery
        .mockResolvedValueOnce([{ month: 4, year: 2026, status: 'draft' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.calculateAllowances('period-1');

      expect(mgrSql(1)).toMatch(
        /INSERT INTO payroll_items[\s\S]*FROM militia_profiles mp[\s\S]*mp\.status = 'active'[\s\S]*ON CONFLICT \(payroll_period_id, militia_id\) DO NOTHING/,
      );
      expect(mgrParams(1)).toEqual(['period-1']);
    });

    it('prorates training days inside the month and stores the training allowance', async () => {
      mockMgrQuery
        .mockResolvedValueOnce([{ month: 4, year: 2026, status: 'draft' }])
        .mockResolvedValueOnce([]) // items for every active member
        .mockResolvedValueOnce([
          { key: 'min_wage_region_1', value: '5200000' },
          { key: 'training_daily_allowance_rate', value: '0.2' },
        ])
        .mockResolvedValueOnce([
          {
            id: 'pi-1',
            kpiBonus: 0,
            isManuallyAdjusted: false,
            attendanceDays: 10,
            trainingDays: 2.5,
          },
        ])
        .mockResolvedValueOnce([]);

      await expect(service.calculateAllowances('period-1')).resolves.toEqual({
        updated: 1,
      });

      const itemsSql = mgrSql(3);
      // COUNT is BIGINT, text in JavaScript: the day count is cast to a number in SQL
      expect(itemsSql).toMatch(
        /\(SELECT COUNT\(\*\)::int\s+FROM attendance_records ar, bounds b/,
      );
      expect(itemsSql).toMatch(/tr\.total_days/);
      expect(itemsSql).toMatch(/tr\.from_date/);
      expect(itemsSql).toMatch(/tr\.to_date/);
      expect(itemsSql).not.toMatch(/days_count|start_date/);
      expect(mgrSql(4)).toMatch(/training_allowance = \$2/);

      const daily = 5200000 / 26;
      const [attendance, training, kpi, net, id] = mgrParams(4) as number[];
      expect(attendance).toBeCloseTo(10 * daily * 1.5);
      expect(training).toBeCloseTo(2.5 * daily * 0.2);
      expect(kpi).toBe(0);
      expect(net).toBeCloseTo(10 * daily * 1.5 + 2.5 * daily * 0.2);
      expect(id).toBe('pi-1');
    });

    // Codex round 2: a manual KPI adjustment excluded the whole item from calculation, so
    // the member's attendance and training allowances stayed at zero
    it('recalculates attendance and training for adjusted items, keeping their KPI bonus', async () => {
      mockMgrQuery
        .mockResolvedValueOnce([{ month: 4, year: 2026, status: 'draft' }])
        .mockResolvedValueOnce([]) // items for every active member
        .mockResolvedValueOnce([
          { key: 'min_wage_region_1', value: '5200000' },
          { key: 'training_daily_allowance_rate', value: '0.2' },
        ])
        .mockResolvedValueOnce([
          {
            id: 'pi-plain',
            attendanceDays: 2,
            trainingDays: 0,
            kpiBonus: 999,
            isManuallyAdjusted: false,
          },
          {
            id: 'pi-adjusted',
            attendanceDays: 4,
            trainingDays: 1,
            kpiBonus: 300000,
            isManuallyAdjusted: true,
          },
        ])
        .mockResolvedValue([]);

      await expect(service.calculateAllowances('period-1')).resolves.toEqual({
        updated: 2,
      });

      expect(mgrSql(3)).not.toMatch(/is_manually_adjusted = false/);
      const daily = 5200000 / 26;
      const updates = new Map(
        [4, 5].map((call) => {
          const params = mgrParams(call);
          return [params[4] as string, params as number[]];
        }),
      );
      const [attendance, training, kpi, net] = updates.get('pi-adjusted')!;
      expect(attendance).toBeCloseTo(4 * daily * 1.5);
      expect(training).toBeCloseTo(1 * daily * 0.2);
      expect(kpi).toBe(300000);
      expect(net).toBeCloseTo(4 * daily * 1.5 + 1 * daily * 0.2 + 300000);
      expect(updates.get('pi-plain')![2]).toBe(0);
      // The adjustment itself is never overwritten by a calculation
      for (const call of [4, 5]) {
        expect(mgrSql(call)).not.toMatch(
          /adjusted_score|adjustment_note|is_manually_adjusted/,
        );
      }
    });
  });

  // ── exportHtml ───────────────────────────────────────────────────────────

  describe('exportHtml', () => {
    it('escapes values coming from the database', async () => {
      mockQuery
        .mockResolvedValueOnce([{ month: 4, year: 2026, status: 'draft' }])
        .mockResolvedValueOnce([
          {
            fullName: '<b onmouseover="x">Tên</b>',
            militiaCode: 'A&B',
            unitName: "KV'1",
            attendanceAllowance: '0',
            trainingAllowance: '0',
            kpiBonus: '0',
            netSalary: '0',
            isManuallyAdjusted: false,
          },
        ]);

      const html = await service.exportHtml('period-1');

      expect(html).not.toContain('<b onmouseover');
      expect(html).toContain(
        '&lt;b onmouseover=&quot;x&quot;&gt;Tên&lt;/b&gt;',
      );
      expect(html).toContain('A&amp;B');
      expect(html).toContain('KV&#39;1');
    });

    // Codex round 2: between 00:00 and 07:00 in Vietnam a UTC server printed yesterday
    describe('on a UTC server', () => {
      useUtcServerClock(VN_1_OCTOBER_0130);

      it('prints the Vietnamese export date', async () => {
        mockQuery
          .mockResolvedValueOnce([{ month: 9, year: 2026, status: 'draft' }])
          .mockResolvedValueOnce([]);

        const html = await service.exportHtml('period-1');

        expect(html).toContain('Ngày xuất: 01/10/2026');
      });
    });
  });

  // ── getKpiScores / adjustKpi ─────────────────────────────────────────────

  // task_assignments has no created_at (migration 003): the query failed with 500 on every call
  it('3c. getKpiScores counts the tasks assigned in the period month in Vietnam', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'period-1' }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await service.getKpiScores('period-1', 1, 20);

    const sql = String((mockQuery.mock.calls as unknown[][])[2][0]);
    expect(sql).not.toMatch(/ta\.created_at/);
    expect(sql).toMatch(
      /DATE_PART\('month', ta\.assigned_at AT TIME ZONE 'Asia\/Ho_Chi_Minh'\) = p\.month\s+AND DATE_PART\('year',\s+ta\.assigned_at AT TIME ZONE 'Asia\/Ho_Chi_Minh'\) = p\.year/,
    );
  });

  it('3b. getKpiScores attributes evaluations by their KPI month, not their creation date', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'period-1' }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await service.getKpiScores('period-1', 1, 20);

    const sql = String((mockQuery.mock.calls as unknown[][])[2][0]);
    expect(sql).toMatch(/ke\.month = p\.month\s+AND ke\.year = p\.year/);
    expect(sql).not.toMatch(/DATE_PART\('month', ke\.created_at\)/);
  });

  describe('adjustKpi', () => {
    it('refuses to adjust a locked period, holding the period row while it checks', async () => {
      mockMgrQuery.mockResolvedValueOnce([{ status: 'locked' }]);

      await expect(
        service.adjustKpi('mp-1', 'period-1', 80, 'Điều chỉnh', 'user-1'),
      ).rejects.toThrow(new ConflictException('period_locked'));
      expect(mgrSql(0)).toMatch(/FOR UPDATE/);
      expect(mockMgrQuery).toHaveBeenCalledTimes(1);
    });

    it('answers 404 for an unknown period', async () => {
      mockMgrQuery.mockResolvedValueOnce([]);

      await expect(
        service.adjustKpi('mp-1', 'missing', 80, 'Điều chỉnh', 'user-1'),
      ).rejects.toThrow(new NotFoundException('period_not_found'));
    });

    it('answers 404 for an unknown militia member', async () => {
      mockMgrQuery
        .mockResolvedValueOnce([{ status: 'draft' }])
        .mockResolvedValueOnce([]);

      await expect(
        service.adjustKpi('missing', 'period-1', 80, 'Điều chỉnh', 'user-1'),
      ).rejects.toThrow(new NotFoundException('militia_not_found'));
    });

    it('upserts the manual adjustment on an open period', async () => {
      mockMgrQuery
        .mockResolvedValueOnce([{ status: 'draft' }])
        .mockResolvedValueOnce([{ id: 'mp-1' }])
        .mockResolvedValueOnce([
          { id: 'pi-1', adjustedScore: 80, isManuallyAdjusted: true },
        ]);

      await expect(
        service.adjustKpi('mp-1', 'period-1', 80, 'Điều chỉnh', 'user-1'),
      ).resolves.toMatchObject({
        adjustedScore: 80,
        isManuallyAdjusted: true,
      });
      expect(mgrSql(2)).toMatch(
        /ON CONFLICT \(payroll_period_id, militia_id\) DO UPDATE/,
      );
    });
  });
});
