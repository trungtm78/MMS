// GET /kpi/dashboard: the KPI overview of a month for the caller's unit scope — coverage,
// the distribution by xếp loại, averages per unit, the best and weakest members, the trend,
// recommendation counts, and the members' results against the KPI targets in force.
//
// A member's score is the average of the month's evaluations on the 100-point scale, as
// in /kpi/summary-report. The members are the active militia members of the scope.
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/auth.service';
import { effectiveUnit } from '../common/access/unit-scope';
import {
  businessDate,
  businessDayEndSql,
  businessDayStartSql,
} from '../common/time/business-date';
import { monthRange } from '../common/validation/date-range';
import {
  KpiTargetsService,
  type KpiTargetsView,
} from '../settings/kpi-targets.service';
import {
  evaluationWindow,
  resolveKpiPeriod,
  trendRange,
  type KpiPeriodQuery,
} from './kpi-dashboard';
import { KPI_GRADES, gradeOf } from './kpi-grades';

export type KpiDashboardActor = Pick<
  JwtPayload,
  'sub' | 'role' | 'roles' | 'unitScope'
>;

export interface KpiDashboardQuery extends KpiPeriodQuery {
  unitCode?: string;
  /** Members listed among the best and the weakest, 1-20 */
  top?: number;
  /** Months of trend ending with the period, 1-24 */
  trendMonths?: number;
}

// kpi_evaluations.recommendation (migration 019), in order of severity
export const KPI_RECOMMENDATIONS = [
  { recommendation: 'reward', label: 'Khen thưởng' },
  { recommendation: 'maintain', label: 'Duy trì' },
  { recommendation: 'training', label: 'Bồi dưỡng thêm' },
  { recommendation: 'warning', label: 'Nhắc nhở' },
  { recommendation: 'discipline', label: 'Xem xét kỷ luật' },
] as const;

// training_records counts days; a training day is a working day of 8 hours
export const TRAINING_HOURS_PER_DAY = 8;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const round1 = (value: number) => Math.round(value * 10) / 10;
const pad2 = (value: number) => String(value).padStart(2, '0');
const camel = (code: string) =>
  code.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

// Active members of the scope ($1 unit)
const SCOPE = `scope AS (
    SELECT mp.id AS militia_id, mp.user_id, mp.full_name, mp.militia_code,
           u.code AS unit_code, u.name AS unit_name
    FROM militia_profiles mp
    JOIN units u ON u.id = mp.unit_id
    WHERE mp.status = 'active' AND ($1::text IS NULL OR u.code = $1)
  )`;

// Each member with their score for the month ($2 year, $3 month), null when not evaluated
const SCORED = `WITH ${SCOPE},
  scored AS (
    SELECT s.*, ev.score
    FROM scope s
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG(ke.weighted_score) * 10, 1) AS score
      FROM kpi_evaluations ke
      WHERE ke.target_user_id = s.user_id AND ke.year = $2 AND ke.month = $3
    ) ev ON true
  )`;

const GRADE_COUNTS = KPI_GRADES.map((band, i) => {
  const upper = i === 0 ? '' : ` AND score < ${KPI_GRADES[i - 1].minScore}`;
  return `COUNT(*) FILTER (WHERE score >= ${band.minScore}${upper})::int AS "${camel(band.grade)}"`;
}).join(',\n         ');

