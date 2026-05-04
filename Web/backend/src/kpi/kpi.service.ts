import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';

export interface CurrentScoreResult {
  score: number | null;
  totalScore: number | null;
  change: number | null;
  rank: number | null;
  rankInUnit: number | null;
  month: number;
  year: number;
  attendanceScore: number | null;
  taskScore: number | null;
}

export interface KpiHistoryItem {
  month: number;
  year: number;
  score: number;
  recommendation: string;
}
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import type { JwtPayload } from '../auth/auth.service';

export interface EvaluateDto {
  targetUserId: string;
  criteria: string[];
  scores: number[];
  recommendation: string;
  notes?: string;
}

export interface EvaluatorInfo {
  sub: string;
  role: string;
}

export interface EvaluationResult {
  id: string;
  evaluatorId: string;
  targetUserId: string;
  weightedScore: number;
  recommendation: string;
  createdAt: Date;
}

const VALID_RECOMMENDATIONS = ['reward', 'maintain', 'training', 'warning', 'discipline'];
const CRITERIA_WEIGHTS = [0.30, 0.25, 0.20, 0.15, 0.10];

export interface KpiSummaryItem {
  militiaId: string;
  name: string;
  code: string;
  unit: string;
  attendanceScore: number | null;
  taskScore: number | null;
  disciplineScore: number | null;
  attitudeScore: number | null;
  supervisorScore: number | null;
  total: number | null;
  rank: number;
  rankInUnit: number;
  xepLoai: 'Xuất sắc' | 'Tốt' | 'Khá' | 'Cần cải thiện';
}

function toXepLoai(total: number | null): 'Xuất sắc' | 'Tốt' | 'Khá' | 'Cần cải thiện' {
  if (total == null) return 'Cần cải thiện';
  if (total >= 90) return 'Xuất sắc';
  if (total >= 75) return 'Tốt';
  if (total >= 60) return 'Khá';
  return 'Cần cải thiện';
}

