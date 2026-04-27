import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface GpsPointDto {
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt?: string;
}

export interface GpsLatest {
  militiaId: string;
  fullName: string;
  lat: number;
  lng: number;
  lastSeenAt: string;
  status: string;
}

@Injectable()
export class GpsService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  async recordLocation(militiaId: string, dto: GpsPointDto): Promise<void> {
    const capturedAt = dto.capturedAt ?? new Date().toISOString();
    await Promise.all([
      this.ds.query(
        `INSERT INTO gps_points(militia_id, lat, lng, accuracy, captured_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [militiaId, dto.lat, dto.lng, dto.accuracy ?? null, capturedAt],
      ),
      this.ds.query(
        `INSERT INTO gps_latest(militia_id, lat, lng, last_seen_at, status)
         VALUES ($1, $2, $3, $4, 'online')
         ON CONFLICT (militia_id) DO UPDATE
           SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
               last_seen_at = EXCLUDED.last_seen_at, status = 'online'`,
        [militiaId, dto.lat, dto.lng, capturedAt],
      ),
    ]);
  }

  async getLive(): Promise<GpsLatest[]> {
    return this.ds.query<GpsLatest[]>(
      `SELECT gl.militia_id AS "militiaId", mp.full_name AS "fullName",
              gl.lat, gl.lng, gl.last_seen_at AS "lastSeenAt", gl.status
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
