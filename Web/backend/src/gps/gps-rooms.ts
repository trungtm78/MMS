// Where live GPS positions travel. Members of a unit share the unit socket room, so a
// position never goes there: it goes to staff-only GPS rooms and to the CA officers the
// member is assigned to. No imports beyond role constants and the room names, so the
// gateway and GpsService can both use it without depending on each other.
import { unitGrantOf } from '../common/access/member-scope';
import type { ScopedActor } from '../common/access/unit-scope';
import type { RoleCode } from '../common/constants/roles';
import { rooms } from '../notifications/rooms';

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

// The rooms are those of one tenant: the same unit code in two tenants is two rooms
export const gpsWardRoom = (tid: string | undefined) => rooms.gpsWard(tid);

export const gpsUnitRoom = (tid: string | undefined, unitCode: string) =>
  rooms.gpsUnit(tid, unitCode);

/**
 * The GPS room a connected user of tenant `tid` joins: the room of the unit their GPS staff
 * roles other than ca_officer grant (unitGrantOf, whatever role is primary), the ward room
 * when that grant is every unit, none when no role grants a unit (members, CA officers, an
 * area role without a unit scope, refused rather than given the ward). CA officers receive
 * the positions of the DQTV assigned to them in their own user room, so a user holding a
 * unit role and ca_officer receives both.
 */
export function gpsRoomOf(
  user: ScopedActor,
  tid: string | undefined,
): string | null {
  const unit = unitGrantOf(user, GPS_STAFF_ROLE_SET);
  if (unit === undefined) return null;
  return unit === null ? gpsWardRoom(tid) : gpsUnitRoom(tid, unit);
}
