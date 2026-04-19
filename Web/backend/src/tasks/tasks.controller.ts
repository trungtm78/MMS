// US-SS-06: TasksController
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  NotFoundException,
  ForbiddenException,
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
} from 'class-validator';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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

  // US-SS-06: militia profile id (SmartSelect returns militia.id)
  @IsUUID()
  @IsNotEmpty()
  assigneeMilitiaId: string;
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  photoIds?: string[];
}

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // GET /tasks — all authenticated roles can list tasks
  @Get()
  @Roles('system_admin', 'office_staff', 'ca_officer', 'dqtv_member', 'dqtv')
  listTasks(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.tasksService.listTasksPaginated({ status, page, limit });
  }

  // POST /tasks — only officers and above can create tasks
  @Post()
  @Roles('system_admin', 'office_staff', 'ca_officer')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTaskDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.tasksService.createTask({
      ...dto,
      createdByUserId: req.user.sub,
    });
  }

  // POST /tasks/:id/report — DQTV submits completion report for assigned task
  @Post(':id/report')
  @Roles('dqtv_member', 'dqtv')
  @HttpCode(HttpStatus.CREATED)
  async submitReport(
    @Param('id') id: string,
    @Body() dto: SubmitReportDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.tasksService.submitReport(id, dto, req.user.sub);
  }
}
