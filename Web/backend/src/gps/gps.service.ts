import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface GpsPointDto {
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt?: string;
}

export interface GpsLiveDto {
  id: string;            // militia_profiles.id
  militiaId: string;     // backward-compat alias for PoliceApp /gps/team
  userId: string | null; // users.id — null if profile has no linked user
  name: string;
  fullName: string;      // backward-compat alias
  lat: number;
  lng: number;
  accuracy: number | null;
  lastUpdate: string;
  lastSeenAt: string;    // backward-compat alias
  status: string;
}

/** @deprecated Use GpsLiveDto */
export type GpsLatest = GpsLiveDto;

@Injectable()
export class GpsService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

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
       INSERT INTO gps_latest(militia_id, lat, lng, last_seen_at, status)
       VALUES ($1, $2, $3, $5, 'online')
       ON CONFLICT (militia_id) DO UPDATE
         SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
             last_seen_at = EXCLUDED.last_seen_at, status = 'online'`,
      [militiaId, dto.lat, dto.lng, dto.accuracy ?? null, capturedAt],
    );
  }

  async getLive(): Promise<GpsLiveDto[]> {
    return this.ds.query(
      `SELECT gl.militia_id     AS "id",
              gl.militia_id     AS "militiaId",
              mp.user_id        AS "userId",
              mp.full_name      AS "name",
              mp.full_name      AS "fullName",
              gl.lat,
              gl.lng,
              gl.accuracy,
              gl.last_seen_at   AS "lastUpdate",
              gl.last_seen_at   AS "lastSeenAt",
              gl.status
       FROM gps_latest gl
       JOIN militia_profiles mp ON mp.id = gl.militia_id
       ORDER BY gl.last_seen_at DESC`,
    );
  }

  async getHistory(
    militiaId: string,
    from?: string,
    to?: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const safLimit = Math.min(Math.max(1, limit), 200);
    const offset = (Math.max(1, page) - 1) * safLimit;
    const params: unknown[] = [militiaId];
    let idx = 2;
    let dateFilter = '';
    if (from) { dateFilter += ` AND captured_at >= $${idx++}::timestamptz`; params.push(from); }
    if (to)   { dateFilter += ` AND captured_at <= $${idx++}::timestamptz`; params.push(to); }

    const countRows = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM gps_points WHERE militia_id = $1${dateFilter}`,
      params,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.ds.query(
      `SELECT id, lat, lng, accuracy, captured_at AS "capturedAt"
       FROM gps_points WHERE militia_id = $1${dateFilter}
       ORDER BY captured_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safLimit, offset],
    );

    return { data, total, page, limit: safLimit };
  }
}
