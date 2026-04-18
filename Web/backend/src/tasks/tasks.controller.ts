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
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // GET /tasks?status=&page=&limit= — paginated list with total count
  @Get()
  listTasks(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.tasksService.listTasksPaginated({ status, page, limit });
  }

  // POST /tasks — create task with militia assignee
  @Post()
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
