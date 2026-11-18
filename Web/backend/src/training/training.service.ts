import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import type { JwtPayload } from '../auth/auth.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import type { UpdateTrainingDto } from './dto/update-training.dto';
import { ExcelExportService } from '../common/services/excel-export.service';
import { businessDate } from '../common/time/business-date';
import { effectiveUnit, holdsAnyRole } from '../common/access/unit-scope';
import { queryRows } from '../database/query-rows';

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
  // Set when session attendance created the record; it then changes only with that attendance
  sessionId: string | null;
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
const MANAGER_ROLE_SET: ReadonlySet<string> = new Set(MANAGER_ROLES);
const SYSTEM_ADMIN: ReadonlySet<string> = new Set(['system_admin']);

@Injectable()
export class TrainingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly excelExportService: ExcelExportService,
  ) {}

  // A record a manager may change: its member belongs to their effective unit. Any other
  // record answers exactly like a missing one.
  private async findManagedRecord(
    id: string,
    unit: string | null,
  ): Promise<{
    id: string;
    createdBy: string;
    militiaId: string;
    sessionId: string | null;
  }> {
    const rows = await this.dataSource.query<
      {
        id: string;
        createdBy: string;
        militiaId: string;
        sessionId: string | null;
      }[]
    >(
      `SELECT tr.id, tr.created_by AS "createdBy", tr.militia_id AS "militiaId",
              tr.session_id AS "sessionId"
       FROM training_records tr
       JOIN militia_profiles mp ON mp.id = tr.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE tr.id = $1::uuid AND ($2::text IS NULL OR u.code = $2)
       LIMIT 1`,
      [id, unit],
    );
    if (!rows.length) {
      throw new NotFoundException('training_record_not_found');
    }
    return rows[0];
  }

  // Records are changed by whoever created them, or by a system administrator
  private assertCreatorOrAdmin(
    user: JwtPayload,
    createdBy: string,
    code: string,
  ): void {
    if (!holdsAnyRole(user, SYSTEM_ADMIN) && createdBy !== user.sub) {
      throw new ForbiddenException(code);
    }
  }

  // A record created by session attendance changes only through that attendance
  private assertNotSessionRecord(record: { sessionId?: string | null }): void {
    if (record.sessionId) {
      throw new ConflictException('training_record_managed_by_session');
    }
  }

  // ── listRecords ─────────────────────────────────────────────────────────

  async listRecords(
    user: JwtPayload,
    params: {
      militiaId?: string;
      year?: number;
      page?: number;
      limit?: number;
      unitCode?: string;
    } = {},
  ): Promise<{
    data: TrainingRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const offset = (page - 1) * limit;

    const yearFilter = params.year ?? null;
    const militiaIdFilter = params.militiaId ?? null;

    // Determine access scope
    let unitCodeFilter: string | null = null;
    let userIdFilter: string | null = null;

    if (holdsAnyRole(user, MANAGER_ROLE_SET)) {
      // Managers see their effective unit (the whole ward for wide roles)
      unitCodeFilter = effectiveUnit(user, params.unitCode);
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
         tr.session_id       AS "sessionId",
         tr.created_at       AS "createdAt"
       ${baseWhere}
       ORDER BY tr.from_date DESC, mp.full_name
       LIMIT $5 OFFSET $6`,
      [
        militiaIdFilter,
        yearFilter,
        unitCodeFilter,
        userIdFilter,
        limit,
        offset,
      ],
    );

    return { data, total, page, limit };
  }

  // ── createRecord ─────────────────────────────────────────────────────────

  async createRecord(
    user: JwtPayload,
    dto: CreateTrainingDto,
  ): Promise<TrainingRecord> {
    if (!holdsAnyRole(user, MANAGER_ROLE_SET)) {
      throw new ForbiddenException('insufficient_role_to_create_training');
    }

    // The member must belong to the caller's effective unit; others answer as missing
    const militiaRows = await this.dataSource.query<
      { id: string; fullName: string; militiaCode: string }[]
    >(
      `SELECT mp.id, mp.full_name AS "fullName", mp.militia_code AS "militiaCode"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.id = $1::uuid AND ($2::text IS NULL OR u.code = $2)
       LIMIT 1`,
      [dto.militiaId, effectiveUnit(user)],
    );
    if (!militiaRows.length) {
      throw new NotFoundException('militia_not_found');
    }
    const militia = militiaRows[0];

    const inserted = await this.dataSource.query<
      { id: string; created_at: Date }[]
    >(
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
      sessionId: null,
      createdAt: inserted[0].created_at,
    };
  }

  // ── getRecord ────────────────────────────────────────────────────────────

  async getRecord(user: JwtPayload, id: string): Promise<TrainingRecord> {
    const isManager = holdsAnyRole(user, MANAGER_ROLE_SET);
    const unit = isManager ? effectiveUnit(user) : null;
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
         tr.session_id       AS "sessionId",
         tr.created_at       AS "createdAt"
       FROM training_records tr
       JOIN militia_profiles mp ON mp.id = tr.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE tr.id = $1::uuid
         AND ($2::text IS NULL OR u.code = $2)
         AND ($3::uuid IS NULL OR mp.user_id = $3::uuid)
       LIMIT 1`,
      // Managers: their effective unit; dqtv / others: their own militia record
      [id, unit, isManager ? null : user.sub],
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
    dto: UpdateTrainingDto,
  ): Promise<TrainingRecord> {
    if (!holdsAnyRole(user, MANAGER_ROLE_SET)) {
      throw new ForbiddenException('insufficient_permission_to_update');
    }
    const unit = effectiveUnit(user);
    const existing = await this.findManagedRecord(id, unit);
    this.assertCreatorOrAdmin(
      user,
      existing.createdBy,
      'insufficient_permission_to_update',
    );
    this.assertNotSessionRecord(existing);

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;
    let militiaParam: number | null = null;

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
        if (key === 'militiaId') militiaParam = paramIdx;
        setClauses.push(`${col} = $${paramIdx++}`);
        values.push((dto as Record<string, unknown>)[key]);
      }
    }

    if (setClauses.length === 0) {
      // Nothing to update — return current record
      return this.getRecord(user, id);
    }

    // Moving the record to another member: that member must be in scope too
    if (dto.militiaId !== undefined && dto.militiaId !== existing.militiaId) {
      const target = await this.dataSource.query<{ id: string }[]>(
        `SELECT mp.id
         FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         WHERE mp.id = $1::uuid AND ($2::text IS NULL OR u.code = $2)
         LIMIT 1`,
        [dto.militiaId, unit],
      );
      if (!target.length) throw new NotFoundException('militia_not_found');
    }

    // Both scope checks are repeated in the statement that writes, so neither member can
    // leave the caller's unit between the checks above and the update
    const idParam = paramIdx;
    const unitParam = paramIdx + 1;
    values.push(id, unit);
    const newMemberGuard =
      militiaParam === null
        ? ''
        : `AND EXISTS (SELECT 1 FROM militia_profiles nmp
                       JOIN units nu ON nu.id = nmp.unit_id
                       WHERE nmp.id = $${militiaParam}::uuid
                         AND ($${unitParam}::text IS NULL OR nu.code = $${unitParam}))`;
    const updated = await queryRows<{ id: string }>(
      this.dataSource,
      `UPDATE training_records tr SET ${setClauses.join(', ')}
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE tr.id = $${idParam}::uuid
         AND mp.id = tr.militia_id
         AND ($${unitParam}::text IS NULL OR u.code = $${unitParam})
         AND tr.session_id IS NULL
         ${newMemberGuard}
       RETURNING tr.id`,
      values,
    );
    if (!updated.length) {
      throw new NotFoundException('training_record_not_found');
    }

    return this.getRecord(user, id);
  }

  // ── deleteRecord ─────────────────────────────────────────────────────────

  async deleteRecord(user: JwtPayload, id: string): Promise<void> {
    if (!holdsAnyRole(user, MANAGER_ROLE_SET)) {
      throw new ForbiddenException('insufficient_permission_to_delete');
    }
    const unit = effectiveUnit(user);
    const existing = await this.findManagedRecord(id, unit);
    this.assertCreatorOrAdmin(
      user,
      existing.createdBy,
      'insufficient_permission_to_delete',
    );
    this.assertNotSessionRecord(existing);

    const deleted = await queryRows<{ id: string }>(
      this.dataSource,
      `DELETE FROM training_records tr
       USING militia_profiles mp, units u
       WHERE tr.id = $1::uuid
         AND mp.id = tr.militia_id
         AND u.id = mp.unit_id
         AND ($2::text IS NULL OR u.code = $2)
         AND tr.session_id IS NULL
       RETURNING tr.id`,
      [id, unit],
    );
    if (!deleted.length) {
      throw new NotFoundException('training_record_not_found');
    }
  }

  // ── getComplianceReport ──────────────────────────────────────────────────

  async getComplianceReport(
    user: JwtPayload,
    year: number,
    unitCode?: string,
  ): Promise<TrainingComplianceRow[]> {
    const unit = effectiveUnit(user, unitCode);

    const rows = await this.dataSource.query<
      {
        militiaId: string;
        militiaName: string;
        militiaCode: string;
        unitCode: string;
        // SUM over NUMERIC total_days: numbers (src/database/pg-types.ts)
        military: number;
        political: number;
        fire: number;
        firstAid: number;
        other: number;
        totalDays: number;
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
      [year, unit],
    );

    return rows.map((r) => {
      const { totalDays } = r;
      let status: 'ĐẠT' | 'KHÔNG ĐẠT' | 'CẢNH BÁO';
      if (totalDays >= 15) status = 'ĐẠT';
      else if (totalDays >= 10) status = 'CẢNH BÁO';
      else status = 'KHÔNG ĐẠT';

      return {
        militiaId: r.militiaId,
        militiaName: r.militiaName,
        militiaCode: r.militiaCode,
        unitCode: r.unitCode,
        military: r.military,
        political: r.political,
        fire: r.fire,
        firstAid: r.firstAid,
        other: r.other,
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
      { header: 'STT', key: 'stt', width: 6, type: 'number' as const },
      { header: 'Họ tên', key: 'militiaName', width: 24 },
      { header: 'Mã DQTV', key: 'militiaCode', width: 14 },
      { header: 'Đơn vị', key: 'unitCode', width: 14 },
      {
        header: 'Quân sự',
        key: 'military',
        width: 10,
        type: 'number' as const,
      },
      {
        header: 'Chính trị',
        key: 'political',
        width: 10,
        type: 'number' as const,
      },
      { header: 'PCCC', key: 'fire', width: 10, type: 'number' as const },
      { header: 'Sơ cứu', key: 'firstAid', width: 10, type: 'number' as const },
      { header: 'Khác', key: 'other', width: 10, type: 'number' as const },
      { header: 'Tổng', key: 'totalDays', width: 10, type: 'number' as const },
      {
        header: 'Yêu cầu',
        key: 'requiredDays',
        width: 10,
        type: 'number' as const,
      },
      {
        header: 'Kết quả',
        key: 'status',
        width: 14,
        type: 'status' as const,
        statusColors: {
          ĐẠT: 'CCFFCC',
          'KHÔNG ĐẠT': 'FFCCCC',
          'CẢNH BÁO': 'FFF3CD',
        },
      },
    ];

    const tableRows = data.map((r, i) => ({ ...r, stt: i + 1 }));
    this.excelExportService.addStyledTable(
      sheet1,
      startRow,
      columns,
      tableRows,
    );

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

    this.excelExportService.addSummaryStatsTable(
      sheet2,
      0,
      `Tóm tắt tuân thủ huấn luyện năm ${year}`,
      [
        { label: 'Tổng số DQTV', value: data.length },
        { label: 'Đạt yêu cầu (≥15 ngày)', value: passCount, highlight: false },
        {
          label: 'Cảnh báo (10-14 ngày)',
          value: warnCount,
          highlight: warnCount > 0,
        },
        {
          label: 'Không đạt (<10 ngày)',
          value: failCount,
          highlight: failCount > 0,
        },
        {
          label: 'Tỷ lệ tuân thủ',
          value:
            data.length > 0
              ? `${Math.round((passCount / data.length) * 100)}%`
              : '0%',
        },
      ],
    );

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
    const year = params.year ?? businessDate().year;

    // Managers report on their effective unit (wide roles may narrow it); everyone else
    // on their own militia record
    const isManager = holdsAnyRole(user, MANAGER_ROLE_SET);
    const unitCodeFilter = isManager
      ? effectiveUnit(user, params.unitCode)
      : null;

    const rows = await this.dataSource.query<
      {
        militiaId: string;
        militiaName: string;
        militiaCode: string;
        // SUM over NUMERIC total_days: a number (src/database/pg-types.ts)
        totalDays: number;
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
      [year, unitCodeFilter, isManager ? null : user.sub],
    );

    const REQUIRED_DAYS = 15 as const;

    return rows.map((row) => {
      const { totalDays } = row;
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
