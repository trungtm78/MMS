import type { RoleCode } from '../common/constants/roles';

// Staff who record khen thưởng and kỷ luật decisions and decide appeals. The web app's
// manageRewards permission copies this list (the same roles as GET /militia/rewards-report).
export const REWARD_STAFF_ROLES = [
  'system_admin',
  'police_ward',
  'office_staff',
] as const satisfies readonly RoleCode[];

// Readers: staff for their unit scope, DQTV members for their own decisions only. DQTV
// members may also appeal a discipline decision issued against them.
export const REWARD_READER_ROLES = [
  ...REWARD_STAFF_ROLES,
  'dqtv',
  'dqtv_member',
] as const satisfies readonly RoleCode[];

export const REWARD_STAFF_ROLE_SET: ReadonlySet<string> = new Set(
  REWARD_STAFF_ROLES,
);
