import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/auth.service';
import { effectiveUnit } from '../common/access/unit-scope';
import { DQTV_ROLES } from '../common/constants/roles';
import { userInUnit } from '../common/sql/user-access.sql';
import { BUSINESS_TODAY_SQL, businessDate } from '../common/time/business-date';
import { ExcelExportService } from '../common/services/excel-export.service';
import { AssignmentsService } from '../assignments/assignments.service';
import type { Response } from 'express';

export interface DashboardStats {
  totalMilitia: number;
  activeToday: number;
  pendingTasks: number;
  pendingApprovals: number;
  activeSosAlerts: number;
}

export interface DashboardCharts {
  year: number;
  tasks: {
    month: number;
    assigned: number;
    completed: number;
    overdue: number;
  }[];
  areas: { unitCode: string; unitName: string; headcount: number }[];
}

export interface ComplianceStats {
  totalActive: number;
  trainingCompliant: number;
  trainingCompliancePct: number;
  attendancePct: number;
  // Average of the latest KPI period that has scores; null before any period is scored
  avgKpiScore: number | null;
  kpiPeriod: { year: number; month: number } | null;
  expiringExemptions: number;
  lastUpdated: Date;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly excelExportService: ExcelExportService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  // Whose records the dashboard counters cover:
  // - DQTV members (no other role): their own records
  // - CA officers: the DQTV members assigned to them, within their unit
  // - other staff: their effective unit (the whole ward for wide roles)
  private async statsScope(
    user: JwtPayload,
  ): Promise<{ unit: string | null; userIds: string[] | null }> {
    const roles = [user.role, ...(user.roles ?? [])];
    if (roles.every((role) => DQTV_ROLES.has(role))) {
      return { unit: null, userIds: [user.sub] };
    }
    const unit = effectiveUnit(user);
    if (user.role === 'ca_officer') {
      return {
        unit,
        userIds: await this.assignmentsService.getAssignedDqtvIds(user.sub),
      };
    }
    return { unit, userIds: null };
  }

  async getComplianceStats(
    user: JwtPayload,
    unitCode?: string,
  ): Promise<ComplianceStats> {
    // The current month in Vietnam, not in the server's UTC clock
    const { year, month } = businessDate();

    // Wide roles may pass unitCode; everyone else is locked to their scope
    const unit = effectiveUnit(user, unitCode);

    // Single CTE query — 1 DB round trip. COUNT answers BIGINT text, ROUND over NUMERIC a
    // number (src/database/pg-types.ts)
    const [row] = await this.ds.query<
      {
        total_active: string;
        training_compliant: string;
        attendance_pct: number;
        avg_kpi_score: number | null;
        kpi_year: number | null;
        kpi_month: number | null;
        expiring_exemptions: string;
      }[]
    >(
      `WITH scope AS (
         SELECT mp.id AS militia_id
         FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         WHERE mp.status = 'active'
           AND ($1::text IS NULL OR u.code = $1)
       ),
       -- The current month is usually still being evaluated: take the latest period up to
       -- it that already has scores for the scope
       latest_kpi AS (
         SELECT kp.id, kp.year, kp.month
         FROM kpi_periods kp
         WHERE (kp.year, kp.month) <= ($2::int, $3::int)
           AND EXISTS (
             SELECT 1 FROM kpi_scores ks
             JOIN scope s ON s.militia_id = ks.militia_id
             WHERE ks.period_id = kp.id)
         ORDER BY kp.year DESC, kp.month DESC
         LIMIT 1
       )
       SELECT
         (SELECT COUNT(*) FROM scope)                                                       AS total_active,
         (SELECT COUNT(*)
          FROM (
            SELECT tr.militia_id
            FROM training_records tr
            JOIN scope s ON s.militia_id = tr.militia_id
            WHERE EXTRACT(YEAR FROM tr.from_date)::int = $2
            GROUP BY tr.militia_id
            HAVING SUM(tr.total_days) >= 15
          ) compliant)                                                                     AS training_compliant,
         (SELECT CASE WHEN COUNT(*) = 0 THEN 0
                 ELSE ROUND(
                   100.0 * COUNT(*) FILTER (
                     WHERE status IN ('checked_in', 'present', 'late')
                   ) / NULLIF(COUNT(*), 0), 1
                 ) END
          FROM attendance_records ar
          JOIN scope s ON s.militia_id = ar.militia_id
          WHERE EXTRACT(MONTH FROM ar.work_date)::int = $3
            AND EXTRACT(YEAR FROM ar.work_date)::int = $2)                                 AS attendance_pct,
         (SELECT ROUND(AVG(ks.total_score)::numeric, 2)
          FROM kpi_scores ks
          JOIN latest_kpi lk ON lk.id = ks.period_id
          JOIN scope s ON s.militia_id = ks.militia_id)                                    AS avg_kpi_score,
         (SELECT lk.year FROM latest_kpi lk)                                               AS kpi_year,
         (SELECT lk.month FROM latest_kpi lk)                                              AS kpi_month,
         (SELECT COUNT(DISTINCT ex.militia_id)
          FROM exemptions ex
          JOIN scope s ON s.militia_id = ex.militia_id
          WHERE ex.status = 'active'
            AND ex.expiry_date BETWEEN ${BUSINESS_TODAY_SQL}
                                   AND ${BUSINESS_TODAY_SQL} + 30) AS expiring_exemptions`,
      [unit, year, month],
    );

    const totalActive = parseInt(row.total_active, 10);
    const trainingCompliant = parseInt(row.training_compliant, 10);

    return {
      totalActive,
      trainingCompliant,
      trainingCompliancePct:
        totalActive > 0
          ? Math.round((trainingCompliant / totalActive) * 1000) / 10
          : 0,
      attendancePct: row.attendance_pct,
      avgKpiScore: row.avg_kpi_score ?? null,
      kpiPeriod:
        row.kpi_year !== null &&
        row.kpi_year !== undefined &&
        row.kpi_month !== null &&
        row.kpi_month !== undefined
          ? { year: row.kpi_year, month: row.kpi_month }
          : null,
      expiringExemptions: parseInt(row.expiring_exemptions, 10),
      lastUpdated: new Date(),
    };
  }

