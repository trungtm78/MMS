import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Res, UseGuards, HttpCode, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common'
import type { Response } from 'express'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { WeaponsService } from './weapons.service'
import { CreateWeaponDto } from './dto/create-weapon.dto'
import { UpdateWeaponDto } from './dto/update-weapon.dto'
import { CreateAllocationDto } from './dto/create-allocation.dto'
import { ReturnAllocationDto } from './dto/return-allocation.dto'

@Controller('weapons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'office_staff', 'police_ward')
export class WeaponsController {
  constructor(private readonly weaponsService: WeaponsService) {}

  @Get()
  async findAll() {
    return this.weaponsService.findAll()
  }

  // Sprint 3: GET /weapons/inventory-report
  @Get('inventory-report')
  async getInventoryReport() {
    return this.weaponsService.getInventoryReport()
  }

  // Sprint 3: GET /weapons/export → xlsx (3 sheets)
  @Get('export')
  async exportInventory(@Res() res: Response) {
    return this.weaponsService.exportInventory(res)
  }

  // STATIC ROUTES TRUOC dynamic :id (tranh route shadowing)
  @Get('allocations')
  async getAllocations() {
    return this.weaponsService.getAllocations()
  }

  @Post('allocations')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createAllocation(@Body() dto: CreateAllocationDto) {
    return this.weaponsService.createAllocation(dto)
  }

  @Patch('allocations/:id/return')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async returnAllocation(@Param('id') id: string, @Body() dto: ReturnAllocationDto) {
    return this.weaponsService.returnAllocation(id, dto)
  }

  // DYNAMIC :id ROUTES SAU cac static routes
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.weaponsService.findOne(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Body() dto: CreateWeaponDto) {
    return this.weaponsService.create(dto)
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async update(@Param('id') id: string, @Body() dto: UpdateWeaponDto) {
    return this.weaponsService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('system_admin')
  async retire(@Param('id') id: string) {
    await this.weaponsService.retire(id)
  }
}
