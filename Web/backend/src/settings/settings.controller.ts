import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.service';
import { auditOriginOf, type OriginRequest } from '../common/audit/audit-log';
import { ROLE_CODES, type RoleCode } from '../common/constants/roles';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { IsoDatePipe } from '../common/pipes/query-pipes';
import { KpiTargetsService } from './kpi-targets.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { KpiTargetsDto, NotificationPreferencesDto } from './settings.dto';

// Everyone who manages, evaluates or reports on militia members reads the targets they
// are measured against; militia members themselves do not
export const KPI_TARGET_READER_ROLES: readonly RoleCode[] = [
  'system_admin',
  'police_ward',
  'ca_ward',
  'ubnd_leader',
  'police_area',
  'ca_area',
  'ca_officer',
  'office_staff',
];

type SettingsActor = Pick<JwtPayload, 'sub' | 'role' | 'roles' | 'unitScope'>;
type SettingsRequest = { user: SettingsActor } & OriginRequest;

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(
    private readonly kpiTargets: KpiTargetsService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  // GET /settings/kpi-targets?asOf=YYYY-MM-DD — the version in force (today by default)
  @Get('kpi-targets')
  @Roles(...KPI_TARGET_READER_ROLES)
  getKpiTargets(@Query('asOf', IsoDatePipe) asOf?: string) {
    return this.kpiTargets.getEffective(asOf);
  }

  // PUT /settings/kpi-targets — a new version effective today, audited
  @Put('kpi-targets')
  @Roles('system_admin')
  updateKpiTargets(
    @Request() req: SettingsRequest,
    @Body() dto: KpiTargetsDto,
  ) {
    return this.kpiTargets.update(req.user, dto, auditOriginOf(req));
  }

  // GET /settings/notifications — the caller's own preferences
  @Get('notifications')
  @Roles(...ROLE_CODES)
  getNotificationPreferences(@Request() req: { user: SettingsActor }) {
    return this.preferences.get(req.user);
  }

  // PUT /settings/notifications — replaces the caller's own preferences
  @Put('notifications')
  @Roles(...ROLE_CODES)
  updateNotificationPreferences(
    @Request() req: { user: SettingsActor },
    @Body() dto: NotificationPreferencesDto,
  ) {
    return this.preferences.update(req.user, dto);
  }
}
