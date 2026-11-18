// Where live GPS positions travel. Members of a unit share the unit:<code> socket room, so a
// position never goes there: it goes to staff-only GPS rooms and to the CA officers the
// member is assigned to. No imports beyond role constants, so the gateway and GpsService can
// both use it without depending on each other.
import { holdsAnyRole, type ScopedActor } from '../common/access/unit-scope';
import {
  AREA_SCOPED_ROLES,
  WIDE_SCOPE_ROLES,
  type RoleCode,
} from '../common/constants/roles';

// Event a client receives with one GET /gps/live row after POST /gps/record
export const GPS_UPDATE_EVENT = 'gps:update';

// A position older than this is reported offline (never stored: derived when read)
export const GPS_OFFLINE_AFTER_MINUTES = 10;

// Staff who read positions (the roles of GET /gps/live, /gps/team, /gps/history/:id)
export const GPS_STAFF_ROLES = [
  'system_admin',
  'police_ward',
  'police_area',
  'ca_ward',
  'ca_area',
  'ca_officer',
] as const satisfies readonly RoleCode[];

export const GPS_STAFF_ROLE_SET: ReadonlySet<string> = new Set(GPS_STAFF_ROLES);

// Staff whose GPS audience is a whole unit or the ward; CA officers see only the DQTV
// assigned to them and so receive positions in their own user room
const GPS_AREA_STAFF_ROLES: ReadonlySet<string> = new Set(
  GPS_STAFF_ROLES.filter((role) => role !== 'ca_officer'),
);

export const GPS_WARD_ROOM = 'gps:ward';

export const gpsUnitRoom = (unitCode: string) => `gps:unit:${unitCode}`;

/**
 * The GPS room a connected user joins, following resolveMemberScope and effectiveUnit: none
 * for members and CA officers, none for an area role without a unit scope (refused rather
 * than given the ward), the ward room for ward-wide staff, else the room of their unit.
 */
export function gpsRoomOf(user: ScopedActor): string | null {
  if (user.role === 'ca_officer') return null;
  if (!holdsAnyRole(user, GPS_AREA_STAFF_ROLES)) return null;
  if (holdsAnyRole(user, WIDE_SCOPE_ROLES)) return GPS_WARD_ROOM;
  if (user.unitScope) return gpsUnitRoom(user.unitScope);
  return AREA_SCOPED_ROLES.has(user.role) ? null : GPS_WARD_ROOM;
}
