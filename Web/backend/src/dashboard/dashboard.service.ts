import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/auth.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import type { Response } from 'express';

export interface DashboardStats {
  totalMilitia: number;
  activeToday: number;
  pendingTasks: number;
  pendingApprovals: number;
  activeSosAlerts: number;
}

export interface ComplianceStats {
  totalActive: number;
  trainingCompliant: number;
  trainingCompliancePct: number;
  attendancePct: number;
  avgKpiScore: number;
  expiringExemptions: number;
  lastUpdated: Date;
}

/** Roles with cross-unit visibility */
const WIDE_ROLES = new Set(['system_admin', 'police_ward']);

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly excelExportService: ExcelExportService,
  ) {}

  async getComplianceStats(user: JwtPayload, unitCode?: string): Promise<ComplianceStats> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Effective unit filter: admins can pass unitCode param; others locked to unitScope
    const effectiveUnit: string | null = WIDE_ROLES.has(user.role)
      ? (unitCode ?? null)
      : (user.unitScope ?? null);

    // Single CTE query — 1 DB round trip
    const [row] = await this.ds.query<Record<string, string>[]>(
      `WITH scope AS (
         SELECT mp.id AS militia_id
         FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         WHERE mp.status = 'active'
           AND ($1::text IS NULL OR u.code = $1)
       )
       SELECT
         (SELECT COUNT(*) FROM scope)                                                       AS total_active,
         (SELECT COUNT(DISTINCT tr.militia_id)
          FROM training_records tr
          JOIN scope s ON s.militia_id = tr.militia_id
          WHERE EXTRACT(YEAR FROM tr.from_date)::int = $2
          GROUP BY tr.militia_id
          HAVING SUM(tr.total_days) >= 15)::bigint                                         AS training_compliant,
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
         (SELECT COALESCE(ROUND(AVG(ks.score)::numeric, 2), 0)
          FROM kpi_scores ks
          JOIN scope s ON s.militia_id = ks.militia_id
          WHERE EXTRACT(MONTH FROM ks.created_at)::int = $3
            AND EXTRACT(YEAR FROM ks.created_at)::int = $2)                                AS avg_kpi_score,
         (SELECT COUNT(*)
          FROM exemptions ex
          JOIN scope s ON s.militia_id = ex.militia_id
          WHERE ex.end_date BETWEEN NOW()::date AND (NOW() + INTERVAL '30 days')::date)    AS expiring_exemptions`,
      [effectiveUnit, year, month],
    );

    const totalActive = parseInt(row['total_active'] ?? '0', 10);
    const trainingCompliant = parseInt(row['training_compliant'] ?? '0', 10);

    return {
      totalActive,
      trainingCompliant,
      trainingCompliancePct: totalActive > 0
        ? Math.round((trainingCompliant / totalActive) * 1000) / 10
        : 0,
      attendancePct: parseFloat(row['attendance_pct'] ?? '0'),
      avgKpiScore: parseFloat(row['avg_kpi_score'] ?? '0'),
      expiringExemptions: parseInt(row['expiring_exemptions'] ?? '0', 10),
      lastUpdated: new Date(),
    };
  }

  // Sprint 3: Mẫu 03-BC aggregate
  async getMau03Bc(year: number, unitCode?: string): Promise<Record<string, unknown>> {
    const unitFilter = unitCode ? `AND u.code = $2` : '';
    const params: unknown[] = [year];
    if (unitCode) params.push(unitCode);

    const [militiaRow] = await this.ds.query<Record<string, string>[]>(
      `SELECT
         COUNT(*) FILTER (WHERE mp.status = 'active')  AS total_active,
         COUNT(*) FILTER (WHERE mp.status = 'inactive') AS total_inactive,
         COUNT(*) FILTER (WHERE mp.gender = 'female')   AS total_female
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE 1=1 ${unitFilter}`,
      params,
    );

    const [trainingRow] = await this.ds.query<Record<string, string>[]>(
      `SELECT
         COUNT(DISTINCT tr.militia_id) AS trained_count,
         COALESCE(SUM(tr.total_days), 0) AS total_training_days
       FROM training_records tr
       JOIN militia_profiles mp ON mp.id = tr.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE EXTRACT(YEAR FROM tr.from_date)::int = $1
       ${unitCode ? `AND u.code = $2` : ''}`,
      params,
    );

    const [disciplineRow] = await this.ds.query<Record<string, string>[]>(
      `SELECT
         COUNT(*) FILTER (WHERE mr.reward_type = 'reward')    AS reward_count,
         COUNT(*) FILTER (WHERE mr.reward_type != 'reward')   AS discipline_count
       FROM militia_rewards mr
       JOIN militia_profiles mp ON mp.id = mr.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE EXTRACT(YEAR FROM mr.issued_date)::int = $1
       ${unitCode ? `AND u.code = $2` : ''}`,
      params,
    );

    const [budgetRow] = await this.ds.query<Record<string, string>[]>(
      `SELECT COALESCE(SUM(pi.net_salary), 0) AS total_salary
       FROM payroll_items pi
       JOIN payroll_periods pp ON pp.id = pi.payroll_period_id
       JOIN militia_profiles mp ON mp.id = pi.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE pp.year = $1
       ${unitCode ? `AND u.code = $2` : ''}`,
      params,
    );

    return {
      year,
      unitCode: unitCode ?? null,
      militia: {
        totalActive: parseInt(militiaRow['total_active'] ?? '0', 10),
        totalInactive: parseInt(militiaRow['total_inactive'] ?? '0', 10),
        totalFemale: parseInt(militiaRow['total_female'] ?? '0', 10),
      },
      training: {
        trainedCount: parseInt(trainingRow['trained_count'] ?? '0', 10),
        totalTrainingDays: parseInt(trainingRow['total_training_days'] ?? '0', 10),
      },
      discipline: {
        rewardCount: parseInt(disciplineRow['reward_count'] ?? '0', 10),
        disciplineCount: parseInt(disciplineRow['discipline_count'] ?? '0', 10),
      },
      budget: {
        totalSalary: parseFloat(budgetRow['total_salary'] ?? '0'),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  // Sprint 3: Mẫu 03-BC xlsx export (4 sheets)
  async exportMau03Bc(year: number, unitCode: string | undefined, res: Response): Promise<void> {
    const data = await this.getMau03Bc(year, unitCode);
    const wb = this.excelExportService.createWorkbook();
    const reportDate = new Date();

    const makeSheet = (name: string, title: string, stats: { label: string; value: string | number; highlight?: boolean }[]) => {
      const sheet = wb.addWorksheet(name);
      const startRow = this.excelExportService.addGovernmentHeader(sheet, {
        agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
        reportTitle: `MẪU 03-BC — ${title} NĂM ${year}`,
        reportDate,
      });
      this.excelExportService.addSummaryStatsTable(sheet, startRow, title, stats);
      this.excelExportService.addSignatureBlock(sheet, startRow + stats.length + 3, { position: 'Chỉ huy trưởng' });
      this.excelExportService.addDocumentHash(sheet, `${name}-${year}-${unitCode ?? 'all'}`);
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
      { label: 'Số lượt kỷ luật', value: d.disciplineCount, highlight: d.disciplineCount > 0 },
    ]);

    makeSheet('IV.Kinh phí', 'KINH PHÍ CHI TRẢ', [
      { label: 'Tổng lương đã chi (VNĐ)', value: b.totalSalary.toLocaleString('vi-VN') + ' đ', highlight: true },
    ]);

    this.excelExportService.addLegalReferencesSheet(wb, [
      'Nghị định 72/2020/NĐ-CP về lực lượng dân quân tự vệ',
      'Thông tư 144/2014/TT-BQP — mẫu biểu báo cáo',
      'Nghị định 30/2020/NĐ-CP về công tác văn thư',
    ]);

    const filename = `Mau03BC_${year}${unitCode ? `_${unitCode}` : ''}.xlsx`;
    await this.excelExportService.streamToResponse(wb, res, filename);
  }

  async getStats(): Promise<DashboardStats> {
    const today = new Date().toISOString().split('T')[0];
    // Single CTE — 1 round trip instead of 5 queries
    const [row] = await this.ds.query<Record<string, string>[]>(
      `SELECT
         (SELECT COUNT(*) FROM militia_profiles WHERE status = 'active')          AS total_militia,
         (SELECT COUNT(*) FROM attendance_records WHERE work_date = $1::date)     AS active_today,
         (SELECT COUNT(*) FROM tasks WHERE status = 'pending')                    AS pending_tasks,
         (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending')           AS pending_approvals,
         (SELECT COUNT(*) FROM incidents WHERE status IN ('open', 'responding'))  AS active_sos`,
      [today],
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
