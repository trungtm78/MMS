import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { OrganizationService } from './organization.service'
import { CreateUnitDto } from './dto/create-unit.dto'
import { UpdateUnitDto } from './dto/update-unit.dto'
import { UpdatePositionDto } from './dto/update-position.dto'

@Controller('organization')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('structure')
  @Roles('system_admin', 'office_staff', 'police_ward', 'police_area')
  async getStructure() {
    return this.organizationService.getStructure()
  }

  @Post('units')
  @Roles('system_admin')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createUnit(@Body() dto: CreateUnitDto) {
    return this.organizationService.createUnit(dto)
  }

  @Get('units/:id')
  @Roles('system_admin', 'office_staff', 'police_ward', 'police_area')
  async getUnit(@Param('id') id: string) {
    return this.organizationService.getUnitById(id)
  }

  @Patch('units/:id')
  @Roles('system_admin')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateUnit(@Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.organizationService.updateUnit(id, dto)
  }

  @Delete('units/:id')
  @Roles('system_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUnit(@Param('id') id: string) {
    await this.organizationService.deleteUnit(id)
  }

  @Patch('positions/:id')
  @Roles('system_admin')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updatePosition(@Param('id') id: string, @Body() dto: UpdatePositionDto) {
    return this.organizationService.updatePosition(id, dto)
  }
}
