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
import type { JwtPayload } from '../auth/auth.service';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateTrainingPlanDto,
  CreateTrainingSessionDto,
  SessionAttendanceDto,
  TrainingPlanQueryDto,
  TrainingSessionQueryDto,
  UpdateTrainingPlanStatusDto,
} from './dto/training-plan.dto';
import { TrainingPlansService } from './training-plans.service';
import { TRAINING_MANAGER_ROLES } from './training.roles';

type AuthedRequest = { user: JwtPayload };

// Kế hoạch huấn luyện, đợt huấn luyện and điểm danh. TrainingModule registers this
// controller before TrainingController, so /training/plans and /training/sessions are
// matched here and never reach GET /training/:id.
@Controller('training')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...TRAINING_MANAGER_ROLES)
export class TrainingPlansController {
  constructor(private readonly plans: TrainingPlansService) {}

  // GET /training/plans?year=&status=&unitCode=
  @Get('plans')
  listPlans(
    @Request() req: AuthedRequest,
    @Query() query: TrainingPlanQueryDto,
  ) {
    return this.plans.listPlans(req.user, query);
  }

  // POST /training/plans
  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  createPlan(
    @Request() req: AuthedRequest,
    @Body() dto: CreateTrainingPlanDto,
  ) {
    return this.plans.createPlan(req.user, dto);
  }

  // GET /training/plans/:id
  @Get('plans/:id')
  getPlan(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.plans.getPlan(req.user, id);
  }

  // PATCH /training/plans/:id/status { status: 'active' | 'completed' }
  @Patch('plans/:id/status')
  @HttpCode(HttpStatus.OK)
  updatePlanStatus(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrainingPlanStatusDto,
  ) {
    return this.plans.updatePlanStatus(req.user, id, dto.status);
  }

  // GET /training/sessions?planId=&year=&unitCode=
  @Get('sessions')
  listSessions(
    @Request() req: AuthedRequest,
    @Query() query: TrainingSessionQueryDto,
  ) {
    return this.plans.listSessions(req.user, query);
  }

  // POST /training/sessions
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  createSession(
    @Request() req: AuthedRequest,
    @Body() dto: CreateTrainingSessionDto,
  ) {
    return this.plans.createSession(req.user, dto);
  }

  // GET /training/sessions/:id
  @Get('sessions/:id')
  getSession(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.plans.getSession(req.user, id);
  }

  // GET /training/sessions/:id/members
  @Get('sessions/:id/members')
  sessionMembers(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.plans.sessionMembers(req.user, id);
  }

  // POST /training/sessions/:id/attendance { attendance: [{ memberId, attended }] }
  @Post('sessions/:id/attendance')
  @HttpCode(HttpStatus.OK)
  recordAttendance(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SessionAttendanceDto,
  ) {
    return this.plans.recordAttendance(req.user, id, dto.attendance);
  }
}
