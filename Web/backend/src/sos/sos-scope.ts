// Which SOS incidents a caller reaches, shared by the alert list, the alert page and status
// changes, so they always agree:
// - militia members: the alerts they raised
// - CA officers: alerts from the DQTV assigned to them, and their own
// - unit staff: alerts from reporters of their unit (a militia profile or an account scope
//   in it); ward-wide roles see every unit and may narrow to one
// Every role held counts, whatever its priority (resolveMemberReach): a user holding a unit
// role and ca_officer reaches the alerts of both.
import type { JwtPayload } from '../auth/auth.service';
import {
  resolveMemberReach,
  type AssignedDqtvSource,
} from '../common/access/member-scope';
import { holdsAnyRole } from '../common/access/unit-scope';
import { userInUnit } from '../common/sql/user-access.sql';

export type SosActor = Pick<JwtPayload, 'sub' | 'role' | 'roles' | 'unitScope'>;

// The roles responding to SOS alerts beyond their own (sos.controller.ts class-level @Roles)
export const SOS_STAFF_ROLES: ReadonlySet<string> = new Set([
  'system_admin',
  'police_ward',
  'police_area',
  'ca_ward',
  'ca_area',
  'ca_officer',
  'office_staff',
]);

const CA_OFFICER_ROLE: ReadonlySet<string> = new Set(['ca_officer']);

/**
 * Whose alerts the caller reaches: the reporters listed, and those of the unit. Both null
 * means every alert; a field that is null otherwise grants nothing.
 */
export interface SosScope {
  reporterIds: string[] | null;
  unit: string | null;
}

export async function resolveSosScope(
  actor: SosActor,
  assignments: AssignedDqtvSource,
  requestedUnit?: string,
): Promise<SosScope> {
  const reach = await resolveMemberReach(actor, {
    staffRoles: SOS_STAFF_ROLES,
    assignments,
    requestedUnit: requestedUnit || undefined,
  });
  if (reach.everyone) return { reporterIds: null, unit: null };
  // CA officers also reach the alerts they raised themselves
  const own = holdsAnyRole(actor, CA_OFFICER_ROLE) ? [actor.sub] : [];
  const listed = reach.userIds === null ? null : [...reach.userIds, ...own];
  return {
    reporterIds: listed && [...new Set(listed)],
    unit: reach.unit,
  };
}

/**
 * Incidents `i` inside a SosScope passed as $1 reporter ids (uuid[]) and $2 unit code (text):
 * every incident when both are null, else those of a listed reporter or of a reporter of
 * the unit.
 */
export const SOS_SCOPE_SQL = `(($1::uuid[] IS NULL AND $2::text IS NULL) OR i.reporter_id = ANY($1::uuid[]) OR ($2::text IS NOT NULL AND ${userInUnit('i.reporter_id', '$2')}))`;
