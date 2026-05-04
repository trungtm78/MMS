// US-SS-01: MilitiaService — search with unaccent + smart ranking
// US-SS-05: Quick-create militia profile inline
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import * as ExcelJS from 'exceljs';
import { AssignmentsService } from '../assignments/assignments.service';
import { CA_ROLES } from '../common/constants/roles';
import { ExcelExportService } from '../common/services/excel-export.service';
import type { JwtPayload } from '../auth/auth.service';

export interface MilitiaSearchItem {
  id: string;
  userId: string | null;
  militiaCode: string;
  fullName: string;
  phone: string | null;
  rank: string | null;
  status: string;
  unitCode: string;
  unitName: string;
}

// NĐ 72/2020 Điều 15-18: Full detail profile (used by getMilitiaById)
export interface MilitiaDetailProfile extends MilitiaSearchItem {
  email: string | null;
  avatarUrl: string | null;
  // 6 NĐ 72 compliance fields (migration 012):
  occupation: string | null;
  educationLevel: string | null;
  healthStatus: string | null;
  bloodType: string | null;
  permanentAddress: string | null;
  judicialClearanceStatus: string | null;
}

export interface CreateMilitiaDto {
  militiaCode: string;
  fullName: string;
  cccd?: string;
  phone?: string;
  rank?: string;
  unitCode: string;
  gender?: 'male' | 'female';
  dob?: string;
  position?: string;
  joinDate?: string;
}

@Injectable()
export class MilitiaService {
  private readonly logger = new Logger(MilitiaService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly assignmentsService: AssignmentsService,
    private readonly excelExportService: ExcelExportService,
  ) {}

  // ── CCCD encryption helpers ────────────────────────────────────────────

  private getEncryptionKey(): Buffer | null {
    const key = process.env.AES_CCCD_KEY;
    if (!key) return null;
    if (key.length !== 64) {
      this.logger.warn('AES_CCCD_KEY must be 64 hex chars (32 bytes); falling back to plaintext');
      return null;
    }
    return Buffer.from(key, 'hex');
  }