const SQL = {
  summary: `${SCORED}
    SELECT COUNT(*)::int AS "memberCount",
           COUNT(score)::int AS "evaluatedCount",
           ROUND(AVG(score), 1)::float8 AS "averageScore",
           ${GRADE_COUNTS}
    FROM scored`,
  byUnit: `${SCORED}
    SELECT unit_code AS "unitCode", unit_name AS "unitName",
           COUNT(*)::int AS "memberCount", COUNT(score)::int AS "evaluatedCount",
           ROUND(AVG(score), 1)::float8 AS "averageScore"
    FROM scored
    GROUP BY unit_code, unit_name
    ORDER BY AVG(score) DESC NULLS LAST, unit_code`,
  // $4 how many
  top: `${SCORED}
    SELECT militia_id AS "militiaId", user_id AS "userId", full_name AS "fullName",
           militia_code AS "militiaCode", unit_code AS "unitCode", score::float8 AS score
    FROM scored
    WHERE score IS NOT NULL
    ORDER BY score DESC, full_name, militia_id
    LIMIT $4`,
  bottom: `${SCORED}
    SELECT militia_id AS "militiaId", user_id AS "userId", full_name AS "fullName",
           militia_code AS "militiaCode", unit_code AS "unitCode", score::float8 AS score
    FROM scored
    WHERE score IS NOT NULL
    ORDER BY score ASC, full_name, militia_id
    LIMIT $4`,
  recommendations: `WITH ${SCOPE}
    SELECT ke.recommendation, COUNT(*)::int AS count
    FROM scope s
    JOIN kpi_evaluations ke
      ON ke.target_user_id = s.user_id AND ke.year = $2 AND ke.month = $3
    GROUP BY ke.recommendation`,
  // $2 first month, $3 last month (first days); today's members over every month
  trend: `WITH ${SCOPE}
    SELECT EXTRACT(YEAR FROM m.month)::int AS year,
           EXTRACT(MONTH FROM m.month)::int AS month,
           ROUND(AVG(ms.score), 1)::float8 AS "averageScore",
           COUNT(ms.score)::int AS "evaluatedCount"
    FROM generate_series($2::date::timestamp, $3::date::timestamp, interval '1 month') AS m(month)
    LEFT JOIN LATERAL (
      SELECT AVG(ke.weighted_score) * 10 AS score
      FROM scope s
      JOIN kpi_evaluations ke ON ke.target_user_id = s.user_id
      WHERE ke.year = EXTRACT(YEAR FROM m.month) AND ke.month = EXTRACT(MONTH FROM m.month)
      GROUP BY s.militia_id
    ) ms ON true
    GROUP BY m.month
    ORDER BY m.month`,
  // $2-$3 the month, $4-$5 the evaluation period, $6-$7 the year, $8-$11 the targets
  metrics: `WITH ${SCOPE},
  per_member AS (
    SELECT s.militia_id,
      (SELECT COUNT(*) FROM attendance_records ar
       WHERE ar.militia_id = s.militia_id
         AND ar.work_date BETWEEN $2::date AND $3::date
         AND ar.status IN ('checked_in', 'checked_out', 'late', 'early_leave')) AS attendance_days,
      (SELECT COUNT(DISTINCT t.id) FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id
       WHERE ta.assignee_id = s.user_id AND t.status = 'completed'
         AND COALESCE(t.completed_at, t.updated_at) >= ${businessDayStartSql('$4')}
         AND COALESCE(t.completed_at, t.updated_at) < ${businessDayEndSql('$5')}) AS tasks_completed,
      (SELECT COUNT(DISTINCT t.id) FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id
       WHERE ta.assignee_id = s.user_id AND t.status NOT IN ('completed', 'cancelled')
         AND t.deadline >= ${businessDayStartSql('$4')}
         AND t.deadline < LEAST(now(), ${businessDayEndSql('$5')})) AS overdue_tasks,
      (SELECT COALESCE(SUM(tr.total_days), 0) * ${TRAINING_HOURS_PER_DAY} FROM training_records tr
       WHERE tr.militia_id = s.militia_id
         AND tr.from_date BETWEEN $6::date AND $7::date) AS training_hours
    FROM scope s
  )
    SELECT COUNT(*)::int AS "memberCount",
           ROUND(AVG(attendance_days), 1)::float8 AS "attendanceDays",
           COUNT(*) FILTER (WHERE attendance_days >= $8)::int AS "attendanceMeeting",
           ROUND(AVG(tasks_completed), 1)::float8 AS "tasksCompleted",
           COUNT(*) FILTER (WHERE tasks_completed >= $9)::int AS "tasksMeeting",
           ROUND(AVG(overdue_tasks), 1)::float8 AS "overdueTasks",
           COUNT(*) FILTER (WHERE overdue_tasks <= $10)::int AS "overdueMeeting",
           ROUND(AVG(training_hours), 1)::float8 AS "trainingHours",
           COUNT(*) FILTER (WHERE training_hours >= $11)::int AS "trainingMeeting"
    FROM per_member`,
} as const;

type Summary = {
  memberCount: number;
  evaluatedCount: number;
  averageScore: number | null;
} & Record<string, number | null>;

interface RankedMember {
  militiaId: string;
  userId: string | null;
  fullName: string;
  militiaCode: string;
  unitCode: string;
  score: number;
}

type Metrics = Record<string, number | null>;

