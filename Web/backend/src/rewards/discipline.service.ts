import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import {
  memberReachSql,
  resolveMemberReach,
  type MemberReach,
  type MemberScopeActor,
} from '../common/access/member-scope';
import { holdsAnyRole } from '../common/access/unit-scope';
import { writeAuditLog, type AuditOrigin } from '../common/audit/audit-log';
import { businessDate } from '../common/time/business-date';
import { queryRows } from '../database/query-rows';
import {
  DISCIPLINE_FORM_LABELS,
  MAX_APPEAL_ROUNDS,
  sqlLabelCase,
  type AppealOutcome,
  type DisciplineForm,
  type DisciplineStatus,
} from './reward-codes';
import { assertDateRange } from '../common/validation/date-range';
import { REWARD_STAFF_ROLE_SET } from './rewards.roles';

export interface DisciplineFilters {
  from?: string;
  to?: string;
  disciplineType?: DisciplineForm;
  status?: DisciplineStatus;
  militiaId?: string;
  unitCode?: string;
}

export interface CreateDisciplineInput {
  militiaId: string;
  disciplineType: DisciplineForm;
  violation: string;
  violationDate?: string;
  decisionDate: string;
  decisionNumber?: string;
  issuedBy?: string;
}

export interface FileAppealInput {
  reason: string;
  filedDate?: string;
}

export interface DecideAppealInput {
  outcome: AppealOutcome;
  resolution: string;
  decidedDate?: string;
}

export interface AppealRecord {
  id: string;
  round: number;
  reason: string;
  filedDate: string;
  filedBy: string;
  filedByName: string;
  outcome: AppealOutcome | null;
  resolution: string | null;
  decidedDate: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface DisciplineRecord {
  id: string;
  militiaId: string;
  militiaName: string;
  militiaCode: string;
  unitCode: string;
  unitName: string;
  disciplineType: DisciplineForm;
  disciplineTypeLabel: string;
  violation: string;
  violationDate: string | null;
  decisionDate: string;
  decisionNumber: string | null;
  issuedBy: string | null;
  status: DisciplineStatus;
  // Filing date of the latest appeal
  appealedAt: string | null;
  appealRounds: number;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisciplineDetail extends DisciplineRecord {
  appeals: AppealRecord[];
}

// Dates are formatted in SQL so they stay the calendar day they are
const RECORD_COLUMNS = `d.id,
         d.militia_id AS "militiaId",
         mp.full_name AS "militiaName",
         mp.militia_code AS "militiaCode",
         u.code AS "unitCode",
         u.name AS "unitName",
         d.discipline_form AS "disciplineType",
         ${sqlLabelCase('d.discipline_form', DISCIPLINE_FORM_LABELS)} AS "disciplineTypeLabel",
         d.violation,
         to_char(d.violation_date, 'YYYY-MM-DD') AS "violationDate",
         to_char(d.decision_date, 'YYYY-MM-DD') AS "decisionDate",
         d.decision_number AS "decisionNumber",
         d.issued_by AS "issuedBy",
         d.status,
         ap.appealed_at AS "appealedAt",
         ap.rounds AS "appealRounds",
         d.created_by AS "createdBy",
         cu.full_name AS "createdByName",
         d.created_at AS "createdAt",
         d.updated_at AS "updatedAt"`;

const APPEALS_COLUMN = `(
         SELECT COALESCE(json_agg(json_build_object(
                  'id', a.id,
                  'round', a.round,
                  'reason', a.reason,
                  'filedDate', to_char(a.filed_date, 'YYYY-MM-DD'),
                  'filedBy', a.filed_by,
                  'filedByName', fu.full_name,
                  'outcome', a.outcome,
                  'resolution', a.resolution,
                  'decidedDate', to_char(a.decided_date, 'YYYY-MM-DD'),
                  'decidedBy', a.decided_by,
                  'decidedByName', du.full_name,
                  'createdAt', a.created_at,
                  'decidedAt', a.decided_at) ORDER BY a.round), '[]'::json)
         FROM discipline_appeals a
         JOIN users fu ON fu.id = a.filed_by
         LEFT JOIN users du ON du.id = a.decided_by
         WHERE a.decision_id = d.id) AS appeals`;

const RECORD_FROM = `FROM discipline_decisions d
       JOIN militia_profiles mp ON mp.id = d.militia_id
       JOIN units u ON u.id = mp.unit_id
       JOIN users cu ON cu.id = d.created_by
       CROSS JOIN LATERAL (
         SELECT to_char(max(a.filed_date), 'YYYY-MM-DD') AS appealed_at,
                count(*)::int AS rounds
         FROM discipline_appeals a
         WHERE a.decision_id = d.id
       ) ap`;

const LIST_SELECT = `SELECT ${RECORD_COLUMNS}
       ${RECORD_FROM}`;
const DETAIL_SELECT = `SELECT ${RECORD_COLUMNS},
       ${APPEALS_COLUMN}
       ${RECORD_FROM}`;

const blankAsNull = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; driverError?: { code?: string } };
  return e?.code === '23505' || e?.driverError?.code === '23505';
};

