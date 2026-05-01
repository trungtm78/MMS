import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { TrainingService } from './training.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ExcelExportService } from '../common/services/excel-export.service';
import type { JwtPayload } from '../auth/auth.service';

@Controller('training')
@UseGuards(JwtAuthGuard)
export class TrainingController {
  constructor(
    private readonly trainingService: TrainingService,
    private readonly excelExportService: ExcelExportService,
  ) {}

  // GET /training — list records (paginated, role-scoped)
  @Get()
  async listRecords(
    @Request() req: { user: JwtPayload },
    @Query('militiaId') militiaId?: string,
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year = 0,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.trainingService.listRecords(req.user, {
      militiaId: militiaId || undefined,
      year: year > 0 ? year : undefined,
      page,
      limit,
    });
  }

  // GET /training/compliance-report — per-militia compliance report (MUST be before /:id)
  @Get('compliance-report')
  @UseGuards(RolesGuard)
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  async getComplianceReport(
    @Request() req: { user: JwtPayload },
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year = 0,
    @Query('unitCode') unitCode?: string,
  ) {
    const effectiveYear = year > 0 ? year : new Date().getFullYear();
    return this.trainingService.getComplianceReport(req.user, effectiveYear, unitCode || undefined);
  }

  // GET /training/export — xlsx export of compliance report (MUST be before /:id)
  @Get('export')
  @UseGuards(RolesGuard)
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  async exportComplianceReport(
    @Request() req: { user: JwtPayload },
    @Res() res: Response,
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year = 0,
    @Query('unitCode') unitCode?: string,
  ) {
    const effectiveYear = year > 0 ? year : new Date().getFullYear();
    const workbook = await this.trainingService.exportComplianceReport(
      req.user,
      effectiveYear,
      unitCode || undefined,
    );
    const date = new Date().toISOString().slice(0, 10);
    const filename = `HuanLuyen_TuanThu_${effectiveYear}_${unitCode ?? 'ToanBo'}_${date}.xlsx`;
    await this.excelExportService.streamToResponse(workbook, res, filename);
  }

  // GET /training/report — yearly training report (MUST be before /:id)
  @Get('report')
  async getReport(
    @Request() req: { user: JwtPayload },
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year = 0,
    @Query('unitCode') unitCode?: string,
  ) {
    return this.trainingService.getReport(req.user, {
      year: year > 0 ? year : undefined,
      unitCode: unitCode || undefined,
    });
  }

  // GET /training/:id — get single record
  @Get(':id')
  async getRecord(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
  ) {
    return this.trainingService.getRecord(req.user, id);
  }

  // POST /training — create record
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRecord(
    @Request() req: { user: JwtPayload },
    @Body() dto: CreateTrainingDto,
  ) {
    return this.trainingService.createRecord(req.user, dto);
  }

  // PATCH /training/:id — update record
  @Patch(':id')
  async updateRecord(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: Partial<CreateTrainingDto>,
  ) {
    return this.trainingService.updateRecord(req.user, id, dto);
  }

  // DELETE /training/:id — delete record
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecord(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
  ): Promise<void> {
    return this.trainingService.deleteRecord(req.user, id);
  }
}
