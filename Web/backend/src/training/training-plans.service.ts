import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  assertUnitInScope,
  effectiveUnit,
  holdsAnyRole,
  type ScopedActor,
} from '../common/access/unit-scope';
import { sqlLabelCase } from '../common/sql/sql-label';
import { BUSINESS_TODAY_SQL, businessDate } from '../common/time/business-date';
import { queryRows } from '../database/query-rows';
import type { TrainingType } from './dto/training-plan.dto';
import {
  TRAINING_PLAN_TRANSITIONS,
  TRAINING_TYPE_LABELS,
  type TrainingPlanStatus,
  type TrainingPlanTarget,
  type TrainingSessionStatus,
} from './training-plan-codes';
import { TRAINING_MANAGER_ROLE_SET } from './training.roles';

export interface TrainingActor extends ScopedActor {
  sub: string;
}

export interface TrainingPlanFilters {
  year?: number;
  status?: TrainingPlanStatus;
  unitCode?: string;
}

export interface CreateTrainingPlanInput {
  year: number;
  type: TrainingType;
  requiredDays: number;
  title?: string;
  unitCode?: string;
}

export interface TrainingPlanRecord {
  id: string;
  year: number;
  type: TrainingType;
  typeLabel: string;
  title: string | null;
  requiredDays: number;
  // Days of the plan's sessions that ended before today in Vietnam
  completedDays: number;
  scheduledDays: number;
  sessionCount: number;
  status: TrainingPlanStatus;
  // NULL: a ward-wide plan
  unitCode: string | null;
  unitName: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
  completedAt: Date | null;
}

export interface TrainingSessionFilters {
  planId?: string;
  year?: number;
  unitCode?: string;
}

export interface CreateTrainingSessionInput {
  planId: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  daysCount: number;
}

export interface TrainingSessionRecord {
  id: string;
  planId: string;
  name: string;
  type: TrainingType;
  typeLabel: string;
  startDate: string;
  endDate: string;
  location: string;
  daysCount: number;
  status: TrainingSessionStatus;
  planYear: number;
  planStatus: TrainingPlanStatus;
  unitCode: string | null;
  unitName: string | null;
  // Attendance rows of members in the caller's scope
  recordedCount: number;
  attendedCount: number;
  // Present only once attendance has been recorded
  attendancePercent?: number;
  createdBy: string;
  createdAt: Date;
}

export interface SessionMember {
  id: string;
  name: string;
  militiaCode: string;
  unitCode: string;
  // null until attendance is recorded for the member
  attended: boolean | null;
}

export interface AttendanceEntry {
  memberId: string;
  attended: boolean;
}

// Plans of the actor's unit (parameter n) and ward-wide plans; every plan when it is NULL
const visiblePlan = (n: number) =>
  `($${n}::text IS NULL OR pu.code = $${n} OR p.unit_id IS NULL)`;

const PLAN_SELECT = `SELECT p.id,
         p.year,
         p.training_type AS type,
         ${sqlLabelCase('p.training_type', TRAINING_TYPE_LABELS)} AS "typeLabel",
         p.title,
         p.required_days::float8 AS "requiredDays",
         COALESCE(s.completed_days, 0)::float8 AS "completedDays",
         COALESCE(s.scheduled_days, 0)::float8 AS "scheduledDays",
         s.session_count AS "sessionCount",
         p.status,
         pu.code AS "unitCode",
         pu.name AS "unitName",
         p.created_by AS "createdBy",
         p.created_at AS "createdAt",
         p.updated_at AS "updatedAt",
         p.activated_at AS "activatedAt",
         p.completed_at AS "completedAt"
       FROM training_plans p
       LEFT JOIN units pu ON pu.id = p.unit_id
       CROSS JOIN LATERAL (
         SELECT count(*)::int AS session_count,
                sum(ts.days_count) AS scheduled_days,
                sum(ts.days_count) FILTER (WHERE ts.end_date < ${BUSINESS_TODAY_SQL}) AS completed_days
         FROM training_sessions ts
         WHERE ts.plan_id = p.id
       ) s`;

