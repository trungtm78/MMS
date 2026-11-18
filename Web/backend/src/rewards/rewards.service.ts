import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
import { assertDateRange } from '../common/validation/date-range';
import {
  REWARD_AUTHORITY_LABELS,
  REWARD_FORM_LABELS,
  authorityAllowedFor,
  sqlLabelCase,
  type RewardAuthority,
  type RewardBasis,
  type RewardForm,
} from './reward-codes';
import { REWARD_STAFF_ROLE_SET } from './rewards.roles';

export interface RewardFilters {
  from?: string;
  to?: string;
  rewardType?: RewardForm;
  militiaId?: string;
  unitCode?: string;
}

export interface CreateRewardInput {
  militiaId: string;
  rewardType: RewardForm;
  issuingAuthority: RewardAuthority;
  basis?: RewardBasis;
  criteria?: string;
  decisionNumber?: string;
  issuedDate: string;
}

export interface RewardRecord {
  id: string;
  militiaId: string;
  militiaName: string;
  militiaCode: string;
  unitCode: string;
  unitName: string;
  rewardType: RewardForm;
  rewardTypeLabel: string;
  issuingAuthority: RewardAuthority;
  issuingAuthorityLabel: string;
  basis: RewardBasis;
  criteria: string | null;
  decisionNumber: string | null;
  issuedDate: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

// Dates are formatted in SQL so they stay the calendar day they are
const RECORD_SELECT = `SELECT rd.id,
         rd.militia_id AS "militiaId",
         mp.full_name AS "militiaName",
         mp.militia_code AS "militiaCode",
         u.code AS "unitCode",
         u.name AS "unitName",
         rd.reward_form AS "rewardType",
         ${sqlLabelCase('rd.reward_form', REWARD_FORM_LABELS)} AS "rewardTypeLabel",
         rd.issuing_authority AS "issuingAuthority",
         ${sqlLabelCase('rd.issuing_authority', REWARD_AUTHORITY_LABELS)} AS "issuingAuthorityLabel",
         rd.basis,
         rd.criteria,
         rd.decision_number AS "decisionNumber",
         to_char(rd.issued_date, 'YYYY-MM-DD') AS "issuedDate",
         rd.created_by AS "createdBy",
         cu.full_name AS "createdByName",
         rd.created_at AS "createdAt"
       FROM reward_decisions rd
       JOIN militia_profiles mp ON mp.id = rd.militia_id
       JOIN units u ON u.id = mp.unit_id
       JOIN users cu ON cu.id = rd.created_by`;

const blankAsNull = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

@Injectable()
export class RewardsService {
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

  async list(
    actor: MemberScopeActor,
    filters: RewardFilters,
  ): Promise<RewardRecord[]> {
    assertDateRange(filters.from, filters.to);
    const scope = await this.scopeOf(actor, filters.unitCode);
    return this.ds.query<RewardRecord[]>(
      `${RECORD_SELECT}
       WHERE ${memberReachSql({ everyone: '$7', unit: '$1', userIds: '$2' })}
         AND ($3::date IS NULL OR rd.issued_date >= $3::date)
         AND ($4::date IS NULL OR rd.issued_date <= $4::date)
         AND ($5::text IS NULL OR rd.reward_form = $5)
         AND ($6::uuid IS NULL OR rd.militia_id = $6::uuid)
       ORDER BY rd.issued_date DESC, rd.created_at DESC`,
      [
        scope.unit,
        scope.userIds,
        filters.from ?? null,
        filters.to ?? null,
        filters.rewardType ?? null,
        filters.militiaId ?? null,
        scope.everyone,
      ],
    );
  }

  // A decision outside the caller's scope answers exactly like a missing one
  async findOne(actor: MemberScopeActor, id: string): Promise<RewardRecord> {
    const scope = await this.scopeOf(actor);
    const rows = await this.ds.query<RewardRecord[]>(
      `${RECORD_SELECT}
       WHERE rd.id = $3 AND ${memberReachSql({ everyone: '$4', unit: '$1', userIds: '$2' })}`,
      [scope.unit, scope.userIds, id, scope.everyone],
    );
    if (!rows.length) throw new NotFoundException('reward_not_found');
    return rows[0];
  }

  async create(
    actor: MemberScopeActor,
    input: CreateRewardInput,
    origin?: AuditOrigin,
  ): Promise<RewardRecord> {
    if (!holdsAnyRole(actor, REWARD_STAFF_ROLE_SET)) {
      throw new ForbiddenException('insufficient_role');
    }
    if (input.issuedDate > businessDate().isoDate) {
      throw new BadRequestException('decision_date_in_future');
    }
    if (
      !authorityAllowedFor(
        input.rewardType,
        input.issuingAuthority,
        input.issuedDate,
      )
    ) {
      throw new BadRequestException('reward_authority_not_allowed');
    }
    const scope = await this.scopeOf(actor);
    const basis = input.basis ?? 'achievement';
    const decisionNumber = blankAsNull(input.decisionNumber);

    return this.ds.transaction(async (mgr) => {
      // The scope check is part of the INSERT: a member outside it inserts nothing and
      // answers like a missing one
      const inserted = await mgr.query<{ id: string }[]>(
        `INSERT INTO reward_decisions
           (militia_id, reward_form, issuing_authority, basis, criteria, decision_number,
            issued_date, created_by)
         SELECT mp.id, $4, $5, $6, $7, $8, $9::date, $10::uuid
         FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         WHERE mp.id = $1 AND ${memberReachSql({ everyone: '$11', unit: '$2', userIds: '$3' })}
         RETURNING id`,
        [
          input.militiaId,
          scope.unit,
          scope.userIds,
          input.rewardType,
          input.issuingAuthority,
          basis,
          blankAsNull(input.criteria),
          decisionNumber,
          input.issuedDate,
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
          action: 'reward.issued',
          entityType: 'reward_decisions',
          entityId: id,
          details: {
            militiaId: input.militiaId,
            rewardType: input.rewardType,
            issuingAuthority: input.issuingAuthority,
            basis,
            issuedDate: input.issuedDate,
            decisionNumber,
          },
        },
        origin,
      );

      const rows = await mgr.query<RewardRecord[]>(
        `${RECORD_SELECT} WHERE rd.id = $1`,
        [id],
      );
      return rows[0];
    });
  }
}
