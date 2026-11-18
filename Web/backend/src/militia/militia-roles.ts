// Who works with militia profiles. Kept apart from MilitiaService so the files layer can apply
// the same profile read rule to documents attached to a profile without importing the service.

// Staff who work with militia profiles, each within their unit scope
export const MILITIA_STAFF_ROLES = [
  'system_admin',
  'police_ward',
  'ca_ward',
  'ubnd_leader',
  'police_area',
  'ca_area',
  'ca_officer',
  'office_staff',
] as const;

// Staff plus DQTV members, who may read only their own profile
export const MILITIA_READER_ROLES = [
  ...MILITIA_STAFF_ROLES,
  'dqtv',
  'dqtv_member',
] as const;

export const MILITIA_STAFF_ROLE_SET: ReadonlySet<string> = new Set(
  MILITIA_STAFF_ROLES,
);
