import { ForbiddenException } from '@nestjs/common';
import { DQTV_ROLES } from '../constants/roles';
import { effectiveUnit, type ScopedActor } from './unit-scope';

// Which militia members' records an actor reaches. Every role the actor holds grants what
// it grants, whatever its priority, and the actor reaches the union of the grants:
// - staff roles other than ca_officer: the members of the effective unit (null = every unit)
// - ca_officer, when a staff role: the DQTV assigned to them (their unit scope does not
//   widen that)
// - DQTV roles: themselves
// So a user holding police_area and ca_officer reaches the members of their unit and the
// DQTV assigned to them, the same whichever of the two is the primary role; and where
// police_area is not a staff role (tasks), holding it beside ca_officer grants nothing more.

/** One grant: the members of a unit (null: every unit), or a list of members. */
export interface MemberScope {
  unit: string | null;
  // Owner user ids the records must belong to; null means no owner restriction
  userIds: string[] | null;
}

/**
 * The union of an actor's grants, in one shape the SQL helpers take:
 * - everyone: every member (a grant of every unit)
 * - unit: the members of this unit (null: none through a unit)
 * - userIds: these members (null: no grant names members; [] names none of them)
 */
export interface MemberReach {
  everyone: boolean;
  unit: string | null;
  userIds: string[] | null;
}

export interface MemberScopeActor extends ScopedActor {
  sub: string;
}

export interface AssignedDqtvSource {
  getAssignedDqtvIds(caUserId: string): Promise<string[]>;
}

export interface MemberScopeOptions {
  staffRoles: ReadonlySet<string>;
  assignments: AssignedDqtvSource;
  // Wide roles may narrow their unit grant to one unit; other grants ignore it
  requestedUnit?: string | null;
}

const CA_OFFICER = 'ca_officer';

const heldRoles = (actor: Pick<ScopedActor, 'role' | 'roles'>) => [
  ...new Set([actor.role, ...(actor.roles ?? [])]),
];

/**
 * The unit the actor's staff roles other than ca_officer grant (effectiveUnit over those
 * roles): a unit code, null for every unit, undefined when they grant none (no such role
 * held, or an area role without a unit scope).
 */
export function unitGrantOf(
  actor: ScopedActor,
  staffRoles: ReadonlySet<string>,
  requestedUnit?: string | null,
): string | null | undefined {
  const unitRoles = heldRoles(actor).filter(
    (role) => staffRoles.has(role) && role !== CA_OFFICER,
  );
  if (unitRoles.length === 0) return undefined;
  try {
    return effectiveUnit(
      { role: unitRoles[0], roles: unitRoles, unitScope: actor.unitScope },
      requestedUnit,
    );
  } catch (error) {
    if (error instanceof ForbiddenException) return undefined;
    throw error;
  }
}

/**
 * Every grant the actor's roles give (see above). Refused (403) when no role grants
 * anything: no_unit_scope when only a missing unit scope stood in the way,
 * insufficient_role otherwise.
 */
export async function resolveMemberGrants(
  actor: MemberScopeActor,
  options: MemberScopeOptions,
): Promise<MemberScope[]> {
  const held = heldRoles(actor);
  const grants: MemberScope[] = [];

  const unit = unitGrantOf(actor, options.staffRoles, options.requestedUnit);
  if (unit !== undefined) grants.push({ unit, userIds: null });
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
    const unitRoleHeld = held.some(
      (role) => options.staffRoles.has(role) && role !== CA_OFFICER,
    );
    throw new ForbiddenException(
      unitRoleHeld ? 'no_unit_scope' : 'insufficient_role',
    );
  }
  return grants;
}

/** The union of grants as one MemberReach. */
export function memberReachOf(grants: readonly MemberScope[]): MemberReach {
  const reach: MemberReach = { everyone: false, unit: null, userIds: null };
  for (const grant of grants) {
    if (grant.userIds !== null) {
      reach.userIds = [
        ...new Set([...(reach.userIds ?? []), ...grant.userIds]),
      ];
    } else if (grant.unit === null) {
      reach.everyone = true;
    } else {
      reach.unit = grant.unit;
    }
  }
  return reach;
}

/** resolveMemberGrants, as one MemberReach. */
export async function resolveMemberReach(
  actor: MemberScopeActor,
  options: MemberScopeOptions,
): Promise<MemberReach> {
  return memberReachOf(await resolveMemberGrants(actor, options));
}

/** True when a record of `unitCode` owned by `ownerId` lies within the reach. */
export function reachIncludes(
  reach: MemberReach,
  record: { unitCode: string | null; ownerId: string | null },
): boolean {
  return (
    reach.everyone ||
    (reach.unit !== null && reach.unit === record.unitCode) ||
    (reach.userIds !== null &&
      record.ownerId !== null &&
      reach.userIds.includes(record.ownerId))
  );
}

/** Placeholders of a MemberReach: everyone (boolean), unit (text), userIds (uuid[]). */
export interface MemberReachPlaceholders {
  everyone: string;
  unit: string;
  userIds: string;
}

/** The values for MemberReachPlaceholders, in the order everyone, unit, userIds. */
export const memberReachParams = (reach: MemberReach) =>
  [reach.everyone, reach.unit, reach.userIds] as const;

/**
 * SQL condition limiting rows to a MemberReach. Aliases name the units row and the
 * militia_profiles row of the query.
 */
export function memberReachSql(
  { everyone, unit, userIds }: MemberReachPlaceholders,
  aliases: { unit: string; profile: string } = { unit: 'u', profile: 'mp' },
): string {
  return `(${everyone}::boolean OR (${unit}::text IS NOT NULL AND ${aliases.unit}.code = ${unit}) OR (${userIds}::uuid[] IS NOT NULL AND ${aliases.profile}.user_id = ANY(${userIds}::uuid[])))`;
}
