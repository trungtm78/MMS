import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsInt,
  Min,
  Max,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { KpiService } from './kpi.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

export class EvaluateDto {
  @IsUUID()
  @IsNotEmpty()
  targetUserId: string;

  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  criteria: string[];

  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10, { each: true })
  scores: number[];

  @IsString()
  @IsIn(['reward', 'maintain', 'training', 'warning', 'discipline'])
  recommendation: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('kpi')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KpiController {
  constructor(private readonly kpiService: KpiService) {}

  // POST /kpi/evaluate — CA officers evaluate DQTV members
  @Post('evaluate')
  @Roles('ca_officer', 'ca_ward', 'ca_area', 'system_admin')
  @HttpCode(HttpStatus.CREATED)
  async evaluate(
    @Body() dto: EvaluateDto,
    @Request() req: { user: { sub: string; role: string } },
  ) {
    return this.kpiService.submitEvaluation(dto, { sub: req.user.sub, role: req.user.role });
  }
}
