import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ExcelExportService } from '../common/services/excel-export.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'police_ward', 'police_area')
export class AuditController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly excelExportService: ExcelExportService,
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
    const fromDate = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = to ?? new Date().toISOString().slice(0, 10);

    // Hard cap: 90-day max range
    const diffMs = new Date(toDate).getTime() - new Date(fromDate).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 90) {
      throw new BadRequestException('date_range_exceeds_90_days');
    }

    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT al.id, al.actor_id AS "actorId",
              COALESCE(u.full_name, u.username, al.actor_id::text) AS "actorName",
              COALESCE(u.role, '') AS "actorRole",
              al.action, al.entity_type AS "entityType", al.entity_id AS "entityId",
              al.before_json AS "beforeJson", al.after_json AS "afterJson",
              al.ip_address AS "ipAddress", al.created_at AS "createdAt"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE ($1::text IS NULL OR al.action = $1)
         AND ($2::text IS NULL OR al.entity_type = $2)
         AND al.created_at BETWEEN $3::timestamptz AND ($4::date + INTERVAL '1 day')::timestamptz
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
      actorName: r['actorName'] as string ?? '—',
      actorRole: r['actorRole'] as string ?? '—',
      action: r['action'] as string,
      entityType: r['entityType'] as string ?? '—',
      changeSummary: (() => {
        try {
          const before = r['beforeJson'] ? JSON.stringify(r['beforeJson']).slice(0, 60) : '';
          const after = r['afterJson'] ? JSON.stringify(r['afterJson']).slice(0, 60) : '';
          if (before && after) return `${before} → ${after}`;
          return after || before || '—';
        } catch { return '—'; }
      })(),
      ipAddress: r['ipAddress'] as string ?? '—',
    }));

    this.excelExportService.addStyledTable(sheet1, startRow, [
      { header: 'STT',           key: 'stt',          width: 6,  type: 'number' as const },
      { header: 'Thời gian',     key: 'createdAt',    width: 20, type: 'date' as const },
      { header: 'Người dùng',    key: 'actorName',    width: 24 },
      { header: 'Vai trò',       key: 'actorRole',    width: 16 },
      {
        header: 'Hành động',
        key: 'action',
        width: 14,
        type: 'status' as const,
        statusColors: { CREATE: 'CCFFCC', UPDATE: 'FFF3CD', DELETE: 'FFCCCC', LOGIN: 'DDDDDD' },
      },
      { header: 'Đối tượng',     key: 'entityType',   width: 18 },
      { header: 'Thay đổi tóm tắt', key: 'changeSummary', width: 40 },
      { header: 'IP',            key: 'ipAddress',    width: 16 },
    ], tableRows);

    this.excelExportService.addDocumentHash(sheet1, `audit-export-${fromDate}-${toDate}-${rows.length}`);

    // Sheet 2 — action count statistics
    const sheet2 = wb.addWorksheet('Thống kê');
    const actionCounts: Record<string, number> = {};
    for (const r of rows) {
      const a = r['action'] as string ?? 'UNKNOWN';
      actionCounts[a] = (actionCounts[a] ?? 0) + 1;
    }

    this.excelExportService.addSummaryStatsTable(sheet2, 0, `Thống kê hành động ${fromDate} — ${toDate}`, [
      { label: 'Tổng bản ghi', value: rows.length },
      ...Object.entries(actionCounts).map(([k, v]) => ({ label: k, value: v })),
    ]);

    const date = new Date().toISOString().slice(0, 10);
    const filename = `NhatKy_KiemToan_${fromDate}_${toDate}_${date}.xlsx`;
    await this.excelExportService.streamToResponse(wb, res, filename);
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
