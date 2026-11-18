import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import {
  effectiveUnit,
  holdsAnyRole,
  type ScopedActor,
} from '../common/access/unit-scope';
import { DQTV_ROLES, WIDE_SCOPE_ROLES } from '../common/constants/roles';
import { userInUnit } from '../common/sql/user-access.sql';

export interface ContactActor extends ScopedActor {
  sub: string;
}

/**
 * Who an actor may find in GET /users/search and add to a conversation.
 * - units: members of these unit codes (militia profile or account scope); null = the ward
 * - userIds: these accounts whatever their unit (CA officer / DQTV assignments)
 */
export interface ContactScope {
  units: string[] | null;
  userIds: string[];
}

/**
 * The one rule deciding whom a user may reach. UsersService.searchUsers lists exactly the
 * accounts ChatService.createConversation accepts, so the picker never offers someone the
 * conversation would refuse, and never hides someone it would accept.
 *
 * - ward-wide roles (WIDE_SCOPE_ROLES, any held role): everyone
 * - CA officers: the members of their unit (none without a unit scope, which never widens
 *   to the ward) and the DQTV assigned to them
 * - DQTV members: the members of their own units, and the CA officers they are assigned to
 * - every other role: the members of its effective unit; ward-level roles without a unit
 *   scope reach the ward, area roles without one are refused (effectiveUnit)
 *
 * Reaching someone is not symmetric, as in directory-scoped messaging elsewhere: a ward
 * officer may open a conversation with a DQTV member who could not have found the officer.
 * Once a conversation exists, membership alone decides who reads and writes in it.
 */
@Injectable()
export class ContactPolicy {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly assignments: AssignmentsService,
  ) {}

  async scopeOf(actor: ContactActor): Promise<ContactScope> {
    if (holdsAnyRole(actor, WIDE_SCOPE_ROLES)) {
      return { units: null, userIds: [] };
    }
    if (actor.role === 'ca_officer') {
      return {
        units: actor.unitScope ? [actor.unitScope] : [],
        userIds: await this.assignments.getAssignedDqtvIds(actor.sub),
      };
    }
    if (DQTV_ROLES.has(actor.role)) {
      return this.dqtvScope(actor.sub);
    }
    const unit = effectiveUnit(actor);
    return { units: unit === null ? null : [unit], userIds: [] };
  }

  // A member's units come from their militia profiles and account scopes; a ward-wide
  // ('all') scope row never widens a member's reach
  private async dqtvScope(userId: string): Promise<ContactScope> {
    const rows = await this.ds.query<
      { units: string[] | null; caUserIds: string[] | null }[]
    >(
      `SELECT ARRAY(
                SELECT pu.code FROM militia_profiles pmp JOIN units pu ON pu.id = pmp.unit_id
                WHERE pmp.user_id = $1
                UNION
                SELECT su.code FROM user_unit_scopes s JOIN units su ON su.id = s.unit_id
                WHERE s.user_id = $1 AND s.scope_type <> 'all'
              ) AS units,
              ARRAY(
                SELECT a.ca_user_id FROM ca_dqtv_assignments a WHERE a.dqtv_user_id = $1
              ) AS "caUserIds"`,
      [userId],
    );
    return {
      units: rows[0]?.units ?? [],
      userIds: rows[0]?.caUserIds ?? [],
    };
  }
}

/**
 * SQL condition: the account `targetSql` lies inside a ContactScope passed as two
 * parameters, the unit codes (`unitsParam`, text[] or NULL for the ward) and the listed
 * users (`userIdsParam`, uuid[]). Arguments are SQL written in code, never request input.
 */
export function contactScopeSql(
  targetSql: string,
  unitsParam: string,
  userIdsParam: string,
): string {
  return `(${unitsParam}::text[] IS NULL
    OR ${targetSql} = ANY(${userIdsParam}::uuid[])
    OR EXISTS (SELECT 1 FROM unnest(${unitsParam}::text[]) AS cu(code)
               WHERE ${userInUnit(targetSql, 'cu.code')}))`;
}
