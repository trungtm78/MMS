import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
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
    // Check unique serial number
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

  async retire(id: string): Promise<void> {
    const weapon = await this.findOne(id)
    if (weapon.status === 'retired') throw new ConflictException('weapon_already_retired')
    // Check no active allocation
    const activeAlloc = await this.allocationRepo.findOne({
      where: { weaponId: id, returnedAt: null as unknown as Date },
    })
    if (activeAlloc) throw new BadRequestException('weapon_has_active_allocation')
    weapon.status = 'retired'
    await this.weaponRepo.save(weapon)
  }

  async getAllocations(): Promise<WeaponAllocation[]> {
    return this.allocationRepo.find()
  }

  async createAllocation(dto: CreateAllocationDto): Promise<WeaponAllocation> {
    // Check weapon exists and is active
    const weapon = await this.findOne(dto.weaponId)
    if (weapon.status !== 'active') throw new BadRequestException('weapon_not_available')
    // Check no active allocation for this weapon
    const existing = await this.allocationRepo.findOne({
      where: { weaponId: dto.weaponId, returnedAt: null as unknown as Date },
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
