import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import type { JwtPayload } from '../auth/auth.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { ExcelExportService } from '../common/services/excel-export.service';

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

export interface TrainingComplianceRow {
  militiaId: string;
  militiaName: string;
  militiaCode: string;
  unitCode: string;
  military: number;
  political: number;
  fire: number;
  firstAid: number;
  other: number;
  totalDays: number;
  requiredDays: 15;
  status: 'ĐẠT' | 'KHÔNG ĐẠT' | 'CẢNH BÁO';
}

/** Roles that can create / manage training records on behalf of others */
const MANAGER_ROLES = ['system_admin', 'police_ward', 'police_area'];
/** Roles that can see across units */
const WIDE_ROLES = new Set(['system_admin', 'police_ward']);

@Injectable()
export class TrainingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly excelExportService: ExcelExportService,
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

  // ── getComplianceReport ──────────────────────────────────────────────────

  async getComplianceReport(
    user: JwtPayload,
    year: number,
    unitCode?: string,
  ): Promise<TrainingComplianceRow[]> {
    const effectiveUnit: string | null = WIDE_ROLES.has(user.role)
      ? (unitCode ?? null)
      : (user.unitScope ?? null);

    const rows = await this.dataSource.query<
      {
        militiaId: string;
        militiaName: string;
        militiaCode: string;
        unitCode: string;
        military: string;
        political: string;
        fire: string;
        firstAid: string;
        other: string;
        totalDays: string;
      }[]
    >(
      `SELECT
         mp.id                     AS "militiaId",
         mp.full_name              AS "militiaName",
         mp.militia_code           AS "militiaCode",
         u.code                    AS "unitCode",
         COALESCE(SUM(tr.total_days) FILTER (WHERE tr.training_type = 'military'),   0) AS "military",
         COALESCE(SUM(tr.total_days) FILTER (WHERE tr.training_type = 'political'),  0) AS "political",
         COALESCE(SUM(tr.total_days) FILTER (WHERE tr.training_type = 'fire'),       0) AS "fire",
         COALESCE(SUM(tr.total_days) FILTER (WHERE tr.training_type = 'first_aid'),  0) AS "firstAid",
         COALESCE(SUM(tr.total_days) FILTER (
           WHERE tr.training_type NOT IN ('military', 'political', 'fire', 'first_aid')
         ), 0)                                                                           AS "other",
         COALESCE(SUM(tr.total_days), 0)                                                AS "totalDays"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       LEFT JOIN training_records tr
         ON tr.militia_id = mp.id
        AND EXTRACT(YEAR FROM tr.from_date)::int = $1
       WHERE mp.status = 'active'
         AND ($2::text IS NULL OR u.code = $2)
       GROUP BY mp.id, mp.full_name, mp.militia_code, u.code
       ORDER BY mp.full_name`,
      [year, effectiveUnit],
    );

    return rows.map((r) => {
      const totalDays = parseFloat(r.totalDays);
      let status: 'ĐẠT' | 'KHÔNG ĐẠT' | 'CẢNH BÁO';
      if (totalDays >= 15) status = 'ĐẠT';
      else if (totalDays >= 10) status = 'CẢNH BÁO';
      else status = 'KHÔNG ĐẠT';

      return {
        militiaId: r.militiaId,
        militiaName: r.militiaName,
        militiaCode: r.militiaCode,
        unitCode: r.unitCode,
        military: parseFloat(r.military),
        political: parseFloat(r.political),
        fire: parseFloat(r.fire),
        firstAid: parseFloat(r.firstAid),
        other: parseFloat(r.other),
        totalDays,
        requiredDays: 15 as const,
        status,
      };
    });
  }

  // ── exportComplianceReport ───────────────────────────────────────────────

  async exportComplianceReport(
    user: JwtPayload,
    year: number,
    unitCode?: string,
  ): Promise<ExcelJS.Workbook> {
    const data = await this.getComplianceReport(user, year, unitCode);
    const wb = this.excelExportService.createWorkbook();

    // Sheet 1 — main compliance table
    const sheet1 = wb.addWorksheet('Tuân thủ huấn luyện');
    const startRow = this.excelExportService.addGovernmentHeader(sheet1, {
      agency: 'BAN CHỈ HUY QUÂN SỰ',
      reportTitle: `BÁO CÁO TUÂN THỦ HUẤN LUYỆN NĂM ${year}`,
      reportDate: new Date(),
    });

    const columns = [
      { header: 'STT',       key: 'stt',         width: 6,  type: 'number' as const },
      { header: 'Họ tên',    key: 'militiaName',  width: 24 },
      { header: 'Mã DQTV',  key: 'militiaCode',  width: 14 },
      { header: 'Đơn vị',   key: 'unitCode',     width: 14 },
      { header: 'Quân sự',  key: 'military',     width: 10, type: 'number' as const },
      { header: 'Chính trị',key: 'political',    width: 10, type: 'number' as const },
      { header: 'PCCC',     key: 'fire',         width: 10, type: 'number' as const },
      { header: 'Sơ cứu',   key: 'firstAid',     width: 10, type: 'number' as const },
      { header: 'Khác',     key: 'other',        width: 10, type: 'number' as const },
      { header: 'Tổng',     key: 'totalDays',    width: 10, type: 'number' as const },
      { header: 'Yêu cầu',  key: 'requiredDays', width: 10, type: 'number' as const },
      {
        header: 'Kết quả',
        key: 'status',
        width: 14,
        type: 'status' as const,
        statusColors: { 'ĐẠT': 'CCFFCC', 'KHÔNG ĐẠT': 'FFCCCC', 'CẢNH BÁO': 'FFF3CD' },
      },
    ];

    const tableRows = data.map((r, i) => ({ ...r, stt: i + 1 }));
    this.excelExportService.addStyledTable(sheet1, startRow, columns, tableRows);

    const afterData = startRow + data.length;
    this.excelExportService.addDocumentHash(
      sheet1,
      `training-compliance-${year}-${data.length}`,
    );
    this.excelExportService.addSignatureBlock(sheet1, afterData + 2, {
      position: 'Chỉ huy trưởng',
    });

    // Sheet 2 — unit summary
    const sheet2 = wb.addWorksheet('Tóm tắt đơn vị');
    const passCount = data.filter((r) => r.status === 'ĐẠT').length;
    const warnCount = data.filter((r) => r.status === 'CẢNH BÁO').length;
    const failCount = data.filter((r) => r.status === 'KHÔNG ĐẠT').length;

    this.excelExportService.addSummaryStatsTable(sheet2, 0, `Tóm tắt tuân thủ huấn luyện năm ${year}`, [
      { label: 'Tổng số DQTV', value: data.length },
      { label: 'Đạt yêu cầu (≥15 ngày)', value: passCount, highlight: false },
      { label: 'Cảnh báo (10-14 ngày)', value: warnCount, highlight: warnCount > 0 },
      { label: 'Không đạt (<10 ngày)', value: failCount, highlight: failCount > 0 },
      {
        label: 'Tỷ lệ tuân thủ',
        value: data.length > 0 ? `${Math.round((passCount / data.length) * 100)}%` : '0%',
      },
    ]);

    // Legal references sheet
    this.excelExportService.addLegalReferencesSheet(wb, [
      'TT 69/2020/TT-BQP — Thông tư hướng dẫn công tác dân quân tự vệ',
      'NĐ 72/2020/NĐ-CP — Quy định chi tiết một số điều của Luật Dân quân tự vệ',
      'NĐ 30/2020/NĐ-CP — Công tác văn thư',
      'Luật Dân quân tự vệ 2019 — Điều 22: Huấn luyện quân sự',
    ]);

    return wb;
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
