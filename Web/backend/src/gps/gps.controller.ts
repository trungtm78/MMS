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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsISO8601, Min, Max } from 'class-validator';
import { GpsService } from './gps.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

class RecordGpsDto {
  @IsNumber()
  @Min(-90) @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180) @Max(180)
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
  @Roles('dqtv_member', 'dqtv', 'system_admin', 'ca_officer', 'police_ward', 'police_area')
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

  // GET /gps/live — latest positions, CA officer and above
  @Get('live')
  @Roles('ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'system_admin')
  getLive() {
    return this.gpsService.getLive();
  }

  // GET /gps/team — alias of /gps/live for mobile PoliceApp (A6)
  @Get('team')
  @Roles('ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'system_admin')
  getTeam() {
    return this.gpsService.getLive();
  }

  // GET /gps/history/:id — paginated history
  @Get('history/:id')
  @Roles('ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'system_admin')
  getHistory(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.gpsService.getHistory(id, from, to, page, limit);
  }
}
