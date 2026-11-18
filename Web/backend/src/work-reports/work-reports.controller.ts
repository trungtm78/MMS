import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { WorkReportsService } from './work-reports.service';
import {
  CreateWorkReportBodyDto,
  ReviewWorkReportBodyDto,
  WorkReportQueryDto,
} from './work-reports.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

export { WORK_REPORT_TYPES } from './work-reports.dto';

@Controller('work-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'dqtv_member',
  'dqtv',
  'ca_officer',
  'police_ward',
  'police_area',
  'ca_ward',
  'ca_area',
  'office_staff',
  'system_admin',
)
export class WorkReportsController {
  constructor(private readonly workReportsService: WorkReportsService) {}

  // GET /work-reports?type=&userId=&page=&limit= — scoped to what the caller may see
  @Get()
  list(
    @Request() req: { user: JwtPayload },
    @Query() query: WorkReportQueryDto,
  ) {
    return this.workReportsService.list({ ...query, actor: req.user });
  }

  // POST /work-reports
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Request() req: { user: JwtPayload },
    @Body() dto: CreateWorkReportBodyDto,
  ) {
    return this.workReportsService.create(req.user.sub, dto);
  }

  // GET /work-reports/:id — one report with its attachments; 404 outside the caller's audience
  @Get(':id')
  findOne(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workReportsService.findOne(id, req.user);
  }

  // PATCH /work-reports/:id/review — REVIEWER_ROLES (guarded by a spec against drift)
  @Patch(':id/review')
  @Roles(
    'ca_officer',
    'police_ward',
    'police_area',
    'ca_ward',
    'ca_area',
    'system_admin',
  )
  review(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewWorkReportBodyDto,
  ) {
    return this.workReportsService.review(id, dto, req.user);
  }
}
