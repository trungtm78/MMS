import { queryOne, queryMany } from '../db/pool';
import { getMilitiaProfileByUserId } from './user.service';

export interface AttendanceRecord {
  id: string;
  militiaId: string;
  taskId: string | null;
  workDate: Date;
  checkinAt: Date | null;
  checkinLat: number | null;
  checkinLng: number | null;
  checkinAccuracy: number | null;
  checkinLocationName: string | null;
  checkoutAt: Date | null;
  checkoutLat: number | null;
  checkoutLng: number | null;
  checkoutAccuracy: number | null;
  checkoutLocationName: string | null;
  source: string;
  status: string;
  workHours: number | null;
  note: string | null;
}

export interface AttendanceStats {
  totalDays: number;
  presentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  absentDays: number;
  workHours: number;
  onTimeRate: number;
}

// US-006: Attendance check-in/check-out with GPS
// BR-006: Attendance requires geo-time proof - Validate and record check-in with GPS
export async function checkIn(
  userId: string,
  data: {
    taskId?: string;
    location: { lat: number; lng: number; accuracy?: number };
    source?: string;
  }
): Promise<AttendanceRecord | null> {
  const profile = await getMilitiaProfileByUserId(userId);
  if (!profile) return null;

  const today = new Date().toISOString().split('T')[0];

  // Check if already checked in today
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM attendance_records WHERE militia_id = $1 AND work_date = $2`,
    [profile.id, today]
  );

  if (existing) {
    throw new Error('Bạn đã điểm danh hôm nay rồi');
  }

  // Determine status based on time (e.g., late if after 8:00)
  const now = new Date();
  const checkinTime = now.getHours() * 60 + now.getMinutes();
  const isLate = checkinTime > 8 * 60 + 30; // Late after 8:30

  const record = await queryOne<AttendanceRecord>(
    `INSERT INTO attendance_records (
      militia_id, task_id, work_date, checkin_at, checkin_lat, checkin_lng, 
      checkin_accuracy, source, status
    ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      profile.id,
      data.taskId || null,
      today,
      data.location.lat,
      data.location.lng,
      data.location.accuracy || null,
      data.source || 'mobile',
      isLate ? 'late' : 'checked_in',
    ]
  );

  return record;
}

// US-006: Attendance check-in/check-out with GPS
// BR-006: Record check-out with GPS and calculate work hours
export async function checkOut(
  userId: string,
  data?: {
    location?: { lat: number; lng: number; accuracy?: number };
  }
): Promise<AttendanceRecord | null> {
  const profile = await getMilitiaProfileByUserId(userId);
  if (!profile) return null;

  const today = new Date().toISOString().split('T')[0];

  const record = await queryOne<{ id: string; checkin_at: Date }>(
    `SELECT id, checkin_at FROM attendance_records 
     WHERE militia_id = $1 AND work_date = $2 AND checkout_at IS NULL`,
    [profile.id, today]
  );

  if (!record) {
    throw new Error('Không tìm thấy bản ghi điểm danh');
  }

  const now = new Date();
  const checkinAt = new Date(record.checkin_at);
  const workHours = (now.getTime() - checkinAt.getTime()) / (1000 * 60 * 60);

  // Determine if early leave (before 17:00)
  const checkoutTime = now.getHours() * 60 + now.getMinutes();
  const isEarlyLeave = checkoutTime < 17 * 60;

  const updated = await queryOne<AttendanceRecord>(
    `UPDATE attendance_records 
     SET checkout_at = NOW(), checkout_lat = $1, checkout_lng = $2, 
         checkout_accuracy = $3, work_hours = $4, status = $5, updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [
      data?.location?.lat || null,
      data?.location?.lng || null,
      data?.location?.accuracy || null,
      workHours,
      isEarlyLeave ? 'early_leave' : 'checked_out',
      record.id,
    ]
  );

  return updated;
}

export async function getTodayAttendance(userId: string): Promise<AttendanceRecord | null> {
  const profile = await getMilitiaProfileByUserId(userId);
  if (!profile) return null;

  const today = new Date().toISOString().split('T')[0];

  return queryOne<AttendanceRecord>(
    `SELECT * FROM attendance_records WHERE militia_id = $1 AND work_date = $2`,
    [profile.id, today]
  );
}

export async function getAttendanceHistory(
  userId: string,
  options?: { from?: Date; to?: Date; page?: number; limit?: number }
): Promise<{ records: AttendanceRecord[]; total: number }> {
  const profile = await getMilitiaProfileByUserId(userId);
  if (!profile) return { records: [], total: 0 };

  const { from, to, page = 1, limit = 30 } = options || {};
  const offset = (page - 1) * limit;

  const conditions: string[] = ['militia_id = $1'];
  const values: unknown[] = [profile.id];
  let paramCount = 2;

  if (from) {
    conditions.push(`work_date >= $${paramCount++}`);
    values.push(from);
  }
  if (to) {
    conditions.push(`work_date <= $${paramCount++}`);
    values.push(to);
  }

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM attendance_records WHERE ${conditions.join(' AND ')}`,
    values
  );
  const total = parseInt(countResult?.count || '0');

  const records = await queryMany<AttendanceRecord>(
    `SELECT * FROM attendance_records 
     WHERE ${conditions.join(' AND ')}
     ORDER BY work_date DESC
     LIMIT $${paramCount++} OFFSET $${paramCount++}`,
    [...values, limit, offset]
  );

  return { records, total };
}

