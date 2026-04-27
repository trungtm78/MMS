import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { WeaponItem } from './entities/weapon-item.entity'
import { WeaponAllocation } from './entities/weapon-allocation.entity'

@Injectable()
export class WeaponsService {
  constructor(
    @InjectRepository(WeaponItem)
    private weaponRepo: Repository<WeaponItem>,
    @InjectRepository(WeaponAllocation)
    private allocationRepo: Repository<WeaponAllocation>,
  ) {}

  async findAll(): Promise<WeaponItem[]> {
    return this.weaponRepo.find()
  }

  async create(dto: Partial<WeaponItem>): Promise<WeaponItem> {
    const weapon = this.weaponRepo.create(dto)
    return this.weaponRepo.save(weapon)
  }

  async getAllocations(): Promise<WeaponAllocation[]> {
    return this.allocationRepo.find()
  }

  async createAllocation(dto: Partial<WeaponAllocation>): Promise<WeaponAllocation> {
    const allocation = this.allocationRepo.create(dto)
    return this.allocationRepo.save(allocation)
  }
}
