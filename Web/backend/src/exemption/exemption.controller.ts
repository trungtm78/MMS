import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { ExemptionService } from './exemption.service'

@Controller('exemptions')
@UseGuards(JwtAuthGuard)
export class ExemptionController {
  constructor(private readonly exemptionService: ExemptionService) {}

  @Get()
  async findAll() {
    return this.exemptionService.findAll()
  }

  @Post()
  async create(@Body() dto: any) {
    return this.exemptionService.create(dto)
  }

  @Patch(':id/review')
  async review(@Param('id') id: string, @Body() dto: any) {
    return this.exemptionService.review(id, dto)
  }
}