/** Count working days (Mon–Sat) up to lastDay in the given year/month. */
function countWorkingDays(year: number, month: number, lastDay: number): number {
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) count++;
  }
  return count;
}

/** Return empty AttendanceStats for users without a profile. */
function emptyStats(): AttendanceStats {
  return { totalDays: 0, presentDays: 0, lateDays: 0, earlyLeaveDays: 0, absentDays: 0, workHours: 0, onTimeRate: 0 };
}

export async function getAttendanceStats(
  userId: string,
  year?: number,
  month?: number
): Promise<AttendanceStats> {
  const profile = await getMilitiaProfileByUserId(userId);
  if (!profile) return emptyStats();

  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1;

  const stats = await queryOne<{
    total_days: string;
    present_days: string;
    late_days: string;
    early_leave_days: string;
    work_hours: string;
  }>(
    `SELECT 
      COUNT(*)::text as total_days,
      COUNT(*) FILTER (WHERE status IN ('checked_in', 'checked_out', 'late', 'early_leave'))::text as present_days,
      COUNT(*) FILTER (WHERE status = 'late')::text as late_days,
      COUNT(*) FILTER (WHERE status = 'early_leave')::text as early_leave_days,
      COALESCE(SUM(work_hours), 0)::text as work_hours
    FROM attendance_records 
    WHERE militia_id = $1 
    AND EXTRACT(YEAR FROM work_date) = $2 
    AND EXTRACT(MONTH FROM work_date) = $3`,
    [profile.id, targetYear, targetMonth]
  );

  const presentDays = parseInt(stats?.present_days || '0');
  const lateDays = parseInt(stats?.late_days || '0');
  const onTimeRate = presentDays > 0 ? ((presentDays - lateDays) / presentDays) * 100 : 0;

  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  const isCurrentMonth = targetYear === now.getFullYear() && targetMonth === now.getMonth() + 1;
  const lastDay = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
  const absentDays = Math.max(0, countWorkingDays(targetYear, targetMonth, lastDay) - presentDays);

  return {
    totalDays: parseInt(stats?.total_days || '0'),
    presentDays,
    lateDays,
    earlyLeaveDays: parseInt(stats?.early_leave_days || '0'),
    absentDays,
    workHours: parseFloat(stats?.work_hours || '0'),
    onTimeRate,
  };
}
