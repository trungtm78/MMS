import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { OrganizationService } from './organization.service'

@Controller('organization')
@UseGuards(JwtAuthGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('structure')
  async getStructure() {
    return this.organizationService.getStructure()
  }

  @Post('units')
  async createUnit(@Body() dto: any) {
    return this.organizationService.createUnit(dto)
  }

  @Put('positions/:id')
  async updatePosition(@Param('id') id: string, @Body() dto: any) {
    return this.organizationService.updatePosition(id, dto)
  }
}
