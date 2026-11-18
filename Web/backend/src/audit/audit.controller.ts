import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
  BadRequestException,
  Request,
} from '@nestjs/common';
import type { Response } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { effectiveUnit } from '../common/access/unit-scope';
import { userInUnit } from '../common/sql/user-access.sql';
import { ExcelExportService } from '../common/services/excel-export.service';
import {
  businessDate,
  businessDayEndSql,
  businessDayStartSql,
  isIsoDate,
  shiftIsoDate,
} from '../common/time/business-date';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'police_ward', 'police_area')
export class AuditController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly excelExportService: ExcelExportService,
  ) {}

  // Responds to both GET /audit and GET /audit-logs.
  // from/to are Vietnamese calendar days (YYYY-MM-DD), both inclusive; entityId narrows to
  // one audited record; search matches action, entity type and actor. Area roles see only
  // entries made by people of their unit.
  @Get('audit')
  async list(
    @Request() req: { user: JwtPayload },
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('actorId', new ParseUUIDPipe({ optional: true })) actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('entityId', new ParseUUIDPipe({ optional: true })) entityId?: string,
    @Query('search') search?: string,
  ) {
    return this.query(req.user, {
      action,
      entityType,
      actorId,
      from,
      to,
      page,
      limit,
      entityId,
      search,
    });
  }

  @Get('audit-logs')
  async listAlias(
    @Request() req: { user: JwtPayload },
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('actorId', new ParseUUIDPipe({ optional: true })) actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('entityId', new ParseUUIDPipe({ optional: true })) entityId?: string,
    @Query('search') search?: string,
  ) {
    return this.query(req.user, {
      action,
      entityType,
      actorId,
      from,
      to,
      page,
      limit,
      entityId,
      search,
    });
  }

  // GET /audit/export — system_admin ONLY, max 90-day range
  @Get('audit/export')
  @Roles('system_admin')
  async exportAuditLog(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
  ) {
    // Periods are Vietnamese calendar days
    const today = businessDate().isoDate;
    const fromDate = from ?? shiftIsoDate(today, -30);
    const toDate = to ?? today;
    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
      throw new BadRequestException('invalid_date');
    }

    // Hard cap: 90-day max range
    const fromTs = new Date(fromDate).getTime();
    const toTs = new Date(toDate).getTime();
    if (fromTs > toTs) {
      throw new BadRequestException('from_must_be_before_to');
    }
    const diffDays = (toTs - fromTs) / (1000 * 60 * 60 * 24);
    if (diffDays > 90) {
      throw new BadRequestException('date_range_exceeds_90_days');
    }

    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `WITH actor_roles AS (
         -- Roles aggregated once per user, not once per exported row
         SELECT ur.user_id, string_agg(r.code, ', ' ORDER BY r.code) AS codes
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         GROUP BY ur.user_id
       )
       SELECT al.id, al.actor_id AS "actorId",
              COALESCE(u.full_name, u.username, al.actor_id::text) AS "actorName",
              COALESCE(ar.codes, '') AS "actorRole",
              al.action, al.entity_type AS "entityType", al.entity_id AS "entityId",
              al.before_json AS "beforeJson", al.after_json AS "afterJson",
              al.ip AS "ipAddress", al.created_at AS "createdAt"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       LEFT JOIN actor_roles ar ON ar.user_id = al.actor_id
       WHERE ($1::text IS NULL OR al.action = $1)
         AND ($2::text IS NULL OR al.entity_type = $2)
         AND al.created_at >= ${businessDayStartSql('$3')}
         AND al.created_at < ${businessDayEndSql('$4')}
       ORDER BY al.created_at DESC
       LIMIT 10000`,
      [action ?? null, entityType ?? null, fromDate, toDate],
    );

    const wb = this.excelExportService.createWorkbook();

    // Sheet 1 — audit log data
    const sheet1 = wb.addWorksheet('Nhật ký kiểm toán');
    const startRow = this.excelExportService.addGovernmentHeader(sheet1, {
      agency: 'HỆ THỐNG QUẢN LÝ DÂN QUÂN TỰ VỆ',
      reportTitle: `NHẬT KÝ KIỂM TOÁN HỆ THỐNG TỪ ${fromDate} ĐẾN ${toDate}`,
      reportDate: new Date(),
    });

    const tableRows = rows.map((r, i) => ({
      stt: i + 1,
      createdAt: r['createdAt'] as Date,
      actorName: (r['actorName'] as string) ?? '—',
      actorRole: (r['actorRole'] as string) ?? '—',
      action: r['action'] as string,
      entityType: (r['entityType'] as string) ?? '—',
      changeSummary: (() => {
        try {
          const before = r['beforeJson']
            ? JSON.stringify(r['beforeJson']).slice(0, 60)
            : '';
          const after = r['afterJson']
            ? JSON.stringify(r['afterJson']).slice(0, 60)
            : '';
          if (before && after) return `${before} → ${after}`;
          return after || before || '—';
        } catch {
          return '—';
        }
      })(),
      ipAddress: (r['ipAddress'] as string) ?? '—',
    }));

    this.excelExportService.addStyledTable(
      sheet1,
      startRow,
      [
        { header: 'STT', key: 'stt', width: 6, type: 'number' as const },
        {
          header: 'Thời gian',
          key: 'createdAt',
          width: 20,
          type: 'date' as const,
        },
        { header: 'Người dùng', key: 'actorName', width: 24 },
        { header: 'Vai trò', key: 'actorRole', width: 16 },
        {
          header: 'Hành động',
          key: 'action',
          width: 14,
          type: 'status' as const,
          statusColors: {
            CREATE: 'CCFFCC',
            UPDATE: 'FFF3CD',
            DELETE: 'FFCCCC',
            LOGIN: 'DDDDDD',
          },
        },
        { header: 'Đối tượng', key: 'entityType', width: 18 },
        { header: 'Thay đổi tóm tắt', key: 'changeSummary', width: 40 },
        { header: 'IP', key: 'ipAddress', width: 16 },
      ],
      tableRows,
    );

    this.excelExportService.addDocumentHash(
      sheet1,
      `audit-export-${fromDate}-${toDate}-${rows.length}`,
    );

    // Sheet 2 — action count statistics
    const sheet2 = wb.addWorksheet('Thống kê');
    const actionCounts: Record<string, number> = {};
    for (const r of rows) {
      const a = (r['action'] as string) ?? 'UNKNOWN';
      actionCounts[a] = (actionCounts[a] ?? 0) + 1;
    }

    this.excelExportService.addSummaryStatsTable(
      sheet2,
      0,
      `Thống kê hành động ${fromDate} — ${toDate}`,
      [
        { label: 'Tổng bản ghi', value: rows.length },
        ...Object.entries(actionCounts).map(([k, v]) => ({
          label: k,
          value: v,
        })),
      ],
    );

    const filename = `NhatKy_KiemToan_${fromDate}_${toDate}_${today}.xlsx`;
    await this.excelExportService.streamToResponse(wb, res, filename);
  }

  private async query(
    actor: JwtPayload,
    opts: {
      action?: string;
      entityType?: string;
      actorId?: string;
      from?: string;
      to?: string;
      page: number;
      limit: number;
      entityId?: string;
      search?: string;
    },
  ) {
    // Entries belong to the unit of the person who acted; ward-wide roles see all of them
    const unit = effectiveUnit(actor);
    for (const date of [opts.from, opts.to]) {
      if (date !== undefined && !isIsoDate(date)) {
        throw new BadRequestException('invalid_date');
      }
    }
    const limit = Math.min(Math.max(1, opts.limit), 100);
    const page = Math.max(1, opts.page);
    const offset = (page - 1) * limit;
    // Wildcards typed into the search box match literally
    const searchText = opts.search?.trim();
    const search = searchText
      ? `%${searchText.replace(/[\\%_]/g, '\\$&')}%`
      : null;

    const filters = `
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE ($1::text IS NULL OR al.action = $1)
         AND ($2::text IS NULL OR al.entity_type = $2)
         AND ($3::uuid IS NULL OR al.actor_id = $3::uuid)
         AND ($4::date IS NULL OR al.created_at >= ${businessDayStartSql('$4')})
         AND ($5::date IS NULL OR al.created_at < ${businessDayEndSql('$5')})
         AND ($6::uuid IS NULL OR al.entity_id = $6::uuid)
         AND ($7::text IS NULL OR al.action ILIKE $7 OR al.entity_type ILIKE $7
              OR u.full_name ILIKE $7 OR u.username ILIKE $7)
         AND ($8::text IS NULL OR ${userInUnit('al.actor_id', '$8')})`;
    const params = [
      opts.action ?? null,
      opts.entityType ?? null,
      opts.actorId ?? null,
      opts.from ?? null,
      opts.to ?? null,
      opts.entityId ?? null,
      search,
      unit,
    ];

    const countRows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count ${filters}`,
      params,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT al.id, al.actor_id AS "actorId", u.full_name AS "actorName",
              al.action, al.entity_type AS "entityType", al.entity_id AS "entityId",
              al.before_json AS "beforeJson", al.after_json AS "afterJson",
              al.ip AS "ipAddress", al.created_at AS "createdAt"
       ${filters}
       ORDER BY al.created_at DESC
       LIMIT $9 OFFSET $10`,
      [...params, limit, offset],
    );

    return { data: rows, total, page, limit };
  }
}
