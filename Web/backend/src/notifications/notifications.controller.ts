import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  NotFoundException,
  ParseBoolPipe,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ROLE_CODES } from '../common/constants/roles';
import type { JwtPayload } from '../auth/auth.service';
import { queryRows } from '../database/query-rows';

// Notifications are broadcast rows; each recipient has a notification_receipts row
// that carries their read state (migrations 007 + 020).
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
// Every signed-in role has an inbox; each caller only ever reaches their own receipts
@Roles(...ROLE_CODES)
export class NotificationsController {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  // GET /notifications?page=&limit=&read=true|false
  @Get('notifications')
  async list(
    @Request() req: { user: JwtPayload },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query('read', new ParseBoolPipe({ optional: true })) read?: boolean,
  ) {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * safeLimit;
    // Built only from a boolean, never from user text
    const readFilter =
      read === undefined
        ? ''
        : read
          ? 'AND r.read_at IS NOT NULL'
          : 'AND r.read_at IS NULL';

    const countRows = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count
       FROM notification_receipts r
       WHERE r.user_id = $1 ${readFilter}`,
      [req.user.sub],
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.ds.query<Record<string, unknown>[]>(
      `SELECT n.id, n.type, n.title, n.body,
              n.entity_type AS "entityType", n.entity_id AS "entityId",
              r.read_at IS NOT NULL AS "isRead", r.read_at AS "readAt",
              n.created_at AS "createdAt"
       FROM notification_receipts r
       JOIN notifications n ON n.id = r.notification_id
       WHERE r.user_id = $1 ${readFilter}
       ORDER BY r.delivered_at DESC, r.id DESC
       LIMIT $2 OFFSET $3`,
      [req.user.sub, safeLimit, offset],
    );

    return { data, total, page: safePage, limit: safeLimit };
  }

  // PATCH /notifications/:id/read — only the caller's own receipt
  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: JwtPayload },
  ) {
    const rows = await queryRows<{ notification_id: string }>(
      this.ds,
      `UPDATE notification_receipts SET read_at = COALESCE(read_at, now())
       WHERE notification_id = $1 AND user_id = $2
       RETURNING notification_id`,
      [id, req.user.sub],
    );
    if (!rows.length) throw new NotFoundException('notification_not_found');
    return { ok: true };
  }

  // DELETE /notifications/:id — dismisses the notification for the caller only
  @Delete('notifications/:id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: JwtPayload },
  ) {
    const rows = await queryRows<{ notification_id: string }>(
      this.ds,
      `DELETE FROM notification_receipts
       WHERE notification_id = $1 AND user_id = $2
       RETURNING notification_id`,
      [id, req.user.sub],
    );
    if (!rows.length) throw new NotFoundException('notification_not_found');
    return { ok: true };
  }

  // POST /notifications/read-all
  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  async readAll(@Request() req: { user: JwtPayload }) {
    const updated = await queryRows<{ notification_id: string }>(
      this.ds,
      `UPDATE notification_receipts SET read_at = now()
       WHERE user_id = $1 AND read_at IS NULL
       RETURNING notification_id`,
      [req.user.sub],
    );
    return { updated: updated.length };
  }
}
