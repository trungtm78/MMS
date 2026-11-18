import {
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { auditOriginOf, type OriginRequest } from '../common/audit/audit-log';
import { ROLE_CODES } from '../common/constants/roles';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  DeviceSessionsService,
  type SessionActor,
} from './device-sessions.service';

type SessionRequest = { user: SessionActor } & OriginRequest;

// Every signed-in user manages the devices signed in to their own account
@Controller('devices/sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLE_CODES)
export class DeviceSessionsController {
  constructor(private readonly sessions: DeviceSessionsService) {}

  // GET /devices/sessions?userId=&page=&limit= — live sessions, the current one first;
  // only system_admin may name another user
  @Get()
  list(
    @Request() req: { user: SessionActor },
    @Query('userId', new ParseUUIDPipe({ optional: true })) userId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.sessions.list(req.user, { userId, page, limit });
  }

  // POST /devices/sessions/revoke-others — signs out every other device of the caller
  @Post('revoke-others')
  @HttpCode(HttpStatus.OK)
  revokeOthers(@Request() req: SessionRequest) {
    return this.sessions.revokeOthers(req.user, auditOriginOf(req));
  }

  // DELETE /devices/sessions/:id — signs one device of the caller out immediately
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Request() req: SessionRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.sessions.revoke(req.user, id, auditOriginOf(req));
  }
}
