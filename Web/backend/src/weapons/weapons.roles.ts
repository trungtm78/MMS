import type { RoleCode } from '../common/constants/roles';

// Staff who manage weapons (the class-level roles of WeaponsController). The web app's
// manageWeapons permission copies this list.
export const WEAPON_STAFF_ROLES = [
  'system_admin',
  'office_staff',
  'police_ward',
] as const satisfies readonly RoleCode[];
