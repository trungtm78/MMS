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
import {
  InventoryQueryDto,
  RecordInventoryDto,
} from './dto/record-inventory.dto';
import { WeaponInventoryService } from './weapon-inventory.service';
import { WEAPON_STAFF_ROLES } from './weapons.roles';

type AuthedRequest = OriginRequest & { user: JwtPayload };

// Kiểm kê vũ khí. WeaponsModule registers this controller before WeaponsController, so
// /weapons/inventory is matched here and never reaches GET /weapons/:id.
@Controller('weapons/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...WEAPON_STAFF_ROLES)
export class WeaponInventoryController {
  constructor(private readonly inventory: WeaponInventoryService) {}

  // POST /weapons/inventory { confirmedCount, notes?, items? }
  @Post()
  @HttpCode(HttpStatus.CREATED)
  record(@Request() req: AuthedRequest, @Body() dto: RecordInventoryDto) {
    return this.inventory.record(req.user, dto, auditOriginOf(req));
  }

  // GET /weapons/inventory?from=&to=
  @Get()
  list(@Query() query: InventoryQueryDto) {
    return this.inventory.list(query);
  }

  // GET /weapons/inventory/:id — the check with its snapshot of the register
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.findOne(id);
  }
}
