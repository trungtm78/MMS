// US-SS-01: MilitiaController — search + quick-create
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { MilitiaService, CreateMilitiaDto } from './militia.service';
import { MILITIA_READER_ROLES, MILITIA_STAFF_ROLES } from './militia-roles';
import { businessDate } from '../common/time/business-date';
import { IsoDatePipe } from '../common/pipes/query-pipes';
import { assertDateRange } from '../common/validation/date-range';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SearchQueryDto } from '../common/dto/search-query.dto';
import { DataCorrectionDto } from './dto/data-correction.dto';
import { ExcelExportService } from '../common/services/excel-export.service';
import type { JwtPayload } from '../auth/auth.service';

export class QuickCreateMilitiaDto implements CreateMilitiaDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 30)
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'militiaCode must be uppercase letters, digits, hyphens',
  })
  militiaCode: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  rank?: string;

  @IsString()
  @IsNotEmpty()
  unitCode: string;

  @IsOptional()
  @IsString()
  gender?: 'male' | 'female';

  @IsOptional()
  @IsString()
  dob?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  joinDate?: string;
}

export class UpdateMilitiaDto {
  @IsOptional() @IsString() @Length(2, 100) fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() rank?: string;
  @IsOptional() @IsIn(['male', 'female']) gender?: 'male' | 'female';
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() joinDate?: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
  @IsOptional() @IsString() emergencyContactRelationship?: string;
}

// Most documents attached to a profile in one request
export const MILITIA_DOCUMENTS_PER_REQUEST = 10;

export class AttachMilitiaDocumentsDto {
  // Ids from POST /files/upload, uploaded by the caller and not attached elsewhere
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MILITIA_DOCUMENTS_PER_REQUEST)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  fileIds: string[];
}

@Controller('militia')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...MILITIA_READER_ROLES)
export class MilitiaController {
  constructor(
    private readonly militiaService: MilitiaService,
    private readonly excelExportService: ExcelExportService,
  ) {}

  // Sprint 3: GET /militia/rewards-report?from=&to=&type=&unitCode=
  @Get('rewards-report')
  @Roles('system_admin', 'police_ward', 'office_staff')
  async getRewardsReport(
    @Request() req: { user: JwtPayload },
    @Query('from', IsoDatePipe) from?: string,
    @Query('to', IsoDatePipe) to?: string,
    @Query('type') type?: string,
    @Query('unitCode') unitCode?: string,
  ) {
    assertDateRange(from, to);
    return this.militiaService.getRewardsReport(req.user, {
      from,
      to,
      type,
      unitCode,
    });
  }

  // Sprint 3: GET /militia/rewards-export?from=&to=&type=&unitCode= → xlsx
  @Get('rewards-export')
  @Roles('system_admin', 'police_ward', 'office_staff')
  async exportRewardsReport(
    @Request() req: { user: JwtPayload },
    @Query('from', IsoDatePipe) from: string | undefined,
    @Query('to', IsoDatePipe) to: string | undefined,
    @Query('type') type: string | undefined,
    @Query('unitCode') unitCode: string | undefined,
    @Res() res: Response,
  ) {
    assertDateRange(from, to);
    return this.militiaService.exportRewardsReport(
      req.user,
      { from, to, type, unitCode },
      res,
    );
  }

  // GET /militia/export?format=xlsx&unitCode=&status= — export roster (unitScope enforced)
  @Get('export')
  @Roles('system_admin', 'police_ward', 'office_staff')
  async exportMilitiaRoster(
    @Request() req: { user: JwtPayload },
    @Res() res: Response,
    @Query('unitCode') unitCode?: string,
    @Query('status') status?: string,
  ) {
    const workbook = await this.militiaService.exportMilitiaRoster(req.user, {
      unitCode: unitCode || undefined,
      status: status || undefined,
    });
    const filename = `DanhSach_DQTV_${unitCode ?? 'ToanBo'}_${businessDate().isoDate}.xlsx`;
    await this.excelExportService.streamToResponse(workbook, res, filename);
  }

