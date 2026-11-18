import { ForbiddenException } from '@nestjs/common';
import { AREA_SCOPED_ROLES, WIDE_SCOPE_ROLES } from '../constants/roles';

export interface ScopedActor {
  role: string;
  roles?: string[];
  unitScope: string | null;
}

/** True when the actor's primary role or any of its other roles is in `roles`. */
export const holdsAnyRole = (
  actor: Pick<ScopedActor, 'role' | 'roles'>,
  roles: ReadonlySet<string>,
) => [actor.role, ...(actor.roles ?? [])].some((role) => roles.has(role));

// The unit an actor's data access is limited to; null means the whole ward.
// - wide roles see every unit and may narrow to a requested one
// - an actor with a unit scope is locked to it, whatever they request
// - area roles must have a scope: a missing scope row must not widen their access
// - ward-level roles without a scope cover the whole ward
// DQTV members are limited to their own records by the caller, not by unit.
export function effectiveUnit(
  actor: ScopedActor,
  requested?: string | null,
): string | null {
  if (holdsAnyRole(actor, WIDE_SCOPE_ROLES)) return requested ?? null;
  if (actor.unitScope) return actor.unitScope;
  if (AREA_SCOPED_ROLES.has(actor.role)) {
    throw new ForbiddenException('no_unit_scope');
  }
  return requested ?? null;
}

// Refuses records that belong to a unit outside the actor's scope
export function assertUnitInScope(actor: ScopedActor, unitCode: string): void {
  const scope = effectiveUnit(actor);
  if (scope !== null && scope !== unitCode) {
    throw new ForbiddenException('unit_scope_violation');
  }
}
