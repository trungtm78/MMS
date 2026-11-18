// Role catalogue mirrored from Web/backend/src/common/constants/roles.ts; the labels are the
// role names seeded by Web/backend/migrations/023_role_catalogue.sql. Keep all three in sync.
import i18n from '@/i18n'
import type { TranslationKey } from '@/i18n/types'

/** Every role code the backend authorizes against. */
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
] as const

export type RoleCode = (typeof ROLE_CODES)[number]

/** Highest privilege first — the backend picks a user's primary `role` in this order. */
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
]

/** Text key of every role name (src/i18n/locales/vi/roles.json); read the text with roleLabel. */
export const ROLE_LABEL_KEYS = {
  system_admin: 'roles.labels.system_admin',
  ubnd_leader: 'roles.labels.ubnd_leader',
  police_ward: 'roles.labels.police_ward',
  police_area: 'roles.labels.police_area',
  office_staff: 'roles.labels.office_staff',
  dqtv: 'roles.labels.dqtv',
  ca_officer: 'roles.labels.ca_officer',
  ca_ward: 'roles.labels.ca_ward',
  ca_area: 'roles.labels.ca_area',
  dqtv_member: 'roles.labels.dqtv_member',
} as const satisfies Readonly<Record<RoleCode, TranslationKey>>

const PRIORITY_INDEX: ReadonlyMap<string, number> = new Map(ROLE_PRIORITY.map((code, index) => [code, index]))

export function isRoleCode(value: unknown): value is RoleCode {
  return typeof value === 'string' && PRIORITY_INDEX.has(value)
}

/** Position in ROLE_PRIORITY (0 = most privileged); unknown codes rank below every known role. */
export function roleRank(code: string): number {
  return PRIORITY_INDEX.get(code) ?? ROLE_PRIORITY.length
}

/** Distinct role codes, highest priority first; unknown codes last, alphabetically (as the backend). */
export function sortRolesByPriority(codes: readonly string[]): string[] {
  return [...new Set(codes)].sort((a, b) => roleRank(a) - roleRank(b) || a.localeCompare(b))
}

export interface RoleHolder {
  role?: string | null
  roles?: readonly string[] | null
}

/**
 * Every role a user holds: the `roles` claim plus the primary `role`, like the backend's
 * holdsAnyRole. Sessions issued before the `roles` claim existed carry only `role`.
 */
export function heldRoles(user: RoleHolder | null | undefined): string[] {
  if (!user) return []
  const codes = [...(Array.isArray(user.roles) ? user.roles : []), user.role]
  return sortRolesByPriority(codes.filter((code): code is string => typeof code === 'string' && code.length > 0))
}

/** The role's name in the current language; an unknown code is shown as-is. */
export function roleLabel(code: string | null | undefined): string {
  if (!code) return i18n.t('common.states.none')
  return isRoleCode(code) ? i18n.t(ROLE_LABEL_KEYS[code]) : code
}
