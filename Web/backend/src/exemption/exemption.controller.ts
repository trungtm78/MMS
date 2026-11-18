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
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateExemptionDto,
  ExemptionQueryDto,
  ReviewExemptionDto,
} from './exemption.dto';
import { ExemptionService } from './exemption.service';

// Readers: ward and area command, UBND leaders and office staff — CA officers work only
// with the DQTV assigned to them and have no view of exemption decisions. The web app's
// viewExemptions permission copies this list. Decisions are issued by ward-level command
// and office staff (see the write routes below).
@Controller('exemptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'system_admin',
  'police_ward',
  'ca_ward',
  'ubnd_leader',
  'police_area',
  'ca_area',
  'office_staff',
)
export class ExemptionController {
  constructor(private readonly exemptionService: ExemptionService) {}

  // GET /exemptions?status=&militiaId=&unitCode=
  @Get()
  findAll(
    @Request() req: { user: JwtPayload },
    @Query() query: ExemptionQueryDto,
  ) {
    return this.exemptionService.findAll(req.user, query);
  }

  // POST /exemptions
  @Post()
  @Roles('system_admin', 'police_ward', 'ca_ward', 'office_staff')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Request() req: { user: JwtPayload },
    @Body() dto: CreateExemptionDto,
  ) {
    return this.exemptionService.create(req.user, dto);
  }

  // PATCH /exemptions/:id/review { status: 'expired' | 'revoked' }
  @Patch(':id/review')
  @Roles('system_admin', 'police_ward', 'ca_ward', 'office_staff')
  review(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewExemptionDto,
  ) {
    return this.exemptionService.review(req.user, id, dto.status);
  }
}
