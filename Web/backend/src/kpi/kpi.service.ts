import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';

// GET /kpi/current. Scores use the evaluation scale: criteria are scored 1-10 and score is
// their weighted sum, so every score here is out of maxScore (10).
export interface CurrentScoreResult {
  // Average weighted score of the month's evaluations (one per evaluator), 2 decimals
  score: number | null;
  totalScore: number | null;
  // score minus the previous month's score; null when either month has no evaluation
  change: number | null;
  // Standard competition ranking ("1224": ties share a rank, the next rank skips) of the
  // monthly score among every evaluated member of the ward, and of the member's unit
  rank: number | null;
  rankInUnit: number | null;
  // Members of the member's unit with a score this month (who rankInUnit is out of);
  // null when the member has no militia profile unit
  unitSize: number | null;
  month: number;
  year: number;
  attendanceScore: number | null;
  taskScore: number | null;
  maxScore: number;
}

// The highest score a criterion, and so the weighted score, can take (submitEvaluation)
export const KPI_MAX_SCORE = 10;

/**
 * Criterion names a component score is read from, most specific first. An evaluation stores
 * the criteria names next to their scores in the order the evaluator's form lists them
 * (POST /kpi/evaluate): PoliceApp sends "Hiệu quả công tác" third and "Chấm công" fourth,
 * other forms say "Nhiệm vụ" / "Chuyên cần". The groups follow the KPI categories of the
 * design (Kỷ luật & Chấp hành, Thực hiện nhiệm vụ, Thái độ & Tinh thần). Names are compared
 * without diacritics or case, as parts of the criterion name.
 */
export const KPI_COMPONENT_CRITERIA = {
  attendance: ['cham cong', 'chuyen can', 'diem danh'],
  task: ['nhiem vu', 'hieu qua cong tac'],
  discipline: ['ky luat', 'chap hanh'],
  attitude: ['thai do', 'tac phong', 'tinh than'],
} as const;

const foldCriterion = (label: string) =>
  label
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();

/**
 * One component of a member's monthly KPI: the average, over the month's evaluations, of
 * the score given to the criterion matching the earliest of `names` (the first such
 * criterion of the form), to 2 decimals. null when no evaluation names such a criterion
 * with a valid score: evaluators score the criteria their form lists, and a form without
 * this criterion gives no data for it.
 */
export function kpiComponentScore(
  evaluations: { criteria: unknown; scores: unknown }[],
  names: readonly string[],
): number | null {
  const values: number[] = [];
  for (const { criteria, scores } of evaluations) {
    if (!Array.isArray(criteria) || !Array.isArray(scores)) continue;
    const labels = criteria.map((label) =>
      typeof label === 'string' ? foldCriterion(label) : '',
    );
    const index =
      names
        .map((name) => labels.findIndex((label) => label.includes(name)))
        .find((found) => found !== -1) ?? -1;
    const value = index === -1 ? undefined : (scores as unknown[])[index];
    if (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= KPI_MAX_SCORE
    ) {
      values.push(value);
    }
  }
  if (values.length === 0) return null;
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(average * 100) / 100;
}

const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

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
import { effectiveUnit, type ScopedActor } from '../common/access/unit-scope';
import { DQTV_ROLES, WIDE_SCOPE_ROLES } from '../common/constants/roles';
import { militiaUnitsOf } from '../common/sql/user-access.sql';
import { businessDate } from '../common/time/business-date';
import { gradeOf, type KpiGrade } from './kpi-grades';

export interface EvaluateDto {
  targetUserId: string;
  criteria: string[];
  scores: number[];
  recommendation: string;
  notes?: string;
}

export interface EvaluatorInfo extends ScopedActor {
  sub: string;
}

export interface EvaluationResult {
  id: string;
  evaluatorId: string;
  targetUserId: string;
  weightedScore: number;
  recommendation: string;
  createdAt: Date;
}

