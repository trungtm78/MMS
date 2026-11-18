import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import {
  memberReachParams,
  memberReachSql,
  resolveMemberReach,
  type MemberReach,
  type MemberScopeActor,
} from '../common/access/member-scope';
import { TenantContext } from '../database/tenancy/tenant-context';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { rooms } from '../notifications/rooms';
import {
  GPS_OFFLINE_AFTER_MINUTES,
  GPS_STAFF_ROLE_SET,
  GPS_UPDATE_EVENT,
  gpsUnitRoom,
  gpsWardRoom,
} from './gps-rooms';

export interface GpsPointDto {
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt?: string;
}

export interface GpsLiveDto {
  id: string; // militia_profiles.id
  militiaId: string; // alias of id for PoliceApp /gps/team
  userId: string | null; // users.id — null if the profile has no account
  name: string;
  fullName: string; // alias of name
  unitCode: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  lastUpdate: Date;
  lastSeenAt: Date; // alias of lastUpdate
  // online while the last position is recent, offline once it is older than
  // GPS_OFFLINE_AFTER_MINUTES (derived when read, never trusted from storage alone)
  status: string;
}

// The latest position of members; `where` filters gl/mp/u and `minutes` is the placeholder of
// the offline threshold
const liveRowsSql = (where: string, minutes: string) =>
  `SELECT gl.militia_id     AS "id",
          gl.militia_id     AS "militiaId",
          mp.user_id        AS "userId",
          mp.full_name      AS "name",
          mp.full_name      AS "fullName",
          u.code            AS "unitCode",
          gl.lat,
          gl.lng,
          gl.accuracy,
          gl.last_seen_at   AS "lastUpdate",
          gl.last_seen_at   AS "lastSeenAt",
          CASE WHEN gl.last_seen_at >= now() - make_interval(mins => ${minutes}) THEN gl.status ELSE 'offline' END AS status
   FROM gps_latest gl
   JOIN militia_profiles mp ON mp.id = gl.militia_id
   JOIN units u ON u.id = mp.unit_id
   WHERE ${where}`;

@Injectable()
export class GpsService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly assignments: AssignmentsService,
    private readonly gateway: NotificationsGateway,
  ) {}

  // CA officers see the DQTV assigned to them, unit staff their unit, ward-wide staff all;
  // a user holding several of these roles sees the union (resolveMemberReach)
  private scopeOf(actor: MemberScopeActor): Promise<MemberReach> {
    return resolveMemberReach(actor, {
      staffRoles: GPS_STAFF_ROLE_SET,
      assignments: this.assignments,
    });
  }

  async recordLocation(userId: string, dto: GpsPointDto): Promise<void> {
    const rows = await this.ds.query<{ id: string }[]>(
      `SELECT id FROM militia_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!rows.length) throw new NotFoundException('militia_profile_not_found');

    const militiaId = rows[0].id;
    const capturedAt = dto.capturedAt ?? new Date().toISOString();

    // Atomic: gps_points insert + gps_latest upsert in one statement
    await this.ds.query(
      `WITH ins AS (
         INSERT INTO gps_points(militia_id, lat, lng, accuracy, captured_at)
         VALUES ($1, $2, $3, $4, $5)
       )
       INSERT INTO gps_latest(militia_id, lat, lng, accuracy, last_seen_at, status)
       VALUES ($1, $2, $3, $4, $5, 'online')
       ON CONFLICT (militia_id) DO UPDATE
         SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, accuracy = EXCLUDED.accuracy,
             last_seen_at = EXCLUDED.last_seen_at, status = 'online'`,
      [militiaId, dto.lat, dto.lng, dto.accuracy ?? null, capturedAt],
    );

    await this.publish(militiaId, userId);
  }

  // gps:update carries the member's /gps/live row to everyone whose scope holds the member:
  // ward-wide staff, staff of the member's unit, the CA officers the member is assigned to.
  // Never the unit room, which the member's teammates share. Every room is the tenant's own.
  private async publish(militiaId: string, userId: string): Promise<void> {
    const [row] = await this.ds.query<GpsLiveDto[]>(
      liveRowsSql('gl.militia_id = $1', '$2'),
      [militiaId, GPS_OFFLINE_AFTER_MINUTES],
    );
    if (!row) return;
    const caOfficers = await this.assignments.getCaOfficerIds(userId);
    const tid = TenantContext.current()?.tenantId;
    this.gateway.emitToRooms(
      [
        gpsWardRoom(tid),
        gpsUnitRoom(tid, row.unitCode),
        ...caOfficers.map((id) => rooms.user(tid, id)),
      ],
      GPS_UPDATE_EVENT,
      row,
    );
  }

  async getLive(actor: MemberScopeActor): Promise<GpsLiveDto[]> {
    const scope = await this.scopeOf(actor);
    return this.ds.query<GpsLiveDto[]>(
      `${liveRowsSql(memberReachSql({ everyone: '$1', unit: '$2', userIds: '$3' }), '$4')}
       ORDER BY gl.last_seen_at DESC`,
      [...memberReachParams(scope), GPS_OFFLINE_AFTER_MINUTES],
    );
  }

  // A member outside the caller's scope answers 404 like an unknown one
  async getHistory(
    actor: MemberScopeActor,
    militiaId: string,
    from?: string,
    to?: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const scope = await this.scopeOf(actor);
    const members = await this.ds.query<{ id: string }[]>(
      `SELECT mp.id
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.id = $1 AND ${memberReachSql({ everyone: '$2', unit: '$3', userIds: '$4' })}`,
      [militiaId, ...memberReachParams(scope)],
    );
    if (!members.length) throw new NotFoundException('militia_not_found');

    const safLimit = Math.min(Math.max(1, limit), 200);
    const offset = (Math.max(1, page) - 1) * safLimit;
    const params: unknown[] = [militiaId];
    let idx = 2;
    let dateFilter = '';
    if (from) {
      dateFilter += ` AND captured_at >= $${idx++}::timestamptz`;
      params.push(from);
    }
    if (to) {
      dateFilter += ` AND captured_at <= $${idx++}::timestamptz`;
      params.push(to);
    }

    const countRows = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM gps_points WHERE militia_id = $1${dateFilter}`,
      params,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.ds.query<unknown[]>(
      `SELECT id, lat, lng, accuracy, captured_at AS "capturedAt"
       FROM gps_points WHERE militia_id = $1${dateFilter}
       ORDER BY captured_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safLimit, offset],
    );

    return { data, total, page, limit: safLimit };
  }
}
