import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CreateRewardDto, RewardQueryDto } from './rewards.dto';
import { REWARD_READER_ROLES, REWARD_STAFF_ROLES } from './rewards.roles';
import { RewardsService } from './rewards.service';

type AuthedRequest = OriginRequest & { user: JwtPayload };

// Khen thưởng decisions. Staff read their unit scope; DQTV members read their own only.
@Controller('rewards')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...REWARD_READER_ROLES)
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  // GET /rewards?from=&to=&rewardType=&militiaId=&unitCode=
  @Get()
  list(@Request() req: AuthedRequest, @Query() query: RewardQueryDto) {
    return this.rewards.list(req.user, query);
  }

  // GET /rewards/:id
  @Get(':id')
  findOne(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rewards.findOne(req.user, id);
  }

  // POST /rewards
  @Post()
  @Roles(...REWARD_STAFF_ROLES)
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: AuthedRequest, @Body() dto: CreateRewardDto) {
    return this.rewards.create(req.user, dto, auditOriginOf(req));
  }
}
