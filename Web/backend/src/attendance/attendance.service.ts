// US-SS-07: AttendanceService — record attendance for militia
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CheckInDto {
  location?: { lat?: number; lng?: number; accuracy?: number };
  source?: string;
}

export interface CheckOutDto {
  location?: { lat?: number; lng?: number; accuracy?: number };
}

export interface TodayStatusResult {
  status: string;
  checkinAt: Date | null;
  checkoutAt: Date | null;
  workDate: string;
}

export interface AttendanceStats {
  totalDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  currentMonth: number;
  currentYear: number;
}

export interface CreateAttendanceDto {
  militiaId: string;
  workDate: string; // YYYY-MM-DD
  status: 'present' | 'absent' | 'late' | 'half_day';
  checkinAt?: string;
  checkoutAt?: string;
  note?: string;
}

export interface AttendanceRecordView {
  id: string;
  militiaId: string;
  militiaName: string;
  militiaCode: string;
  workDate: string;
  status: string;
  checkinAt: Date | null;
  checkoutAt: Date | null;
  workHours: number | null;
  source: string;
  createdAt: Date;
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // US-SS-07 AC-1: Record attendance for militia member
  async record(dto: CreateAttendanceDto): Promise<AttendanceRecordView> {
    // Validate militia exists
    const militiaRows = await this.dataSource.query<
      { id: string; fullName: string; militiaCode: string }[]
    >(
      `SELECT id, full_name AS "fullName", militia_code AS "militiaCode"
       FROM militia_profiles WHERE id = $1 LIMIT 1`,
      [dto.militiaId],
    );
    if (!militiaRows.length) {
      throw new NotFoundException('militia_not_found');
    }
    const militia = militiaRows[0];

    // US-SS-07 AC-2: Guard against duplicate attendance for same date
    const dupRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM attendance_records WHERE militia_id = $1 AND work_date = $2::date LIMIT 1`,
      [dto.militiaId, dto.workDate],
    );
    if (dupRows.length) {
      throw new ConflictException('attendance_already_recorded');
    }

    // Map status to DB status values
    const dbStatus = this.mapStatus(dto.status);

    const inserted = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO attendance_records
         (militia_id, work_date, status, checkin_at, checkout_at, source, note)
       VALUES ($1::uuid, $2::date, $3, $4::timestamptz, $5::timestamptz, 'web', $6)
       RETURNING id`,
      [
        dto.militiaId,
        dto.workDate,
        dbStatus,
        dto.checkinAt ?? null,
        dto.checkoutAt ?? null,
        dto.note ?? null,
      ],
    );

