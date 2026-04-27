import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'dqtv_member', 'dqtv', 'ca_officer', 'police_ward', 'police_area',
  'ca_ward', 'ca_area', 'office_staff', 'system_admin',
)
export class NotificationsController {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  // GET /notifications?page=&limit=
  @Get('notifications')
  async list(
    @Request() req: { user: JwtPayload },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const safLimit = Math.min(Math.max(1, limit), 100);
    const offset = (Math.max(1, page) - 1) * safLimit;

    const countRows = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1`,
      [req.user.sub],
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.ds.query(
      `SELECT id, type, title, body, is_read AS "isRead",
              entity_type AS "entityType", entity_id AS "entityId",
              created_at AS "createdAt"
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.sub, safLimit, offset],
    );

    return { data, total, page, limit: safLimit };
  }

  // PATCH /notifications/:id/read
  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ) {
    await this.ds.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [id, req.user.sub],
    );
    return { ok: true };
  }

  // POST /notifications/read-all
  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  async readAll(@Request() req: { user: JwtPayload }) {
    const result = await this.ds.query<{ count: string }[]>(
      `WITH updated AS (
         UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false
         RETURNING id
       ) SELECT COUNT(*)::text AS count FROM updated`,
      [req.user.sub],
    );
    return { updated: parseInt(result[0]?.count ?? '0', 10) };
  }
}
