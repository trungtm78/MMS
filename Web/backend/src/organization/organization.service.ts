import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { OrganizationUnit } from './entities/organization-unit.entity'

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(OrganizationUnit)
    private repo: Repository<OrganizationUnit>,
  ) {}

  async getStructure(): Promise<OrganizationUnit[]> {
    const units = await this.repo.find({ relations: ['children'] })
    return units.filter(u => !u.parentId)
  }

  async createUnit(dto: Partial<OrganizationUnit>): Promise<OrganizationUnit> {
    const unit = this.repo.create(dto)
    return this.repo.save(unit)
  }

  async updatePosition(id: string, dto: Partial<OrganizationUnit>): Promise<OrganizationUnit> {
    await this.repo.update(id, dto)
    return this.repo.findOneOrFail({ where: { id } })
  }
}
