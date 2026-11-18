import { ForbiddenException } from '@nestjs/common';
import { DQTV_ROLES } from '../constants/roles';
import { effectiveUnit, holdsAnyRole, type ScopedActor } from './unit-scope';

// Which militia members' records an actor reaches:
// - staff: the members of their effective unit (null = every unit)
// - CA officers: only the DQTV assigned to them (their unit scope does not widen that)
// - DQTV members: only themselves
export interface MemberScope {
  unit: string | null;
  // Owner user ids the records must belong to; null means no owner restriction
  userIds: string[] | null;
}

export interface MemberScopeActor extends ScopedActor {
  sub: string;
}

export interface AssignedDqtvSource {
  getAssignedDqtvIds(caUserId: string): Promise<string[]>;
}

export async function resolveMemberScope(
  actor: MemberScopeActor,
  options: {
    staffRoles: ReadonlySet<string>;
    assignments: AssignedDqtvSource;
    requestedUnit?: string | null;
  },
): Promise<MemberScope> {
  if (holdsAnyRole(actor, options.staffRoles)) {
    if (actor.role === 'ca_officer') {
      return {
        unit: null,
        userIds: await options.assignments.getAssignedDqtvIds(actor.sub),
      };
    }
    return {
      unit: effectiveUnit(actor, options.requestedUnit),
      userIds: null,
    };
  }
  if (holdsAnyRole(actor, DQTV_ROLES)) {
    return { unit: null, userIds: [actor.sub] };
  }
  throw new ForbiddenException('insufficient_role');
}

/**
 * SQL condition limiting rows to a MemberScope passed as two parameters: the unit code
 * ($unitParam, text) and the owner user ids ($userIdsParam, uuid[]). Aliases name the
 * units row and the militia_profiles row of the query.
 */
export function memberScopeSql(
  unitParam: number,
  userIdsParam: number,
  aliases: { unit: string; profile: string } = { unit: 'u', profile: 'mp' },
): string {
  const unit = `$${unitParam}`;
  const users = `$${userIdsParam}`;
  return `(${unit}::text IS NULL OR ${aliases.unit}.code = ${unit}) AND (${users}::uuid[] IS NULL OR ${aliases.profile}.user_id = ANY(${users}::uuid[]))`;
}