@Injectable()
export class KpiDashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly kpiTargets: KpiTargetsService,
  ) {}

  async getDashboard(actor: KpiDashboardActor, query: KpiDashboardQuery) {
    const resolved = resolveKpiPeriod(query, businessDate().isoDate);
    const unit = effectiveUnit(actor, query.unitCode);

    let year: number;
    let month: number;
    let periodId: string | null = null;
    if ('periodId' in resolved) {
      const [period] = await this.dataSource.query<
        { year: number; month: number }[]
      >(`SELECT year, month FROM payroll_periods WHERE id = $1`, [
        resolved.periodId,
      ]);
      if (!period) throw new NotFoundException('period_not_found');
      ({ year, month } = period);
      periodId = resolved.periodId;
    } else {
      ({ year, month } = resolved);
    }

    const top = clamp(query.top ?? 5, 1, 20);
    const trendMonths = clamp(query.trendMonths ?? 6, 1, 24);
    const bounds = monthRange(year, month);
    const targets = await this.kpiTargets.getEffective(bounds.to);
    const window = evaluationWindow(year, month, targets.evaluationPeriod);
    const yearRange = { from: `${year}-01-01`, to: `${year}-12-31` };
    const trend = trendRange(year, month, trendMonths);

    const month3 = [unit, year, month];
    const [summary] = await this.dataSource.query<Summary[]>(
      SQL.summary,
      month3,
    );
    const byUnit = await this.dataSource.query<Record<string, unknown>[]>(
      SQL.byUnit,
      month3,
    );
    const best = await this.dataSource.query<RankedMember[]>(SQL.top, [
      ...month3,
      top,
    ]);
    const weakest = await this.dataSource.query<RankedMember[]>(SQL.bottom, [
      ...month3,
      top,
    ]);
    const recommendationRows = await this.dataSource.query<
      { recommendation: string; count: number }[]
    >(SQL.recommendations, month3);
    const trendRows = await this.dataSource.query<
      {
        year: number;
        month: number;
        averageScore: number | null;
        evaluatedCount: number;
      }[]
    >(SQL.trend, [unit, trend.from, trend.to]);
    const [metrics] = await this.dataSource.query<Metrics[]>(SQL.metrics, [
      unit,
      bounds.from,
      bounds.to,
      window.from,
      window.to,
      yearRange.from,
      yearRange.to,
      targets.minAttendanceDays,
      targets.minTasksCompleted,
      targets.maxOverdueTasks,
      targets.minTrainingHours,
    ]);

    const memberCount = Number(summary?.memberCount ?? 0);
    const evaluatedCount = Number(summary?.evaluatedCount ?? 0);
    const graded = (rows: RankedMember[]) =>
      rows.map((row) => {
        const band = gradeOf(row.score);
        return { ...row, grade: band.grade, gradeLabel: band.label };
      });

    return {
      period: {
        year,
        month,
        label: `${pad2(month)}/${year}`,
        from: bounds.from,
        to: bounds.to,
        periodId,
      },
      unitCode: unit,
      generatedAt: new Date(),
      memberCount,
      evaluatedCount,
      notEvaluatedCount: memberCount - evaluatedCount,
      coverageRate: memberCount
        ? round1((evaluatedCount * 100) / memberCount)
        : 0,
      averageScore: summary?.averageScore ?? null,
      distribution: KPI_GRADES.map((band) => {
        const count = Number(summary?.[camel(band.grade)] ?? 0);
        return {
          grade: band.grade,
          label: band.label,
          minScore: band.minScore,
          count,
          pct: evaluatedCount ? round1((count * 100) / evaluatedCount) : 0,
        };
      }),
      recommendations: KPI_RECOMMENDATIONS.map((r) => ({
        ...r,
        count:
          recommendationRows.find(
            (row) => row.recommendation === r.recommendation,
          )?.count ?? 0,
      })),
      byUnit,
      top: graded(best),
      bottom: graded(weakest),
      trend: trendRows.map((row) => ({
        ...row,
        label: `${row.year}-${pad2(row.month)}`,
      })),
      targets,
      metrics: this.metrics(metrics ?? {}, targets, bounds, window, yearRange),
    };
  }

  private metrics(
    row: Metrics,
    targets: KpiTargetsView,
    month: { from: string; to: string },
    evaluation: { from: string; to: string },
    year: { from: string; to: string },
  ) {
    const memberCount = Number(row.memberCount ?? 0);
    const metric = (
      key: string,
      name: string,
      unit: string,
      comparison: 'min' | 'max',
      window: { from: string; to: string },
      target: number,
      meeting: string,
    ) => {
      const current = row[key] ?? null;
      return {
        key,
        name,
        unit,
        comparison,
        window,
        current,
        target,
        met:
          current !== null &&
          (comparison === 'min' ? current >= target : current <= target),
        membersMeeting: Number(row[meeting] ?? 0),
        memberCount,
      };
    };
    return [
      metric(
        'attendanceDays',
        'Ngày chấm công',
        'ngày',
        'min',
        month,
        targets.minAttendanceDays,
        'attendanceMeeting',
      ),
      metric(
        'tasksCompleted',
        'Nhiệm vụ hoàn thành',
        'nhiệm vụ',
        'min',
        evaluation,
        targets.minTasksCompleted,
        'tasksMeeting',
      ),
      metric(
        'overdueTasks',
        'Nhiệm vụ quá hạn',
        'nhiệm vụ',
        'max',
        evaluation,
        targets.maxOverdueTasks,
        'overdueMeeting',
      ),
      metric(
        'trainingHours',
        'Giờ huấn luyện',
        'giờ',
        'min',
        year,
        targets.minTrainingHours,
        'trainingMeeting',
      ),
    ];
  }
}
