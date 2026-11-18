import { ForbiddenException } from '@nestjs/common';
import { DQTV_ROLES } from '../constants/roles';

const CA_OFFICER = 'ca_officer';
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
 * What each role the actor holds grants, whatever its priority: the actor reaches the union
 * of the grants (each one a MemberScope), so a user holding police_area and ca_officer
 * reaches the members of their unit and the DQTV assigned to them, the same whichever of
 * the two is the primary role.
 * - staff roles other than ca_officer: the members of the effective unit (effectiveUnit
 *   over those roles; an area role without a unit scope grants nothing through it)
 * - ca_officer, when a staff role: the DQTV assigned to them (their unit scope does not
 *   widen that)
 * - DQTV roles: themselves
 * Refused (403) when no role grants anything: no_unit_scope when only a missing unit
 * scope stood in the way, insufficient_role otherwise.
 */
export async function resolveMemberGrants(
  actor: MemberScopeActor,
  options: {
    staffRoles: ReadonlySet<string>;
    assignments: AssignedDqtvSource;
    requestedUnit?: string | null;
  },
): Promise<MemberScope[]> {
  const held = [...new Set([actor.role, ...(actor.roles ?? [])])];
  const grants: MemberScope[] = [];
  let unitScopeMissing = false;

  const unitRoles = held.filter(
    (role) => options.staffRoles.has(role) && role !== CA_OFFICER,
  );
  if (unitRoles.length) {
    try {
      grants.push({
        unit: effectiveUnit(
          { role: unitRoles[0], roles: unitRoles, unitScope: actor.unitScope },
          options.requestedUnit,
        ),
        userIds: null,
      });
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
      unitScopeMissing = true;
    }
  }
  if (options.staffRoles.has(CA_OFFICER) && held.includes(CA_OFFICER)) {
    grants.push({
      unit: null,
      userIds: await options.assignments.getAssignedDqtvIds(actor.sub),
    });
  }
  if (held.some((role) => DQTV_ROLES.has(role))) {
    grants.push({ unit: null, userIds: [actor.sub] });
  }

  if (grants.length === 0) {
    throw new ForbiddenException(
      unitScopeMissing ? 'no_unit_scope' : 'insufficient_role',
    );
  }
  return grants;
}

/** True when a record of `unitCode` owned by `ownerId` lies within one of the grants. */
export function grantsReach(
  grants: readonly MemberScope[],
  record: { unitCode: string | null; ownerId: string | null },
): boolean {
  return grants.some(
    (grant) =>
      (grant.unit === null || grant.unit === record.unitCode) &&
      (grant.userIds === null ||
        (record.ownerId !== null && grant.userIds.includes(record.ownerId))),
  );
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
