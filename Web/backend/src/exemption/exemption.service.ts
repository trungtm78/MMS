import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  assertUnitInScope,
  effectiveUnit,
  type ScopedActor,
} from '../common/access/unit-scope';
import type {
  ExemptionStatus,
  ExemptionType,
  ReviewStatus,
} from './exemption.dto';

export type ExemptionActor = ScopedActor;

export interface ExemptionFilters {
  status?: ExemptionStatus;
  militiaId?: string;
  unitCode?: string;
}

export interface CreateExemptionInput {
  militiaId: string;
  type: ExemptionType;
  reason: string;
  legalBasis: string;
  effectiveDate: string;
  expiryDate?: string;
  documents?: string[];
}

export interface ExemptionRecord {
  id: string;
  militiaId: string;
  militiaName: string;
  militiaCode: string;
  unitCode: string;
  type: ExemptionType;
  reason: string;
  legalBasis: string;
  effectiveDate: string;
  expiryDate: string | null;
  status: ExemptionStatus;
  documents: string[];
  createdAt: Date;
  updatedAt: Date;
}

// A decision past its expiry date reads as expired even before anyone marks it,
// so lists, counts and review rules never depend on a background job.
const EFFECTIVE_STATUS = `CASE WHEN e.status = 'active'
                  AND e.expiry_date < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                 THEN 'expired' ELSE e.status END`;

// Dates are formatted in SQL: node-postgres would turn DATE into a local-midnight Date
const RECORD_SELECT = `SELECT x.* FROM (
         SELECT e.id, e.militia_id AS "militiaId",
                mp.full_name AS "militiaName", mp.militia_code AS "militiaCode",
                u.code AS "unitCode",
                e.type, e.reason, e.legal_basis AS "legalBasis",
                to_char(e.effective_date, 'YYYY-MM-DD') AS "effectiveDate",
                to_char(e.expiry_date, 'YYYY-MM-DD') AS "expiryDate",
                ${EFFECTIVE_STATUS} AS status,
                COALESCE(e.documents, '{}') AS documents,
                e.created_at AS "createdAt", e.updated_at AS "updatedAt"
         FROM exemptions e
         JOIN militia_profiles mp ON mp.id = e.militia_id
         JOIN units u ON u.id = mp.unit_id
       ) x`;

@Injectable()
export class ExemptionService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  async findAll(
    actor: ExemptionActor,
    filters: ExemptionFilters,
  ): Promise<ExemptionRecord[]> {
    const unit = effectiveUnit(actor, filters.unitCode);
    return this.ds.query<ExemptionRecord[]>(
      `${RECORD_SELECT}
       WHERE ($1::text IS NULL OR x."unitCode" = $1)
         AND ($2::text IS NULL OR x.status = $2)
         AND ($3::uuid IS NULL OR x."militiaId" = $3)
       ORDER BY x."effectiveDate" DESC, x."createdAt" DESC`,
      [unit, filters.status ?? null, filters.militiaId ?? null],
    );
  }

  async findOne(
    id: string,
    runner: DataSource | EntityManager = this.ds,
  ): Promise<ExemptionRecord> {
    const rows = await runner.query<ExemptionRecord[]>(
      `${RECORD_SELECT} WHERE x.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('exemption_not_found');
    return rows[0];
  }

  async create(
    actor: ExemptionActor,
    input: CreateExemptionInput,
  ): Promise<ExemptionRecord> {
    const expiryDate = input.expiryDate ?? null;
    // YYYY-MM-DD strings compare in calendar order
    if (expiryDate !== null && expiryDate < input.effectiveDate) {
      throw new BadRequestException('expiry_before_effective');
    }

    return this.ds.transaction(async (mgr) => {
      // Locking the member serializes concurrent decisions for them, so two
      // overlapping ones cannot both pass the check below
      const militia = await mgr.query<{ id: string; unitCode: string }[]>(
        `SELECT mp.id, u.code AS "unitCode"
         FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         WHERE mp.id = $1
         FOR UPDATE OF mp`,
        [input.militiaId],
      );
      if (!militia.length) throw new BadRequestException('militia_not_found');
      assertUnitInScope(actor, militia[0].unitCode);

      // A NULL expiry is an open-ended range
      const overlapping = await mgr.query<{ id: string }[]>(
        `SELECT e.id FROM exemptions e
         WHERE e.militia_id = $1
           AND e.status = 'active'
           AND daterange(e.effective_date, e.expiry_date, '[]') && daterange($2::date, $3::date, '[]')
         LIMIT 1`,
        [input.militiaId, input.effectiveDate, expiryDate],
      );
      if (overlapping.length) {
        throw new ConflictException('overlapping_active_exemption');
      }

      const inserted = await mgr.query<{ id: string }[]>(
        `INSERT INTO exemptions (militia_id, type, reason, legal_basis, effective_date, expiry_date, status, documents)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
         RETURNING id`,
        [
          input.militiaId,
          input.type,
          input.reason.trim(),
          input.legalBasis.trim(),
          input.effectiveDate,
          expiryDate,
          input.documents ?? [],
        ],
      );
      return this.findOne(inserted[0].id, mgr);
    });
  }

  async review(
    actor: ExemptionActor,
    id: string,
    status: ReviewStatus,
  ): Promise<ExemptionRecord> {
    return this.ds.transaction(async (mgr) => {
      const rows = await mgr.query<
        { id: string; status: ExemptionStatus; unitCode: string }[]
      >(
        `SELECT e.id, ${EFFECTIVE_STATUS} AS status, u.code AS "unitCode"
         FROM exemptions e
         JOIN militia_profiles mp ON mp.id = e.militia_id
         JOIN units u ON u.id = mp.unit_id
         WHERE e.id = $1
         FOR UPDATE OF e`,
        [id],
      );
      if (!rows.length) throw new NotFoundException('exemption_not_found');
      assertUnitInScope(actor, rows[0].unitCode);
      if (rows[0].status !== 'active') {
        throw new ConflictException('invalid_status_transition');
      }

      await mgr.query(
        `UPDATE exemptions SET status = $2, updated_at = now() WHERE id = $1`,
        [id, status],
      );
      return this.findOne(id, mgr);
    });
  }
}
