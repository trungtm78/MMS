// US-SS-01: MilitiaService — search with unaccent + smart ranking
// US-SS-05: Quick-create militia profile inline
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { queryRows } from '../database/query-rows';
import * as crypto from 'crypto';
import * as ExcelJS from 'exceljs';
import { AssignmentsService } from '../assignments/assignments.service';
import { REWARD_LEDGER_SQL } from '../rewards/reward-ledger.sql';
import {
  assertUnitInScope,
  effectiveUnit,
  holdsAnyRole,
  type ScopedActor,
} from '../common/access/unit-scope';
import { businessDate } from '../common/time/business-date';
import { ExcelExportService } from '../common/services/excel-export.service';
import type { JwtPayload } from '../auth/auth.service';
import {
  FilesService,
  type FileView,
  type ViewRow,
} from '../files/files.service';
import { MILITIA_STAFF_ROLE_SET } from './militia-roles';

export interface MilitiaActor extends ScopedActor {
  sub?: string | null;
}

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

// A row of the paginated DQTV list: the picker fields plus what the list page and the
// Mẫu 01-BC roster show
const MILITIA_LIST_FIELDS = `mp.email, mp.gender, mp.dob AS "dateOfBirth", mp.occupation,
                mp.education_level AS "educationLevel"`;

