// Every role code the backend authorizes against. Migration 023 seeds this catalogue,
// so production databases (which never run the development seeder) know all of them.
export const ROLE_CODES = [
  'system_admin',
  'ubnd_leader',
  'police_ward',
  'police_area',
  'office_staff',
  'dqtv',
  'ca_officer',
  'ca_ward',
  'ca_area',
  'dqtv_member',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

// Highest privilege first. A user's primary `role` claim is their first assigned role in
// this order; it mirrors ROLE_HIERARCHY in Web/frontend/src/hooks/useRbac.ts.
export const ROLE_PRIORITY: readonly RoleCode[] = [
  'system_admin',
  'police_ward',
  'ca_ward',
  'ubnd_leader',
  'police_area',
  'ca_area',
  'ca_officer',
  'office_staff',
  'dqtv',
  'dqtv_member',
];

// Distinct role codes, highest priority first; unknown codes sort last, alphabetically
export function sortRolesByPriority(codes: readonly string[]): string[] {
  const rank = (code: string) => {
    const index = (ROLE_PRIORITY as readonly string[]).indexOf(code);
    return index === -1 ? ROLE_PRIORITY.length : index;
  };
  return [...new Set(codes)].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );
}

// Roles whose data access spans every unit; every other role is limited to its unit scope
export const WIDE_SCOPE_ROLES: ReadonlySet<string> = new Set([
  'system_admin',
  'police_ward',
]);

// Militia member roles: they only ever see their own records
export const DQTV_ROLES: ReadonlySet<string> = new Set(['dqtv', 'dqtv_member']);

// Roles that always carry a unit scope; without one they are refused rather than
// silently given the whole ward
export const AREA_SCOPED_ROLES: ReadonlySet<string> = new Set([
  'police_area',
  'ca_area',
  'ca_officer',
]);

export const CA_ROLES = new Set([
  'ca_officer',
  'police_ward',
  'police_area',
  'ca_ward',
  'ca_area',
]);

// Roles that may approve or reject DQTV work reports
export const REVIEWER_ROLES: ReadonlySet<string> = new Set([
  ...CA_ROLES,
  'system_admin',
]);