    return {
      id: inserted[0].id,
      militiaId: militia.id,
      militiaName: militia.fullName,
      militiaCode: militia.militiaCode,
      workDate: dto.workDate,
      status: dbStatus,
      checkinAt: dto.checkinAt ? new Date(dto.checkinAt) : null,
      checkoutAt: dto.checkoutAt ? new Date(dto.checkoutAt) : null,
      workHours: null,
      source: 'web',
      createdAt: new Date(),
    };
  }

  // List attendance records for a militia member
  async list(
    params: {
      militiaId?: string;
      workDate?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<AttendanceRecordView[]> {
    const limit = Math.min(params.limit ?? 20, 100);
    const offset = ((params.page ?? 1) - 1) * limit;

    return this.dataSource.query<AttendanceRecordView[]>(
      `SELECT
         ar.id,
         ar.militia_id   AS "militiaId",
         mp.full_name    AS "militiaName",
         mp.militia_code AS "militiaCode",
         ar.work_date    AS "workDate",
         ar.status,
         ar.checkin_at   AS "checkinAt",
         ar.checkout_at  AS "checkoutAt",
         ar.work_hours   AS "workHours",
         ar.source,
         ar.created_at   AS "createdAt"
       FROM attendance_records ar
       JOIN militia_profiles mp ON mp.id = ar.militia_id
       WHERE ($1::uuid IS NULL OR ar.militia_id = $1::uuid)
         AND ($2::date IS NULL OR ar.work_date = $2::date)
       ORDER BY ar.work_date DESC, mp.full_name
       LIMIT $3 OFFSET $4`,
      [params.militiaId ?? null, params.workDate ?? null, limit, offset],
    );
  }

  // Paginated list — pagination contract: {data, total, page, limit}
  // Supports single date filter (date=) or range filter (from= + to=).
  // Fallback when no date/range provided: returns today's records (backward compat).
  async listAttendancePaginated(
    user: { role: string; unitScope: string | null },
    params: { date?: string; from?: string; to?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: AttendanceRecordView[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const offset = (page - 1) * limit;

    const unitFilter = user.role === 'system_admin' ? null : user.unitScope;

    // Resolve date filter: explicit date > range > today fallback
    const singleDate = params.date ?? null;
    const fromDate = params.from ?? null;
    const toDate = params.to ?? null;
    // If no filter at all, fall back to today
    const effectiveSingleDate =
      singleDate ?? (!fromDate && !toDate ? new Date().toISOString().slice(0, 10) : null);

    const countResult = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) as count FROM attendance_records ar
       JOIN militia_profiles mp ON mp.id = ar.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE ($1::date IS NULL OR ar.work_date = $1::date)
         AND ($2::date IS NULL OR ar.work_date >= $2::date)
         AND ($3::date IS NULL OR ar.work_date <= $3::date)
         AND ($4::text IS NULL OR u.code = $4)`,
      [effectiveSingleDate, fromDate, toDate, unitFilter],
    );
    const total = parseInt(countResult[0]?.count ?? '0', 10);

    const data = await this.dataSource.query<AttendanceRecordView[]>(
      `SELECT ar.id, ar.militia_id AS "militiaId", mp.full_name AS "militiaName",
              mp.militia_code AS "militiaCode", ar.work_date AS "workDate",
              ar.status, ar.checkin_at AS "checkinAt", ar.checkout_at AS "checkoutAt",
              ar.work_hours AS "workHours", ar.source, ar.created_at AS "createdAt"
       FROM attendance_records ar
       JOIN militia_profiles mp ON mp.id = ar.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE ($1::date IS NULL OR ar.work_date = $1::date)
         AND ($2::date IS NULL OR ar.work_date >= $2::date)
         AND ($3::date IS NULL OR ar.work_date <= $3::date)
         AND ($4::text IS NULL OR u.code = $4)
       ORDER BY ar.work_date ASC, mp.full_name
       LIMIT $5 OFFSET $6`,
      [effectiveSingleDate, fromDate, toDate, unitFilter, limit, offset],
    );

    return { data, total, page, limit };
  }

  // Mobile: check-in for current user
  async checkIn(userId: string, dto: CheckInDto): Promise<{
    id: string; militiaId: string; status: string; workDate: string; checkinAt: Date;
  }> {
    const militiaRows = await this.dataSource.query<
      { id: string; fullName: string; militiaCode: string }[]
    >(
      `SELECT id, full_name AS "fullName", militia_code AS "militiaCode"
       FROM militia_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!militiaRows.length) throw new NotFoundException('militia_not_found');
    const militia = militiaRows[0];

    const today = new Date().toISOString().slice(0, 10);
    const dupRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM attendance_records WHERE militia_id = $1 AND work_date = $2::date LIMIT 1`,
      [militia.id, today],
    );
    if (dupRows.length) throw new ConflictException('already_checked_in');

    const source = dto.source ?? 'mobile';
    const inserted = await this.dataSource.query<{ id: string; checkin_at: Date }[]>(
      `INSERT INTO attendance_records (militia_id, work_date, status, checkin_at, source)
       VALUES ($1::uuid, $2::date, 'checked_in', NOW(), $3)
       RETURNING id, checkin_at`,
      [militia.id, today, source],
    );

    return {
      id: inserted[0].id,
      militiaId: militia.id,
      status: 'checked_in',
      workDate: today,
      checkinAt: inserted[0].checkin_at,
    };
  }

  // Mobile: check-out for current user
  async checkOut(userId: string, _dto: CheckOutDto): Promise<{
    id: string; militiaId: string; status: string; checkoutAt: Date;
  }> {
    const militiaRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM militia_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!militiaRows.length) throw new NotFoundException('militia_not_found');
    const militiaId = militiaRows[0].id;

    const today = new Date().toISOString().slice(0, 10);
    const updated = await this.dataSource.query<{ id: string; checkout_at: Date }[]>(
      `UPDATE attendance_records SET checkout_at = NOW()
       WHERE militia_id = $1 AND work_date = $2::date AND checkout_at IS NULL
       RETURNING id, checkout_at`,
      [militiaId, today],
    );
    if (!updated.length) throw new NotFoundException('no_open_checkin');

    return {
      id: updated[0].id,
      militiaId,
      status: 'checked_out',
      checkoutAt: updated[0].checkout_at,
    };
  }

  // Mobile: get today's status for current user
  async getTodayStatus(userId: string): Promise<TodayStatusResult | null> {
    const militiaRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM militia_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!militiaRows.length) return null;
    const militiaId = militiaRows[0].id;

    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.dataSource.query<{
      status: string; checkin_at: Date | null; checkout_at: Date | null; work_date: string;
    }[]>(
      `SELECT status, checkin_at, checkout_at, work_date::text
       FROM attendance_records WHERE militia_id = $1 AND work_date = $2::date LIMIT 1`,
      [militiaId, today],
    );
    if (!rows.length) return null;
    return {
      status: rows[0].status,
      checkinAt: rows[0].checkin_at,
      checkoutAt: rows[0].checkout_at,
      workDate: rows[0].work_date,
    };
  }

  // Mobile: get monthly stats for current user
  async getStats(userId: string): Promise<AttendanceStats> {
    const militiaRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM militia_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!militiaRows.length) throw new NotFoundException('militia_not_found');
    const militiaId = militiaRows[0].id;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const rows = await this.dataSource.query<{
      totalDays: string; presentDays: string; lateDays: string; absentDays: string;
    }[]>(
      `SELECT
         COUNT(*) AS "totalDays",
         COUNT(*) FILTER (WHERE status IN ('checked_in', 'present')) AS "presentDays",
         COUNT(*) FILTER (WHERE status = 'late') AS "lateDays",
         COUNT(*) FILTER (WHERE status = 'absent') AS "absentDays"
       FROM attendance_records
       WHERE militia_id = $1
         AND EXTRACT(MONTH FROM work_date) = $2
         AND EXTRACT(YEAR FROM work_date) = $3`,
      [militiaId, currentMonth, currentYear],
    );

    const r = rows[0];
    return {
      totalDays: parseInt(r.totalDays, 10),
      presentDays: parseInt(r.presentDays, 10),
      lateDays: parseInt(r.lateDays, 10),
      absentDays: parseInt(r.absentDays, 10),
      currentMonth,
      currentYear,
    };
  }

  private mapStatus(status: string): string {
    switch (status) {
      case 'present':
        return 'checked_in';
      case 'absent':
        return 'absent';
      case 'late':
        return 'late';
      case 'half_day':
        return 'early_leave';
      default:
        return 'checked_in';
    }
  }
}
