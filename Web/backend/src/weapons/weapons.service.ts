import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import type { Response } from 'express';
import { WeaponItem } from './entities/weapon-item.entity';
import { WeaponAllocation } from './entities/weapon-allocation.entity';
import { CreateWeaponDto } from './dto/create-weapon.dto';
import { UpdateWeaponDto } from './dto/update-weapon.dto';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { ReturnAllocationDto } from './dto/return-allocation.dto';
import { ExcelExportService } from '../common/services/excel-export.service';
import { businessDate } from '../common/time/business-date';

/** GET /weapons: a weapon with the name of the member responsible for it. */
export interface WeaponListItem extends Omit<
  WeaponItem,
  'createdAt' | 'updatedAt'
> {
  responsiblePersonName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** GET /weapons/allocations: an allocation naming its weapon and recipient. */
export interface AllocationListItem extends WeaponAllocation {
  weaponSerialNumber: string;
  weaponType: string;
  recipientName: string;
  recipientCode: string;
}

@Injectable()
export class WeaponsService {
  constructor(
    @InjectRepository(WeaponItem)
    private weaponRepo: Repository<WeaponItem>,
    @InjectRepository(WeaponAllocation)
    private allocationRepo: Repository<WeaponAllocation>,
    private dataSource: DataSource,
    private excelExportService: ExcelExportService,
  ) {}

  // The register of active weapons, each with the name of the member responsible for it
  async findAll(): Promise<WeaponListItem[]> {
    return this.dataSource.query<WeaponListItem[]>(
      `SELECT w.id, w.type, w.serial_number AS "serialNumber", w.acquired_at AS "acquiredAt",
              w.condition, w.storage_location AS "storageLocation",
              w.responsible_person_id AS "responsiblePersonId",
              rp.full_name AS "responsiblePersonName",
              w.status, w.created_at AS "createdAt", w.updated_at AS "updatedAt"
       FROM weapons w
       LEFT JOIN militia_profiles rp ON rp.id = w.responsible_person_id
       WHERE w.status = 'active'
       ORDER BY w.type, w.serial_number`,
    );
  }

  async findOne(id: string): Promise<WeaponItem> {
    const weapon = await this.weaponRepo.findOne({ where: { id } });
    if (!weapon) throw new NotFoundException('weapon_not_found');
    return weapon;
  }

  async create(dto: CreateWeaponDto): Promise<WeaponItem> {
    const existing = await this.weaponRepo.findOne({
      where: { serialNumber: dto.serialNumber },
    });
    if (existing) throw new ConflictException('serial_number_already_exists');
    const weapon = this.weaponRepo.create({
      ...dto,
      condition: dto.condition as 'good' | 'damaged' | 'maintenance',
      status: 'active' as const,
    });
    return this.weaponRepo.save(weapon);
  }

  async update(id: string, dto: UpdateWeaponDto): Promise<WeaponItem> {
    const weapon = await this.findOne(id);
    if (weapon.status === 'retired')
      throw new BadRequestException('cannot_update_retired_weapon');
    Object.assign(weapon, dto);
    return this.weaponRepo.save(weapon);
  }

  // Wrap retire in transaction with SELECT FOR UPDATE to prevent TOCTOU race
  async retire(id: string): Promise<void> {
    await this.dataSource.transaction(async (mgr) => {
      const rows = await mgr.query<{ id: string; status: string }[]>(
        `SELECT id, status FROM weapons WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!rows.length) throw new NotFoundException('weapon_not_found');
      if (rows[0].status === 'retired')
        throw new ConflictException('weapon_already_retired');
      // Same connection as the FOR UPDATE above
      const activeAlloc = await mgr.getRepository(WeaponAllocation).findOne({
        where: { weaponId: id, returnedAt: IsNull() },
      });
      if (activeAlloc)
        throw new BadRequestException('weapon_has_active_allocation');
      await mgr.query(
        `UPDATE weapons SET status = 'retired', updated_at = NOW() WHERE id = $1`,
        [id],
      );
    });
  }

  // Allocations newest first, naming the weapon and the member who received it, so a client
  // needs no request per row. Every allocation has a recipient (NOT NULL, ON DELETE RESTRICT).
  async getAllocations(): Promise<AllocationListItem[]> {
    return this.dataSource.query<AllocationListItem[]>(
      `SELECT wa.id, wa.weapon_id AS "weaponId", wa.recipient_id AS "recipientId",
              wa.issued_at AS "issuedAt", wa.purpose, wa.returned_at AS "returnedAt",
              wa.created_at AS "createdAt",
              w.serial_number AS "weaponSerialNumber", w.type AS "weaponType",
              mp.full_name AS "recipientName", mp.militia_code AS "recipientCode"
       FROM weapon_allocations wa
       JOIN weapons w ON w.id = wa.weapon_id
       JOIN militia_profiles mp ON mp.id = wa.recipient_id
       ORDER BY wa.issued_at DESC, wa.id`,
    );
  }

  // Wrap allocation in transaction with SELECT FOR UPDATE to prevent double-allocation
  async createAllocation(dto: CreateAllocationDto): Promise<WeaponAllocation> {
    return this.dataSource.transaction(async (mgr) => {
      const weapons = await mgr.query<{ id: string; status: string }[]>(
        `SELECT id, status FROM weapons WHERE id = $1 FOR UPDATE`,
        [dto.weaponId],
      );
      if (!weapons.length) throw new NotFoundException('weapon_not_found');
      if (weapons[0].status !== 'active')
        throw new BadRequestException('weapon_not_available');

      // Read and write on the transaction's connection: the INSERT's foreign-key check
      // on another connection would wait for the weapon lock this transaction holds
      const allocations = mgr.getRepository(WeaponAllocation);
      const existing = await allocations.findOne({
        where: { weaponId: dto.weaponId, returnedAt: IsNull() },
      });
      if (existing) throw new ConflictException('weapon_already_allocated');

      const allocation = allocations.create({
        weaponId: dto.weaponId,
        recipientId: dto.recipientId,
        issuedAt: new Date(dto.issuedAt),
        purpose: dto.purpose,
        returnedAt: dto.returnedAt ? new Date(dto.returnedAt) : null,
      });
      return allocations.save(allocation);
    });
  }

  async returnAllocation(
    id: string,
    dto: ReturnAllocationDto,
  ): Promise<WeaponAllocation> {
    const allocation = await this.allocationRepo.findOne({ where: { id } });
    if (!allocation) throw new NotFoundException('allocation_not_found');
    if (allocation.returnedAt)
      throw new ConflictException('weapon_already_returned');
    const returnDate = new Date(dto.returnedAt);
    if (returnDate < allocation.issuedAt) {
      throw new BadRequestException('return_date_cannot_be_before_issue_date');
    }
    allocation.returnedAt = returnDate;
    return this.allocationRepo.save(allocation);
  }

  // Sprint 3: GET /weapons/inventory-report
  async getInventoryReport(): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT w.id, w.type AS "weaponType", w.serial_number AS "serialNumber",
              w.condition, w.storage_location AS "storageLocation",
              w.acquired_at AS "acquiredAt", w.status,
              mp.full_name AS "responsiblePersonName",
              holder.full_name AS "currentHolder",
              wa.issued_at AS "issuedAt",
              wa.returned_at AS "returnedAt",
              CASE
                WHEN wa.id IS NOT NULL AND wa.returned_at IS NULL
                     AND wa.issued_at < NOW() - INTERVAL '180 days'
                THEN true ELSE false
              END AS "overdue"
       FROM weapons w
       LEFT JOIN militia_profiles mp ON mp.id = w.responsible_person_id
       LEFT JOIN weapon_allocations wa
         ON wa.weapon_id = w.id AND wa.returned_at IS NULL
       LEFT JOIN militia_profiles holder ON holder.id = wa.recipient_id
       WHERE w.status = 'active'
       ORDER BY w.type, w.serial_number`,
    );
  }

  // Sprint 3: GET /weapons/export → xlsx (3 sheets)
  async exportInventory(res: Response): Promise<void> {
    const inventoryRows = (await this.getInventoryReport()) as Record<
      string,
      unknown
    >[];
    const allocations = await this.allocationRepo.find({
      order: { issuedAt: 'DESC' },
    });

    const wb = this.excelExportService.createWorkbook();
    const reportDate = new Date();

    // Sheet 1: Tình trạng kho
    const sheet1 = wb.addWorksheet('Tình trạng kho');
    const start1 = this.excelExportService.addGovernmentHeader(sheet1, {
      agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
      reportTitle: 'TÌNH TRẠNG KHO VŨ KHÍ TRANG THIẾT BỊ',
      reportDate,
    });
    const tableRows1 = inventoryRows.map((r, idx) => ({
      stt: idx + 1,
      weaponType: r['weaponType'],
      serialNumber: r['serialNumber'],
      condition: r['condition'],
      storageLocation: r['storageLocation'],
      acquiredAt: r['acquiredAt'] ? new Date(r['acquiredAt'] as string) : null,
      status: r['status'],
      responsiblePersonName: r['responsiblePersonName'],
      currentHolder: r['currentHolder'],
    }));
    this.excelExportService.addStyledTable(
      sheet1,
      start1,
      [
        { header: 'STT', key: 'stt', width: 6, type: 'number' },
        { header: 'Loại vũ khí', key: 'weaponType', width: 20 },
        { header: 'Số hiệu', key: 'serialNumber', width: 16 },
        { header: 'Tình trạng', key: 'condition', width: 14, type: 'status' },
        { header: 'Nơi cất', key: 'storageLocation', width: 18 },
        { header: 'Ngày nhập', key: 'acquiredAt', width: 14, type: 'date' },
        { header: 'Trạng thái', key: 'status', width: 12 },
        { header: 'Người chịu TN', key: 'responsiblePersonName', width: 20 },
        { header: 'Đang cấp phát cho', key: 'currentHolder', width: 20 },
      ],
      tableRows1,
    );
    this.excelExportService.addDocumentHash(sheet1, JSON.stringify(tableRows1));

    // Sheet 2: Biên bản kiểm kê (nội bộ)
    const sheet2 = wb.addWorksheet('Biên bản kiểm kê');
    const start2 = this.excelExportService.addGovernmentHeader(sheet2, {
      agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
      reportTitle: 'BIÊN BẢN KIỂM KÊ VŨ KHÍ TRANG THIẾT BỊ (NỘI BỘ)',
      reportDate,
    });
    const goods = inventoryRows.filter((r) => r['condition'] === 'good').length;
    const damaged = inventoryRows.filter(
      (r) => r['condition'] === 'damaged',
    ).length;
    const maintenance = inventoryRows.filter(
      (r) => r['condition'] === 'maintenance',
    ).length;
    const overdue = inventoryRows.filter((r) => r['overdue']).length;
    this.excelExportService.addSummaryStatsTable(
      sheet2,
      start2,
      'Tổng hợp kiểm kê',
      [
        { label: 'Tổng số vũ khí/trang thiết bị', value: inventoryRows.length },
        { label: 'Tình trạng tốt', value: goods },
        { label: 'Đang bảo trì', value: maintenance },
        { label: 'Hỏng', value: damaged },
        {
          label: 'Quá hạn cấp phát (>180 ngày)',
          value: overdue,
          highlight: overdue > 0,
        },
      ],
    );
    sheet2.getCell('A1').note =
      'Tóm tắt nội bộ — không phải biên bản chính thức. Cần in và ký tay trước khi nộp cơ quan.';
    this.excelExportService.addSignatureBlock(sheet2, start2 + 8, {
      position: 'Chỉ huy trưởng DQTV',
    });
    this.excelExportService.addDocumentHash(
      sheet2,
      `kiemdke-${reportDate.toISOString()}`,
    );

    // Sheet 3: Lịch sử cấp phát
    const sheet3 = wb.addWorksheet('Lịch sử cấp phát');
    const start3 = this.excelExportService.addGovernmentHeader(sheet3, {
      agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
      reportTitle: 'LỊCH SỬ CẤP PHÁT VŨ KHÍ TRANG THIẾT BỊ',
      reportDate,
    });
    const tableRows3 = allocations.map((a, idx) => ({
      stt: idx + 1,
      weaponId: a.weaponId,
      recipientId: a.recipientId,
      purpose: a.purpose,
      issuedAt: a.issuedAt,
      returnedAt: a.returnedAt,
    }));
    this.excelExportService.addStyledTable(
      sheet3,
      start3,
      [
        { header: 'STT', key: 'stt', width: 6, type: 'number' },
        { header: 'Vũ khí (ID)', key: 'weaponId', width: 20 },
        { header: 'Người nhận (ID)', key: 'recipientId', width: 20 },
        { header: 'Mục đích', key: 'purpose', width: 30 },
        { header: 'Ngày cấp', key: 'issuedAt', width: 14, type: 'date' },
        { header: 'Ngày trả', key: 'returnedAt', width: 14, type: 'date' },
      ],
      tableRows3,
    );
    this.excelExportService.addDocumentHash(sheet3, JSON.stringify(tableRows3));

    const filename = `KiemKe_VuKhi_${businessDate(reportDate).isoDate}.xlsx`;
    await this.excelExportService.streamToResponse(wb, res, filename);
  }
}
