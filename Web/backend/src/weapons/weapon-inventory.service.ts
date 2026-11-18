import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { effectiveUnit, type ScopedActor } from '../common/access/unit-scope';
import { writeAuditLog, type AuditOrigin } from '../common/audit/audit-log';
import { assertDateRange } from '../common/validation/date-range';
import type { WeaponCondition } from './weapon-inventory-codes';

export interface InventoryActor extends ScopedActor {
  sub: string;
}

export interface InventoryItemInput {
  weaponId: string;
  found: boolean;
  observedCondition?: WeaponCondition;
}

export interface RecordInventoryInput {
  confirmedCount: number;
  notes?: string;
  items?: InventoryItemInput[];
}

export interface InventoryFilters {
  from?: string;
  to?: string;
}

export interface InventoryCheckRecord {
  id: string;
  checkDate: string;
  performedBy: string;
  performedByName: string;
  // Active weapons on record when the check was saved
  expectedCount: number;
  confirmedCount: number;
  // confirmedCount - expectedCount: negative when weapons are missing
  discrepancy: number;
  notes: string | null;
  itemCount: number;
  verifiedCount: number;
  missingCount: number;
  createdAt: Date;
}

export interface InventoryItemRecord {
  weaponId: string;
  weaponType: string;
  serialNumber: string;
  condition: WeaponCondition;
  storageLocation: string;
  holderMilitiaId: string | null;
  holderName: string | null;
  found: boolean | null;
  observedCondition: WeaponCondition | null;
}

export interface InventoryCheckDetail extends InventoryCheckRecord {
  items: InventoryItemRecord[];
}

const CHECK_COLUMNS = `c.id,
         to_char(c.check_date, 'YYYY-MM-DD') AS "checkDate",
         c.performed_by AS "performedBy",
         pu.full_name AS "performedByName",
         c.expected_count AS "expectedCount",
         c.confirmed_count AS "confirmedCount",
         c.discrepancy,
         c.notes,
         i.item_count AS "itemCount",
         i.verified_count AS "verifiedCount",
         i.missing_count AS "missingCount",
         c.created_at AS "createdAt"`;

const CHECK_FROM = `FROM weapon_inventory_checks c
       JOIN users pu ON pu.id = c.performed_by
       CROSS JOIN LATERAL (
         SELECT count(*)::int AS item_count,
                (count(*) FILTER (WHERE wi.found IS NOT NULL))::int AS verified_count,
                (count(*) FILTER (WHERE wi.found = false))::int AS missing_count
         FROM weapon_inventory_items wi
         WHERE wi.check_id = c.id
       ) i`;

const ITEMS_COLUMN = `(
         SELECT COALESCE(json_agg(json_build_object(
                  'weaponId', wi.weapon_id,
                  'weaponType', wi.weapon_type,
                  'serialNumber', wi.serial_number,
                  'condition', wi.condition,
                  'storageLocation', wi.storage_location,
                  'holderMilitiaId', wi.holder_militia_id,
                  'holderName', hp.full_name,
                  'found', wi.found,
                  'observedCondition', wi.observed_condition)
                ORDER BY wi.weapon_type, wi.serial_number), '[]'::json)
         FROM weapon_inventory_items wi
         LEFT JOIN militia_profiles hp ON hp.id = wi.holder_militia_id
         WHERE wi.check_id = c.id) AS items`;