// $1: the caller's unit, which also limits the attendance counts to members in scope.
// A session's status follows from its dates and the Vietnamese calendar day.
const SESSION_SELECT = `SELECT ts.id,
         ts.plan_id AS "planId",
         ts.name,
         p.training_type AS type,
         ${sqlLabelCase('p.training_type', TRAINING_TYPE_LABELS)} AS "typeLabel",
         to_char(ts.start_date, 'YYYY-MM-DD') AS "startDate",
         to_char(ts.end_date, 'YYYY-MM-DD') AS "endDate",
         ts.location,
         ts.days_count::float8 AS "daysCount",
         CASE WHEN ts.start_date > ${BUSINESS_TODAY_SQL} THEN 'upcoming'
              WHEN ts.end_date < ${BUSINESS_TODAY_SQL} THEN 'completed'
              ELSE 'ongoing' END AS status,
         p.year AS "planYear",
         p.status AS "planStatus",
         pu.code AS "unitCode",
         pu.name AS "unitName",
         att.recorded AS "recordedCount",
         att.attended AS "attendedCount",
         ts.created_by AS "createdBy",
         ts.created_at AS "createdAt"
       FROM training_sessions ts
       JOIN training_plans p ON p.id = ts.plan_id
       LEFT JOIN units pu ON pu.id = p.unit_id
       CROSS JOIN LATERAL (
         SELECT count(*)::int AS recorded,
                (count(*) FILTER (WHERE a.attended))::int AS attended
         FROM training_session_attendance a
         JOIN militia_profiles amp ON amp.id = a.militia_id
         JOIN units au ON au.id = amp.unit_id
         WHERE a.session_id = ts.id AND ($1::text IS NULL OR au.code = $1)
       ) att`;

// Calendar days from start to end inclusive, for YYYY-MM-DD dates
function spanDays(startDate: string, endDate: string): number {
  const utc = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return (utc(endDate) - utc(startDate)) / 86_400_000 + 1;
}

function withAttendancePercent(
  row: TrainingSessionRecord,
): TrainingSessionRecord {
  const session: TrainingSessionRecord = { ...row };
  if (row.recordedCount > 0) {
    session.attendancePercent = Math.round(
      (row.attendedCount * 100) / row.recordedCount,
    );
  } else {
    // Omitted, not null: the web app shows a rate only when the property is present
    delete session.attendancePercent;
  }
  return session;
}

