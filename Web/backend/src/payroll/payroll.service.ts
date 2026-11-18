import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { queryRows } from '../database/query-rows';
import { escapeHtml } from '../common/html/escape-html';
import { businessDate } from '../common/time/business-date';
import type { JwtPayload } from '../auth/auth.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import type { Response } from 'express';

export interface PayrollPeriod {
  id: string;
  month: number;
  year: number;
  status: 'draft' | 'review' | 'locked';
  lockedBy: string | null;
  lockedAt: Date | null;
  createdAt: Date;
}

export interface KpiScore {
  id: string;
  militiaId: string;
  militiaName: string;
  periodId: string;
  attendanceDays: number;
  taskCompleted: number;
  taskTotal: number;
  score: number | null;
  adjustedScore: number | null;
  adjustmentNote: string | null;
  adjustedBy: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ComplianceItem {
  militiaId: string;
  militiaName: string;
  baseSalary: number;
  net: number;
  minWage: number;
  diff: number;
  compliant: boolean;
}

@Injectable()
export class PayrollService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly excelExportService: ExcelExportService,
  ) {}

  async listPeriods(
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<PayrollPeriod>> {
    const offset = (page - 1) * limit;

    const countRows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM payroll_periods`,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT id, month, year, status,
              locked_by AS "lockedBy", locked_at AS "lockedAt", created_at AS "createdAt"
       FROM payroll_periods
       ORDER BY year DESC, month DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return {
      data: rows.map((r) => ({
        id: r['id'] as string,
        month: r['month'] as number,
        year: r['year'] as number,
        status: r['status'] as 'draft' | 'review' | 'locked',
        lockedBy: (r['lockedBy'] as string | null) ?? null,
        lockedAt: r['lockedAt'] ? new Date(r['lockedAt'] as string) : null,
        createdAt: new Date(r['createdAt'] as string),
      })),
      total,
      page,
      limit,
    };
  }

  async getKpiScores(
    periodId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<KpiScore>> {
    const offset = (page - 1) * limit;

    // Verify period exists before aggregation — returns 404 not empty 200
    const periodCheck = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM payroll_periods WHERE id = $1`,
      [periodId],
    );
    if (!periodCheck.length) {
      throw new NotFoundException('period_not_found');
    }

    const countRows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM militia_profiles`,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT
         mp.id                                                                           AS "id",
         mp.id                                                                           AS "militiaId",
         mp.full_name                                                                    AS "militiaName",
         $1::uuid                                                                        AS "periodId",
         COUNT(DISTINCT ar.id) FILTER (WHERE ar.status != 'absent')::int                AS "attendanceDays",
         COUNT(DISTINCT ta.id) FILTER (WHERE ta.status = 'completed')::int              AS "taskCompleted",
         COUNT(DISTINCT ta.id)::int                                                      AS "taskTotal",
         ROUND(AVG(ke.weighted_score)::numeric, 1)                                      AS "score",
         NULL::numeric                                                                   AS "adjustedScore",
         NULL::text                                                                      AS "adjustmentNote",
         NULL::uuid                                                                      AS "adjustedBy"
       FROM militia_profiles mp
       CROSS JOIN (SELECT month, year FROM payroll_periods WHERE id = $1) p
       LEFT JOIN attendance_records ar
         ON ar.militia_id = mp.id
         AND DATE_PART('month', ar.work_date) = p.month
         AND DATE_PART('year',  ar.work_date) = p.year
       LEFT JOIN users u ON u.id = mp.user_id
       LEFT JOIN task_assignments ta
         ON ta.assignee_id = u.id
         AND DATE_PART('month', ta.assigned_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = p.month
         AND DATE_PART('year',  ta.assigned_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = p.year
       LEFT JOIN kpi_evaluations ke
         ON ke.target_user_id = u.id
         AND ke.month = p.month
         AND ke.year = p.year
       GROUP BY mp.id, mp.full_name
       ORDER BY mp.full_name
       LIMIT $2 OFFSET $3`,
      [periodId, limit, offset],
    );

    return {
      data: rows.map((r) => ({
        id: r['id'] as string,
        militiaId: r['militiaId'] as string,
        militiaName: r['militiaName'] as string,
        periodId: r['periodId'] as string,
        attendanceDays: (r['attendanceDays'] as number) ?? 0,
        taskCompleted: (r['taskCompleted'] as number) ?? 0,
        taskTotal: (r['taskTotal'] as number) ?? 0,
        // ROUND over NUMERIC: a number (src/database/pg-types.ts)
        score: r['score'] as number | null,
        adjustedScore: null,
        adjustmentNote: null,
        adjustedBy: null,
      })),
      total,
      page,
      limit,
    };
  }

  // P3-15: Payroll HTML export (print-to-PDF in browser) — NĐ 72/2020 phiếu lương
  async exportHtml(periodId: string): Promise<string> {
    const periodRows = await this.dataSource.query<
      { month: number; year: number; status: string }[]
    >(`SELECT month, year, status FROM payroll_periods WHERE id = $1`, [
      periodId,
    ]);
    if (!periodRows.length) throw new NotFoundException('period_not_found');
    const { month, year } = periodRows[0];

    const items = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT mp.full_name AS "fullName", mp.militia_code AS "militiaCode",
              u.name AS "unitName",
              COALESCE(pi.attendance_allowance, 0) AS "attendanceAllowance",
              COALESCE(pi.training_allowance, 0)   AS "trainingAllowance",
              COALESCE(pi.kpi_bonus, 0)             AS "kpiBonus",
              COALESCE(pi.net_salary, 0)            AS "netSalary",
              pi.is_manually_adjusted               AS "isManuallyAdjusted"
       FROM payroll_items pi
       JOIN militia_profiles mp ON mp.id = pi.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE pi.payroll_period_id = $1
       ORDER BY mp.full_name`,
      [periodId],
    );

    const fmt = (n: unknown) => Number(n).toLocaleString('vi-VN') + ' đ';
    // The Vietnamese calendar day, whatever the server's time zone
    const [exportYear, exportMonth, exportDay] =
      businessDate().isoDate.split('-');
    const exportedOn = `${exportDay}/${exportMonth}/${exportYear}`;
    const rows = items
      .map(
        (item) => `
      <tr>
        <td>${escapeHtml(item['militiaCode'])}</td>
        <td>${escapeHtml(item['fullName'])}</td>
        <td>${escapeHtml(item['unitName'])}</td>
        <td>${fmt(item['attendanceAllowance'])}</td>
        <td>${fmt(item['trainingAllowance'])}</td>
        <td>${fmt(item['kpiBonus'])}</td>
        <td style="font-weight:bold">${fmt(item['netSalary'])}</td>
        <td>${(item['isManuallyAdjusted'] as boolean) ? '✓' : ''}</td>
      </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<title>Phiếu lương tháng ${month}/${year}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
  h1 { text-align: center; font-size: 16px; }
  h2 { text-align: center; font-size: 13px; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  @media print { button { display: none; } }
</style></head>
<body>
  <h1>BẢNG LƯƠNG DÂN QUÂN TỰ VỆ</h1>
  <h2>Tháng ${month} năm ${year}</h2>
  <button onclick="window.print()" style="margin-bottom:10px;padding:6px 16px;cursor:pointer">In / Lưu PDF</button>
  <table>
    <thead><tr>
      <th>Mã DQTV</th><th>Họ tên</th><th>Đơn vị</th>
      <th>PC trực chiến</th><th>PC huấn luyện</th><th>Thưởng KPI</th>
      <th>Tổng lương</th><th>Điều chỉnh</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:40px">Ngày xuất: ${exportedOn}</p>
</body></html>`;
  }

  // P3-14: Allowance calculation — NĐ 72/2020 Điều 41-52
  // Gives every active member an item in the period; existing items, including manual
  // adjustments, are kept. Shared by calculation and locking so both cover the same people.
  private async ensureItemsForActiveMembers(
    mgr: { query(sql: string, parameters?: unknown[]): Promise<unknown> },
    periodId: string,
  ): Promise<void> {
    await mgr.query(
      `INSERT INTO payroll_items(payroll_period_id, militia_id, base_salary, net_salary, is_manually_adjusted, created_at)
       SELECT $1, mp.id, 0, 0, false, NOW()
       FROM militia_profiles mp
       WHERE mp.status = 'active'
       ON CONFLICT (payroll_period_id, militia_id) DO NOTHING`,
      [periodId],
    );
  }

  async calculateAllowances(periodId: string): Promise<{ updated: number }> {
    return this.dataSource.transaction(async (mgr) => {
      // The period row stays locked while items are recalculated, so it cannot be
      // locked halfway through, and a locked period is never recalculated
      const periodRows = await mgr.query<
        { month: number; year: number; status: string }[]
      >(
        `SELECT month, year, status FROM payroll_periods WHERE id = $1 FOR UPDATE`,
        [periodId],
      );
      if (!periodRows.length) throw new NotFoundException('period_not_found');
      const { month, year, status } = periodRows[0];
      if (status === 'locked') throw new ConflictException('period_locked');

      // A new draft period has no items yet; calculate for every active member
      await this.ensureItemsForActiveMembers(mgr, periodId);

      // Read wage settings from system_settings
      const settingRows = await mgr.query<{ key: string; value: string }[]>(
        `SELECT key, value FROM system_settings WHERE key IN ('min_wage_region_1', 'training_daily_allowance_rate')`,
      );
      const settings = Object.fromEntries(
        settingRows.map((r) => [r.key, r.value]),
      );
      const minWage = parseFloat(settings['min_wage_region_1'] ?? '4960000');
      const trainingRate = parseFloat(
        settings['training_daily_allowance_rate'] ?? '0.2',
      );
      const dailyRate = minWage / 26;

      // Every item, manually adjusted ones included: an adjustment sets the KPI by hand,
      // it does not waive the member's attendance and training allowances. Each figure is
      // its own subquery so attendance rows and training rows never multiply each other,
      // and a training course contributes only the share of its total_days in this month.
      // NUMERIC amounts and days are numbers (src/database/pg-types.ts); COUNT is BIGINT
      // text, so the attendance count is cast in SQL
      const items = await mgr.query<
        {
          id: string;
          kpiBonus: number;
          isManuallyAdjusted: boolean;
          attendanceDays: number;
          trainingDays: number;
        }[]
      >(
        `WITH bounds AS (
           SELECT make_date($3, $2, 1) AS month_start,
                  (make_date($3, $2, 1) + INTERVAL '1 month - 1 day')::date AS month_end
         )
         SELECT pi.id,
                pi.kpi_bonus AS "kpiBonus",
                pi.is_manually_adjusted AS "isManuallyAdjusted",
                (SELECT COUNT(*)::int
                 FROM attendance_records ar, bounds b
                 WHERE ar.militia_id = pi.militia_id
                   AND ar.status != 'absent'
                   AND ar.work_date BETWEEN b.month_start AND b.month_end) AS "attendanceDays",
                (SELECT COALESCE(SUM(
                          tr.total_days
                          * (LEAST(tr.to_date, b.month_end) - GREATEST(tr.from_date, b.month_start) + 1)
                          / NULLIF(tr.to_date - tr.from_date + 1, 0)
                        ), 0)
                 FROM training_records tr, bounds b
                 WHERE tr.militia_id = pi.militia_id
                   AND tr.from_date <= b.month_end
                   AND tr.to_date >= b.month_start) AS "trainingDays"
         FROM payroll_items pi
         WHERE pi.payroll_period_id = $1`,
        [periodId, month, year],
      );

      let updated = 0;
      for (const item of items) {
        const attendanceAllowance = item.attendanceDays * dailyRate * 1.5;
        const trainingAllowance = item.trainingDays * dailyRate * trainingRate;
        // Computed KPI bonus is not mapped yet (0); a manually adjusted item keeps the
        // bonus it already carries (payroll_items.kpi_bonus is NOT NULL)
        const kpiBonus = item.isManuallyAdjusted ? item.kpiBonus : 0;
        const netSalary = attendanceAllowance + trainingAllowance + kpiBonus;

        await mgr.query(
          `UPDATE payroll_items
           SET attendance_allowance = $1, training_allowance = $2, kpi_bonus = $3, net_salary = $4, updated_at = NOW()
           WHERE id = $5`,
          [
            attendanceAllowance,
            trainingAllowance,
            kpiBonus,
            netSalary,
            item.id,
          ],
        );
        updated++;
      }
      return { updated };
    });
  }

  async adjustKpi(
    militiaId: string,
    periodId: string,
    adjustedScore: number,
    adjustmentNote: string,
    actorId: string,
  ): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (mgr) => {
      // A locked period is final; the row lock keeps a concurrent lock from racing this
      const period = await mgr.query<{ status: string }[]>(
        `SELECT status FROM payroll_periods WHERE id = $1 FOR UPDATE`,
        [periodId],
      );
      if (!period.length) throw new NotFoundException('period_not_found');
      if (period[0].status === 'locked')
        throw new ConflictException('period_locked');

      const militia = await mgr.query<{ id: string }[]>(
        `SELECT id FROM militia_profiles WHERE id = $1`,
        [militiaId],
      );
      if (!militia.length) throw new NotFoundException('militia_not_found');

      const rows = await mgr.query<Record<string, unknown>[]>(
        `INSERT INTO payroll_items(payroll_period_id, militia_id, adjusted_score, adjustment_note, adjusted_by, is_manually_adjusted, base_salary, net_salary, created_at)
         VALUES ($1, $2, $3, $4, $5, true, 0, 0, NOW())
         ON CONFLICT (payroll_period_id, militia_id) DO UPDATE
           SET adjusted_score = EXCLUDED.adjusted_score,
               adjustment_note = EXCLUDED.adjustment_note,
               adjusted_by = EXCLUDED.adjusted_by,
               is_manually_adjusted = true,
               updated_at = NOW()
         RETURNING id, payroll_period_id AS "periodId", militia_id AS "militiaId",
                   adjusted_score AS "adjustedScore", adjustment_note AS "adjustmentNote",
                   is_manually_adjusted AS "isManuallyAdjusted"`,
        [periodId, militiaId, adjustedScore, adjustmentNote, actorId],
      );
      return rows[0];
    });
  }

  async createPeriod(
    year: number,
    month: number,
  ): Promise<Record<string, unknown>> {
    try {
      const rows = await this.dataSource.query<Record<string, unknown>[]>(
        `INSERT INTO payroll_periods (year, month, status, created_at, updated_at)
         VALUES ($1, $2, 'draft', NOW(), NOW())
         RETURNING id, year, month, status, created_at AS "createdAt"`,
        [year, month],
      );
      return rows[0];
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        throw new ConflictException(
          `payroll_period_${year}_${month}_already_exists`,
        );
      }
      throw err;
    }
  }

  async reopenPeriod(
    periodId: string,
    actor: JwtPayload,
  ): Promise<PayrollPeriod> {
    return this.dataSource.transaction(async (mgr) => {
      const existing = await mgr.query<{ status: string }[]>(
        `SELECT status FROM payroll_periods WHERE id = $1 FOR UPDATE`,
        [periodId],
      );
      if (!existing.length) throw new NotFoundException('period_not_found');
      if (existing[0].status !== 'locked') {
        throw new BadRequestException('period_not_locked');
      }
      const rows = await queryRows<Record<string, unknown>>(
        mgr,
        `UPDATE payroll_periods
         SET status = 'draft', locked_by = NULL, locked_at = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING id, month, year, status,
                   locked_by AS "lockedBy", locked_at AS "lockedAt", created_at AS "createdAt"`,
        [periodId],
      );
      // Audit log
      await mgr.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_json, after_json, created_at)
         VALUES ($1, 'reopen_period', 'payroll_period', $2, '{"status":"locked"}', '{"status":"draft"}', NOW())`,
        [actor.sub, periodId],
      );
      return this.mapPeriod(rows[0]);
    });
  }

  // P3-13: lockPeriod with snapshot — inserts payroll_items then locks
  async lockPeriod(
    periodId: string,
    actor: JwtPayload,
  ): Promise<PayrollPeriod> {
    return this.dataSource.transaction(async (mgr) => {
      // Row lock: concurrent lock requests queue here instead of both passing the check
      const existing = await mgr.query<{ status: string }[]>(
        `SELECT status FROM payroll_periods WHERE id = $1 FOR UPDATE`,
        [periodId],
      );
      if (!existing.length) throw new NotFoundException('period_not_found');
      if (existing[0].status === 'locked')
        throw new ConflictException('period_already_locked');

      // Snapshot the members paid in this period (idempotent)
      await this.ensureItemsForActiveMembers(mgr, periodId);

      // Lock period; the status guard makes a second lock a no-op even without the row lock
      const rows = await queryRows<Record<string, unknown>>(
        mgr,
        `UPDATE payroll_periods
         SET status = 'locked', locked_by = $2, locked_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status <> 'locked'
         RETURNING id, month, year, status,
                   locked_by AS "lockedBy", locked_at AS "lockedAt", created_at AS "createdAt"`,
        [periodId, actor.sub],
      );
      if (!rows.length) throw new ConflictException('period_already_locked');

      await mgr.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_json, after_json, created_at)
         VALUES ($1, 'lock_period', 'payroll_period', $2,
                 jsonb_build_object('status', $3::text), '{"status":"locked"}', NOW())`,
        [actor.sub, periodId, existing[0].status],
      );

      return this.mapPeriod(rows[0]);
    });
  }

  // Sprint 3: GET /payroll/compliance-check?periodId=
  async getComplianceCheck(periodId: string): Promise<ComplianceItem[]> {
    const periodRows = await this.dataSource.query<
      { month: number; year: number }[]
    >(`SELECT month, year FROM payroll_periods WHERE id = $1`, [periodId]);
    if (!periodRows.length) throw new NotFoundException('period_not_found');

    const settingRows = await this.dataSource.query<
      { key: string; value: string }[]
    >(`SELECT key, value FROM system_settings WHERE key = 'min_wage_region_1'`);
    const minWage = parseFloat(settingRows[0]?.value ?? '4960000');

    // NUMERIC amounts: numbers (src/database/pg-types.ts)
    const rows = await this.dataSource.query<
      {
        militiaId: string;
        militiaName: string;
        baseSalary: number;
        net: number;
      }[]
    >(
      `SELECT mp.id AS "militiaId", mp.full_name AS "militiaName",
              COALESCE(pi.base_salary, 0)  AS "baseSalary",
              COALESCE(pi.net_salary, 0)   AS "net"
       FROM payroll_items pi
       JOIN militia_profiles mp ON mp.id = pi.militia_id
       WHERE pi.payroll_period_id = $1
       ORDER BY mp.full_name`,
      [periodId],
    );

    return rows.map((r) => {
      const { net, baseSalary } = r;
      const diff = net - minWage;
      return {
        militiaId: r.militiaId,
        militiaName: r.militiaName,
        baseSalary,
        net,
        minWage,
        diff,
        compliant: net >= minWage,
      };
    });
  }

  // Sprint 3: GET /payroll/export?periodId= → xlsx stream
  async exportPayroll(periodId: string, res: Response): Promise<void> {
    const periodRows = await this.dataSource.query<
      { month: number; year: number; status: string }[]
    >(`SELECT month, year, status FROM payroll_periods WHERE id = $1`, [
      periodId,
    ]);
    if (!periodRows.length) throw new NotFoundException('period_not_found');
    const { month, year } = periodRows[0];

    const settingRows = await this.dataSource.query<
      { key: string; value: string }[]
    >(`SELECT key, value FROM system_settings WHERE key = 'min_wage_region_1'`);
    const minWage = parseFloat(settingRows[0]?.value ?? '4960000');

    // NUMERIC amounts: numbers (src/database/pg-types.ts)
    const items = await this.dataSource.query<
      {
        fullName: string;
        militiaCode: string;
        unitName: string;
        baseSalary: number;
        allowance: number;
        bonus: number;
        deductions: number;
        netSalary: number;
      }[]
    >(
      `SELECT mp.full_name AS "fullName", mp.militia_code AS "militiaCode",
              u.name AS "unitName",
              COALESCE(pi.base_salary, 0)                AS "baseSalary",
              COALESCE(pi.attendance_allowance, 0) + COALESCE(pi.training_allowance, 0) AS "allowance",
              COALESCE(pi.kpi_bonus, 0)                   AS "bonus",
              COALESCE(pi.net_salary - pi.base_salary - pi.attendance_allowance - pi.training_allowance - pi.kpi_bonus, 0) AS "deductions",
              COALESCE(pi.net_salary, 0)                  AS "netSalary"
       FROM payroll_items pi
       JOIN militia_profiles mp ON mp.id = pi.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE pi.payroll_period_id = $1
       ORDER BY mp.full_name`,
      [periodId],
    );

    const wb = this.excelExportService.createWorkbook();

    // Sheet 1: Bảng lương
    const sheet1 = wb.addWorksheet('Bảng lương');
    const startRow = this.excelExportService.addGovernmentHeader(sheet1, {
      agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
      reportTitle: `BẢNG LƯƠNG DÂN QUÂN TỰ VỆ THÁNG ${month}/${year}`,
      reportDate: new Date(),
    });

    const payrollRows = items.map((item, idx) => ({
      stt: idx + 1,
      fullName: item.fullName,
      militiaCode: item.militiaCode,
      unitName: item.unitName,
      baseSalary: item.baseSalary,
      allowance: item.allowance,
      bonus: item.bonus,
      deductions: item.deductions,
      netSalary: item.netSalary,
      minWage,
      diff: item.netSalary - minWage,
    }));

    this.excelExportService.addStyledTable(
      sheet1,
      startRow,
      [
        { header: 'STT', key: 'stt', width: 6, type: 'number' },
        { header: 'Họ tên', key: 'fullName', width: 24 },
        { header: 'Mã DQTV', key: 'militiaCode', width: 14 },
        { header: 'Đơn vị', key: 'unitName', width: 18 },
        { header: 'Lương CB', key: 'baseSalary', width: 16, type: 'currency' },
        { header: 'Phụ cấp', key: 'allowance', width: 16, type: 'currency' },
        { header: 'Thưởng', key: 'bonus', width: 14, type: 'currency' },
        { header: 'Khấu trừ', key: 'deductions', width: 14, type: 'currency' },
        { header: 'Thực lĩnh', key: 'netSalary', width: 16, type: 'currency' },
        {
          header: 'Lương tối thiểu',
          key: 'minWage',
          width: 18,
          type: 'currency',
        },
        { header: 'Chênh lệch', key: 'diff', width: 14, type: 'currency' },
      ],
      payrollRows,
    );

    this.excelExportService.addSignatureBlock(
      sheet1,
      startRow + payrollRows.length + 1,
      {
        position: 'Chỉ huy trưởng',
      },
    );
    this.excelExportService.addDocumentHash(
      sheet1,
      JSON.stringify(payrollRows),
    );

    // Sheet 2: Công thức tính
    const sheet2 = wb.addWorksheet('Công thức tính');
    sheet2.getColumn(1).width = 50;
    sheet2.getColumn(2).width = 40;
    [
      ['Công thức tính lương DQTV', ''],
      ['Lương cơ bản', 'Theo NĐ 72/2020 và quy định hiện hành'],
      ['Phụ cấp trực chiến', 'Số ngày × Đơn giá ngày × 1.5'],
      ['Phụ cấp huấn luyện', 'Số ngày huấn luyện × Đơn giá × 0.2'],
      ['Thưởng KPI', 'Theo điểm đánh giá hàng tháng'],
      ['Thực lĩnh', 'Lương CB + Phụ cấp + Thưởng − Khấu trừ'],
      [
        'Lương tối thiểu (Vùng 1)',
        `${minWage.toLocaleString('vi-VN')} đ (NĐ 38/2022/NĐ-CP)`,
      ],
    ].forEach(([label, value], i) => {
      sheet2.getRow(i + 1).getCell(1).value = label;
      sheet2.getRow(i + 1).getCell(2).value = value;
    });
    this.excelExportService.addLegalReferencesSheet(wb, [
      'Nghị định 72/2020/NĐ-CP về lực lượng dân quân tự vệ',
      'Nghị định 38/2022/NĐ-CP về mức lương tối thiểu',
      'Thông tư 144/2014/TT-BQP về chế độ phụ cấp',
    ]);

    const filename = `BangLuong_DQTV_${month}_${year}.xlsx`;
    await this.excelExportService.streamToResponse(wb, res, filename);
  }

  private mapPeriod(r: Record<string, unknown>): PayrollPeriod {
    return {
      id: r['id'] as string,
      month: r['month'] as number,
      year: r['year'] as number,
      status: r['status'] as 'draft' | 'review' | 'locked',
      lockedBy: (r['lockedBy'] as string | null) ?? null,
      lockedAt: r['lockedAt'] ? new Date(r['lockedAt'] as string) : null,
      createdAt: new Date(r['createdAt'] as string),
    };
  }
}
