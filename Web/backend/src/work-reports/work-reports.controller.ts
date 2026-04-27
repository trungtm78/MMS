import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { WorkReportsService } from './work-reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

class CreateWorkReportBodyDto {
  @IsString() @IsNotEmpty()
  reportType: string;

  @IsString() @IsNotEmpty()
  title: string;

  @IsString() @IsNotEmpty()
  content: string;

  @IsOptional() @IsString()
  period?: string;
}

class ReviewBodyDto {
  @IsString() @IsIn(['approved', 'rejected'])
  reviewStatus: 'approved' | 'rejected';

  @IsOptional() @IsString()
  reviewNote?: string;
}

@Controller('work-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dqtv_member', 'dqtv', 'ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'office_staff', 'system_admin')
export class WorkReportsController {
  constructor(private readonly workReportsService: WorkReportsService) {}

  // GET /work-reports
  @Get()
  list(
    @Request() req: { user: JwtPayload },
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.workReportsService.list({
      type,
      userId,
      page,
      limit,
      requesterRole: req.user.role,
      requesterSub: req.user.sub,
    });
  }

  // POST /work-reports
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Request() req: { user: JwtPayload }, @Body() dto: CreateWorkReportBodyDto) {
    return this.workReportsService.create(req.user.sub, dto);
  }

  // PATCH /work-reports/:id/review
  @Patch(':id/review')
  @Roles('ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'system_admin')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  review(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: ReviewBodyDto,
  ) {
    return this.workReportsService.review(id, dto, req.user.sub, req.user.role);
  }
}
