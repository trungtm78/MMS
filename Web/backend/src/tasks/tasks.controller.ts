// US-SS-06: TasksController
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Length,
  IsUUID,
  IsIn,
  IsDateString,
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
}
