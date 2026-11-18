// US-SS-06: TasksController
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Length,
  IsUUID,
  IsIn,
  IsDateString,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsInt,
  IsLatitude,
  IsLongitude,
  Min,
  Max,
} from 'class-validator';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { IsoDatePipe } from '../common/pipes/query-pipes';
import { businessDate } from '../common/time/business-date';
import { resolveTaskReportRange } from './task-report';

// Most files attached to a task when it is created
export const TASK_ATTACHMENTS_PER_REQUEST = 10;

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'patrol',
    'guard',
    'inspection',
    'support',
    'training',
    'admin',
    'other',
  ])
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'high', 'medium', 'low'])
  priority?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  // Where the task takes place (tasks.location_name / location_lat / location_lng)
  @IsOptional()
  @IsString()
  @Length(1, 500)
  locationName?: string;

  @IsOptional()
  @IsLatitude()
  locationLat?: number;

  @IsOptional()
  @IsLongitude()
  locationLng?: number;

  // US-SS-06: militia profile id (SmartSelect returns militia.id)
  @IsUUID()
  @IsNotEmpty()
  assigneeMilitiaId: string;

  // Ids from POST /files/upload, uploaded by the creator and not attached elsewhere: the
  // instructions the assignee reads with the task (GET /tasks/:id attachments)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TASK_ATTACHMENTS_PER_REQUEST)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}

export class UpdateProgressDto {
  @IsInt()
  @Min(0)
  @Max(100)
  progress: number;

  @IsOptional()
  @IsString()
  note?: string;

  // An assignee only starts a task this way: completing it takes a report (POST
  // /tasks/:id/report), cancelling it a manager (DELETE /tasks/:id)
  @IsOptional()
  @IsString()
  @IsIn(['in_progress'])
  status?: string;
}

export class SubmitReportDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 1000)
  description: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  location?: string;

  @IsOptional()
  @IsString()
  audioNoteUrl?: string;

  // Ids from POST /files/upload: images the submitter uploaded, each once, in display order
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  photoIds?: string[];
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @Length(1, 255) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional()
  @IsString()
  @IsIn([
    'patrol',
    'guard',
    'inspection',
    'support',
    'training',
    'admin',
    'other',
  ])
  type?: string;
  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'high', 'medium', 'low'])
  priority?: string;
  @IsOptional() @IsDateString() deadline?: string;
}

export class CancelTaskDto {
  @IsString() @IsNotEmpty() @Length(1, 500) reason: string;
}

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // GET /tasks?status=&unitCode=&page=&limit= — the tasks of the caller's scope, one row per
  // task; status=overdue means open past the deadline
  @Get()
  @Roles('system_admin', 'office_staff', 'ca_officer', 'dqtv_member', 'dqtv')
  listTasks(
    @Request() req: { user: JwtPayload },
    @Query('status') status?: string,
    @Query('unitCode') unitCode?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.tasksService.listTasksPaginated(req.user, {
      status,
      unitCode: unitCode || undefined,
      page,
      limit,
    });
  }

  // GET /tasks/report?from=&to=&unitCode=&page=&limit= — task statistics over the tasks
  // created in the range (twelve business months by default, 366 days at most) that the
  // caller may see; page/limit apply to the per-assignee breakdown. Declared before
  // /tasks/:id, which would otherwise take "report" as an id.
  @Get('report')
  @Roles('system_admin', 'office_staff', 'ca_officer', 'dqtv_member', 'dqtv')
  async getReport(
    @Request() req: { user: JwtPayload },
    @Query('from', IsoDatePipe) from?: string,
    @Query('to', IsoDatePipe) to?: string,
    @Query('unitCode') unitCode?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const range = resolveTaskReportRange({ from, to }, businessDate().isoDate);
    return this.tasksService.getTaskReport(req.user, {
      ...range,
      unitCode: unitCode || undefined,
      page,
      limit,
    });
  }

  // POST /tasks — a task for a member of the creator's scope
  @Post()
  @Roles('system_admin', 'office_staff', 'ca_officer')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Request() req: { user: JwtPayload },
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createTask(req.user, dto);
  }

  // GET /tasks/:id — a task of the caller's scope
  @Get(':id')
  @Roles('system_admin', 'office_staff', 'ca_officer', 'dqtv_member', 'dqtv')
  async getById(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.getTaskById(req.user, id);
  }

  // POST /tasks/:id/accept — the assignee starts a task not yet under way
  @Post(':id/accept')
  @Roles('dqtv_member', 'dqtv')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.acceptTask(req.user, id);
  }

  // PATCH /tasks/:id/progress — the assignee records progress on an open task
  @Patch(':id/progress')
  @Roles('dqtv_member', 'dqtv')
  async updateProgress(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.tasksService.updateProgress(req.user, id, dto);
  }

  // POST /tasks/:id/report — the assignee's completion report
  @Post(':id/report')
  @Roles('dqtv_member', 'dqtv')
  @HttpCode(HttpStatus.CREATED)
  async submitReport(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitReportDto,
  ) {
    return this.tasksService.submitReport(req.user, id, dto);
  }

  // PATCH /tasks/:id — edit a task of the caller's scope before it is under way
  @Patch(':id')
  @Roles('system_admin', 'office_staff', 'ca_officer')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateTask(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(req.user, id, dto);
  }

  // DELETE /tasks/:id — cancel a task of the caller's scope, with the reason kept
  @Delete(':id')
  @Roles('system_admin', 'ca_officer')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelTask(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTaskDto,
  ) {
    await this.tasksService.cancelTask(req.user, id, dto.reason);
  }
}