@Injectable()
export class DisciplineService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly assignments: AssignmentsService,
  ) {}

  private scopeOf(
    actor: MemberScopeActor,
    requestedUnit?: string,
  ): Promise<MemberReach> {
    // Every role held counts: a user holding several reaches the union
    return resolveMemberReach(actor, {
      staffRoles: REWARD_STAFF_ROLE_SET,
      assignments: this.assignments,
      requestedUnit,
    });
  }

  private assertStaff(actor: MemberScopeActor): void {
    if (!holdsAnyRole(actor, REWARD_STAFF_ROLE_SET)) {
      throw new ForbiddenException('insufficient_role');
    }
  }

  private async detail(
    runner: DataSource | EntityManager,
    id: string,
  ): Promise<DisciplineDetail> {
    const rows = await runner.query<DisciplineDetail[]>(
      `${DETAIL_SELECT} WHERE d.id = $1`,
      [id],
    );
    return rows[0];
  }

  async list(
    actor: MemberScopeActor,
    filters: DisciplineFilters,
  ): Promise<DisciplineRecord[]> {
    assertDateRange(filters.from, filters.to);
    const scope = await this.scopeOf(actor, filters.unitCode);
    return this.ds.query<DisciplineRecord[]>(
      `${LIST_SELECT}
       WHERE ${memberReachSql({ everyone: '$8', unit: '$1', userIds: '$2' })}
         AND ($3::date IS NULL OR d.decision_date >= $3::date)
         AND ($4::date IS NULL OR d.decision_date <= $4::date)
         AND ($5::text IS NULL OR d.discipline_form = $5)
         AND ($6::text IS NULL OR d.status = $6)
         AND ($7::uuid IS NULL OR d.militia_id = $7::uuid)
       ORDER BY d.decision_date DESC, d.created_at DESC`,
      [
        scope.unit,
        scope.userIds,
        filters.from ?? null,
        filters.to ?? null,
        filters.disciplineType ?? null,
        filters.status ?? null,
        filters.militiaId ?? null,
        scope.everyone,
      ],
    );
  }

  // A decision outside the caller's scope answers exactly like a missing one
  async findOne(
    actor: MemberScopeActor,
    id: string,
  ): Promise<DisciplineDetail> {
    const scope = await this.scopeOf(actor);
    const rows = await this.ds.query<DisciplineDetail[]>(
      `${DETAIL_SELECT}
       WHERE d.id = $3 AND ${memberReachSql({ everyone: '$4', unit: '$1', userIds: '$2' })}`,
      [scope.unit, scope.userIds, id, scope.everyone],
    );
    if (!rows.length) {
      throw new NotFoundException('discipline_decision_not_found');
    }
    return rows[0];
  }

  async create(
    actor: MemberScopeActor,
    input: CreateDisciplineInput,
    origin?: AuditOrigin,
  ): Promise<DisciplineDetail> {
    this.assertStaff(actor);
    if (input.decisionDate > businessDate().isoDate) {
      throw new BadRequestException('decision_date_in_future');
    }
    // YYYY-MM-DD strings compare in calendar order
    if (input.violationDate && input.violationDate > input.decisionDate) {
      throw new BadRequestException('violation_after_decision');
    }
    const scope = await this.scopeOf(actor);
    const decisionNumber = blankAsNull(input.decisionNumber);

    return this.ds.transaction(async (mgr) => {
      // The scope check is part of the INSERT: a member outside it inserts nothing and
      // answers like a missing one
      const inserted = await mgr.query<{ id: string }[]>(
        `INSERT INTO discipline_decisions
           (militia_id, discipline_form, violation, violation_date, decision_date,
            decision_number, issued_by, created_by)
         SELECT mp.id, $4, $5, $6::date, $7::date, $8, $9, $10::uuid
         FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         WHERE mp.id = $1 AND ${memberReachSql({ everyone: '$11', unit: '$2', userIds: '$3' })}
         RETURNING id`,
        [
          input.militiaId,
          scope.unit,
          scope.userIds,
          input.disciplineType,
          input.violation.trim(),
          input.violationDate ?? null,
          input.decisionDate,
          decisionNumber,
          blankAsNull(input.issuedBy),
          actor.sub,
          scope.everyone,
        ],
      );
      if (!inserted.length) throw new NotFoundException('militia_not_found');
      const id = inserted[0].id;

      await writeAuditLog(
        mgr,
        {
          actorId: actor.sub,
          action: 'discipline.issued',
          entityType: 'discipline_decisions',
          entityId: id,
          details: {
            militiaId: input.militiaId,
            disciplineType: input.disciplineType,
            decisionDate: input.decisionDate,
            decisionNumber,
          },
        },
        origin,
      );
      return this.detail(mgr, id);
    });
  }

  // Khiếu nại: a staff member records it, or the disciplined member files it. The
  // decision stays in force while the appeal is open (Thông tư 75/2020/TT-BQP Điều 6).
  async fileAppeal(
    actor: MemberScopeActor,
    id: string,
    input: FileAppealInput,
    origin?: AuditOrigin,
  ): Promise<DisciplineDetail> {
    const scope = await this.scopeOf(actor);
    const today = businessDate().isoDate;
    const filedDate = input.filedDate ?? today;
    if (filedDate > today) {
      throw new BadRequestException('appeal_date_in_future');
    }

    return this.ds.transaction(async (mgr) => {
      // Locking the decision serializes concurrent filings and decisions on it; locking
      // the member keeps them in the caller's scope until the transaction ends
      const rows = await mgr.query<
        {
          id: string;
          status: DisciplineStatus;
          decisionDate: string;
          rounds: number;
        }[]
      >(
        `SELECT d.id, d.status,
                to_char(d.decision_date, 'YYYY-MM-DD') AS "decisionDate",
                (SELECT count(*)::int FROM discipline_appeals a WHERE a.decision_id = d.id) AS rounds
         FROM discipline_decisions d
         JOIN militia_profiles mp ON mp.id = d.militia_id
         JOIN units u ON u.id = mp.unit_id
         WHERE d.id = $1 AND ${memberReachSql({ everyone: '$4', unit: '$2', userIds: '$3' })}
         FOR UPDATE OF d FOR SHARE OF mp`,
        [id, scope.unit, scope.userIds, scope.everyone],
      );
      const decision = rows[0];
      if (!decision) {
        throw new NotFoundException('discipline_decision_not_found');
      }
      if (decision.status === 'overturned') {
        throw new ConflictException('discipline_decision_overturned');
      }
      if (decision.status === 'appealed') {
        throw new ConflictException('appeal_already_open');
      }
      if (decision.rounds >= MAX_APPEAL_ROUNDS) {
        throw new ConflictException('appeal_rounds_exhausted');
      }
      if (filedDate < decision.decisionDate) {
        throw new BadRequestException('appeal_before_decision');
      }

      const marked = await queryRows<{ id: string }>(
        mgr,
        `UPDATE discipline_decisions SET status = 'appealed', updated_at = now()
         WHERE id = $1 AND status = 'active'
         RETURNING id`,
        [id],
      );
      if (!marked.length) {
        throw new ConflictException('invalid_status_transition');
      }

      const round = decision.rounds + 1;
      let appealId: string;
      try {
        const inserted = await mgr.query<{ id: string }[]>(
          `INSERT INTO discipline_appeals (decision_id, round, reason, filed_date, filed_by)
           VALUES ($1, $2, $3, $4::date, $5::uuid)
           RETURNING id`,
          [id, round, input.reason.trim(), filedDate, actor.sub],
        );
        appealId = inserted[0].id;
      } catch (error) {
        // uq_discipline_appeals_open / uq_discipline_appeals_round
        if (isUniqueViolation(error)) {
          throw new ConflictException('appeal_already_open');
        }
        throw error;
      }

      await writeAuditLog(
        mgr,
        {
          actorId: actor.sub,
          action: 'discipline.appeal_filed',
          entityType: 'discipline_appeals',
          entityId: appealId,
          details: { decisionId: id, round, filedDate },
        },
        origin,
      );
      return this.detail(mgr, id);
    });
  }

  // Deciding the open appeal is final: upheld puts the decision back in force (a second
  // round may follow), overturned annuls it for good
  async decideAppeal(
    actor: MemberScopeActor,
    id: string,
    input: DecideAppealInput,
    origin?: AuditOrigin,
  ): Promise<DisciplineDetail> {
    this.assertStaff(actor);
    const scope = await this.scopeOf(actor);
    const today = businessDate().isoDate;
    const decidedDate = input.decidedDate ?? today;
    if (decidedDate > today) {
      throw new BadRequestException('decided_date_in_future');
    }

    return this.ds.transaction(async (mgr) => {
      const rows = await mgr.query<
        {
          id: string;
          status: DisciplineStatus;
          appealId: string | null;
          round: number | null;
          filedDate: string | null;
        }[]
      >(
        `SELECT d.id, d.status, a.id AS "appealId", a.round,
                to_char(a.filed_date, 'YYYY-MM-DD') AS "filedDate"
         FROM discipline_decisions d
         JOIN militia_profiles mp ON mp.id = d.militia_id
         JOIN units u ON u.id = mp.unit_id
         LEFT JOIN discipline_appeals a ON a.decision_id = d.id AND a.outcome IS NULL
         WHERE d.id = $1 AND ${memberReachSql({ everyone: '$4', unit: '$2', userIds: '$3' })}
         FOR UPDATE OF d FOR SHARE OF mp`,
        [id, scope.unit, scope.userIds, scope.everyone],
      );
      const decision = rows[0];
      if (!decision) {
        throw new NotFoundException('discipline_decision_not_found');
      }
      if (!decision.appealId || !decision.filedDate) {
        throw new ConflictException('no_open_appeal');
      }
      if (decidedDate < decision.filedDate) {
        throw new BadRequestException('decided_before_filed');
      }

      const closed = await queryRows<{ id: string }>(
        mgr,
        `UPDATE discipline_appeals
         SET outcome = $2, resolution = $3, decided_date = $4::date,
             decided_by = $5::uuid, decided_at = now()
         WHERE id = $1 AND outcome IS NULL
         RETURNING id`,
        [
          decision.appealId,
          input.outcome,
          input.resolution.trim(),
          decidedDate,
          actor.sub,
        ],
      );
      const status: DisciplineStatus =
        input.outcome === 'upheld' ? 'active' : 'overturned';
      const moved = closed.length
        ? await queryRows<{ id: string }>(
            mgr,
            `UPDATE discipline_decisions SET status = $2, updated_at = now()
             WHERE id = $1 AND status = 'appealed'
             RETURNING id`,
            [id, status],
          )
        : [];
      if (!moved.length) {
        throw new ConflictException('invalid_status_transition');
      }

      await writeAuditLog(
        mgr,
        {
          actorId: actor.sub,
          action: 'discipline.appeal_decided',
          entityType: 'discipline_appeals',
          entityId: decision.appealId,
          details: {
            decisionId: id,
            round: decision.round,
            outcome: input.outcome,
            decidedDate,
          },
        },
        origin,
      );
      return this.detail(mgr, id);
    });
  }
}