const VALID_RECOMMENDATIONS = [
  'reward',
  'maintain',
  'training',
  'warning',
  'discipline',
];
const CRITERIA_WEIGHTS = [0.3, 0.25, 0.2, 0.15, 0.1];

export interface KpiSummaryItem {
  militiaId: string;
  name: string;
  code: string;
  unit: string;
  // Components on the 0-10 scale of a criterion, read by criterion name (kpiComponentScore)
  attendanceScore: number | null;
  taskScore: number | null;
  disciplineScore: number | null;
  attitudeScore: number | null;
  // The evaluators' overall score: the average weighted score of the month, 0-10
  supervisorScore: number | null;
  // The same average on the 100-point scale
  total: number | null;
  // Standard competition ranks in the report and in the member's unit
  rank: number;
  rankInUnit: number;
  xepLoai: KpiGrade['label'];
}

interface KpiSummaryRow {
  militiaId: string;
  name: string;
  code: string;
  unit: string;
  evaluations: { criteria: unknown; scores: unknown }[];
  // ROUND over NUMERIC: numbers (src/database/pg-types.ts)
  supervisorScore: number | null;
  total: number | null;
  // RANK() is BIGINT: text
  rank: string;
  rankInUnit: string;
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

    // Only DQTV members are evaluated
    const targets = await this.dataSource.query<
      { id: string; isDqtv: boolean; units: string[] }[]
    >(
      `SELECT u.id,
              EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                      WHERE ur.user_id = u.id AND r.code IN ('dqtv', 'dqtv_member')) AS "isDqtv",
              ${militiaUnitsOf('u.id')} AS units
       FROM users u
       WHERE u.id = $1::uuid`,
      [dto.targetUserId],
    );
    if (!targets.length) throw new NotFoundException('target_user_not_found');
    const target = targets[0];
    if (!target.isDqtv) throw new BadRequestException('target_not_dqtv');

    await this.assertCanEvaluate(evaluator, target.id, target.units);

    // Calculate weighted score: weights = [30%, 25%, 20%, 15%, 10%]
    const weightedScore = dto.scores.reduce(
      (sum, score, i) => sum + score * CRITERIA_WEIGHTS[i],
      0,
    );