  // Exposed as package-private (no underscore) so spec can call via (service as any)
  encryptCccd(plaintext: string): { lookupHash: string; encrypted: string } {
    const key = this.getEncryptionKey();
    if (!key) throw new Error('AES_CCCD_KEY env var not set or invalid');
    const lookupHash = crypto.createHmac('sha256', key).update(plaintext).digest('hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, tag, encrypted]);
    return { lookupHash, encrypted: combined.toString('base64url') };
  }

  decryptCccd(encryptedB64: string): string {
    const key = this.getEncryptionKey();
    if (!key) throw new Error('AES_CCCD_KEY env var not set or invalid');
    const combined = Buffer.from(encryptedB64, 'base64url');
    const iv = combined.subarray(0, 12);
    const tag = combined.subarray(12, 28);
    const ciphertext = combined.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  }

  computeLookupHash(plaintext: string): string {
    const key = this.getEncryptionKey();
    if (!key) throw new Error('AES_CCCD_KEY env var not set or invalid');
    return crypto.createHmac('sha256', key).update(plaintext).digest('hex');
  }

  // US-SS-01 AC-1: Search militia by name (unaccent), code, phone
  // US-SS-02 AC-3: PostgreSQL unaccent for accent-insensitive matching
  async search(
    q: string,
    unitCode?: string,
    limit = 20,
  ): Promise<MilitiaSearchItem[]> {
    // US-SS-01: normalise limit
    const safeLimit = Math.min(Math.max(1, limit), 50);

    const rows = await this.dataSource.query<MilitiaSearchItem[]>(
      `SELECT
         mp.id,
         mp.user_id        AS "userId",
         mp.militia_code   AS "militiaCode",
         mp.full_name      AS "fullName",
         mp.phone,
         mp.rank,
         mp.status,
         u.code            AS "unitCode",
         u.name            AS "unitName"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.status IN ('active')
         AND ($1 = ''
           OR unaccent(LOWER(mp.full_name))   ILIKE unaccent(LOWER('%'||$1||'%'))
           OR LOWER(mp.militia_code)           ILIKE LOWER('%'||$1||'%')
           OR mp.phone                         ILIKE '%'||$1||'%')
         AND ($2::text IS NULL OR u.code = $2)
       ORDER BY
         CASE
           WHEN LOWER(mp.militia_code) = LOWER($1)              THEN 0
           WHEN LOWER(mp.militia_code) ILIKE LOWER($1||'%')     THEN 1
           WHEN unaccent(LOWER(mp.full_name)) ILIKE unaccent(LOWER($1||'%')) THEN 2
           ELSE 3
         END,
         mp.full_name
       LIMIT $3`,
      [q ?? '', unitCode ?? null, safeLimit],
    );

    return rows;
  }

  // US-SS-05: Quick-create militia inline from SmartSelect modal
  // Guard: unit must exist; militiaCode must be unique
  async quickCreate(dto: CreateMilitiaDto): Promise<MilitiaSearchItem> {
    // US-SS-05 AC-2: Resolve unit id from code
    const unitRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM units WHERE code = $1 LIMIT 1`,
      [dto.unitCode],
    );
    if (!unitRows.length) {
      throw new BadRequestException(`unit_not_found:${dto.unitCode}`);
    }
    const unitId = unitRows[0].id;

    // Guard: militia_code unique
    const existRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM militia_profiles WHERE militia_code = $1 LIMIT 1`,
      [dto.militiaCode],
    );
    if (existRows.length) {
      throw new BadRequestException('militia_code_duplicate');
    }

    // Default CCCD: 12 chars max — use 'T' + last 11 digits of code, or '000000000000'
    const defaultCccd = dto.cccd
      ?? ('T' + dto.militiaCode.replace(/[^0-9]/g, '')).slice(0, 12).padEnd(12, '0');
    // Default dob/joinDate to today if not provided (required NOT NULL columns)
    const today = new Date().toISOString().slice(0, 10);

    // Encrypt CCCD if AES_CCCD_KEY is set; otherwise store plaintext (dev fallback)
    let cccdPlaintext: string | null = defaultCccd;
    let cccdLookupHash: string | null = null;
    let cccdEncrypted: string | null = null;
    const encKey = this.getEncryptionKey();
    if (encKey) {
      try {
        const { lookupHash, encrypted } = this.encryptCccd(defaultCccd);
        cccdLookupHash = lookupHash;
        cccdEncrypted = encrypted;
        cccdPlaintext = null; // migrate away from plaintext when key is present
      } catch (err) {
        this.logger.warn(`CCCD encryption failed, storing plaintext: ${(err as Error).message}`);
      }
    }

    const inserted = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO militia_profiles
         (militia_code, full_name, cccd, cccd_lookup_hash, cccd_encrypted, phone, rank, unit_id, gender, dob, position, join_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
       RETURNING id`,
      [
        dto.militiaCode,
        dto.fullName,
        cccdPlaintext,
        cccdLookupHash,
        cccdEncrypted,
        dto.phone ?? null,
        dto.rank ?? null,
        unitId,
        dto.gender ?? 'male',
        dto.dob ?? today,
        dto.position ?? null,
        dto.joinDate ?? today,
      ],
    );

    const newId = inserted[0].id;
    const results = await this.search(dto.militiaCode, undefined, 1);
    if (!results.length) {
      throw new NotFoundException('militia_create_read_back_failed');
    }
    return results.find((r) => r.id === newId) ?? results[0];
  }

  // Paginated search with unitScope enforcement + CA explicit assignment filter
  async searchMilitia(
    user: { role: string; unitScope: string | null; sub?: string | null },
    params: { q?: string; unitCode?: string; page?: number; limit?: number; excludeAssignedTo?: string },
  ): Promise<{ data: MilitiaSearchItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const offset = (page - 1) * limit;
    const q = params.q ?? '';

    // CA officers with explicit assignments: filter to assigned DQTV only.
    // If CA has zero assignments, fall back to unitScope (backward compat for new CAs).
    let assignedUserIds: string[] | null = null;
    if (CA_ROLES.has(user.role) && user.sub) {
      const ids = await this.assignmentsService.getAssignedDqtvIds(user.sub);
      if (ids.length > 0) {
        assignedUserIds = ids;
      }
    }

    // Resolve IDs already assigned to the given CA (for excludeAssignedTo filter)
    let excludedUserIds: string[] | null = null;
    if (params.excludeAssignedTo) {
      excludedUserIds = await this.assignmentsService.getAssignedDqtvIds(params.excludeAssignedTo);
    }

    const effectiveUnit = user.role === 'system_admin' ? params.unitCode : user.unitScope ?? undefined;

    if (assignedUserIds !== null) {
      // Filter to explicitly assigned DQTV
      const countResult = await this.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(*) as count FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         WHERE mp.status IN ('active')
           AND mp.user_id = ANY($1::uuid[])
           AND ($2 = '' OR unaccent(LOWER(mp.full_name)) ILIKE unaccent(LOWER('%'||$2||'%'))
             OR LOWER(mp.militia_code) ILIKE LOWER('%'||$2||'%')
             OR mp.phone ILIKE '%'||$2||'%')
           ${excludedUserIds && excludedUserIds.length > 0 ? 'AND (mp.user_id IS NULL OR mp.user_id != ALL($3::uuid[]))' : ''}`,
        excludedUserIds && excludedUserIds.length > 0
          ? [assignedUserIds, q, excludedUserIds]
          : [assignedUserIds, q],
      );
      const total = parseInt(countResult[0]?.count ?? '0', 10);

      const rows = await this.dataSource.query<MilitiaSearchItem[]>(
        `SELECT mp.id, mp.user_id AS "userId", mp.militia_code AS "militiaCode", mp.full_name AS "fullName",
                mp.phone, mp.rank, mp.status, u.code AS "unitCode", u.name AS "unitName"
         FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         WHERE mp.status IN ('active')
           AND mp.user_id = ANY($1::uuid[])
           AND ($2 = '' OR unaccent(LOWER(mp.full_name)) ILIKE unaccent(LOWER('%'||$2||'%'))
             OR LOWER(mp.militia_code) ILIKE LOWER('%'||$2||'%')
             OR mp.phone ILIKE '%'||$2||'%')
           ${excludedUserIds && excludedUserIds.length > 0 ? 'AND (mp.user_id IS NULL OR mp.user_id != ALL($3::uuid[]))' : ''}
         ORDER BY mp.full_name
         LIMIT $${excludedUserIds && excludedUserIds.length > 0 ? 4 : 3} OFFSET $${excludedUserIds && excludedUserIds.length > 0 ? 5 : 4}`,
        excludedUserIds && excludedUserIds.length > 0
          ? [assignedUserIds, q, excludedUserIds, limit, offset]
          : [assignedUserIds, q, limit, offset],
      );

      return { data: rows, total, page, limit };
    }

