import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Exemption } from './entities/exemption.entity'

@Injectable()
export class ExemptionService {
  constructor(
    @InjectRepository(Exemption)
    private repo: Repository<Exemption>,
  ) {}

  async findAll(): Promise<Exemption[]> {
    return this.repo.find()
  }

  async create(dto: Partial<Exemption>): Promise<Exemption> {
    const exemption = this.repo.create(dto)
    return this.repo.save(exemption)
  }

  async review(id: string, dto: Partial<Exemption>): Promise<Exemption> {
    await this.repo.update(id, dto)
    return this.repo.findOneOrFail({ where: { id } })
  }
}
