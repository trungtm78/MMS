// GET /reports/custom and /reports/custom/export: a whitelisted report over one dataset
// (custom-report.definitions.ts), limited to the caller's unit scope, with a summary of the
// whole scope and an optional breakdown capped at a row limit.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import type { DataSource } from 'typeorm';
import { effectiveUnit, type ScopedActor } from '../common/access/unit-scope';
import { ExcelExportService } from '../common/services/excel-export.service';
import { businessDate } from '../common/time/business-date';
import { assertBoundedDateRange } from '../common/validation/date-range';
import {
  buildCustomReportQuery,
  customReportTitle,
  type CustomReportDataset,
  type CustomReportGrouping,
  type ReportColumn,
} from './custom-report.definitions';

export const CUSTOM_REPORT_DEFAULT_ROWS = 500;
export const CUSTOM_REPORT_MAX_ROWS = 5000;
// A year and a day, so a report can run from one date to the same date a year later
export const CUSTOM_REPORT_MAX_DAYS = 366;

export interface CustomReportRequest {
  dataset: string;
  from?: string;
  to?: string;
  groupBy?: string;
  status?: string;
  unitCode?: string;
  limit?: number;
}

export interface CustomReportResult {
  dataset: CustomReportDataset;
  title: string;
  from: string;
  to: string;
  /** The unit the report is limited to; null for the whole ward */
  unitCode: string | null;
  groupBy: CustomReportGrouping;
  status: string | null;
  generatedAt: Date;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  rowLimit: number;
  /** More breakdown rows exist than rowLimit */
  truncated: boolean;
  /** The measures over the whole scope and range, whatever the breakdown */
  summary: { key: string; label: string; value: unknown }[];
}

const EXCEL_WIDTH: Record<ReportColumn['type'], number> = {
  text: 24,
  date: 14,
  number: 14,
  percent: 14,
  currency: 18,
};

@Injectable()
export class CustomReportsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly excel: ExcelExportService,
  ) {}

  async generate(
    actor: ScopedActor,
    request: CustomReportRequest,
    defaultRows = CUSTOM_REPORT_DEFAULT_ROWS,
  ): Promise<CustomReportResult> {
    // The Vietnamese month to date by default
    const today = businessDate().isoDate;
    const to = request.to || today;
    const from = request.from || `${to.slice(0, 8)}01`;
    assertBoundedDateRange(from, to, CUSTOM_REPORT_MAX_DAYS);

    const dataset = request.dataset as CustomReportDataset;
    const groupBy = (request.groupBy || 'none') as CustomReportGrouping;
    const status = request.status || undefined;
    const summaryQuery = buildCustomReportQuery(dataset, 'none', status);
    const query =
      groupBy === 'none'
        ? summaryQuery
        : buildCustomReportQuery(dataset, groupBy, status);

    // Totals of other units must not leak: the requested unit only applies to wide roles
    const unit = effectiveUnit(actor, request.unitCode || undefined);
    const rowLimit = Math.min(
      Math.max(1, request.limit ?? defaultRows),
      CUSTOM_REPORT_MAX_ROWS,
    );
    const params = [from, to, unit];

    const [summaryRow = {}] = await this.dataSource.query<
      Record<string, unknown>[]
    >(summaryQuery.sql, params);

    let rows: Record<string, unknown>[] = [summaryRow];
    let truncated = false;
    if (groupBy !== 'none') {
      // One row past the limit tells whether the breakdown was cut
      const fetched = await this.dataSource.query<Record<string, unknown>[]>(
        query.sql,
        [...params, rowLimit + 1],
      );
      truncated = fetched.length > rowLimit;
      rows = fetched.slice(0, rowLimit);
    }

    return {
      dataset,
      title: customReportTitle(dataset),
      from,
      to,
      unitCode: unit,
      groupBy,
      status: status ?? null,
      generatedAt: new Date(),
      columns: query.columns,
      rows,
      rowCount: rows.length,
      rowLimit,
      truncated,
      summary: summaryQuery.measures.map((m) => ({
        key: m.key,
        label: m.label,
        value: summaryRow[m.key] ?? null,
      })),
    };
  }

  /** The same report as an xlsx workbook, up to 5000 breakdown rows unless asked for fewer. */
  async export(
    actor: ScopedActor,
    request: CustomReportRequest,
    res: Response,
  ): Promise<void> {
    const report = await this.generate(actor, request, CUSTOM_REPORT_MAX_ROWS);
    const workbook = this.excel.createWorkbook();

    const sheet = workbook.addWorksheet('Báo cáo');
    const startRow = this.excel.addGovernmentHeader(sheet, {
      agency: 'UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ',
      reportTitle: `${report.title} từ ${report.from} đến ${report.to}${
        report.unitCode ? ` — đơn vị ${report.unitCode}` : ''
      }`,
      reportDate: new Date(),
    });
    this.excel.addStyledTable(
      sheet,
      startRow,
      report.columns.map((c) => ({
        header: c.label,
        key: c.key,
        width: EXCEL_WIDTH[c.type],
        type: c.type === 'date' ? 'text' : c.type,
      })),
      report.rows,
    );
    this.excel.addDocumentHash(
      sheet,
      JSON.stringify({
        dataset: report.dataset,
        from: report.from,
        to: report.to,
        unitCode: report.unitCode,
        groupBy: report.groupBy,
        status: report.status,
        rows: report.rows,
      }),
    );

    const summarySheet = workbook.addWorksheet('Tổng hợp');
    this.excel.addSummaryStatsTable(summarySheet, 0, report.title, [
      ...report.summary.map((s) => ({
        label: s.label,
        value: (s.value ?? '—') as string | number,
      })),
      { label: 'Từ ngày', value: report.from },
      { label: 'Đến ngày', value: report.to },
      ...(report.truncated
        ? [
            {
              label: 'Lưu ý',
              value: `Chỉ xuất ${report.rowLimit} dòng đầu của bảng chi tiết`,
              highlight: true,
            },
          ]
        : []),
    ]);

    await this.excel.streamToResponse(
      workbook,
      res,
      `BaoCao_${report.dataset}_${report.from}_${report.to}.xlsx`,
    );
  }
}
