import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/auth.service';
import { CreateTrainingDto } from './dto/create-training.dto';

export interface TrainingRecord {
  id: string;
  militiaId: string;
  militiaName: string;
  militiaCode: string;
  trainingType: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  location: string | null;
  instructor: string | null;
  result: string;
  certificateNo: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface TrainingReport {
  militiaId: string;
  militiaName: string;
  militiaCode: string;
  year: number;
  totalDays: number;
  requiredDays: 15;
  meetsRequirement: boolean;
}

/** Roles that can create / manage training records on behalf of others */
const MANAGER_ROLES = ['system_admin', 'police_ward', 'police_area'];

@Injectable()
export class TrainingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ── listRecords ─────────────────────────────────────────────────────────

  async listRecords(
    user: JwtPayload,
    params: {
      militiaId?: string;
      year?: number;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ data: TrainingRecord[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const offset = (page - 1) * limit;

    const yearFilter = params.year ?? null;
    const militiaIdFilter = params.militiaId ?? null;

    // Determine access scope
    let unitCodeFilter: string | null = null;
    let userIdFilter: string | null = null;

    if (user.role === 'system_admin') {
      // no extra filter — sees everything
    } else if (user.role === 'police_ward' || user.role === 'police_area') {
      unitCodeFilter = user.unitScope;
    } else {
      // dqtv / others — only own records via militia_profiles.user_id
      userIdFilter = user.sub;
    }

    const baseWhere = `
      FROM training_records tr
      JOIN militia_profiles mp ON mp.id = tr.militia_id
      JOIN units u ON u.id = mp.unit_id
      WHERE ($1::uuid IS NULL OR tr.militia_id = $1::uuid)
        AND ($2::int IS NULL OR EXTRACT(YEAR FROM tr.from_date)::int = $2)
        AND ($3::text IS NULL OR u.code = $3)
        AND ($4::uuid IS NULL OR mp.user_id = $4::uuid)
    `;

    const countResult = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count ${baseWhere}`,
      [militiaIdFilter, yearFilter, unitCodeFilter, userIdFilter],
    );
    const total = parseInt(countResult[0]?.count ?? '0', 10);

    const data = await this.dataSource.query<TrainingRecord[]>(
      `SELECT
         tr.id,
         tr.militia_id       AS "militiaId",
         mp.full_name        AS "militiaName",
         mp.militia_code     AS "militiaCode",
         tr.training_type    AS "trainingType",
         tr.from_date        AS "fromDate",
         tr.to_date          AS "toDate",
         tr.total_days       AS "totalDays",
         tr.location,
         tr.instructor,
         tr.result,
         tr.certificate_no   AS "certificateNo",
         tr.notes,
         tr.created_at       AS "createdAt"
       ${baseWhere}
       ORDER BY tr.from_date DESC, mp.full_name
       LIMIT $5 OFFSET $6`,
      [militiaIdFilter, yearFilter, unitCodeFilter, userIdFilter, limit, offset],
    );

    return { data, total, page, limit };
  }

  // ── createRecord ─────────────────────────────────────────────────────────

  async createRecord(user: JwtPayload, dto: CreateTrainingDto): Promise<TrainingRecord> {
    if (!MANAGER_ROLES.includes(user.role)) {
      throw new ForbiddenException('insufficient_role_to_create_training');
    }

    // Validate militia exists
    const militiaRows = await this.dataSource.query<
      { id: string; fullName: string; militiaCode: string }[]
    >(
      `SELECT id, full_name AS "fullName", militia_code AS "militiaCode"
       FROM militia_profiles WHERE id = $1::uuid LIMIT 1`,
      [dto.militiaId],
    );
    if (!militiaRows.length) {
      throw new NotFoundException('militia_not_found');
    }
    const militia = militiaRows[0];

    const inserted = await this.dataSource.query<{ id: string; created_at: Date }[]>(
      `INSERT INTO training_records
         (militia_id, training_type, from_date, to_date, total_days,
          location, instructor, result, certificate_no, notes, created_by)
       VALUES
         ($1::uuid, $2, $3::date, $4::date, $5,
          $6, $7, $8, $9, $10, $11::uuid)
       RETURNING id, created_at`,
      [
        dto.militiaId,
        dto.trainingType,
        dto.fromDate,
        dto.toDate,
        dto.totalDays,
        dto.location ?? null,
        dto.instructor ?? null,
        dto.result ?? 'pass',
        dto.certificateNo ?? null,
        dto.notes ?? null,
        user.sub,
      ],
    );

    return {
      id: inserted[0].id,
      militiaId: dto.militiaId,
      militiaName: militia.fullName,
      militiaCode: militia.militiaCode,
      trainingType: dto.trainingType,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      totalDays: dto.totalDays,
      location: dto.location ?? null,
      instructor: dto.instructor ?? null,
      result: dto.result ?? 'pass',
      certificateNo: dto.certificateNo ?? null,
      notes: dto.notes ?? null,
      createdAt: inserted[0].created_at,
    };
  }

  // ── getRecord ────────────────────────────────────────────────────────────

  async getRecord(user: JwtPayload, id: string): Promise<TrainingRecord> {
    const rows = await this.dataSource.query<TrainingRecord[]>(
      `SELECT
         tr.id,
         tr.militia_id       AS "militiaId",
         mp.full_name        AS "militiaName",
         mp.militia_code     AS "militiaCode",
         tr.training_type    AS "trainingType",
         tr.from_date        AS "fromDate",
         tr.to_date          AS "toDate",
         tr.total_days       AS "totalDays",
         tr.location,
         tr.instructor,
         tr.result,
         tr.certificate_no   AS "certificateNo",
         tr.notes,
         tr.created_at       AS "createdAt"
       FROM training_records tr
       JOIN militia_profiles mp ON mp.id = tr.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE tr.id = $1::uuid
         AND ($2::text IS NULL OR u.code = $2)
         AND ($3::uuid IS NULL OR mp.user_id = $3::uuid)
       LIMIT 1`,
      [
        id,
        // police_ward / police_area: scope to unit; system_admin: no filter
        MANAGER_ROLES.includes(user.role) && user.role !== 'system_admin'
          ? user.unitScope
          : user.role === 'system_admin'
          ? null
          : null,
        // dqtv / others: filter to own militia
        !MANAGER_ROLES.includes(user.role) ? user.sub : null,
      ],
    );

    if (!rows.length) {
      throw new NotFoundException('training_record_not_found');
    }
    return rows[0];
  }

  // ── updateRecord ─────────────────────────────────────────────────────────

  async updateRecord(
    user: JwtPayload,
    id: string,
    dto: Partial<CreateTrainingDto>,
  ): Promise<TrainingRecord> {
    // Fetch existing record (no scope restriction here — check owner/admin after)
    const existing = await this.dataSource.query<
      { id: string; createdBy: string }[]
    >(
      `SELECT id, created_by AS "createdBy" FROM training_records WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    if (!existing.length) {
      throw new NotFoundException('training_record_not_found');
    }

    // Only creator or system_admin can update
    if (user.role !== 'system_admin' && existing[0].createdBy !== user.sub) {
      throw new ForbiddenException('insufficient_permission_to_update');
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      militiaId: 'militia_id',
      trainingType: 'training_type',
      fromDate: 'from_date',
      toDate: 'to_date',
      totalDays: 'total_days',
      location: 'location',
      instructor: 'instructor',
      result: 'result',
      certificateNo: 'certificate_no',
      notes: 'notes',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in dto && (dto as Record<string, unknown>)[key] !== undefined) {
        setClauses.push(`${col} = $${paramIdx++}`);
        values.push((dto as Record<string, unknown>)[key]);
      }
    }

    if (setClauses.length === 0) {
      // Nothing to update — return current record
      return this.getRecord(user, id);
    }

    values.push(id);
    await this.dataSource.query(
      `UPDATE training_records SET ${setClauses.join(', ')} WHERE id = $${paramIdx}::uuid`,
      values,
    );

    return this.getRecord(user, id);
  }

  // ── deleteRecord ─────────────────────────────────────────────────────────

  async deleteRecord(user: JwtPayload, id: string): Promise<void> {
    const existing = await this.dataSource.query<
      { id: string; createdBy: string }[]
    >(
      `SELECT id, created_by AS "createdBy" FROM training_records WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    if (!existing.length) {
      throw new NotFoundException('training_record_not_found');
    }

    // Only creator or system_admin can delete
    if (user.role !== 'system_admin' && existing[0].createdBy !== user.sub) {
      throw new ForbiddenException('insufficient_permission_to_delete');
    }

    await this.dataSource.query(
      `DELETE FROM training_records WHERE id = $1::uuid`,
      [id],
    );
  }

  // ── getReport ────────────────────────────────────────────────────────────

  async getReport(
    user: JwtPayload,
    params: { year?: number; unitCode?: string } = {},
  ): Promise<TrainingReport[]> {
    const year = params.year ?? new Date().getFullYear();

    // Determine unit code filter based on role
    let unitCodeFilter: string | null = null;
    if (user.role === 'system_admin') {
      unitCodeFilter = params.unitCode ?? null;
    } else if (user.role === 'police_ward' || user.role === 'police_area') {
      // Scoped to their own unit; allow narrowing further by unitCode param
      unitCodeFilter = params.unitCode ?? user.unitScope;
    } else {
      // dqtv / others: only their own militia's unit
      unitCodeFilter = user.unitScope;
    }

    const rows = await this.dataSource.query<
      {
        militiaId: string;
        militiaName: string;
        militiaCode: string;
        totalDays: string;
      }[]
    >(
      `SELECT
         mp.id           AS "militiaId",
         mp.full_name    AS "militiaName",
         mp.militia_code AS "militiaCode",
         COALESCE(SUM(tr.total_days), 0) AS "totalDays"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       LEFT JOIN training_records tr
         ON tr.militia_id = mp.id
        AND EXTRACT(YEAR FROM tr.from_date)::int = $1
       WHERE mp.status = 'active'
         AND ($2::text IS NULL OR u.code = $2)
         AND ($3::uuid IS NULL OR mp.user_id = $3::uuid)
       GROUP BY mp.id, mp.full_name, mp.militia_code
       ORDER BY mp.full_name`,
      [
        year,
        unitCodeFilter,
        !MANAGER_ROLES.includes(user.role) ? user.sub : null,
      ],
    );

    const REQUIRED_DAYS = 15 as const;

    return rows.map((row) => {
      const totalDays = parseFloat(row.totalDays);
      return {
        militiaId: row.militiaId,
        militiaName: row.militiaName,
        militiaCode: row.militiaCode,
        year,
        totalDays,
        requiredDays: REQUIRED_DAYS,
        meetsRequirement: totalDays >= REQUIRED_DAYS,
      };
    });
  }
}