    // The (evaluator, target, year, month) unique index is the duplicate check: it holds
    // under concurrent submissions and its month is the Vietnamese month (migration 019)
    let inserted: { id: string }[];
    try {
      inserted = await this.dataSource.query<{ id: string }[]>(
        `INSERT INTO kpi_evaluations
           (evaluator_id, target_user_id, criteria, scores, weighted_score, recommendation, notes)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
         ON CONFLICT (evaluator_id, target_user_id, year, month) DO NOTHING
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
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('evaluation_already_submitted_this_month');
      }
      throw err;
    }
    if (!inserted.length) {
      throw new ConflictException('evaluation_already_submitted_this_month');
    }

    return {
      id: inserted[0].id,
      evaluatorId,
      targetUserId: dto.targetUserId,
      weightedScore: Math.round(weightedScore * 100) / 100,
      recommendation: dto.recommendation,
      createdAt: new Date(),
    };
  }

  // Wide roles evaluate anyone; CA officers only the DQTV assigned to them (none
  // assigned means none); other CA roles only members of their unit
  private async assertCanEvaluate(
    evaluator: EvaluatorInfo,
    targetUserId: string,
    targetUnits: string[],
  ): Promise<void> {
    if (this.isWide(evaluator)) return;
    if (evaluator.role === 'ca_officer') {
      const assigned = await this.assignmentsService.getAssignedDqtvIds(
        evaluator.sub,
      );
      if (!assigned.includes(targetUserId)) {
        throw new ForbiddenException('dqtv_not_assigned_to_ca');
      }
      return;
    }
    const unit = effectiveUnit(evaluator);
    if (unit !== null && !targetUnits.includes(unit)) {
      throw new ForbiddenException('unit_scope_violation');
    }
  }

  // Members read their own KPI; wide roles anyone's; CA officers their assigned DQTV;
  // other roles members of their unit. ?userId= never widens this.
  private async assertKpiVisible(
    actor: EvaluatorInfo,
    targetUserId: string,
  ): Promise<void> {
    if (actor.sub === targetUserId || this.isWide(actor)) return;
    if (DQTV_ROLES.has(actor.role))
      throw new ForbiddenException('kpi_not_visible');
    if (actor.role === 'ca_officer') {
      const assigned = await this.assignmentsService.getAssignedDqtvIds(
        actor.sub,
      );
      if (!assigned.includes(targetUserId)) {
        throw new ForbiddenException('kpi_not_visible');
      }
      return;
    }
    const unit = effectiveUnit(actor);
    if (unit === null) return;
    const rows = await this.dataSource.query<{ units: string[] }[]>(
      `SELECT ${militiaUnitsOf('$1::uuid')} AS units`,
      [targetUserId],
    );
    if (!(rows[0]?.units ?? []).includes(unit)) {
      throw new ForbiddenException('kpi_not_visible');
    }
  }

  private isWide(actor: EvaluatorInfo): boolean {
    return [actor.role, ...(actor.roles ?? [])].some((role) =>
      WIDE_SCOPE_ROLES.has(role),
    );
  }

  async getCurrentScore(
    actor: EvaluatorInfo,
    userId: string,
    month?: number,
    year?: number,
  ): Promise<CurrentScoreResult> {
    await this.assertKpiVisible(actor, userId);
    if (
      month !== undefined &&
      !(Number.isInteger(month) && month >= 1 && month <= 12)
    ) {
      throw new BadRequestException('invalid_month');
    }
    // Default to the current month in Vietnam, not in the server's UTC clock
    const today = businessDate();
    const targetMonth = month ?? today.month;
    const targetYear = year ?? today.year;
    const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
    const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;

    // One statement, one snapshot: the member's monthly score (average of the month's
    // evaluations, one per evaluator), their standard competition rank ("1224") among every
    // member scored that month and among those of their unit, how many of their unit were
    // scored, the previous month's score, and the evaluations the components are read from.
    // A member's unit is that of their militia profile (the active one first).
    const rows = await this.dataSource.query<
      {
        score: string | null;
        rank: string | null;
        rankInUnit: string | null;
        unitSize: string | null;
        previousScore: string | null;
        evaluations: { criteria: unknown; scores: unknown }[] | null;
      }[]
    >(
      `WITH monthly AS (
         SELECT ke.target_user_id AS user_id, AVG(ke.weighted_score) AS score
         FROM kpi_evaluations ke
         WHERE ke.year = $2 AND ke.month = $3
         GROUP BY ke.target_user_id
       ),
       own AS (
         SELECT score FROM monthly WHERE user_id = $1
       ),
       member_unit AS (
         SELECT mp.unit_id FROM militia_profiles mp
         WHERE mp.user_id = $1
         ORDER BY (mp.status = 'active') DESC, mp.created_at DESC, mp.id
         LIMIT 1
       ),
       unit_monthly AS (
         SELECT m.user_id, m.score FROM monthly m
         WHERE EXISTS (
           SELECT 1 FROM militia_profiles ump
           JOIN member_unit mu ON ump.unit_id = mu.unit_id
           WHERE ump.user_id = m.user_id)
       )
       SELECT ROUND((SELECT score FROM own), 2) AS score,
              (SELECT COUNT(*) FROM monthly m WHERE m.score > (SELECT score FROM own)) + 1 AS rank,
              CASE WHEN EXISTS (SELECT 1 FROM member_unit) THEN
                (SELECT COUNT(*) FROM unit_monthly um WHERE um.score > (SELECT score FROM own)) + 1
              END AS "rankInUnit",
              CASE WHEN EXISTS (SELECT 1 FROM member_unit) THEN
                (SELECT COUNT(*) FROM unit_monthly)
              END AS "unitSize",
              (SELECT ROUND(AVG(pe.weighted_score), 2) FROM kpi_evaluations pe
               WHERE pe.target_user_id = $1 AND pe.year = $4 AND pe.month = $5) AS "previousScore",
              (SELECT COALESCE(json_agg(json_build_object('criteria', ce.criteria, 'scores', ce.scores)
                                        ORDER BY ce.created_at), '[]'::json)
               FROM kpi_evaluations ce
               WHERE ce.target_user_id = $1 AND ce.year = $2 AND ce.month = $3) AS evaluations`,
      [userId, targetYear, targetMonth, prevYear, prevMonth],
    );
    const row = rows[0];
    const score = toNumber(row?.score);
    const unitSize = toNumber(row?.unitSize);

    if (score === null) {
      return {
        score: null,
        totalScore: null,
        change: null,
        rank: null,
        rankInUnit: null,
        unitSize,
        month: targetMonth,
        year: targetYear,
        attendanceScore: null,
        taskScore: null,
        maxScore: KPI_MAX_SCORE,
      };
    }

    const previous = toNumber(row.previousScore);
    const evaluations = row.evaluations ?? [];
    return {
      score,
      totalScore: score,
      change:
        previous === null ? null : Math.round((score - previous) * 100) / 100,
      rank: toNumber(row.rank),
      rankInUnit: toNumber(row.rankInUnit),
      unitSize,
      month: targetMonth,
      year: targetYear,
      attendanceScore: kpiComponentScore(
        evaluations,
        KPI_COMPONENT_CRITERIA.attendance,
      ),
      taskScore: kpiComponentScore(evaluations, KPI_COMPONENT_CRITERIA.task),
      maxScore: KPI_MAX_SCORE,
    };
  }

  // One entry per evaluated month, newest first (year, then month): the month's average
  // score, as GET /kpi/current reports it, and the latest recommendation
  async getHistory(
    actor: EvaluatorInfo,
    userId: string,
  ): Promise<KpiHistoryItem[]> {
    await this.assertKpiVisible(actor, userId);
    const rows = await this.dataSource.query<
      {
        month: number;
        year: number;
        // ROUND over NUMERIC: a number (src/database/pg-types.ts)
        score: number;
        recommendation: string;
      }[]
    >(
      `SELECT ke.year, ke.month,
              ROUND(AVG(ke.weighted_score), 2) AS score,
              (ARRAY_AGG(ke.recommendation ORDER BY ke.created_at DESC))[1] AS recommendation
       FROM kpi_evaluations ke
       WHERE ke.target_user_id = $1
       GROUP BY ke.year, ke.month
       ORDER BY ke.year DESC, ke.month DESC`,
      [userId],
    );

    return rows.map((r) => ({
      month: r.month,
      year: r.year,
      score: r.score,
      recommendation: r.recommendation,
    }));
  }

  // Sprint 3: GET /kpi/summary-report?periodId=&unitCode=
  async getSummaryReport(
    user: JwtPayload,
    periodId: string,
    unitCode?: string,
  ): Promise<KpiSummaryItem[]> {
    const unit = effectiveUnit(user, unitCode);

    const periodCheck = await this.dataSource.query<
      { id: string; month: number; year: number }[]
    >(`SELECT id, month, year FROM payroll_periods WHERE id = $1`, [periodId]);
    if (!periodCheck.length) throw new NotFoundException('period_not_found');
    const { month, year } = periodCheck[0];

    const params: unknown[] = [month, year];
    let unitFilter = '';
    if (unit) {
      params.push(unit);
      unitFilter = `AND u.code = $${params.length}`;
    }

    // Units are told apart by id: two units may share a name
    const rows = await this.dataSource.query<KpiSummaryRow[]>(
      `SELECT mp.id AS "militiaId", mp.full_name AS "name", mp.militia_code AS "code",
              u.name AS "unit",
              COALESCE(json_agg(json_build_object('criteria', ke.criteria, 'scores', ke.scores)
                                ORDER BY ke.created_at) FILTER (WHERE ke.id IS NOT NULL),
                       '[]'::json) AS evaluations,
              ROUND(AVG(ke.weighted_score), 2) AS "supervisorScore",
              ROUND(AVG(ke.weighted_score)::numeric * 10, 1) AS "total",
              RANK() OVER (ORDER BY AVG(ke.weighted_score) DESC NULLS LAST) AS "rank",
              RANK() OVER (PARTITION BY u.id ORDER BY AVG(ke.weighted_score) DESC NULLS LAST) AS "rankInUnit"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       LEFT JOIN users usr ON usr.id = mp.user_id
       LEFT JOIN kpi_evaluations ke
         ON ke.target_user_id = usr.id
         AND ke.month = $1 AND ke.year = $2
       WHERE mp.status = 'active'
       ${unitFilter}
       GROUP BY mp.id, mp.full_name, mp.militia_code, u.id, u.name
       ORDER BY mp.full_name`,
      params,
    );

    return rows.map((row) => {
      const { total } = row;
      return {
        militiaId: row.militiaId,
        name: row.name,
        code: row.code,
        unit: row.unit,
        attendanceScore: kpiComponentScore(
          row.evaluations,
          KPI_COMPONENT_CRITERIA.attendance,
        ),
        taskScore: kpiComponentScore(
          row.evaluations,
          KPI_COMPONENT_CRITERIA.task,
        ),
        disciplineScore: kpiComponentScore(
          row.evaluations,
          KPI_COMPONENT_CRITERIA.discipline,
        ),
        attitudeScore: kpiComponentScore(
          row.evaluations,
          KPI_COMPONENT_CRITERIA.attitude,
        ),
        supervisorScore: row.supervisorScore,
        total,
        rank: Number(row.rank),
        rankInUnit: Number(row.rankInUnit),
        // A member nobody evaluated keeps the lowest band; clients show them as not evaluated
        xepLoai: gradeOf(total ?? 0).label,
      };
    });
  }

  // Sprint 3: GET /kpi/export?periodId=&unitCode= → xlsx
  async exportKpi(
    user: JwtPayload,
    periodId: string,
    unitCode: string | undefined,
    res: Response,
  ): Promise<void> {
    const periodCheck = await this.dataSource.query<
      { month: number; year: number }[]
    >(`SELECT month, year FROM payroll_periods WHERE id = $1`, [periodId]);
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

    this.excelExportService.addStyledTable(
      sheet,
      startRow,
      [
        { header: 'STT', key: 'stt', width: 6, type: 'number' },
        { header: 'Họ tên', key: 'name', width: 24 },
        { header: 'Mã DQTV', key: 'code', width: 14 },
        { header: 'Đơn vị', key: 'unit', width: 18 },
        {
          header: 'Điểm chuyên cần',
          key: 'attendanceScore',
          width: 16,
          type: 'number',
        },
        {
          header: 'Điểm nhiệm vụ',
          key: 'taskScore',
          width: 14,
          type: 'number',
        },
        {
          header: 'Điểm kỷ luật',
          key: 'disciplineScore',
          width: 14,
          type: 'number',
        },
        {
          header: 'Điểm thái độ',
          key: 'attitudeScore',
          width: 14,
          type: 'number',
        },
        {
          header: 'Điểm chỉ huy',
          key: 'supervisorScore',
          width: 14,
          type: 'number',
        },
        { header: 'Tổng điểm', key: 'total', width: 12, type: 'number' },
        { header: 'Xếp loại', key: 'xepLoai', width: 14, type: 'status' },
      ],
      tableRows,
    );

    this.excelExportService.addDocumentHash(sheet, JSON.stringify(tableRows));
    const filename = `BaoCaoKPI_${month}_${year}${unitCode ? `_${unitCode}` : ''}.xlsx`;
    await this.excelExportService.streamToResponse(wb, res, filename);
  }
}