  // Sprint 3: Mẫu 03-BC aggregate
  async getMau03Bc(
    actor: JwtPayload,
    year: number,
    unitCode?: string,
  ): Promise<Record<string, unknown>> {
    // Totals of other units must not leak: the requested unit only applies to wide roles
    const unit = effectiveUnit(actor, unitCode);
    // Placeholders are fixed and the unit filter is a NULL check, so the bound
    // parameter count always matches the statement
    const params: unknown[] = [year, unit];

    // COUNT answers BIGINT text; SUM over NUMERIC answers a number (src/database/pg-types.ts)
    const [militiaRow] = await this.ds.query<
      { total_active: string; total_inactive: string; total_female: string }[]
    >(
      `SELECT
         COUNT(*) FILTER (WHERE mp.status = 'active')  AS total_active,
         COUNT(*) FILTER (WHERE mp.status = 'inactive') AS total_inactive,
         COUNT(*) FILTER (WHERE mp.gender = 'female')   AS total_female
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE ($1::text IS NULL OR u.code = $1)`,
      [unit],
    );

    const [trainingRow] = await this.ds.query<
      { trained_count: string; total_training_days: number }[]
    >(
      `SELECT
         COUNT(DISTINCT tr.militia_id) AS trained_count,
         COALESCE(SUM(tr.total_days), 0) AS total_training_days
       FROM training_records tr
       JOIN militia_profiles mp ON mp.id = tr.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE EXTRACT(YEAR FROM tr.from_date)::int = $1
       AND ($2::text IS NULL OR u.code = $2)`,
      params,
    );

    const [disciplineRow] = await this.ds.query<
      { reward_count: string; discipline_count: string }[]
    >(
      `SELECT
         COUNT(*) FILTER (WHERE mr.reward_type = 'reward')    AS reward_count,
         COUNT(*) FILTER (WHERE mr.reward_type != 'reward')   AS discipline_count
       FROM militia_rewards mr
       JOIN militia_profiles mp ON mp.id = mr.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE EXTRACT(YEAR FROM mr.issued_date)::int = $1
       AND ($2::text IS NULL OR u.code = $2)`,
      params,
    );

    const [budgetRow] = await this.ds.query<{ total_salary: number }[]>(
      `SELECT COALESCE(SUM(pi.net_salary), 0) AS total_salary
       FROM payroll_items pi
       JOIN payroll_periods pp ON pp.id = pi.payroll_period_id
       JOIN militia_profiles mp ON mp.id = pi.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE pp.year = $1
       AND ($2::text IS NULL OR u.code = $2)`,
      params,
    );

    return {
      year,
      unitCode: unit,
      militia: {
        totalActive: parseInt(militiaRow.total_active, 10),
        totalInactive: parseInt(militiaRow.total_inactive, 10),
        totalFemale: parseInt(militiaRow.total_female, 10),
      },
      training: {
        trainedCount: parseInt(trainingRow.trained_count, 10),
        // Half days count: training_records.total_days is NUMERIC(5,1)
        totalTrainingDays: trainingRow.total_training_days,
      },
      discipline: {
        rewardCount: parseInt(disciplineRow.reward_count, 10),
        disciplineCount: parseInt(disciplineRow.discipline_count, 10),
      },
      budget: {
        totalSalary: budgetRow.total_salary,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  // Sprint 3: Mẫu 03-BC xlsx export (4 sheets)
  async exportMau03Bc(
    actor: JwtPayload,
    year: number,
    unitCode: string | undefined,
    res: Response,
  ): Promise<void> {
    const data = await this.getMau03Bc(actor, year, unitCode);
    const exportedUnit = data['unitCode'] as string | null;
    const wb = this.excelExportService.createWorkbook();
    const reportDate = new Date();

    const makeSheet = (
      name: string,
      title: string,
      stats: { label: string; value: string | number; highlight?: boolean }[],
    ) => {
      const sheet = wb.addWorksheet(name);
      const startRow = this.excelExportService.addGovernmentHeader(sheet, {
        agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
        reportTitle: `MẪU 03-BC — ${title} NĂM ${year}`,
        reportDate,
      });
      this.excelExportService.addSummaryStatsTable(
        sheet,
        startRow,
        title,
        stats,
      );
      this.excelExportService.addSignatureBlock(
        sheet,
        startRow + stats.length + 3,
        { position: 'Chỉ huy trưởng' },
      );
      this.excelExportService.addDocumentHash(
        sheet,
        `${name}-${year}-${unitCode ?? 'all'}`,
      );
    };

    const m = data['militia'] as Record<string, number>;
    const t = data['training'] as Record<string, number>;
    const d = data['discipline'] as Record<string, number>;
    const b = data['budget'] as Record<string, number>;

    makeSheet('I.Quân số', 'QUÂN SỐ DÂN QUÂN TỰ VỆ', [
      { label: 'Quân số hiện dịch', value: m.totalActive },
      { label: 'Dự bị / Không hoạt động', value: m.totalInactive },
      { label: 'Trong đó: Nữ', value: m.totalFemale },
    ]);

    makeSheet('II.Huấn luyện', 'KẾT QUẢ HUẤN LUYỆN', [
      { label: 'Số lượt huấn luyện', value: t.trainedCount },
      { label: 'Tổng ngày huấn luyện', value: t.totalTrainingDays },
    ]);

    makeSheet('III.Kỷ luật', 'KHEN THƯỞNG – KỶ LUẬT', [
      { label: 'Số lượt khen thưởng', value: d.rewardCount },
      {
        label: 'Số lượt kỷ luật',
        value: d.disciplineCount,
        highlight: d.disciplineCount > 0,
      },
    ]);

    makeSheet('IV.Kinh phí', 'KINH PHÍ CHI TRẢ', [
      {
        label: 'Tổng lương đã chi (VNĐ)',
        value: b.totalSalary.toLocaleString('vi-VN') + ' đ',
        highlight: true,
      },
    ]);

    this.excelExportService.addLegalReferencesSheet(wb, [
      'Nghị định 72/2020/NĐ-CP về lực lượng dân quân tự vệ',
      'Thông tư 144/2014/TT-BQP — mẫu biểu báo cáo',
      'Nghị định 30/2020/NĐ-CP về công tác văn thư',
    ]);

    const filename = `Mau03BC_${year}${exportedUnit ? `_${exportedUnit}` : ''}.xlsx`;
    await this.excelExportService.streamToResponse(wb, res, filename);
  }

  // The overview charts over the scope of the counters: tasks by the Vietnamese month they
  // were created in (late = finished after the deadline, or still open past it) and the
  // active headcount of each unit
  async getCharts(user: JwtPayload, year: number): Promise<DashboardCharts> {
    const { unit, userIds } = await this.statsScope(user);
    const [taskRows, areaRows] = await Promise.all([
      this.ds.query<
        {
          month: number;
          assigned: string;
          completed: string;
          overdue: string;
        }[]
      >(
        `SELECT EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS month,
                COUNT(*) AS assigned,
                COUNT(*) FILTER (WHERE t.status = 'completed') AS completed,
                COUNT(*) FILTER (
                  WHERE t.completed_at > t.deadline
                     OR (t.status NOT IN ('completed', 'cancelled')
                         AND t.deadline < now())) AS overdue
         FROM tasks t
         LEFT JOIN units u ON u.id = t.unit_id
         WHERE EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int = $1
           AND ($2::text IS NULL OR u.code = $2)
           AND ($3::uuid[] IS NULL OR EXISTS (
                 SELECT 1 FROM task_assignments ta
                 WHERE ta.task_id = t.id AND ta.assignee_id = ANY($3::uuid[])))
         GROUP BY 1`,
        [year, unit, userIds],
      ),
      this.ds.query<
        { unit_code: string; unit_name: string; headcount: string }[]
      >(
        `SELECT u.code AS unit_code, u.name AS unit_name, COUNT(*) AS headcount
         FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         WHERE mp.status = 'active'
           AND ($1::text IS NULL OR u.code = $1)
           AND ($2::uuid[] IS NULL OR mp.user_id = ANY($2::uuid[]))
         GROUP BY u.code, u.name
         ORDER BY u.code`,
        [unit, userIds],
      ),
    ]);
    const byMonth = new Map(taskRows.map((row) => [row.month, row]));
    return {
      year,
      tasks: Array.from({ length: 12 }, (_, index) => {
        const row = byMonth.get(index + 1);
        return {
          month: index + 1,
          assigned: parseInt(row?.assigned ?? '0', 10),
          completed: parseInt(row?.completed ?? '0', 10),
          overdue: parseInt(row?.overdue ?? '0', 10),
        };
      }),
      areas: areaRows.map((row) => ({
        unitCode: row.unit_code,
        unitName: row.unit_name,
        headcount: parseInt(row.headcount, 10),
      })),
    };
  }

  async getStats(user: JwtPayload): Promise<DashboardStats> {
    const { unit, userIds } = await this.statsScope(user);
    const today = businessDate().isoDate;
    // One round trip. $2 limits to a unit (leave and SOS by the unit of the person who
    // filed them); $3 limits to the records of the listed users.
    const [row] = await this.ds.query<Record<string, string>[]>(
      `SELECT
         (SELECT COUNT(*)
          FROM militia_profiles mp
          JOIN units u ON u.id = mp.unit_id
          WHERE mp.status = 'active'
            AND ($2::text IS NULL OR u.code = $2)
            AND ($3::uuid[] IS NULL OR mp.user_id = ANY($3::uuid[])))  AS total_militia,
         (SELECT COUNT(*)
          FROM attendance_records ar
          JOIN militia_profiles mp ON mp.id = ar.militia_id
          JOIN units u ON u.id = mp.unit_id
          WHERE ar.work_date = $1::date
            AND ($2::text IS NULL OR u.code = $2)
            AND ($3::uuid[] IS NULL OR mp.user_id = ANY($3::uuid[])))  AS active_today,
         (SELECT COUNT(*)
          FROM tasks t
          LEFT JOIN units u ON u.id = t.unit_id
          WHERE t.status = 'pending'
            AND ($2::text IS NULL OR u.code = $2)
            AND ($3::uuid[] IS NULL OR EXISTS (
                  SELECT 1 FROM task_assignments ta
                  WHERE ta.task_id = t.id AND ta.assignee_id = ANY($3::uuid[]))))  AS pending_tasks,
         (SELECT COUNT(*)
          FROM leave_requests lr
          WHERE lr.status = 'pending'
            AND ($2::text IS NULL OR ${userInUnit('lr.requester_id', '$2')})
            AND ($3::uuid[] IS NULL OR lr.requester_id = ANY($3::uuid[])))  AS pending_approvals,
         (SELECT COUNT(*)
          FROM incidents i
          WHERE i.status IN ('open', 'responding')
            AND ($2::text IS NULL OR ${userInUnit('i.reporter_id', '$2')})
            AND ($3::uuid[] IS NULL OR i.reporter_id = ANY($3::uuid[])))  AS active_sos`,
      [today, unit, userIds],
    );
    return {
      totalMilitia: parseInt(row['total_militia'] ?? '0', 10),
      activeToday: parseInt(row['active_today'] ?? '0', 10),
      pendingTasks: parseInt(row['pending_tasks'] ?? '0', 10),
      pendingApprovals: parseInt(row['pending_approvals'] ?? '0', 10),
      activeSosAlerts: parseInt(row['active_sos'] ?? '0', 10),
    };
  }
}