@Injectable()
export class TrainingPlansService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  // The unit a training manager acts in: null for the whole ward
  private unitOf(actor: TrainingActor, requested?: string): string | null {
    if (!holdsAnyRole(actor, TRAINING_MANAGER_ROLE_SET)) {
      throw new ForbiddenException('insufficient_role');
    }
    return effectiveUnit(actor, requested);
  }

  private async planById(
    runner: DataSource | EntityManager,
    unit: string | null,
    id: string,
  ): Promise<TrainingPlanRecord | undefined> {
    const rows = await runner.query<TrainingPlanRecord[]>(
      `${PLAN_SELECT}
       WHERE p.id = $2 AND ${visiblePlan(1)}`,
      [unit, id],
    );
    return rows[0];
  }

  private async sessionById(
    runner: DataSource | EntityManager,
    unit: string | null,
    id: string,
  ): Promise<TrainingSessionRecord | undefined> {
    const rows = await runner.query<TrainingSessionRecord[]>(
      `${SESSION_SELECT}
       WHERE ts.id = $2 AND ${visiblePlan(1)}`,
      [unit, id],
    );
    return rows[0] && withAttendancePercent(rows[0]);
  }

  // ── Plans ───────────────────────────────────────────────────────────────────

  async listPlans(
    actor: TrainingActor,
    filters: TrainingPlanFilters,
  ): Promise<TrainingPlanRecord[]> {
    const unit = this.unitOf(actor, filters.unitCode);
    return this.ds.query<TrainingPlanRecord[]>(
      `${PLAN_SELECT}
       WHERE ${visiblePlan(1)}
         AND ($2::int IS NULL OR p.year = $2)
         AND ($3::text IS NULL OR p.status = $3)
       ORDER BY p.year DESC, p.training_type, pu.code NULLS FIRST`,
      [unit, filters.year ?? null, filters.status ?? null],
    );
  }

  // A plan outside the caller's scope answers exactly like a missing one
  async getPlan(actor: TrainingActor, id: string): Promise<TrainingPlanRecord> {
    const plan = await this.planById(this.ds, this.unitOf(actor), id);
    if (!plan) throw new NotFoundException('training_plan_not_found');
    return plan;
  }

  // A new plan is a draft. Without a unit code it belongs to the caller's unit, or to the
  // whole ward for ward-level roles; naming another unit needs a ward-level role.
  async createPlan(
    actor: TrainingActor,
    input: CreateTrainingPlanInput,
  ): Promise<TrainingPlanRecord> {
    if (!holdsAnyRole(actor, TRAINING_MANAGER_ROLE_SET)) {
      throw new ForbiddenException('insufficient_role');
    }
    let unitCode: string | null;
    if (input.unitCode) {
      assertUnitInScope(actor, input.unitCode);
      unitCode = input.unitCode;
    } else {
      unitCode = effectiveUnit(actor);
    }

    let unitId: string | null = null;
    if (unitCode) {
      const units = await this.ds.query<{ id: string }[]>(
        `SELECT id FROM units WHERE code = $1`,
        [unitCode],
      );
      if (!units.length) throw new BadRequestException('unit_not_found');
      unitId = units[0].id;
    }

    // The unique constraint decides, so two concurrent requests cannot both create the
    // plan and the loser gets 409, not a database error
    const inserted = await this.ds.query<{ id: string }[]>(
      `INSERT INTO training_plans (unit_id, year, training_type, title, required_days, created_by)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid)
       ON CONFLICT ON CONSTRAINT uq_training_plans_unit_year_type DO NOTHING
       RETURNING id`,
      [
        unitId,
        input.year,
        input.type,
        input.title?.trim() || null,
        input.requiredDays,
        actor.sub,
      ],
    );
    if (!inserted.length) {
      throw new ConflictException('training_plan_exists');
    }
    return (await this.planById(this.ds, null, inserted[0].id))!;
  }

  // draft -> active -> completed, in one guarded UPDATE so concurrent transitions cannot
  // both apply. Officers manage the plans of their unit; ward-wide plans need a ward role.
  async updatePlanStatus(
    actor: TrainingActor,
    id: string,
    target: TrainingPlanTarget,
  ): Promise<TrainingPlanRecord> {
    const unit = this.unitOf(actor);
    const updated = await queryRows<{ id: string }>(
      this.ds,
      `UPDATE training_plans p
       SET status = $2::text,
           updated_at = now(),
           activated_at = CASE WHEN $2::text = 'active' THEN now() ELSE p.activated_at END,
           completed_at = CASE WHEN $2::text = 'completed' THEN now() ELSE p.completed_at END
       WHERE p.id = $1 AND p.status = $3
         AND ($4::text IS NULL OR EXISTS (
               SELECT 1 FROM units wu WHERE wu.id = p.unit_id AND wu.code = $4))
       RETURNING p.id`,
      [id, target, TRAINING_PLAN_TRANSITIONS[target], unit],
    );

    if (!updated.length) {
      const rows = await this.ds.query<
        { status: TrainingPlanStatus; unitCode: string | null }[]
      >(
        `SELECT p.status, pu.code AS "unitCode"
         FROM training_plans p
         LEFT JOIN units pu ON pu.id = p.unit_id
         WHERE p.id = $1 AND ${visiblePlan(2)}`,
        [id, unit],
      );
      if (!rows.length) throw new NotFoundException('training_plan_not_found');
      if (unit !== null && rows[0].unitCode !== unit) {
        throw new ForbiddenException('training_plan_not_managed');
      }
      throw new ConflictException('invalid_status_transition');
    }
    return (await this.planById(this.ds, unit, id))!;
  }

  // ── Sessions ────────────────────────────────────────────────────────────────

  async listSessions(
    actor: TrainingActor,
    filters: TrainingSessionFilters,
  ): Promise<TrainingSessionRecord[]> {
    const unit = this.unitOf(actor, filters.unitCode);
    const rows = await this.ds.query<TrainingSessionRecord[]>(
      `${SESSION_SELECT}
       WHERE ${visiblePlan(1)}
         AND ($2::uuid IS NULL OR ts.plan_id = $2::uuid)
         AND ($3::int IS NULL OR p.year = $3)
       ORDER BY ts.start_date DESC, ts.name`,
      [unit, filters.planId ?? null, filters.year ?? null],
    );
    return rows.map(withAttendancePercent);
  }

  // A session outside the caller's scope answers exactly like a missing one
  async getSession(
    actor: TrainingActor,
    id: string,
  ): Promise<TrainingSessionRecord> {
    const session = await this.sessionById(this.ds, this.unitOf(actor), id);
    if (!session) throw new NotFoundException('training_session_not_found');
    return session;
  }

  // Sessions are scheduled in draft or active plans the caller manages, within the plan
  // year. The plan row is share-locked so it cannot be completed meanwhile.
  async createSession(
    actor: TrainingActor,
    input: CreateTrainingSessionInput,
  ): Promise<TrainingSessionRecord> {
    const unit = this.unitOf(actor);
    // YYYY-MM-DD strings compare in calendar order
    if (input.endDate < input.startDate) {
      throw new BadRequestException('session_end_before_start');
    }
    if (input.daysCount > spanDays(input.startDate, input.endDate)) {
      throw new BadRequestException('session_days_exceed_span');
    }

    return this.ds.transaction(async (mgr) => {
      const plans = await mgr.query<
        {
          id: string;
          year: number;
          status: TrainingPlanStatus;
          unitCode: string | null;
        }[]
      >(
        `SELECT p.id, p.year, p.status, pu.code AS "unitCode"
         FROM training_plans p
         LEFT JOIN units pu ON pu.id = p.unit_id
         WHERE p.id = $1 AND ${visiblePlan(2)}
         FOR SHARE OF p`,
        [input.planId, unit],
      );
      const plan = plans[0];
      if (!plan) throw new NotFoundException('training_plan_not_found');
      if (unit !== null && plan.unitCode !== unit) {
        throw new ForbiddenException('training_plan_not_managed');
      }
      if (plan.status === 'completed') {
        throw new ConflictException('training_plan_completed');
      }
      const year = Number(plan.year);
      if (
        Number(input.startDate.slice(0, 4)) !== year ||
        Number(input.endDate.slice(0, 4)) !== year
      ) {
        throw new BadRequestException('session_outside_plan_year');
      }

      const inserted = await mgr.query<{ id: string }[]>(
        `INSERT INTO training_sessions
           (plan_id, name, start_date, end_date, location, days_count, created_by)
         VALUES ($1::uuid, $2, $3::date, $4::date, $5, $6, $7::uuid)
         RETURNING id`,
        [
          input.planId,
          input.name.trim(),
          input.startDate,
          input.endDate,
          input.location.trim(),
          input.daysCount,
          actor.sub,
        ],
      );
      return (await this.sessionById(mgr, unit, inserted[0].id))!;
    });
  }

  // The roster for attendance: active members of the plan's unit (every unit for a
  // ward-wide plan) in the caller's scope, and everyone whose attendance is already
  // recorded, even if they have since left the unit or become inactive
  async sessionMembers(
    actor: TrainingActor,
    id: string,
  ): Promise<SessionMember[]> {
    const unit = this.unitOf(actor);
    const sessions = await this.ds.query<
      { id: string; planUnitId: string | null }[]
    >(
      `SELECT ts.id, p.unit_id AS "planUnitId"
       FROM training_sessions ts
       JOIN training_plans p ON p.id = ts.plan_id
       LEFT JOIN units pu ON pu.id = p.unit_id
       WHERE ts.id = $1 AND ${visiblePlan(2)}`,
      [id, unit],
    );
    if (!sessions.length) {
      throw new NotFoundException('training_session_not_found');
    }

    return this.ds.query<SessionMember[]>(
      `SELECT mp.id, mp.full_name AS name, mp.militia_code AS "militiaCode",
              u.code AS "unitCode", a.attended
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       LEFT JOIN training_session_attendance a
         ON a.session_id = $1 AND a.militia_id = mp.id
       WHERE ($2::text IS NULL OR u.code = $2)
         AND (a.militia_id IS NOT NULL OR (mp.status = 'active' AND ($3::uuid IS NULL OR mp.unit_id = $3)))
       ORDER BY mp.full_name, mp.militia_code`,
      [id, unit, sessions[0].planUnitId],
    );
  }

  // Điểm danh: saves each member's attendance and keeps the training record every report
  // and the payroll training allowance count in step with it — created for those who
  // attended, removed for those who did not. Re-submitting replaces earlier answers.
  async recordAttendance(
    actor: TrainingActor,
    id: string,
    entries: AttendanceEntry[],
  ): Promise<TrainingSessionRecord> {
    const unit = this.unitOf(actor);
    const today = businessDate().isoDate;
    const memberIds = entries.map((e) => e.memberId);

    return this.ds.transaction(async (mgr) => {
      // Locking the session serializes concurrent submissions for it; share-locking the
      // plan keeps it active until the transaction ends
      const sessions = await mgr.query<
        {
          id: string;
          startDate: string;
          planStatus: TrainingPlanStatus;
          planUnitId: string | null;
        }[]
      >(
        `SELECT ts.id, to_char(ts.start_date, 'YYYY-MM-DD') AS "startDate",
                p.status AS "planStatus", p.unit_id AS "planUnitId"
         FROM training_sessions ts
         JOIN training_plans p ON p.id = ts.plan_id
         LEFT JOIN units pu ON pu.id = p.unit_id
         WHERE ts.id = $1 AND ${visiblePlan(2)}
         FOR UPDATE OF ts FOR SHARE OF p`,
        [id, unit],
      );
      const session = sessions[0];
      if (!session) throw new NotFoundException('training_session_not_found');
      if (session.planStatus !== 'active') {
        throw new ConflictException('training_plan_not_active');
      }
      if (session.startDate > today) {
        throw new ConflictException('training_session_not_started');
      }

      // Every member must be on the roster and in scope; share-locking them keeps them
      // there until the transaction ends. Anyone else answers like a missing member.
      const eligible = await mgr.query<{ id: string }[]>(
        `SELECT mp.id
         FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         LEFT JOIN training_session_attendance a
           ON a.session_id = $1 AND a.militia_id = mp.id
         WHERE mp.id = ANY($2::uuid[])
           AND ($3::text IS NULL OR u.code = $3)
           AND (a.militia_id IS NOT NULL OR (mp.status = 'active' AND ($4::uuid IS NULL OR mp.unit_id = $4)))
         FOR SHARE OF mp`,
        [id, memberIds, unit, session.planUnitId],
      );
      if (eligible.length !== memberIds.length) {
        throw new NotFoundException('militia_not_found');
      }

      await mgr.query(
        `INSERT INTO training_session_attendance (session_id, militia_id, attended, recorded_by)
         SELECT $1::uuid, e.militia_id, e.attended, $4::uuid
         FROM unnest($2::uuid[], $3::boolean[]) AS e(militia_id, attended)
         ON CONFLICT (session_id, militia_id) DO UPDATE
         SET attended = EXCLUDED.attended,
             recorded_by = EXCLUDED.recorded_by,
             recorded_at = now()`,
        [id, memberIds, entries.map((e) => e.attended), actor.sub],
      );

      const attendedIds = entries
        .filter((e) => e.attended)
        .map((e) => e.memberId);
      const absentIds = entries
        .filter((e) => !e.attended)
        .map((e) => e.memberId);

      await mgr.query(
        `INSERT INTO training_records
           (militia_id, training_type, from_date, to_date, total_days, location,
            result, notes, created_by, session_id)
         SELECT e.militia_id, p.training_type, ts.start_date, ts.end_date, ts.days_count,
                ts.location, 'not_evaluated', ts.name, $3::uuid, ts.id
         FROM unnest($2::uuid[]) AS e(militia_id)
         JOIN training_sessions ts ON ts.id = $1::uuid
         JOIN training_plans p ON p.id = ts.plan_id
         ON CONFLICT (session_id, militia_id) WHERE session_id IS NOT NULL DO NOTHING`,
        [id, attendedIds, actor.sub],
      );
      await mgr.query(
        `DELETE FROM training_records
         WHERE session_id = $1 AND militia_id = ANY($2::uuid[])`,
        [id, absentIds],
      );

      return (await this.sessionById(mgr, unit, id))!;
    });
  }
}
