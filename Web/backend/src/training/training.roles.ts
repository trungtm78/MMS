import type { RoleCode } from '../common/constants/roles';

// Roles that manage training: records, annual plans, sessions and session attendance. The
// web app's manageTraining permission copies this list.
export const TRAINING_MANAGER_ROLES = [
  'system_admin',
  'police_ward',
  'police_area',
] as const satisfies readonly RoleCode[];

export const TRAINING_MANAGER_ROLE_SET: ReadonlySet<string> = new Set(
  TRAINING_MANAGER_ROLES,
);