export interface MilitiaListItem extends MilitiaSearchItem {
  email: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  occupation: string | null;
  educationLevel: string | null;
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
    private readonly files: FilesService,
  ) {}

  // ── CCCD encryption helpers ────────────────────────────────────────────

  private getEncryptionKey(): Buffer | null {
    const key = process.env.AES_CCCD_KEY;
    if (!key) return null;
    if (key.length !== 64) {
      this.logger.warn(
        'AES_CCCD_KEY must be 64 hex chars (32 bytes); falling back to plaintext',
      );
      return null;
    }
    return Buffer.from(key, 'hex');
  }

  // Exposed as package-private (no underscore) so spec can call via (service as any)
  encryptCccd(plaintext: string): { lookupHash: string; encrypted: string } {
    const key = this.getEncryptionKey();
    if (!key) throw new Error('AES_CCCD_KEY env var not set or invalid');
    const lookupHash = crypto
      .createHmac('sha256', key)
      .update(plaintext)
      .digest('hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
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
    return (
      decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8')
    );
  }

  computeLookupHash(plaintext: string): string {
    const key = this.getEncryptionKey();
    if (!key) throw new Error('AES_CCCD_KEY env var not set or invalid');
    return crypto.createHmac('sha256', key).update(plaintext).digest('hex');
  }

  // US-SS-01 AC-1: Search militia by name (unaccent), code, phone
  // US-SS-02 AC-3: PostgreSQL unaccent for accent-insensitive matching
  // Militia picker behind the web forms: wide roles search every unit (optionally one),
  // CA officers only the DQTV assigned to them, everyone else only their own unit
  async search(
    actor: ScopedActor & { sub?: string },
    q: string,
    unitCode?: string,
    limit = 20,
  ): Promise<MilitiaSearchItem[]> {
    // US-SS-01: normalise limit
    const safeLimit = Math.min(Math.max(1, limit), 50);

    let unit: string | null = null;
    let assignedUserIds: string[] | null = null;
    if (actor.role === 'ca_officer' && actor.sub) {
      assignedUserIds = await this.assignmentsService.getAssignedDqtvIds(
        actor.sub,
      );
      if (!assignedUserIds.length) return [];
    } else {
      unit = effectiveUnit(actor, unitCode);
    }

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
         AND ($3::uuid[] IS NULL OR mp.user_id = ANY($3::uuid[]))
       ORDER BY
         CASE
           WHEN LOWER(mp.militia_code) = LOWER($1)              THEN 0
           WHEN LOWER(mp.militia_code) ILIKE LOWER($1||'%')     THEN 1
           WHEN unaccent(LOWER(mp.full_name)) ILIKE unaccent(LOWER($1||'%')) THEN 2
           ELSE 3
         END,
         mp.full_name
       LIMIT $4`,
      [q ?? '', unit, assignedUserIds, safeLimit],
    );

    return rows;
  }

  // US-SS-05: Quick-create militia inline from SmartSelect modal
  // Guard: unit must exist; militiaCode must be unique
  async quickCreate(
    actor: ScopedActor,
    dto: CreateMilitiaDto,
  ): Promise<MilitiaSearchItem> {
    // Unit-scoped staff may only enrol members into their own unit
    assertUnitInScope(actor, dto.unitCode);

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
    const defaultCccd =
      dto.cccd ??
      ('T' + dto.militiaCode.replace(/[^0-9]/g, ''))
        .slice(0, 12)
        .padEnd(12, '0');
    // Default dob/joinDate to today if not provided (required NOT NULL columns)
    const today = businessDate().isoDate;

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
        this.logger.warn(
          `CCCD encryption failed, storing plaintext: ${(err as Error).message}`,
        );
      }
    }

    let inserted: { id: string }[];
    try {
      inserted = await this.dataSource.query<{ id: string }[]>(
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
    } catch (err) {
      // The duplicate check above can lose a race with a concurrent create
      const pgError = err as { code?: string; constraint?: string };
      if (pgError.code === '23505') {
        throw new BadRequestException(
          pgError.constraint?.includes('cccd')
            ? 'militia_cccd_duplicate'
            : 'militia_code_duplicate',
        );
      }
      throw err;
    }

    // Read the new row back by id: the picker search is scoped and fuzzy
    const rows = await this.dataSource.query<MilitiaSearchItem[]>(
      `SELECT mp.id, mp.user_id AS "userId", mp.militia_code AS "militiaCode",
              mp.full_name AS "fullName", mp.phone, mp.rank, mp.status,
              u.code AS "unitCode", u.name AS "unitName"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.id = $1`,
      [inserted[0].id],
    );
    if (!rows.length) {
      throw new NotFoundException('militia_create_read_back_failed');
    }
    return rows[0];
  }

  // Paginated roster: CA officers see the DQTV assigned to them (nobody without assignments),
  // everyone else the members of their effective unit
  async searchMilitia(
    user: MilitiaActor,
    params: {
      q?: string;
      unitCode?: string;
      page?: number;
      limit?: number;
      excludeAssignedTo?: string;
    },
  ): Promise<{
    data: MilitiaListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const offset = (page - 1) * limit;
    const q = params.q ?? '';
    const unit = effectiveUnit(user, params.unitCode);

    let assignedUserIds: string[] | null = null;
    if (user.role === 'ca_officer') {
      assignedUserIds = user.sub
        ? await this.assignmentsService.getAssignedDqtvIds(user.sub)
        : [];
      if (assignedUserIds.length === 0)
        return { data: [], total: 0, page, limit };
    }

    // Resolve IDs already assigned to the given CA (for excludeAssignedTo filter)
    let excludedUserIds: string[] | null = null;
    if (params.excludeAssignedTo) {
      excludedUserIds = await this.assignmentsService.getAssignedDqtvIds(
        params.excludeAssignedTo,
      );
    }

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

      const rows = await this.dataSource.query<MilitiaListItem[]>(
        `SELECT mp.id, mp.user_id AS "userId", mp.militia_code AS "militiaCode", mp.full_name AS "fullName",
                mp.phone, mp.rank, mp.status, u.code AS "unitCode", u.name AS "unitName",
                ${MILITIA_LIST_FIELDS}
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
        ? [q, unit, excludedUserIds]
        : [q, unit],
    );
    const total = parseInt(countResult[0]?.count ?? '0', 10);

    const rows = await this.dataSource.query<MilitiaListItem[]>(
      `SELECT mp.id, mp.user_id AS "userId", mp.militia_code AS "militiaCode", mp.full_name AS "fullName",
              mp.phone, mp.rank, mp.status, u.code AS "unitCode", u.name AS "unitName",
              ${MILITIA_LIST_FIELDS}
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
        ? [q, unit, excludedUserIds, limit, offset]
        : [q, unit, limit, offset],
    );

    return { data: rows, total, page, limit };
  }

  // Search militia by CCCD (identity verification) using lookup hash
  async searchByCccd(
    user: { role: string; unitScope: string | null },
    cccd: string,
  ): Promise<MilitiaSearchItem | null> {
    const lookupHash = this.computeLookupHash(cccd);

    const rows = await this.dataSource.query<
      (MilitiaSearchItem & { unitCode: string })[]
    >(
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
    assertUnitInScope(user, row.unitCode);

    return row;
  }

  // Profiles hold personal data: staff read those in their unit scope (CA officers only the
  // DQTV assigned to them), anyone else only their own. Other profiles answer 404, so their
  // existence is not revealed.
  private async assertCanReadProfile(
    actor: MilitiaActor,
    profile: { userId: string | null; unitCode: string },
  ): Promise<void> {
    if (!holdsAnyRole(actor, MILITIA_STAFF_ROLE_SET)) {
      if (!actor.sub || profile.userId !== actor.sub) {
        throw new NotFoundException('militia_not_found');
      }
      return;
    }
    if (actor.role === 'ca_officer') {
      const assigned = actor.sub
        ? await this.assignmentsService.getAssignedDqtvIds(actor.sub)
        : [];
      if (!profile.userId || !assigned.includes(profile.userId)) {
        throw new NotFoundException('militia_not_found');
      }
      return;
    }
    assertUnitInScope(actor, profile.unitCode);
  }

  private async assertCanReadProfileById(
    actor: MilitiaActor,
    id: string,
  ): Promise<void> {
    const rows = await this.dataSource.query<
      { userId: string | null; unitCode: string }[]
    >(
      `SELECT mp.user_id AS "userId", u.code AS "unitCode"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('militia_not_found');
    await this.assertCanReadProfile(actor, rows[0]);
  }

  // P3-18: History tab — assignments + task history
  async getMilitiaHistory(
    actor: MilitiaActor,
    id: string,
  ): Promise<Record<string, unknown>> {
    await this.assertCanReadProfileById(actor, id);
    const [assignments, taskHistory] = await Promise.all([
      this.dataSource.query<Record<string, unknown>[]>(
        `SELECT a.id, a.ca_user_id AS "caUserId", u.username AS "caUsername",
                a.assigned_at AS "assignedAt"
         FROM ca_dqtv_assignments a
         JOIN users u ON u.id = a.ca_user_id
         WHERE a.dqtv_user_id = (SELECT user_id FROM militia_profiles WHERE id = $1)
         ORDER BY a.assigned_at DESC`,
        [id],
      ),
      this.dataSource.query<Record<string, unknown>[]>(
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

  // P3-18: Rewards tab — every khen thưởng / kỷ luật entry of the member (reward ledger)
  async getMilitiaRewards(actor: MilitiaActor, id: string): Promise<unknown[]> {
    await this.assertCanReadProfileById(actor, id);
    return this.dataSource.query(
      `SELECT id, reward_type AS "rewardType", title, description,
              issued_date AS "issuedDate", issued_by AS "issuedBy", status,
              created_at AS "createdAt"
       FROM (${REWARD_LEDGER_SQL}) mr
       WHERE militia_id = $1
       ORDER BY issued_date DESC NULLS LAST, created_at DESC`,
      [id],
    );
  }

  // P3-18: Documents tab — files attached to the profile (migration 034), newest first, each
  // with the path its content downloads from (FilesService applies the profile read rule)
  async getMilitiaDocuments(
    actor: MilitiaActor,
    id: string,
  ): Promise<FileView[]> {
    await this.assertCanReadProfileById(actor, id);
    const rows = await this.dataSource.query<ViewRow[]>(
      `SELECT f.id, f.original_name AS name, f.mime_type AS "mimeType", f.size
       FROM files f
       WHERE f.related_type = 'militia_profile' AND f.related_id = $1
       ORDER BY f.created_at DESC, f.id`,
      [id],
    );
    return this.files.views(rows);
  }

  // POST /militia/:id/documents — staff attach their own uploads to a profile they may read;
  // a member reads their profile's documents but never adds to them. The files are claimed
  // in one transaction, so a refused file attaches none.
  async attachMilitiaDocuments(
    actor: MilitiaActor,
    id: string,
    fileIds: string[],
  ): Promise<FileView[]> {
    const ownerId = actor.sub;
    if (!ownerId || !holdsAnyRole(actor, MILITIA_STAFF_ROLE_SET)) {
      throw new ForbiddenException('insufficient_role');
    }
    await this.assertCanReadProfileById(actor, id);
    return this.dataSource.transaction((mgr) =>
      this.files.attach(mgr, {
        ownerId,
        fileIds,
        relatedType: 'militia_profile',
        relatedId: id,
      }),
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
      return {
        profile: null,
        training: [],
        attendance: [],
        leaveRequests: [],
        kpiScores: [],
        exportedAt: new Date().toISOString(),
      };
    }
    const profile = profileRows[0];
    const militiaId = profile['id'] as string;

    const [training, attendance, leaveRequests, kpiScores] = await Promise.all([
      this.dataSource.query<Record<string, unknown>[]>(
        `SELECT id, training_type AS "trainingType", from_date AS "fromDate",
                to_date AS "toDate", total_days AS "totalDays", result, notes
         FROM training_records WHERE militia_id = $1 ORDER BY from_date DESC`,
        [militiaId],
      ),
      this.dataSource.query<Record<string, unknown>[]>(
        `SELECT id, work_date AS "workDate", checkin_at AS "checkinAt",
                checkout_at AS "checkoutAt", status, note
         FROM attendance_records WHERE militia_id = $1
         ORDER BY work_date DESC LIMIT 180`,
        [militiaId],
      ),
      this.dataSource.query<Record<string, unknown>[]>(
        `SELECT lr.id, lt.code AS "leaveType", lt.name AS "leaveTypeName",
                lr.from_date AS "fromDate", lr.to_date AS "toDate", lr.status, lr.reason
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.requester_id = $1
         ORDER BY lr.created_at DESC`,
        [userId],
      ),
      this.dataSource.query<Record<string, unknown>[]>(
        `SELECT ks.id, ks.period_id AS "periodId", kp.month, kp.year,
                ks.total_score AS "totalScore", ks.created_at AS "createdAt"
         FROM kpi_scores ks
         JOIN kpi_periods kp ON kp.id = ks.period_id
         WHERE ks.militia_id = $1
         ORDER BY kp.year DESC, kp.month DESC
         LIMIT 12`,
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
    const unit = effectiveUnit(user, filters.unitCode);

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
      [unit, filters.status ?? null],
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

    this.excelExportService.addStyledTable(
      sheet1,
      startRow,
      [
        { header: 'STT', key: 'stt', width: 6, type: 'number' as const },
        { header: 'Mã DQTV', key: 'militiaCode', width: 14 },
        { header: 'Họ tên', key: 'fullName', width: 24 },
        { header: 'CCCD (ẩn)', key: 'cccd', width: 18 },
        { header: 'Điện thoại', key: 'phone', width: 16 },
        { header: 'Cấp bậc', key: 'rank', width: 14 },
        {
          header: 'Trạng thái',
          key: 'status',
          width: 14,
          type: 'status' as const,
          statusColors: {
            active: 'CCFFCC',
            inactive: 'FFCCCC',
            reserve: 'FFF3CD',
          },
        },
        { header: 'Giới tính', key: 'gender', width: 12 },
        { header: 'Ngày sinh', key: 'dob', width: 14, type: 'date' as const },
        { header: 'Chức vụ', key: 'position', width: 18 },
        {
          header: 'Ngày nhập ngũ',
          key: 'joinDate',
          width: 16,
          type: 'date' as const,
        },
        { header: 'Nghề nghiệp', key: 'occupation', width: 18 },
        { header: 'Trình độ', key: 'educationLevel', width: 16 },
        { header: 'Sức khỏe', key: 'healthStatus', width: 14 },
        { header: 'Nhóm máu', key: 'bloodType', width: 12 },
        { header: 'Địa chỉ TT', key: 'permanentAddress', width: 30 },
        { header: 'Tư pháp', key: 'judicialClearanceStatus', width: 18 },
        { header: 'Mã đơn vị', key: 'unitCode', width: 14 },
        { header: 'Tên đơn vị', key: 'unitName', width: 24 },
      ],
      tableRows,
    );

    this.excelExportService.addDocumentHash(
      sheet1,
      `militia-roster-${unit ?? 'all'}-${rows.length}`,
    );
    this.excelExportService.addSignatureBlock(
      sheet1,
      startRow + rows.length + 2,
      {
        position: 'Chỉ huy trưởng',
      },
    );

    // Sheet 2 — summary stats
    const sheet2 = wb.addWorksheet('Thống kê');
    const activeCount = rows.filter((r) => r['status'] === 'active').length;
    const inactiveCount = rows.filter((r) => r['status'] === 'inactive').length;

    this.excelExportService.addSummaryStatsTable(
      sheet2,
      0,
      'Thống kê danh sách DQTV',
      [
        { label: 'Tổng số', value: rows.length },
        { label: 'Đang hoạt động', value: activeCount },
        { label: 'Không hoạt động', value: inactiveCount },
        { label: 'Đơn vị', value: unit ?? 'Toàn bộ' },
      ],
    );

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
      [
        userId,
        JSON.stringify({
          field: dto.field,
          requestedValue: dto.requestedValue,
          reason: dto.reason,
        }),
      ],
    );
    return {
      accepted: true,
      message: 'Yêu cầu đã được ghi nhận và sẽ được xem xét trong 30 ngày',
    };
  }

  // PATCH /militia/:id — update mutable fields (militiaCode is immutable)
  async updateMilitia(
    id: string,
    dto: Partial<{
      fullName: string;
      phone: string;
      address: string;
      position: string;
      rank: string;
      gender: string;
      dob: string;
      joinDate: string;
      emergencyContactName: string;
      emergencyContactPhone: string;
      emergencyContactRelationship: string;
    }>,
    actor: MilitiaActor,
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

    if (fields.length === 0)
      throw new BadRequestException('no_fields_to_update');

    fields.push(`updated_at = NOW()`);
    // Unit staff edit only profiles of their own unit. The scope is part of the UPDATE
    // itself, so no concurrent unit change can slip between a check and the write, and a
    // profile outside the scope answers exactly like a missing one.
    values.push(id, effectiveUnit(actor));

    const rows = await queryRows<Record<string, unknown>>(
      this.dataSource,
      `UPDATE militia_profiles mp SET ${fields.join(', ')}
       FROM units u
       WHERE mp.id = $${idx}
         AND u.id = mp.unit_id
         AND ($${idx + 1}::text IS NULL OR u.code = $${idx + 1})
       RETURNING mp.id, mp.full_name AS "fullName", mp.phone, mp.status, mp.updated_at AS "updatedAt"`,
      values,
    );
    if (!rows.length) throw new NotFoundException('militia_not_found');
    return rows[0];
  }

  // DELETE /militia/:id — soft delete: set status='inactive'
  // The controller passes the acting user; AuditInterceptor records who deleted
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteMilitia(id: string, actor: { sub: string }): Promise<void> {
    const result = await queryRows<{ id: string }>(
      this.dataSource,
      `UPDATE militia_profiles SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND status != 'inactive' RETURNING id`,
      [id],
    );
    if (!result.length)
      throw new NotFoundException('militia_not_found_or_already_inactive');
  }

  // Get single militia member with unitScope enforcement — includes 6 NĐ 72/2020 fields
  async getMilitiaById(
    user: MilitiaActor,
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
    await this.assertCanReadProfile(user, {
      userId: (row['userId'] as string | null) ?? null,
      unitCode,
    });
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
      judicialClearanceStatus:
        (row['judicialClearanceStatus'] as string | null) ?? null,
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
    const unit = effectiveUnit(user, params.unitCode);

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
    if (unit) {
      qParams.push(unit);
      conditions.push(`u.code = $${qParams.length}`);
    }

    // Every ledger: free-form militia_rewards rows and the decisions recorded through
    // /rewards and /discipline; status tells an overturned discipline decision apart
    return this.dataSource.query(
      `SELECT mr.id, mp.full_name AS "fullName", mp.militia_code AS "militiaCode",
              u.name AS "unitName", mr.reward_type AS "rewardType",
              mr.title AS "description", mr.description AS "content",
              mr.issued_by AS "issuedBy", mr.issued_date AS "decisionDate",
              mr.status AS "status", mr.created_at AS "createdAt"
       FROM (${REWARD_LEDGER_SQL}) mr
       JOIN militia_profiles mp ON mp.id = mr.militia_id
       JOIN units u ON u.id = mp.unit_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY mr.issued_date DESC NULLS LAST, mr.created_at DESC`,
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
    const rewards = (data as Record<string, unknown>[]).filter(
      (r) => r['rewardType'] === 'reward',
    );
    const discipline = (data as Record<string, unknown>[]).filter(
      (r) => r['rewardType'] !== 'reward',
    );

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
        decisionDate: item['decisionDate']
          ? new Date(item['decisionDate'] as string)
          : null,
      }));

    const cols = [
      { header: 'STT', key: 'stt', width: 6, type: 'number' as const },
      { header: 'Họ tên', key: 'fullName', width: 24 },
      { header: 'Mã DQTV', key: 'militiaCode', width: 14 },
      { header: 'Đơn vị', key: 'unitName', width: 18 },
      { header: 'Hình thức', key: 'rewardType', width: 16 },
      { header: 'Nội dung', key: 'content', width: 30 },
      { header: 'Người ký', key: 'issuedBy', width: 16 },
      {
        header: 'Ngày QĐ',
        key: 'decisionDate',
        width: 14,
        type: 'date' as const,
      },
    ];

    // Sheet 1: Khen thưởng
    const sheet1 = wb.addWorksheet('Khen thưởng');
    const start1 = this.excelExportService.addGovernmentHeader(sheet1, {
      agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
      reportTitle: `DANH SÁCH KHEN THƯỞNG DÂN QUÂN TỰ VỆ (${dateRange})`,
      reportDate,
    });
    this.excelExportService.addStyledTable(
      sheet1,
      start1,
      cols,
      toRows(rewards),
    );
    this.excelExportService.addDocumentHash(sheet1, `khen-thuong-${dateRange}`);

    // Sheet 2: Kỷ luật
    const sheet2 = wb.addWorksheet('Kỷ luật');
    const start2 = this.excelExportService.addGovernmentHeader(sheet2, {
      agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
      reportTitle: `DANH SÁCH KỶ LUẬT DÂN QUÂN TỰ VỆ (${dateRange})`,
      reportDate,
    });
    this.excelExportService.addStyledTable(
      sheet2,
      start2,
      cols,
      toRows(discipline),
    );
    sheet2.getCell(`A${start2 - 1}`).note =
      'Tóm tắt nội bộ — không phải biên bản chính thức. Tham chiếu: TT 57/2020/TT-BQP.';
    this.excelExportService.addDocumentHash(sheet2, `ky-luat-${dateRange}`);

    this.excelExportService.addLegalReferencesSheet(wb, [
      'Thông tư 57/2020/TT-BQP về công tác khen thưởng, kỷ luật dân quân tự vệ',
      'Nghị định 72/2020/NĐ-CP về lực lượng dân quân tự vệ',
    ]);

    const filename = `KhenThuong_KyLuat_${params.from ?? 'all'}_${params.to ?? 'all'}.xlsx`;
    await this.excelExportService.streamToResponse(wb, res, filename);
  }
}