    // Default: unitScope or admin
    const countResult = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) as count FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.status IN ('active')
         AND ($1 = '' OR unaccent(LOWER(mp.full_name)) ILIKE unaccent(LOWER('%'||$1||'%'))
           OR LOWER(mp.militia_code) ILIKE LOWER('%'||$1||'%')
           OR mp.phone ILIKE '%'||$1||'%')
         AND ($2::text IS NULL OR u.code = $2)
         ${excludedUserIds && excludedUserIds.length > 0 ? 'AND (mp.user_id IS NULL OR mp.user_id != ALL($3::uuid[]))' : ''}`,
      excludedUserIds && excludedUserIds.length > 0
        ? [q, effectiveUnit ?? null, excludedUserIds]
        : [q, effectiveUnit ?? null],
    );
    const total = parseInt(countResult[0]?.count ?? '0', 10);

    const rows = await this.dataSource.query<MilitiaSearchItem[]>(
      `SELECT mp.id, mp.user_id AS "userId", mp.militia_code AS "militiaCode", mp.full_name AS "fullName",
              mp.phone, mp.rank, mp.status, u.code AS "unitCode", u.name AS "unitName"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.status IN ('active')
         AND ($1 = '' OR unaccent(LOWER(mp.full_name)) ILIKE unaccent(LOWER('%'||$1||'%'))
           OR LOWER(mp.militia_code) ILIKE LOWER('%'||$1||'%')
           OR mp.phone ILIKE '%'||$1||'%')
         AND ($2::text IS NULL OR u.code = $2)
         ${excludedUserIds && excludedUserIds.length > 0 ? 'AND (mp.user_id IS NULL OR mp.user_id != ALL($3::uuid[]))' : ''}
       ORDER BY mp.full_name
       LIMIT $${excludedUserIds && excludedUserIds.length > 0 ? 4 : 3} OFFSET $${excludedUserIds && excludedUserIds.length > 0 ? 5 : 4}`,
      excludedUserIds && excludedUserIds.length > 0
        ? [q, effectiveUnit ?? null, excludedUserIds, limit, offset]
        : [q, effectiveUnit ?? null, limit, offset],
    );

    return { data: rows, total, page, limit };
  }

  // Search militia by CCCD (identity verification) using lookup hash
  async searchByCccd(
    user: { role: string; unitScope: string | null },
    cccd: string,
  ): Promise<MilitiaSearchItem | null> {
    const lookupHash = this.computeLookupHash(cccd);

    const rows = await this.dataSource.query<(MilitiaSearchItem & { unitCode: string })[]>(
      `SELECT mp.id, mp.user_id AS "userId", mp.militia_code AS "militiaCode", mp.full_name AS "fullName",
              mp.phone, mp.rank, mp.status, u.code AS "unitCode", u.name AS "unitName"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.cccd_lookup_hash = $1
       LIMIT 1`,
      [lookupHash],
    );

    if (!rows.length) return null;

    const row = rows[0];
    if (user.role !== 'system_admin' && user.unitScope && row.unitCode !== user.unitScope) {
      throw new ForbiddenException('unit_scope_violation');
    }

    return row;
  }

  // P3-18: History tab — assignments + task history
  async getMilitiaHistory(id: string): Promise<Record<string, unknown>> {
    const [assignments, taskHistory] = await Promise.all([
      this.dataSource.query(
        `SELECT a.id, a.ca_user_id AS "caUserId", u.username AS "caUsername",
                a.assigned_at AS "assignedAt"
         FROM ca_dqtv_assignments a
         JOIN users u ON u.id = a.ca_user_id
         WHERE a.dqtv_user_id = (SELECT user_id FROM militia_profiles WHERE id = $1)
         ORDER BY a.assigned_at DESC`,
        [id],
      ),
      this.dataSource.query(
        `SELECT ta.id, t.title, ta.status, ta.created_at AS "createdAt", ta.updated_at AS "updatedAt"
         FROM task_assignments ta
         JOIN tasks t ON t.id = ta.task_id
         WHERE ta.assignee_id = (SELECT user_id FROM militia_profiles WHERE id = $1)
         ORDER BY ta.created_at DESC LIMIT 50`,
        [id],
      ),
    ]);
    return { assignments, taskHistory };
  }

  // P3-18: Rewards tab — militia_rewards table
  async getMilitiaRewards(id: string): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT id, reward_type AS "rewardType", title, description,
              issued_date AS "issuedDate", issued_by AS "issuedBy", created_at AS "createdAt"
       FROM militia_rewards WHERE militia_id = $1 ORDER BY issued_date DESC NULLS LAST`,
      [id],
    );
  }

  // P3-18: Documents tab — files related to militia profile
  async getMilitiaDocuments(id: string): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT id, original_name AS "originalName", mime_type AS "mimeType",
              size, url, created_at AS "uploadedAt"
       FROM files WHERE related_id = $1 AND related_type = 'militia_profile'
       ORDER BY created_at DESC`,
      [id],
    );
  }

  // NĐ 13/2023 Điều 10-14: Data subject rights — export own data bundle
  async exportMyData(userId: string): Promise<Record<string, unknown>> {
    const profileRows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT mp.id, mp.militia_code AS "militiaCode", mp.full_name AS "fullName",
              mp.phone, mp.email, mp.rank, mp.status,
              mp.occupation, mp.education_level AS "educationLevel",
              mp.health_status AS "healthStatus", mp.blood_type AS "bloodType",
              mp.permanent_address AS "permanentAddress",
              mp.judicial_clearance_status AS "judicialClearanceStatus",
              u.code AS "unitCode", u.name AS "unitName"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.user_id = $1`,
      [userId],
    );
    if (!profileRows.length) {
      return { profile: null, training: [], attendance: [], leaveRequests: [], kpiScores: [], exportedAt: new Date().toISOString() };
    }
    const profile = profileRows[0];
    const militiaId = profile['id'] as string;

    const [training, attendance, leaveRequests, kpiScores] = await Promise.all([
      this.dataSource.query(
        `SELECT id, training_type AS "trainingType", start_date AS "startDate",
                end_date AS "endDate", days_count AS "daysCount", result, notes
         FROM training_records WHERE militia_id = $1 ORDER BY start_date DESC`,
        [militiaId],
      ),
      this.dataSource.query(
        `SELECT id, work_date AS "workDate", check_in_time AS "checkInTime",
                check_out_time AS "checkOutTime", status, notes
         FROM attendance_records WHERE militia_id = $1
         ORDER BY work_date DESC LIMIT 180`,
        [militiaId],
      ),
      this.dataSource.query(
        `SELECT id, leave_type AS "leaveType", start_date AS "startDate",
                end_date AS "endDate", status, reason
         FROM leave_requests WHERE requester_id = $1 ORDER BY created_at DESC`,
        [userId],
      ),
      this.dataSource.query(
        `SELECT id, period_id AS "periodId", score, created_at AS "createdAt"
         FROM kpi_scores WHERE militia_id = $1 ORDER BY created_at DESC LIMIT 12`,
        [militiaId],
      ),
    ]);

    return {
      profile,
      training,
      attendance,
      leaveRequests,
      kpiScores,
      exportedAt: new Date().toISOString(),
      note: 'Attendance limited to last 180 days per NĐ 13/2023',
    };
  }

  // ── exportMilitiaRoster ──────────────────────────────────────────────────

  async exportMilitiaRoster(
    user: JwtPayload,
    filters: { unitCode?: string; status?: string },
  ): Promise<ExcelJS.Workbook> {
    const effectiveUnit: string | null =
      user.role === 'system_admin' ? (filters.unitCode ?? null) : (user.unitScope ?? null);

    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT
         mp.id,
         mp.militia_code           AS "militiaCode",
         mp.full_name              AS "fullName",
         mp.cccd,
         mp.phone,
         mp.rank,
         mp.status,
         mp.gender,
         mp.dob,
         mp.position,
         mp.join_date              AS "joinDate",
         mp.occupation,
         mp.education_level        AS "educationLevel",
         mp.health_status          AS "healthStatus",
         mp.blood_type             AS "bloodType",
         mp.permanent_address      AS "permanentAddress",
         mp.judicial_clearance_status AS "judicialClearanceStatus",
         u.code                    AS "unitCode",
         u.name                    AS "unitName"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE ($1::text IS NULL OR u.code = $1)
         AND ($2::text IS NULL OR mp.status = $2)
       ORDER BY u.code, mp.full_name`,
      [effectiveUnit, filters.status ?? null],
    );

    const wb = this.excelExportService.createWorkbook();

    // Sheet 1 — main roster (CCCD masked)
    const sheet1 = wb.addWorksheet('Danh sách DQTV');
    const startRow = this.excelExportService.addGovernmentHeader(sheet1, {
      agency: 'BAN CHỈ HUY QUÂN SỰ',
      reportTitle: 'DANH SÁCH DÂN QUÂN TỰ VỆ (NĐ 72/2020/NĐ-CP)',
      reportDate: new Date(),
    });

    const tableRows = rows.map((r, i) => {
      const cccd = r['cccd'] as string | null;
      const maskedCccd = cccd ? `****-****-${cccd.slice(-4)}` : '—';
      return {
        stt: i + 1,
        militiaCode: r['militiaCode'],
        fullName: r['fullName'],
        cccd: maskedCccd,
        phone: r['phone'] ?? '—',
        rank: r['rank'] ?? '—',
        status: r['status'],
        gender: r['gender'],
        dob: r['dob'] ? new Date(r['dob'] as string) : null,
        position: r['position'] ?? '—',
        joinDate: r['joinDate'] ? new Date(r['joinDate'] as string) : null,
        occupation: r['occupation'] ?? '—',
        educationLevel: r['educationLevel'] ?? '—',
        healthStatus: r['healthStatus'] ?? '—',
        bloodType: r['bloodType'] ?? '—',
        permanentAddress: r['permanentAddress'] ?? '—',
        judicialClearanceStatus: r['judicialClearanceStatus'] ?? '—',
        unitCode: r['unitCode'],
        unitName: r['unitName'],
      };
    });

    this.excelExportService.addStyledTable(sheet1, startRow, [
      { header: 'STT',            key: 'stt',                    width: 6,  type: 'number' as const },
      { header: 'Mã DQTV',       key: 'militiaCode',            width: 14 },
      { header: 'Họ tên',        key: 'fullName',               width: 24 },
      { header: 'CCCD (ẩn)',     key: 'cccd',                   width: 18 },
      { header: 'Điện thoại',    key: 'phone',                  width: 16 },
      { header: 'Cấp bậc',       key: 'rank',                   width: 14 },
      {
        header: 'Trạng thái',
        key: 'status',
        width: 14,
        type: 'status' as const,
        statusColors: { active: 'CCFFCC', inactive: 'FFCCCC', reserve: 'FFF3CD' },
      },
      { header: 'Giới tính',     key: 'gender',                 width: 12 },
      { header: 'Ngày sinh',     key: 'dob',                    width: 14, type: 'date' as const },
      { header: 'Chức vụ',       key: 'position',               width: 18 },
      { header: 'Ngày nhập ngũ', key: 'joinDate',               width: 16, type: 'date' as const },
      { header: 'Nghề nghiệp',   key: 'occupation',             width: 18 },
      { header: 'Trình độ',      key: 'educationLevel',         width: 16 },
      { header: 'Sức khỏe',      key: 'healthStatus',           width: 14 },
      { header: 'Nhóm máu',      key: 'bloodType',              width: 12 },
      { header: 'Địa chỉ TT',    key: 'permanentAddress',       width: 30 },
      { header: 'Tư pháp',       key: 'judicialClearanceStatus',width: 18 },
      { header: 'Mã đơn vị',     key: 'unitCode',               width: 14 },
      { header: 'Tên đơn vị',    key: 'unitName',               width: 24 },
    ], tableRows);

    this.excelExportService.addDocumentHash(sheet1, `militia-roster-${effectiveUnit ?? 'all'}-${rows.length}`);
    this.excelExportService.addSignatureBlock(sheet1, startRow + rows.length + 2, {
      position: 'Chỉ huy trưởng',
    });

    // Sheet 2 — summary stats
    const sheet2 = wb.addWorksheet('Thống kê');
    const activeCount = rows.filter((r) => r['status'] === 'active').length;
    const inactiveCount = rows.filter((r) => r['status'] === 'inactive').length;

    this.excelExportService.addSummaryStatsTable(sheet2, 0, 'Thống kê danh sách DQTV', [
      { label: 'Tổng số', value: rows.length },
      { label: 'Đang hoạt động', value: activeCount },
      { label: 'Không hoạt động', value: inactiveCount },
      { label: 'Đơn vị', value: effectiveUnit ?? 'Toàn bộ' },
    ]);

    return wb;
  }

  // NĐ 13/2023: Data correction request — logs to audit trail
  async requestDataCorrection(
    userId: string,
    dto: { field: string; requestedValue: string; reason: string },
  ): Promise<{ accepted: boolean; message: string }> {
    await this.dataSource.query(
      `INSERT INTO audit_logs(actor_id, action, entity_type, after_json, created_at)
       VALUES ($1, 'DATA_CORRECTION_REQUEST', 'militia_profile', $2::jsonb, NOW())`,
      [userId, JSON.stringify({ field: dto.field, requestedValue: dto.requestedValue, reason: dto.reason })],
    );
    return { accepted: true, message: 'Yêu cầu đã được ghi nhận và sẽ được xem xét trong 30 ngày' };
  }

  // PATCH /militia/:id — update mutable fields (militiaCode is immutable)
  async updateMilitia(
    id: string,
    dto: Partial<{
      fullName: string; phone: string; address: string; position: string; rank: string;
      gender: string; dob: string; joinDate: string;
      emergencyContactName: string; emergencyContactPhone: string; emergencyContactRelationship: string;
    }>,
    actor: { sub: string },
  ): Promise<Record<string, unknown>> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      fullName: 'full_name',
      phone: 'phone',
      address: 'address',
      position: 'position',
      rank: 'rank',
      gender: 'gender',
      dob: 'dob',
      joinDate: 'join_date',
      emergencyContactName: 'emergency_contact_name',
      emergencyContactPhone: 'emergency_contact_phone',
      emergencyContactRelationship: 'emergency_contact_relationship',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      const val = (dto as Record<string, unknown>)[key];
      if (val !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(val);
      }
    }

    if (fields.length === 0) throw new BadRequestException('no_fields_to_update');

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `UPDATE militia_profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, full_name AS "fullName", phone, status, updated_at AS "updatedAt"`,
      values,
    );
    if (!rows.length) throw new NotFoundException('militia_not_found');
    return rows[0];
  }

  // DELETE /militia/:id — soft delete: set status='inactive'
  async deleteMilitia(id: string, actor: { sub: string }): Promise<void> {
    const result = await this.dataSource.query<{ id: string }[]>(
      `UPDATE militia_profiles SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND status != 'inactive' RETURNING id`,
      [id],
    );
    if (!result.length) throw new NotFoundException('militia_not_found_or_already_inactive');
  }

  // Get single militia member with unitScope enforcement — includes 6 NĐ 72/2020 fields
  async getMilitiaById(
    user: { role: string; unitScope: string | null },
    id: string,
  ): Promise<MilitiaDetailProfile> {
    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT mp.id,
              mp.user_id            AS "userId",
              mp.militia_code       AS "militiaCode",
              mp.full_name          AS "fullName",
              mp.phone,
              mp.email,
              mp.rank,
              mp.status,
              mp.avatar_url         AS "avatarUrl",
              u.code                AS "unitCode",
              u.name                AS "unitName",
              mp.occupation,
              mp.education_level    AS "educationLevel",
              mp.health_status      AS "healthStatus",
              mp.blood_type         AS "bloodType",
              mp.permanent_address  AS "permanentAddress",
              mp.judicial_clearance_status AS "judicialClearanceStatus"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('militia_not_found');
    const row = rows[0];
    const unitCode = row['unitCode'] as string;
    if (user.role !== 'system_admin' && user.unitScope && unitCode !== user.unitScope) {
      throw new ForbiddenException('unit_scope_violation');
    }
    return {
      id: row['id'] as string,
      userId: (row['userId'] as string | null) ?? null,
      militiaCode: row['militiaCode'] as string,
      fullName: row['fullName'] as string,
      phone: (row['phone'] as string | null) ?? null,
      email: (row['email'] as string | null) ?? null,
      rank: (row['rank'] as string | null) ?? null,
      status: row['status'] as string,
      avatarUrl: (row['avatarUrl'] as string | null) ?? null,
      unitCode,
      unitName: row['unitName'] as string,
      occupation: (row['occupation'] as string | null) ?? null,
      educationLevel: (row['educationLevel'] as string | null) ?? null,
      healthStatus: (row['healthStatus'] as string | null) ?? null,
      bloodType: (row['bloodType'] as string | null) ?? null,
      permanentAddress: (row['permanentAddress'] as string | null) ?? null,
      judicialClearanceStatus: (row['judicialClearanceStatus'] as string | null) ?? null,
    };
  }

  // Sprint 3: GET /militia/rewards-report?from=&to=&type=&unitCode=
  async getRewardsReport(
    user: JwtPayload,
    params: {
      from?: string;
      to?: string;
      type?: string;
      unitCode?: string;
    },
  ): Promise<unknown[]> {
    const WIDE_ROLES = new Set(['system_admin', 'police_ward']);
    const effectiveUnit = WIDE_ROLES.has(user.role) ? (params.unitCode ?? null) : (user.unitScope ?? null);

    const conditions: string[] = ['1=1'];
    const qParams: unknown[] = [];

    if (params.from) {
      qParams.push(params.from);
      conditions.push(`mr.issued_date >= $${qParams.length}::date`);
    }
    if (params.to) {
      qParams.push(params.to);
      conditions.push(`mr.issued_date <= $${qParams.length}::date`);
    }
    if (params.type && params.type !== 'all') {
      qParams.push(params.type);
      conditions.push(`mr.reward_type = $${qParams.length}`);
    }
    if (effectiveUnit) {
      qParams.push(effectiveUnit);
      conditions.push(`u.code = $${qParams.length}`);
    }

    return this.dataSource.query(
      `SELECT mr.id, mp.full_name AS "fullName", mp.militia_code AS "militiaCode",
              u.name AS "unitName", mr.reward_type AS "rewardType",
              mr.title AS "description", mr.description AS "content",
              mr.issued_by AS "issuedBy", mr.issued_date AS "decisionDate",
              mr.created_at AS "createdAt"
       FROM militia_rewards mr
       JOIN militia_profiles mp ON mp.id = mr.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY mr.issued_date DESC NULLS LAST`,
      qParams,
    );
  }

  // Sprint 3: GET /militia/rewards-export → xlsx stream (TT 57/2020 reference)
  async exportRewardsReport(
    user: JwtPayload,
    params: { from?: string; to?: string; type?: string; unitCode?: string },
    res: import('express').Response,
  ): Promise<void> {
    const data = await this.getRewardsReport(user, params);
    const rewards = (data as Record<string, unknown>[]).filter(r => r['rewardType'] === 'reward');
    const discipline = (data as Record<string, unknown>[]).filter(r => r['rewardType'] !== 'reward');

    const wb = this.excelExportService.createWorkbook();
    const reportDate = new Date();
    const dateRange = `${params.from ?? '...'} đến ${params.to ?? '...'}`;

    const toRows = (items: Record<string, unknown>[]) =>
      items.map((item, idx) => ({
        stt: idx + 1,
        fullName: item['fullName'],
        militiaCode: item['militiaCode'],
        unitName: item['unitName'],
        rewardType: item['rewardType'],
        content: item['content'],
        issuedBy: item['issuedBy'],
        decisionDate: item['decisionDate'] ? new Date(item['decisionDate'] as string) : null,
      }));

    const cols = [
      { header: 'STT', key: 'stt', width: 6, type: 'number' as const },
      { header: 'Họ tên', key: 'fullName', width: 24 },
      { header: 'Mã DQTV', key: 'militiaCode', width: 14 },
      { header: 'Đơn vị', key: 'unitName', width: 18 },
      { header: 'Hình thức', key: 'rewardType', width: 16 },
      { header: 'Nội dung', key: 'content', width: 30 },
      { header: 'Người ký', key: 'issuedBy', width: 16 },
      { header: 'Ngày QĐ', key: 'decisionDate', width: 14, type: 'date' as const },
    ];

    // Sheet 1: Khen thưởng
    const sheet1 = wb.addWorksheet('Khen thưởng');
    const start1 = this.excelExportService.addGovernmentHeader(sheet1, {
      agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
      reportTitle: `DANH SÁCH KHEN THƯỞNG DÂN QUÂN TỰ VỆ (${dateRange})`,
      reportDate,
    });
    this.excelExportService.addStyledTable(sheet1, start1, cols, toRows(rewards));
    this.excelExportService.addDocumentHash(sheet1, `khen-thuong-${dateRange}`);

    // Sheet 2: Kỷ luật
    const sheet2 = wb.addWorksheet('Kỷ luật');
    const start2 = this.excelExportService.addGovernmentHeader(sheet2, {
      agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
      reportTitle: `DANH SÁCH KỶ LUẬT DÂN QUÂN TỰ VỆ (${dateRange})`,
      reportDate,
    });
    this.excelExportService.addStyledTable(sheet2, start2, cols, toRows(discipline));
    sheet2.getCell(`A${start2 - 1}`).note = 'Tóm tắt nội bộ — không phải biên bản chính thức. Tham chiếu: TT 57/2020/TT-BQP.';
    this.excelExportService.addDocumentHash(sheet2, `ky-luat-${dateRange}`);

    this.excelExportService.addLegalReferencesSheet(wb, [
      'Thông tư 57/2020/TT-BQP về công tác khen thưởng, kỷ luật dân quân tự vệ',
      'Nghị định 72/2020/NĐ-CP về lực lượng dân quân tự vệ',
    ]);

    const filename = `KhenThuong_KyLuat_${params.from ?? 'all'}_${params.to ?? 'all'}.xlsx`;
    await this.excelExportService.streamToResponse(wb, res, filename);
  }
}
