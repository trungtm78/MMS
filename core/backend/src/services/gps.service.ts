import { queryOne, queryMany } from '../db/pool';

export interface GpsUpdate {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
}

export interface GpsTeamMember {
  userId: string;
  fullName: string;
  militiaCode: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  speed: number | null;
  battery: number | null;
  status: string;
  lastSeenAt: Date | null;
  currentTask: {
    id: string;
    title: string;
    type: string;
  } | null;
}

export async function upsertGpsLatest(userId: string, data: GpsUpdate): Promise<void> {
  // gps_latest uses militia_id (FK to militia_profiles.id), not user_id directly
  const profile = await queryOne<{ id: string }>(
    `SELECT id FROM militia_profiles WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (!profile) return; // user has no militia profile, skip

  await queryOne(
    `INSERT INTO gps_latest (militia_id, lat, lng, accuracy, speed, battery, status, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'online', NOW())
     ON CONFLICT (militia_id) DO UPDATE SET
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       accuracy = EXCLUDED.accuracy,
       speed = EXCLUDED.speed,
       battery = EXCLUDED.battery,
       status = 'online',
       last_seen_at = NOW()`,
    [profile.id, data.lat, data.lng, data.accuracy ?? null, data.speed ?? null, data.battery ?? null]
  );
}

export async function getTeamGps(unitId?: string, statusFilter?: string): Promise<GpsTeamMember[]> {
  // Build status filter
  const statusCondition = statusFilter === 'online'
    ? `AND (gl.last_seen_at > NOW() - INTERVAL '2 minutes')`
    : statusFilter === 'offline'
    ? `AND (gl.last_seen_at IS NULL OR gl.last_seen_at <= NOW() - INTERVAL '2 minutes')`
    : '';

  // Build unit filter
  const unitCondition = unitId
    ? `AND mp.unit_id = '${unitId}'`
    : '';

  const rows = await queryMany<{
    user_id: string;
    full_name: string;
    militia_code: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    speed: number | null;
    battery: number | null;
    last_seen_at: Date | null;
    task_id: string | null;
    task_title: string | null;
    task_type: string | null;
  }>(
    `SELECT
       u.id AS user_id,
       mp.full_name,
       mp.militia_code,
       gl.lat,
       gl.lng,
       gl.accuracy,
       gl.speed,
       gl.battery,
       gl.last_seen_at,
       t.id AS task_id,
       t.title AS task_title,
       t.type AS task_type
     FROM users u
     JOIN militia_profiles mp ON mp.user_id = u.id
     LEFT JOIN gps_latest gl ON gl.militia_id = mp.id
     LEFT JOIN task_assignments ta ON ta.assignee_id = u.id
       AND ta.status = 'in_progress'
     LEFT JOIN tasks t ON t.id = ta.task_id
     WHERE u.status = 'active'
       ${unitCondition}
       ${statusCondition}
     ORDER BY mp.militia_code`,
    []
  );

  return rows.map(r => {
    const isOnline = r.last_seen_at != null &&
      (new Date().getTime() - new Date(r.last_seen_at).getTime()) < 2 * 60 * 1000;
    const isMoving = isOnline && r.speed != null && r.speed > 0.5;

    return {
      userId: r.user_id,
      fullName: r.full_name,
      militiaCode: r.militia_code,
      lat: r.lat,
      lng: r.lng,
      accuracy: r.accuracy,
      speed: r.speed,
      battery: r.battery,
      status: isMoving ? 'moving' : isOnline ? 'online' : 'offline',
      lastSeenAt: r.last_seen_at,
      currentTask: r.task_id ? {
        id: r.task_id,
        title: r.task_title!,
        type: r.task_type!,
      } : null,
    };
  });
}
