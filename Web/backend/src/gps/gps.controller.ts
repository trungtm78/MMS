import {
  Controller,
  Get,
  Post,
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
import { IsNumber, IsOptional, IsISO8601, Min, Max } from 'class-validator';
import { GpsService } from './gps.service';
import { GPS_STAFF_ROLES } from './gps-rooms';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

class RecordGpsDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;
}

@Controller('gps')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GpsController {
  constructor(private readonly gpsService: GpsService) {}

  // POST /gps/record — militia member records own location
  @Post('record')
  @Roles(
    'dqtv_member',
    'dqtv',
    'system_admin',
    'ca_officer',
    'police_ward',
    'police_area',
  )
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async record(
    @Request() req: { user: JwtPayload },
    @Body() dto: RecordGpsDto,
  ) {
    // Use user.sub as proxy for militiaId — service resolves from user_id
    await this.gpsService.recordLocation(req.user.sub, dto);
    return { ok: true };
  }

  // GET /gps/live — latest positions of the members in the caller's scope
  @Get('live')
  @Roles(...GPS_STAFF_ROLES)
  getLive(@Request() req: { user: JwtPayload }) {
    return this.gpsService.getLive(req.user);
  }

  // GET /gps/team — alias of /gps/live for mobile PoliceApp (A6)
  @Get('team')
  @Roles(...GPS_STAFF_ROLES)
  getTeam(@Request() req: { user: JwtPayload }) {
    return this.gpsService.getLive(req.user);
  }

  // GET /gps/history/:id — paginated history of a member in the caller's scope
  @Get('history/:id')
  @Roles(...GPS_STAFF_ROLES)
  getHistory(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.gpsService.getHistory(req.user, id, from, to, page, limit);
  }
}
