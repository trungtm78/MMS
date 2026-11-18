// Which SOS incidents a caller reaches, shared by the alert list, the alert page and status
// changes, so they always agree:
// - militia members: the alerts they raised
// - CA officers: alerts from the DQTV assigned to them, and their own
// - unit staff: alerts from reporters of their unit (a militia profile or an account scope
//   in it); ward-wide roles see every unit and may narrow to one
import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.service';
import type { AssignedDqtvSource } from '../common/access/member-scope';
import { effectiveUnit, holdsAnyRole } from '../common/access/unit-scope';
import { DQTV_ROLES } from '../common/constants/roles';
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

export interface SosScope {
  /** Reporters whose alerts the caller reaches; null means no reporter restriction */
  reporterIds: string[] | null;
  /** The unit of those reporters; null means every unit */
  unit: string | null;
}

export async function resolveSosScope(
  actor: SosActor,
  assignments: AssignedDqtvSource,
  requestedUnit?: string,
): Promise<SosScope> {
  if (holdsAnyRole(actor, SOS_STAFF_ROLES)) {
    if (actor.role === 'ca_officer') {
      const assigned = await assignments.getAssignedDqtvIds(actor.sub);
      return {
        reporterIds: [...new Set([...assigned, actor.sub])],
        unit: null,
      };
    }
    return {
      reporterIds: null,
      unit: effectiveUnit(actor, requestedUnit || undefined),
    };
  }
  if (holdsAnyRole(actor, DQTV_ROLES)) {
    return { reporterIds: [actor.sub], unit: null };
  }
  throw new ForbiddenException('insufficient_role');
}

/** Incidents `i` inside a SosScope passed as $1 reporter ids (uuid[]) and $2 unit code (text) */
export const SOS_SCOPE_SQL = `($1::uuid[] IS NULL OR i.reporter_id = ANY($1::uuid[]))
    AND ($2::text IS NULL OR ${userInUnit('i.reporter_id', '$2')})`;
