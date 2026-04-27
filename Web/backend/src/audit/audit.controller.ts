import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'police_ward', 'police_area')
export class AuditController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Responds to both GET /audit and GET /audit-logs
  @Get('audit')
  async list(
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.query({ action, entityType, actorId, from, to, page, limit });
  }

  @Get('audit-logs')
  async listAlias(
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.query({ action, entityType, actorId, from, to, page, limit });
  }

  private async query(opts: {
    action?: string;
    entityType?: string;
    actorId?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }) {
    const cap = Math.min(opts.limit, 100);
    const offset = (opts.page - 1) * cap;

    const fromTs = opts.from ?? '1970-01-01';
    const toTs = opts.to ?? '9999-12-31';

    const countRows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count
       FROM audit_logs al
       WHERE ($1::text IS NULL OR al.action  = $1)
         AND ($2::text IS NULL OR al.entity_type = $2)
         AND ($3::uuid IS NULL OR al.actor_id = $3::uuid)
         AND al.created_at BETWEEN $4::timestamptz AND $5::timestamptz`,
      [opts.action ?? null, opts.entityType ?? null, opts.actorId ?? null, fromTs, toTs],
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT al.id, al.actor_id AS "actorId", u.full_name AS "actorName",
              al.action, al.entity_type AS "entityType", al.entity_id AS "entityId",
              al.before_json AS "beforeJson", al.after_json AS "afterJson",
              al.ip_address AS "ipAddress", al.created_at AS "createdAt"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE ($1::text IS NULL OR al.action  = $1)
         AND ($2::text IS NULL OR al.entity_type = $2)
         AND ($3::uuid IS NULL OR al.actor_id = $3::uuid)
         AND al.created_at BETWEEN $4::timestamptz AND $5::timestamptz
       ORDER BY al.created_at DESC
       LIMIT $6 OFFSET $7`,
      [opts.action ?? null, opts.entityType ?? null, opts.actorId ?? null, fromTs, toTs, cap, offset],
    );

    return { data: rows, total, page: opts.page, limit: cap };
  }
}
