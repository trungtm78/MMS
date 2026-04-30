import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { OrganizationUnit } from './entities/organization-unit.entity'
import { CreateUnitDto } from './dto/create-unit.dto'
import { UpdateUnitDto } from './dto/update-unit.dto'
import { UpdatePositionDto } from './dto/update-position.dto'

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

  async createUnit(dto: CreateUnitDto): Promise<OrganizationUnit> {
    const unit = this.repo.create(dto)
    return this.repo.save(unit)
  }

  async getUnitById(id: string): Promise<OrganizationUnit> {
    const unit = await this.repo.findOne({ where: { id }, relations: ['children', 'parent'] })
    if (!unit) {
      throw new NotFoundException(`Unit with id ${id} not found`)
    }
    return unit
  }

  async updateUnit(id: string, dto: UpdateUnitDto): Promise<OrganizationUnit> {
    const unit = await this.repo.findOne({ where: { id } })
    if (!unit) {
      throw new NotFoundException(`Unit with id ${id} not found`)
    }
    const updateFields = Object.keys(dto).filter(k => (dto as Record<string, unknown>)[k] !== undefined)
    if (updateFields.length === 0) {
      throw new BadRequestException('No fields provided to update')
    }
    Object.assign(unit, dto)
    return this.repo.save(unit)
  }

  async deleteUnit(id: string): Promise<void> {
    const unit = await this.repo.findOne({ where: { id }, relations: ['children'] })
    if (!unit) {
      throw new NotFoundException(`Unit with id ${id} not found`)
    }
    if (unit.children && unit.children.length > 0) {
      throw new ConflictException(`Cannot delete unit with existing sub-units`)
    }
    await this.repo.remove(unit)
  }

  async updatePosition(id: string, dto: UpdatePositionDto): Promise<OrganizationUnit> {
    await this.repo.update(id, dto as Partial<OrganizationUnit>)
    const updated = await this.repo.findOne({ where: { id } })
    if (!updated) {
      throw new NotFoundException(`Position with id ${id} not found`)
    }
    return updated
  }
}
