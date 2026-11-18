// KPI targets (chỉ tiêu KPI): the thresholds militia members are assessed against.
// Versions are append-only (migration 029): a change adds a row effective from the
// Vietnamese business day it was made, so a past period is compared with the targets in
// force at its end, and the table is the history of who set what.
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { writeAuditLog, type AuditOrigin } from '../common/audit/audit-log';
import { businessDate } from '../common/time/business-date';

export const EVALUATION_PERIODS = ['monthly', 'quarterly', 'yearly'] as const;
export type EvaluationPeriod = (typeof EVALUATION_PERIODS)[number];

export interface KpiTargets {
  /** Days with attendance a member needs in a month */
  minAttendanceDays: number;
  /** Tasks a member completes in an evaluation period */
  minTasksCompleted: number;
  /** Tasks a member may let run past their deadline in an evaluation period */
  maxOverdueTasks: number;
  /** Training hours a member needs in a year */
  minTrainingHours: number;
  evaluationPeriod: EvaluationPeriod;
}

type NumericTarget = Exclude<keyof KpiTargets, 'evaluationPeriod'>;

// The same ranges as the settings page, KpiTargetsDto and the CHECK constraints of
// migration 029
export const KPI_TARGET_RANGES: Readonly<
  Record<NumericTarget, { min: number; max: number }>
> = {
  minAttendanceDays: { min: 1, max: 31 },
  minTasksCompleted: { min: 0, max: 100 },
  maxOverdueTasks: { min: 0, max: 20 },
  minTrainingHours: { min: 0, max: 500 },
};

// What applies until a system_admin sets targets; the settings page shows the same values
export const DEFAULT_KPI_TARGETS: Readonly<KpiTargets> = {
  minAttendanceDays: 22,
  minTasksCompleted: 10,
  maxOverdueTasks: 2,
  minTrainingHours: 40,
  evaluationPeriod: 'monthly',
};

export interface KpiTargetsView extends KpiTargets {
  /** First business day the version applies; null for the defaults */
  effectiveFrom: string | null;
  updatedAt: Date | null;
  updatedBy: { id: string; fullName: string | null } | null;
  isDefault: boolean;
}

interface VersionRow extends KpiTargets {
  id: string;
  effectiveFrom: string;
  updatedAt: Date;
  updatedById: string;
  updatedByName: string | null;
}

type Queryable = Pick<DataSource | EntityManager, 'query'>;

/** Refuses targets outside the declared ranges, whoever the caller is. */
export function assertValidKpiTargets(targets: KpiTargets): void {
  const numbersValid = (
    Object.keys(KPI_TARGET_RANGES) as NumericTarget[]
  ).every((key) => {
    const value = targets[key];
    const { min, max } = KPI_TARGET_RANGES[key];
    return Number.isInteger(value) && value >= min && value <= max;
  });
  if (
    !numbersValid ||
    !(EVALUATION_PERIODS as readonly string[]).includes(
      targets.evaluationPeriod,
    )
  ) {
    throw new BadRequestException('invalid_kpi_targets');
  }
}

const auditable = (view: KpiTargetsView) => ({
  minAttendanceDays: view.minAttendanceDays,
  minTasksCompleted: view.minTasksCompleted,
  maxOverdueTasks: view.maxOverdueTasks,
  minTrainingHours: view.minTrainingHours,
  evaluationPeriod: view.evaluationPeriod,
  effectiveFrom: view.effectiveFrom,
  isDefault: view.isDefault,
});

@Injectable()
export class KpiTargetsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** The targets in force on a business day (today in Vietnam by default). */
  getEffective(asOf: string = businessDate().isoDate): Promise<KpiTargetsView> {
    return this.readEffective(this.dataSource, asOf);
  }

  /** Appends a version effective today and audits it in the same transaction. */
  async update(
    actor: { sub: string },
    targets: KpiTargets,
    origin?: AuditOrigin,
  ): Promise<KpiTargetsView> {
    assertValidKpiTargets(targets);
    const today = businessDate().isoDate;

    return this.dataSource.transaction(async (manager) => {
      // Writers take turns, so the audited "before" is exactly what each one replaced;
      // readers are not blocked
      await manager.query(
        `LOCK TABLE kpi_target_settings IN SHARE ROW EXCLUSIVE MODE`,
      );
      const before = await this.readEffective(manager, today);
      const [inserted] = await manager.query<{ id: string }[]>(
        `INSERT INTO kpi_target_settings
           (effective_from, min_attendance_days, min_tasks_completed, max_overdue_tasks,
            min_training_hours, evaluation_period, created_by, created_at)
         VALUES ($1::date, $2, $3, $4, $5, $6, $7::uuid, clock_timestamp())
         RETURNING id`,
        [
          today,
          targets.minAttendanceDays,
          targets.minTasksCompleted,
          targets.maxOverdueTasks,
          targets.minTrainingHours,
          targets.evaluationPeriod,
          actor.sub,
        ],
      );
      const after = await this.readEffective(manager, today);
      await writeAuditLog(
        manager,
        {
          actorId: actor.sub,
          action: 'kpi_targets.updated',
          entityType: 'kpi_target_settings',
          entityId: inserted.id,
          details: { before: auditable(before), after: auditable(after) },
        },
        origin,
      );
      return after;
    });
  }

  private async readEffective(
    runner: Queryable,
    asOf: string,
  ): Promise<KpiTargetsView> {
    const [row] = await runner.query<VersionRow[]>(
      `SELECT k.id,
              k.min_attendance_days AS "minAttendanceDays",
              k.min_tasks_completed AS "minTasksCompleted",
              k.max_overdue_tasks   AS "maxOverdueTasks",
              k.min_training_hours  AS "minTrainingHours",
              k.evaluation_period   AS "evaluationPeriod",
              k.effective_from      AS "effectiveFrom",
              k.created_at          AS "updatedAt",
              k.created_by          AS "updatedById",
              u.full_name           AS "updatedByName"
       FROM kpi_target_settings k
       LEFT JOIN users u ON u.id = k.created_by
       WHERE k.effective_from <= $1::date
       ORDER BY k.effective_from DESC, k.created_at DESC, k.id DESC
       LIMIT 1`,
      [asOf],
    );
    if (!row) {
      return {
        ...DEFAULT_KPI_TARGETS,
        effectiveFrom: null,
        updatedAt: null,
        updatedBy: null,
        isDefault: true,
      };
    }
    return {
      minAttendanceDays: row.minAttendanceDays,
      minTasksCompleted: row.minTasksCompleted,
      maxOverdueTasks: row.maxOverdueTasks,
      minTrainingHours: row.minTrainingHours,
      evaluationPeriod: row.evaluationPeriod,
      effectiveFrom: row.effectiveFrom,
      updatedAt: row.updatedAt,
      updatedBy: { id: row.updatedById, fullName: row.updatedByName },
      isDefault: false,
    };
  }
}
