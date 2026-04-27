// US-SS-01: MilitiaController — search + quick-create
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
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Length,
  Matches,
} from 'class-validator';
import { MilitiaService, CreateMilitiaDto } from './militia.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SearchQueryDto } from '../common/dto/search-query.dto';
import { DataCorrectionDto } from './dto/data-correction.dto';
import type { JwtPayload } from '../auth/auth.service';

export class QuickCreateMilitiaDto implements CreateMilitiaDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 30)
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'militiaCode must be uppercase letters, digits, hyphens',
  })
  militiaCode: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  rank?: string;

  @IsString()
  @IsNotEmpty()
  unitCode: string;

  @IsOptional()
  @IsString()
  gender?: 'male' | 'female';

  @IsOptional()
  @IsString()
  dob?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  joinDate?: string;
}

@Controller('militia')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'office_staff', 'ca_officer', 'dqtv_member', 'dqtv')
export class MilitiaController {
  constructor(private readonly militiaService: MilitiaService) {}

  // GET /militia?q=&unitCode=&page=&limit=&excludeAssignedTo= — paginated list with unitScope + CA assignment enforcement
  @Get()
  listMilitia(
    @Request() req: { user: JwtPayload },
    @Query('q') q?: string,
    @Query('unitCode') unitCode?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query('excludeAssignedTo') excludeAssignedTo?: string,
  ) {
    return this.militiaService.searchMilitia(
      { role: req.user.role, unitScope: req.user.unitScope, sub: req.user.sub },
      { q, unitCode, page, limit, excludeAssignedTo },
    );
  }

  // NĐ 13/2023 Điều 10: GET /militia/me/data-export — dqtv_member exports own data
  @Get('me/data-export')
  @Roles('dqtv_member', 'dqtv', 'system_admin')
  async exportMyData(@Request() req: { user: JwtPayload }) {
    return this.militiaService.exportMyData(req.user.sub);
  }

  // NĐ 13/2023 Điều 14: POST /militia/me/data-correction-request
  @Post('me/data-correction-request')
  @Roles('dqtv_member', 'dqtv', 'system_admin')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async requestDataCorrection(
    @Request() req: { user: JwtPayload },
    @Body() dto: DataCorrectionDto,
  ) {
    return this.militiaService.requestDataCorrection(req.user.sub, dto);
  }

  // US-SS-01 AC-1: GET /militia/search?q=&unitCode=&limit=
  @Get('search')
  async search(@Query() query: SearchQueryDto) {
    return this.militiaService.search(
      query.q ?? '',
      query.unitCode,
      query.limit ?? 20,
    );
  }

  // GET /militia/:id/history — assignments + task history (P3-18)
  @Get(':id/history')
  async getMilitiaHistory(@Param('id') id: string) {
    return this.militiaService.getMilitiaHistory(id);
  }

  // GET /militia/:id/rewards — khen thưởng / kỷ luật (P3-18)
  @Get(':id/rewards')
  async getMilitiaRewards(@Param('id') id: string) {
    return this.militiaService.getMilitiaRewards(id);
  }

  // GET /militia/:id/documents — files attached to militia profile (P3-18)
  @Get(':id/documents')
  async getMilitiaDocuments(@Param('id') id: string) {
    return this.militiaService.getMilitiaDocuments(id);
  }

  // GET /militia/:id — fetch single militia member
  @Get(':id')
  async getMilitiaById(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
  ) {
    return this.militiaService.getMilitiaById(req.user, id);
  }

  // US-SS-05 AC-1: POST /militia/quick-create — inline quick-create
  @Post('quick-create')
  @Roles('system_admin', 'office_staff', 'ca_officer')
  @HttpCode(HttpStatus.CREATED)
  async quickCreate(@Body() dto: QuickCreateMilitiaDto) {
    return this.militiaService.quickCreate(dto);
  }
}
