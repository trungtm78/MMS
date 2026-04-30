import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Request,
  UseGuards, HttpCode, HttpStatus, UsePipes, ValidationPipe,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

@Controller('recruitment/applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecruitmentController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get()
  @Roles('system_admin', 'office_staff', 'police_ward', 'ca_officer')
  async listApplications(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.recruitmentService.listApplications({ status, page, limit });
  }

  @Post()
  @Roles('system_admin', 'office_staff', 'police_ward')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createApplication(
    @Body() dto: CreateApplicationDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.recruitmentService.createApplication(dto, req.user.sub);
  }

  @Get(':id')
  @Roles('system_admin', 'office_staff', 'police_ward', 'ca_officer')
  async getApplicationById(@Param('id') id: string) {
    return this.recruitmentService.getApplicationById(id);
  }

  @Patch(':id')
  @Roles('system_admin', 'office_staff', 'police_ward')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateApplication(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.recruitmentService.updateApplication(id, dto, req.user.sub);
  }

  @Delete(':id')
  @Roles('system_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteApplication(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ) {
    const isAdmin = req.user.role === 'system_admin';
    await this.recruitmentService.deleteApplication(id, req.user.sub, isAdmin);
  }
}
