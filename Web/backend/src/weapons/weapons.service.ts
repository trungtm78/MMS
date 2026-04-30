import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, IsNull, Repository } from 'typeorm'
import { WeaponItem } from './entities/weapon-item.entity'
import { WeaponAllocation } from './entities/weapon-allocation.entity'
import { CreateWeaponDto } from './dto/create-weapon.dto'
import { UpdateWeaponDto } from './dto/update-weapon.dto'
import { CreateAllocationDto } from './dto/create-allocation.dto'
import { ReturnAllocationDto } from './dto/return-allocation.dto'

@Injectable()
export class WeaponsService {
  constructor(
    @InjectRepository(WeaponItem)
    private weaponRepo: Repository<WeaponItem>,
    @InjectRepository(WeaponAllocation)
    private allocationRepo: Repository<WeaponAllocation>,
    private dataSource: DataSource,
  ) {}

  async findAll(): Promise<WeaponItem[]> {
    return this.weaponRepo.find({ where: { status: 'active' as const } })
  }

  async findOne(id: string): Promise<WeaponItem> {
    const weapon = await this.weaponRepo.findOne({ where: { id } })
    if (!weapon) throw new NotFoundException('weapon_not_found')
    return weapon
  }

  async create(dto: CreateWeaponDto): Promise<WeaponItem> {
    const existing = await this.weaponRepo.findOne({ where: { serialNumber: dto.serialNumber } })
    if (existing) throw new ConflictException('serial_number_already_exists')
    const weapon = this.weaponRepo.create({
      ...dto,
      condition: dto.condition as 'good' | 'damaged' | 'maintenance',
      status: 'active' as const,
    })
    return this.weaponRepo.save(weapon) as Promise<WeaponItem>
  }

  async update(id: string, dto: UpdateWeaponDto): Promise<WeaponItem> {
    const weapon = await this.findOne(id)
    if (weapon.status === 'retired') throw new BadRequestException('cannot_update_retired_weapon')
    Object.assign(weapon, dto)
    return this.weaponRepo.save(weapon)
  }

  // Wrap retire in transaction with SELECT FOR UPDATE to prevent TOCTOU race
  async retire(id: string): Promise<void> {
    await this.dataSource.transaction(async (mgr) => {
      const rows = await mgr.query<{ id: string; status: string }[]>(
        `SELECT id, status FROM weapons WHERE id = $1 FOR UPDATE`,
        [id],
      )
      if (!rows.length) throw new NotFoundException('weapon_not_found')
      if (rows[0].status === 'retired') throw new ConflictException('weapon_already_retired')
      const activeAlloc = await this.allocationRepo.findOne({
        where: { weaponId: id, returnedAt: IsNull() },
      })
      if (activeAlloc) throw new BadRequestException('weapon_has_active_allocation')
      await mgr.query(`UPDATE weapons SET status = 'retired', updated_at = NOW() WHERE id = $1`, [id])
    })
  }

  async getAllocations(): Promise<WeaponAllocation[]> {
    return this.allocationRepo.find()
  }

  // Wrap allocation in transaction with SELECT FOR UPDATE to prevent double-allocation
  async createAllocation(dto: CreateAllocationDto): Promise<WeaponAllocation> {
    return this.dataSource.transaction(async (mgr) => {
      const weapons = await mgr.query<{ id: string; status: string }[]>(
        `SELECT id, status FROM weapons WHERE id = $1 FOR UPDATE`,
        [dto.weaponId],
      )
      if (!weapons.length) throw new NotFoundException('weapon_not_found')
      if (weapons[0].status !== 'active') throw new BadRequestException('weapon_not_available')

      const existing = await this.allocationRepo.findOne({
        where: { weaponId: dto.weaponId, returnedAt: IsNull() },
      })
      if (existing) throw new ConflictException('weapon_already_allocated')

      const allocation = this.allocationRepo.create({
        weaponId: dto.weaponId,
        recipientId: dto.recipientId,
        issuedAt: new Date(dto.issuedAt),
        purpose: dto.purpose,
        returnedAt: dto.returnedAt ? new Date(dto.returnedAt) : null,
      })
      return this.allocationRepo.save(allocation)
    })
  }

  async returnAllocation(id: string, dto: ReturnAllocationDto): Promise<WeaponAllocation> {
    const allocation = await this.allocationRepo.findOne({ where: { id } })
    if (!allocation) throw new NotFoundException('allocation_not_found')
    if (allocation.returnedAt) throw new ConflictException('weapon_already_returned')
    const returnDate = new Date(dto.returnedAt)
    if (returnDate < allocation.issuedAt) {
      throw new BadRequestException('return_date_cannot_be_before_issue_date')
    }
    allocation.returnedAt = returnDate
    return this.allocationRepo.save(allocation)
  }
}
