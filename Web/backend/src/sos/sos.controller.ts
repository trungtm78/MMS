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
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { SosService } from './sos.service';
import { SosAlertsService } from './sos-alerts.service';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
} from './incident-values';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

export const SOS_TEXT_MAX_LENGTH = 2000;

// Every value is checked against what the incidents table accepts (migration 007), so a
// wrong one answers 400 instead of failing in PostgreSQL
export class CreateSosBodyDto {
  @IsIn([...INCIDENT_TYPES])
  incidentType: string;

  @IsIn([...INCIDENT_SEVERITIES])
  severity: 'low' | 'medium' | 'high' | 'urgent';

  @IsString()
  @Length(1, 255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(SOS_TEXT_MAX_LENGTH)
  message?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}

export class UpdateStatusBodyDto {
  @IsIn([...INCIDENT_STATUSES])
  status: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SOS_TEXT_MAX_LENGTH)
  resolutionNote?: string;
}

@Controller('sos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'dqtv_member',
  'dqtv',
  'ca_officer',
  'police_ward',
  'police_area',
  'ca_ward',
  'ca_area',
  'office_staff',
  'system_admin',
)
export class SosController {
  constructor(
    private readonly sosService: SosService,
    private readonly sosAlerts: SosAlertsService,
  ) {}

  // POST /sos — raise an alert
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Request() req: { user: JwtPayload }, @Body() dto: CreateSosBodyDto) {
    return this.sosService.create(
      req.user.sub,
      req.user.unitScope ?? null,
      dto,
    );
  }

  // GET /sos?status=&severity=&page=&limit= — the alerts of the caller's scope, as
  // GET /sos/alerts lists them
  @Get()
  list(
    @Request() req: { user: JwtPayload },
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.sosAlerts.list(req.user, { status, severity, page, limit });
  }

  // GET /sos/alerts?status=active|resolved|all|<incident status>&severity=&unitCode=&page=&limit=
  // The SOS alerts the caller responds to (SosAlertsService), active first. Declared
  // before /sos/:id, which would otherwise take "alerts" as an id.
  @Get('alerts')
  listAlerts(
    @Request() req: { user: JwtPayload },
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('unitCode') unitCode?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.sosAlerts.list(req.user, {
      status,
      severity,
      unitCode,
      page,
      limit,
    });
  }

  // GET /sos/:id — one alert of the caller's scope
  @Get(':id')
  getById(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sosAlerts.findOne(req.user, id);
  }

  // PATCH /sos/:id/status — a responder moves an alert of their scope
  @Patch(':id/status')
  @Roles(
    'ca_officer',
    'police_ward',
    'police_area',
    'ca_ward',
    'ca_area',
    'system_admin',
  )
  @UsePipes(new ValidationPipe({ whitelist: true }))
  updateStatus(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusBodyDto,
  ) {
    return this.sosService.updateStatus(req.user, id, dto);
  }
}