@Injectable()
export class WeaponInventoryService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  private async detail(
    runner: DataSource | EntityManager,
    id: string,
  ): Promise<InventoryCheckDetail | undefined> {
    const rows = await runner.query<InventoryCheckDetail[]>(
      `SELECT ${CHECK_COLUMNS},
         ${ITEMS_COLUMN}
       ${CHECK_FROM}
       WHERE c.id = $1`,
      [id],
    );
    return rows[0];
  }

  // Kiểm kê: records what the checker confirmed against the register as it stands, with
  // a snapshot of every active weapon (condition, storage, current holder). The armoury
  // is the ward's, so only staff with a ward-wide scope may record a check.
  async record(
    actor: InventoryActor,
    input: RecordInventoryInput,
    origin?: AuditOrigin,
  ): Promise<InventoryCheckDetail> {
    if (effectiveUnit(actor) !== null) {
      throw new ForbiddenException('ward_scope_required');
    }
    const items = input.items;
    if (items?.some((item) => !item.found && item.observedCondition)) {
      throw new BadRequestException('observed_condition_without_found');
    }
    const notes = input.notes?.trim() || null;

    return this.ds.transaction(async (mgr) => {
      // Share-locking the active weapons freezes the register until the check is saved:
      // none can be retired, allocated or edited in between
      const register = await mgr.query<{ id: string }[]>(
        `SELECT w.id
         FROM weapons w
         WHERE w.status = 'active'
         ORDER BY w.id
         FOR SHARE`,
      );
      const activeIds = register.map((w) => w.id);

      if (items) {
        const active = new Set(activeIds);
        const listed = new Set(items.map((item) => item.weaponId));
        if (
          items.some((item) => !active.has(item.weaponId)) ||
          activeIds.some((weaponId) => !listed.has(weaponId))
        ) {
          throw new ConflictException('inventory_register_changed');
        }
        if (
          items.filter((item) => item.found).length !== input.confirmedCount
        ) {
          throw new BadRequestException('inventory_count_mismatch');
        }
      }

      const inserted = await mgr.query<{ id: string }[]>(
        `INSERT INTO weapon_inventory_checks (performed_by, expected_count, confirmed_count, notes)
         VALUES ($1::uuid, $2, $3, $4)
         RETURNING id`,
        [actor.sub, activeIds.length, input.confirmedCount, notes],
      );
      const id = inserted[0].id;

      // The snapshot names the locked weapons: a weapon created by a concurrent request
      // after the count was taken is not part of this check
      await mgr.query(
        `INSERT INTO weapon_inventory_items
           (check_id, weapon_id, weapon_type, serial_number, condition, storage_location,
            holder_militia_id, found, observed_condition)
         SELECT $1::uuid, w.id, w.type, w.serial_number, w.condition, w.storage_location,
                wa.recipient_id, e.found, e.observed_condition
         FROM weapons w
         LEFT JOIN weapon_allocations wa ON wa.weapon_id = w.id AND wa.returned_at IS NULL
         LEFT JOIN unnest($2::uuid[], $3::boolean[], $4::text[])
           AS e(weapon_id, found, observed_condition) ON e.weapon_id = w.id
         WHERE w.id = ANY($5::uuid[])`,
        [
          id,
          items?.map((item) => item.weaponId) ?? [],
          items?.map((item) => item.found) ?? [],
          items?.map((item) => item.observedCondition ?? null) ?? [],
          activeIds,
        ],
      );

      await writeAuditLog(
        mgr,
        {
          actorId: actor.sub,
          action: 'weapons.inventory_recorded',
          entityType: 'weapon_inventory_checks',
          entityId: id,
          details: {
            expectedCount: activeIds.length,
            confirmedCount: input.confirmedCount,
            discrepancy: input.confirmedCount - activeIds.length,
            itemCount: activeIds.length,
            verifiedItems: items?.length ?? 0,
          },
        },
        origin,
      );
      return (await this.detail(mgr, id))!;
    });
  }

  async list(filters: InventoryFilters): Promise<InventoryCheckRecord[]> {
    assertDateRange(filters.from, filters.to);
    return this.ds.query<InventoryCheckRecord[]>(
      `SELECT ${CHECK_COLUMNS}
       ${CHECK_FROM}
       WHERE ($1::date IS NULL OR c.check_date >= $1::date)
         AND ($2::date IS NULL OR c.check_date <= $2::date)
       ORDER BY c.check_date DESC, c.created_at DESC`,
      [filters.from ?? null, filters.to ?? null],
    );
  }

  async findOne(id: string): Promise<InventoryCheckDetail> {
    const check = await this.detail(this.ds, id);
    if (!check) throw new NotFoundException('inventory_check_not_found');
    return check;
  }
}
