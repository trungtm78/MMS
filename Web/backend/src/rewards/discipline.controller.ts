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
import { auditOriginOf, type OriginRequest } from '../common/audit/audit-log';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DisciplineService } from './discipline.service';
import {
  CreateDisciplineDto,
  DecideAppealDto,
  DisciplineQueryDto,
  FileAppealDto,
} from './rewards.dto';
import { REWARD_READER_ROLES, REWARD_STAFF_ROLES } from './rewards.roles';

type AuthedRequest = OriginRequest & { user: JwtPayload };

// Kỷ luật decisions and their appeals (khiếu nại). Staff read and act within their unit
// scope; a DQTV member reads and appeals only the decisions issued against them.
@Controller('discipline')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...REWARD_READER_ROLES)
export class DisciplineController {
  constructor(private readonly discipline: DisciplineService) {}

  // GET /discipline?from=&to=&disciplineType=&status=&militiaId=&unitCode=
  @Get()
  list(@Request() req: AuthedRequest, @Query() query: DisciplineQueryDto) {
    return this.discipline.list(req.user, query);
  }

  // GET /discipline/:id — the decision with its appeals
  @Get(':id')
  findOne(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discipline.findOne(req.user, id);
  }

  // POST /discipline
  @Post()
  @Roles(...REWARD_STAFF_ROLES)
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: AuthedRequest, @Body() dto: CreateDisciplineDto) {
    return this.discipline.create(req.user, dto, auditOriginOf(req));
  }

  // PATCH /discipline/:id/appeal { reason, filedDate? } — opens an appeal
  @Patch(':id/appeal')
  @HttpCode(HttpStatus.OK)
  fileAppeal(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FileAppealDto,
  ) {
    return this.discipline.fileAppeal(req.user, id, dto, auditOriginOf(req));
  }

  // PATCH /discipline/:id/appeal/decision { outcome, resolution, decidedDate? }
  @Patch(':id/appeal/decision')
  @Roles(...REWARD_STAFF_ROLES)
  @HttpCode(HttpStatus.OK)
  decideAppeal(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideAppealDto,
  ) {
    return this.discipline.decideAppeal(req.user, id, dto, auditOriginOf(req));
  }
}