@Injectable()
export class KpiService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly assignmentsService: AssignmentsService,
    private readonly excelExportService: ExcelExportService,
  ) {}

  async submitEvaluation(
    dto: EvaluateDto,
    evaluator: EvaluatorInfo,
  ): Promise<EvaluationResult> {
    const evaluatorId = evaluator.sub;
    // Validate criteria + scores length
    if (dto.criteria.length !== 5 || dto.scores.length !== 5) {
      throw new BadRequestException('criteria_and_scores_must_have_5_items');
    }
    for (const score of dto.scores) {
      if (!Number.isInteger(score) || score < 1 || score > 10) {
        throw new BadRequestException('scores_must_be_integers_1_to_10');
      }
    }
    if (!VALID_RECOMMENDATIONS.includes(dto.recommendation)) {
      throw new BadRequestException('invalid_recommendation');
    }

    // Verify target user exists
    const userRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM users WHERE id = $1::uuid LIMIT 1`,
      [dto.targetUserId],
    );
    if (!userRows.length) throw new NotFoundException('target_user_not_found');

    // CA scope check: ca_officer can only evaluate assigned DQTV
    if (evaluator.role === 'ca_officer') {
      const assignedIds = await this.assignmentsService.getAssignedDqtvIds(evaluatorId);
      if (assignedIds.length > 0 && !assignedIds.includes(dto.targetUserId)) {
        throw new ForbiddenException('dqtv_not_assigned_to_ca');
      }
    }

    // Duplicate guard: same evaluator + target within current calendar month
    const dupRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM kpi_evaluations
       WHERE evaluator_id = $1::uuid
         AND target_user_id = $2::uuid
         AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
       LIMIT 1`,
      [evaluatorId, dto.targetUserId],
    );
    if (dupRows.length) {
      throw new ConflictException('evaluation_already_submitted_this_month');
    }

    // Calculate weighted score: weights = [30%, 25%, 20%, 15%, 10%]
    const weightedScore = dto.scores.reduce(
      (sum, score, i) => sum + score * CRITERIA_WEIGHTS[i],
      0,
    );

    const inserted = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO kpi_evaluations
         (evaluator_id, target_user_id, criteria, scores, weighted_score, recommendation, notes)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        evaluatorId,
        dto.targetUserId,
        JSON.stringify(dto.criteria),
        JSON.stringify(dto.scores),
        Math.round(weightedScore * 100) / 100,
        dto.recommendation,
        dto.notes ?? null,
      ],
    );

    return {
      id: inserted[0].id,
      evaluatorId,
      targetUserId: dto.targetUserId,
      weightedScore: Math.round(weightedScore * 100) / 100,
      recommendation: dto.recommendation,
      createdAt: new Date(),
    };
  }

  async getCurrentScore(
    userId: string,
    month?: number,
    year?: number,
  ): Promise<CurrentScoreResult> {
    const now = new Date();
    const targetMonth = month ?? now.getMonth() + 1;
    const targetYear = year ?? now.getFullYear();

    const rows = await this.dataSource.query<{
      score: string; recommendation: string; month: number; year: number;
    }[]>(
      `SELECT ke.weighted_score AS score, ke.recommendation, ke.month, ke.year
       FROM kpi_evaluations ke
       JOIN militia_profiles mp ON mp.user_id = ke.target_user_id
       WHERE ke.target_user_id = $1
         AND ke.month = $2 AND ke.year = $3
       ORDER BY ke.created_at DESC LIMIT 1`,
      [userId, targetMonth, targetYear],
    );

    if (!rows.length) {
      return {
        score: null, totalScore: null, change: null,
        rank: null, rankInUnit: null,
        month: targetMonth, year: targetYear,
        attendanceScore: null, taskScore: null,
      };
    }

    const currentScore = parseFloat(rows[0].score);

    // Get last month's score for change calculation
    const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
    const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
    const prevRows = await this.dataSource.query<{ score: string }[]>(
      `SELECT ke.weighted_score AS score
       FROM kpi_evaluations ke
       WHERE ke.target_user_id = $1 AND ke.month = $2 AND ke.year = $3
       ORDER BY ke.created_at DESC LIMIT 1`,
      [userId, prevMonth, prevYear],
    );
    const change = prevRows.length
      ? Math.round((currentScore - parseFloat(prevRows[0].score)) * 100) / 100
      : null;

    // Approximate rank: count users with higher score this month + 1
    const rankRows = await this.dataSource.query<{ cnt: string }[]>(
      `SELECT COUNT(DISTINCT target_user_id)::text AS cnt
       FROM kpi_evaluations
       WHERE month = $1 AND year = $2 AND weighted_score > $3`,
      [targetMonth, targetYear, currentScore],
    );
    const rank = parseInt(rankRows[0]?.cnt ?? '0', 10) + 1;

    return {
      score: currentScore,
      totalScore: currentScore,
      change,
      rank,
      rankInUnit: null,
      month: targetMonth,
      year: targetYear,
      attendanceScore: null,
      taskScore: null,
    };
  }

  async getHistory(userId: string): Promise<KpiHistoryItem[]> {
    const rows = await this.dataSource.query<{
      month: number; year: number; score: string; recommendation: string;
    }[]>(
      `SELECT DISTINCT ON (month, year) month, year,
              weighted_score AS score, recommendation
       FROM kpi_evaluations
       WHERE target_user_id = $1
       ORDER BY month, year, created_at DESC`,
      [userId],
    );

    return rows.map(r => ({
      month: r.month,
      year: r.year,
      score: parseFloat(r.score),
      recommendation: r.recommendation,
    }));
  }

  // Sprint 3: GET /kpi/summary-report?periodId=&unitCode=
  async getSummaryReport(
    user: JwtPayload,
    periodId: string,
    unitCode?: string,
  ): Promise<KpiSummaryItem[]> {
    const WIDE_ROLES = new Set(['system_admin', 'police_ward']);
    const effectiveUnit = WIDE_ROLES.has(user.role) ? (unitCode ?? null) : (user.unitScope ?? null);

    const periodCheck = await this.dataSource.query<{ id: string; month: number; year: number }[]>(
      `SELECT id, month, year FROM payroll_periods WHERE id = $1`,
      [periodId],
    );
    if (!periodCheck.length) throw new NotFoundException('period_not_found');
    const { month, year } = periodCheck[0];

    const params: unknown[] = [month, year];
    let unitFilter = '';
    if (effectiveUnit) {
      params.push(effectiveUnit);
      unitFilter = `AND u.code = $${params.length}`;
    }

    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT mp.id AS "militiaId", mp.full_name AS "name", mp.militia_code AS "code",
              u.name AS "unit",
              ROUND(AVG((ke.scores->0)::numeric), 1) AS "attendanceScore",
              ROUND(AVG((ke.scores->1)::numeric), 1) AS "taskScore",
              ROUND(AVG((ke.scores->2)::numeric), 1) AS "disciplineScore",
              ROUND(AVG((ke.scores->3)::numeric), 1) AS "attitudeScore",
              ROUND(AVG((ke.scores->4)::numeric), 1) AS "supervisorScore",
              ROUND(AVG(ke.weighted_score)::numeric * 10, 1) AS "total",
              RANK() OVER (ORDER BY AVG(ke.weighted_score) DESC NULLS LAST) AS "rank"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       LEFT JOIN users usr ON usr.id = mp.user_id
       LEFT JOIN kpi_evaluations ke
         ON ke.target_user_id = usr.id
         AND ke.month = $1 AND ke.year = $2
       WHERE mp.status = 'active'
       ${unitFilter}
       GROUP BY mp.id, mp.full_name, mp.militia_code, u.name, u.code
       ORDER BY mp.full_name`,
      params,
    );

    // rank within unit
    const unitGroups = new Map<string, number[]>();
    rows.forEach((r, idx) => {
      const u = r['unit'] as string;
      if (!unitGroups.has(u)) unitGroups.set(u, []);
      unitGroups.get(u)!.push(idx);
    });
    const rankInUnit = new Map<number, number>();
    unitGroups.forEach((indices) => {
      const sorted = [...indices].sort((a, b) => {
        const ta = parseFloat(String(rows[a]['total'] ?? '0'));
        const tb = parseFloat(String(rows[b]['total'] ?? '0'));
        return tb - ta;
      });
      sorted.forEach((origIdx, rank) => rankInUnit.set(origIdx, rank + 1));
    });

    return rows.map((r, idx) => {
      const total = r['total'] !== null ? parseFloat(String(r['total'])) : null;
      return {
        militiaId: r['militiaId'] as string,
        name: r['name'] as string,
        code: r['code'] as string,
        unit: r['unit'] as string,
        attendanceScore: r['attendanceScore'] !== null ? parseFloat(String(r['attendanceScore'])) : null,
        taskScore: r['taskScore'] !== null ? parseFloat(String(r['taskScore'])) : null,
        disciplineScore: r['disciplineScore'] !== null ? parseFloat(String(r['disciplineScore'])) : null,
        attitudeScore: r['attitudeScore'] !== null ? parseFloat(String(r['attitudeScore'])) : null,
        supervisorScore: r['supervisorScore'] !== null ? parseFloat(String(r['supervisorScore'])) : null,
        total,
        rank: parseInt(String(r['rank'] ?? '0'), 10),
        rankInUnit: rankInUnit.get(idx) ?? 1,
        xepLoai: toXepLoai(total),
      };
    });
  }

  // Sprint 3: GET /kpi/export?periodId=&unitCode= → xlsx
  async exportKpi(
    user: { sub: string; role: string },
    periodId: string,
    unitCode: string | undefined,
    res: Response,
  ): Promise<void> {
    const periodCheck = await this.dataSource.query<{ month: number; year: number }[]>(
      `SELECT month, year FROM payroll_periods WHERE id = $1`,
      [periodId],
    );
    if (!periodCheck.length) throw new NotFoundException('period_not_found');
    const { month, year } = periodCheck[0];

    const data = await this.getSummaryReport(user, periodId, unitCode);
    const wb = this.excelExportService.createWorkbook();
    const sheet = wb.addWorksheet('Báo cáo KPI');

    const startRow = this.excelExportService.addGovernmentHeader(sheet, {
      agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
      reportTitle: `BÁO CÁO KPI THÁNG ${month}/${year}${unitCode ? ` — ĐƠN VỊ ${unitCode}` : ''}`,
      reportDate: new Date(),
    });

    const tableRows = data.map((item, idx) => ({
      stt: idx + 1,
      name: item.name,
      code: item.code,
      unit: item.unit,
      attendanceScore: item.attendanceScore ?? 0,
      taskScore: item.taskScore ?? 0,
      disciplineScore: item.disciplineScore ?? 0,
      attitudeScore: item.attitudeScore ?? 0,
      supervisorScore: item.supervisorScore ?? 0,
      total: item.total ?? 0,
      xepLoai: item.xepLoai,
    }));

    this.excelExportService.addStyledTable(sheet, startRow, [
      { header: 'STT', key: 'stt', width: 6, type: 'number' },
      { header: 'Họ tên', key: 'name', width: 24 },
      { header: 'Mã DQTV', key: 'code', width: 14 },
      { header: 'Đơn vị', key: 'unit', width: 18 },
      { header: 'Điểm chuyên cần', key: 'attendanceScore', width: 16, type: 'number' },
      { header: 'Điểm nhiệm vụ', key: 'taskScore', width: 14, type: 'number' },
      { header: 'Điểm kỷ luật', key: 'disciplineScore', width: 14, type: 'number' },
      { header: 'Điểm thái độ', key: 'attitudeScore', width: 14, type: 'number' },
      { header: 'Điểm chỉ huy', key: 'supervisorScore', width: 14, type: 'number' },
      { header: 'Tổng điểm', key: 'total', width: 12, type: 'number' },
      { header: 'Xếp loại', key: 'xepLoai', width: 14, type: 'status' },
    ], tableRows);

    this.excelExportService.addDocumentHash(sheet, JSON.stringify(tableRows));
    const filename = `BaoCaoKPI_${month}_${year}${unitCode ? `_${unitCode}` : ''}.xlsx`;
    await this.excelExportService.streamToResponse(wb, res, filename);
  }
}
