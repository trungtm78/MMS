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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn } from 'class-validator';
import { SosService } from './sos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

class CreateSosBodyDto {
  @IsString() @IsNotEmpty()
  incidentType: string;

  @IsString() @IsIn(['low', 'medium', 'high', 'urgent'])
  severity: 'low' | 'medium' | 'high' | 'urgent';

  @IsString() @IsNotEmpty()
  title: string;

  @IsOptional() @IsString()
  message?: string;

  @IsOptional() @IsNumber()
  lat?: number;

  @IsOptional() @IsNumber()
  lng?: number;
}

class UpdateStatusBodyDto {
  @IsString() @IsNotEmpty()
  status: string;

  @IsOptional() @IsString()
  assignedTo?: string;

  @IsOptional() @IsString()
  resolutionNote?: string;
}

@Controller('sos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dqtv_member', 'dqtv', 'ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'office_staff', 'system_admin')
export class SosController {
  constructor(private readonly sosService: SosService) {}

  // POST /sos — tạo sự cố
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Request() req: { user: JwtPayload }, @Body() dto: CreateSosBodyDto) {
    return this.sosService.create(req.user.sub, req.user.unitScope ?? null, dto);
  }

  // GET /sos?status=&severity=&page=&limit=
  @Get()
  list(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.sosService.list({ status, severity, page, limit });
  }

  // GET /sos/:id
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.sosService.getById(id);
  }

  // PATCH /sos/:id/status
  @Patch(':id/status')
  @Roles('ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'system_admin')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  updateStatus(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: UpdateStatusBodyDto,
  ) {
    return this.sosService.updateStatus(id, dto, req.user.sub);
  }
}