  // GET /militia?q=&unitCode=&page=&limit=&excludeAssignedTo= — paginated list with unitScope + CA assignment enforcement
  @Get()
  @Roles(...MILITIA_STAFF_ROLES)
  listMilitia(
    @Request() req: { user: JwtPayload },
    @Query('q') q?: string,
    @Query('unitCode') unitCode?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query('excludeAssignedTo') excludeAssignedTo?: string,
  ) {
    return this.militiaService.searchMilitia(req.user, {
      q,
      unitCode,
      page,
      limit,
      excludeAssignedTo,
    });
  }

  // NĐ 13/2023 Điều 10: GET /militia/me/data-export — dqtv_member exports own data
  @Get('me/data-export')
  @Roles('dqtv_member', 'dqtv', 'system_admin')
  async exportMyData(@Request() req: { user: JwtPayload }) {
    return this.militiaService.exportMyData(req.user.sub);
  }

  // NĐ 13/2023 Điều 14: POST /militia/me/data-correction-request
  @Post('me/data-correction-request')
  @Roles('dqtv_member', 'dqtv', 'system_admin')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async requestDataCorrection(
    @Request() req: { user: JwtPayload },
    @Body() dto: DataCorrectionDto,
  ) {
    return this.militiaService.requestDataCorrection(req.user.sub, dto);
  }

  // US-SS-01 AC-1: GET /militia/search?q=&unitCode=&limit=
  // GET /militia/search — picker for attendance, task, payroll KPI and exemption forms;
  // results are scoped to the caller, and DQTV members cannot list other members
  @Get('search')
  @Roles(...MILITIA_STAFF_ROLES)
  async search(
    @Request() req: { user: JwtPayload },
    @Query() query: SearchQueryDto,
  ) {
    return this.militiaService.search(
      req.user,
      query.q ?? '',
      query.unitCode,
      query.limit ?? 20,
    );
  }

  // Profile routes below are open to DQTV members too: the service lets them read only
  // their own profile and answers 404 for anyone else's

  // GET /militia/:id/history — assignments + task history (P3-18)
  @Get(':id/history')
  @Roles(...MILITIA_READER_ROLES)
  async getMilitiaHistory(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.militiaService.getMilitiaHistory(req.user, id);
  }

  // GET /militia/:id/rewards — khen thưởng / kỷ luật (P3-18)
  @Get(':id/rewards')
  @Roles(...MILITIA_READER_ROLES)
  async getMilitiaRewards(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.militiaService.getMilitiaRewards(req.user, id);
  }

  // GET /militia/:id/documents — files attached to militia profile (P3-18)
  @Get(':id/documents')
  @Roles(...MILITIA_READER_ROLES)
  async getMilitiaDocuments(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.militiaService.getMilitiaDocuments(req.user, id);
  }

  // POST /militia/:id/documents — staff attach their uploads to a profile of their scope
  @Post(':id/documents')
  @Roles(...MILITIA_STAFF_ROLES)
  @HttpCode(HttpStatus.CREATED)
  async attachMilitiaDocuments(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachMilitiaDocumentsDto,
  ) {
    return this.militiaService.attachMilitiaDocuments(
      req.user,
      id,
      dto.fileIds,
    );
  }

  // GET /militia/:id — fetch single militia member
  @Get(':id')
  @Roles(...MILITIA_READER_ROLES)
  async getMilitiaById(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.militiaService.getMilitiaById(req.user, id);
  }

  // US-SS-05 AC-1: POST /militia/quick-create — inline quick-create
  @Post('quick-create')
  @Roles('system_admin', 'office_staff', 'ca_officer')
  @HttpCode(HttpStatus.CREATED)
  async quickCreate(
    @Request() req: { user: JwtPayload },
    @Body() dto: QuickCreateMilitiaDto,
  ) {
    return this.militiaService.quickCreate(req.user, dto);
  }

  // PATCH /militia/:id — update profile (office_staff, system_admin only)
  @Patch(':id')
  @Roles('system_admin', 'office_staff')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateMilitia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilitiaDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.militiaService.updateMilitia(id, dto, req.user);
  }

  // DELETE /militia/:id — soft delete: set status='inactive' (system_admin only)
  @Delete(':id')
  @Roles('system_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMilitia(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: JwtPayload },
  ) {
    await this.militiaService.deleteMilitia(id, req.user);
  }
}
