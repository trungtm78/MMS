// US-SS-01: MilitiaService — search with unaccent + smart ranking
// US-SS-05: Quick-create militia profile inline
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AssignmentsService } from '../assignments/assignments.service';

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
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly assignmentsService: AssignmentsService,
  ) {}

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

    const inserted = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO militia_profiles
         (militia_code, full_name, cccd, phone, rank, unit_id, gender, dob, position, join_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
       RETURNING id`,
      [
        dto.militiaCode,
        dto.fullName,
        defaultCccd,
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
    const CA_ROLES = new Set(['ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area']);
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

  // Get single militia member with unitScope enforcement
  async getMilitiaById(
    user: { role: string; unitScope: string | null },
    id: string,
  ): Promise<MilitiaSearchItem> {
    const rows = await this.dataSource.query<(MilitiaSearchItem & { unitCode: string })[]>(
      `SELECT mp.id, mp.user_id AS "userId", mp.militia_code AS "militiaCode", mp.full_name AS "fullName",
              mp.phone, mp.rank, mp.status, u.code AS "unitCode", u.name AS "unitName"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('militia_not_found');
    const row = rows[0];
    if (user.role !== 'system_admin' && user.unitScope && row.unitCode !== user.unitScope) {
      throw new ForbiddenException('unit_scope_violation');
    }
    return row;
  }
}
