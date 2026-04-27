import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { WeaponsService } from './weapons.service'

@Controller('weapons')
@UseGuards(JwtAuthGuard)
export class WeaponsController {
  constructor(private readonly weaponsService: WeaponsService) {}

  @Get()
  async findAll() {
    return this.weaponsService.findAll()
  }

  @Post()
  async create(@Body() dto: any) {
    return this.weaponsService.create(dto)
  }

  @Get('allocations')
  async getAllocations() {
    return this.weaponsService.getAllocations()
  }

  @Post('allocations')
  async createAllocation(@Body() dto: any) {
    return this.weaponsService.createAllocation(dto)
  }
}
