// Shared Excel export utility — stateless helpers, inject don't extend
// Per NĐ 30/2020: all official exports include document hash for audit trail
import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as crypto from 'crypto';
import type { Response } from 'express';

export interface GovernmentHeaderOptions {
  agency: string;       // Tên đơn vị báo cáo
  reportTitle: string;  // Tiêu đề báo cáo (in hoa)
  reportDate: Date;
  location?: string;    // Địa điểm (default 'Hồ Chí Minh')
}

export interface TableColumn {
  header: string;
  key: string;
  width?: number;
  type?: 'text' | 'number' | 'date' | 'currency' | 'percent' | 'status';
  statusColors?: Record<string, string>; // status value → hex color
}

const HEADER_FILL = '1F3A5F';
const ROW_ALT = 'EBF5FB';
const STATUS_PASS_FILL = 'CCFFCC';
const STATUS_FAIL_FILL = 'FFCCCC';
const STATUS_WARN_FILL = 'FFF3CD';

@Injectable()
export class ExcelExportService {

  // ─── Government header (5 rows CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM) ─────────

  addGovernmentHeader(sheet: ExcelJS.Worksheet, opts: GovernmentHeaderOptions): number {
    const cols = sheet.columnCount || 10;
    const merge = (row: number, value: string, fontSize: number, bold: boolean, italic = false) => {
      const r = sheet.getRow(row);
      r.getCell(1).value = value;
      r.getCell(1).font = { name: 'Times New Roman', size: fontSize, bold, italic };
      r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      if (cols > 1) sheet.mergeCells(row, 1, row, cols);
      r.height = bold ? 22 : 18;
    };

    merge(1, opts.agency.toUpperCase(), 11, true);
    merge(2, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 13, true);
    merge(3, 'Độc lập - Tự do - Hạnh phúc', 12, false, true);
    merge(4, '', 10, false);  // blank row
    merge(5, opts.reportTitle.toUpperCase(), 14, true);

    // Date line under title
    const loc = opts.location ?? 'Hồ Chí Minh';
    const d = opts.reportDate;
    const dateLine = `${loc}, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
    const dateRow = sheet.getRow(6);
    dateRow.getCell(1).value = dateLine;
    dateRow.getCell(1).font = { name: 'Times New Roman', size: 11, italic: true };
    dateRow.getCell(1).alignment = { horizontal: 'center' };
    if (cols > 1) sheet.mergeCells(6, 1, 6, cols);
    dateRow.height = 16;

    // Blank separator
    sheet.getRow(7).height = 8;

    return 8; // next data row
  }

  // ─── Data table with professional styling ────────────────────────────────────

  addStyledTable(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    columns: TableColumn[],
    rows: Record<string, unknown>[],
  ): void {
    // Set column widths
    columns.forEach((col, i) => {
      sheet.getColumn(i + 1).key = col.key;
      sheet.getColumn(i + 1).width = col.width ?? 16;
    });

    // Header row
    const headerRow = sheet.getRow(startRow);
    columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_FILL}` } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium' }, bottom: { style: 'medium' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });
    headerRow.height = 28;

    // Enable auto-filter
    sheet.autoFilter = {
      from: { row: startRow, column: 1 },
      to: { row: startRow, column: columns.length },
    };

    // Freeze header + gov header rows
    sheet.views = [{ state: 'frozen', ySplit: startRow, xSplit: Math.min(2, columns.length) }];

    // Data rows
    rows.forEach((rowData, rowIdx) => {
      const dataRow = sheet.getRow(startRow + 1 + rowIdx);
      const isAlt = rowIdx % 2 === 1;
      const defaultFill: ExcelJS.FillPattern = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: isAlt ? `FF${ROW_ALT}` : 'FFFFFFFF' },
      };

      columns.forEach((col, colIdx) => {
        const cell = dataRow.getCell(colIdx + 1);
        const raw = rowData[col.key];

        // Format value by type
        if (col.type === 'date' && raw instanceof Date) {
          cell.value = raw;
          cell.numFmt = 'dd/MM/yyyy';
        } else if (col.type === 'currency' && typeof raw === 'number') {
          cell.value = raw;
          cell.numFmt = '#,##0 ₫';
        } else if (col.type === 'number' && typeof raw === 'number') {
          cell.value = raw;
          cell.numFmt = '#,##0';
        } else if (col.type === 'percent' && typeof raw === 'number') {
          cell.value = raw / 100;
          cell.numFmt = '0.0%';
        } else {
          cell.value = raw as ExcelJS.CellValue ?? '—';
        }

        // Status-based coloring
        let fill = defaultFill;
        if (col.type === 'status' && typeof raw === 'string') {
          const customColor = col.statusColors?.[raw];
          if (customColor) {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${customColor}` } };
          } else if (['ĐẠT', 'PASS', 'active', 'approved'].includes(raw)) {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${STATUS_PASS_FILL}` } };
          } else if (['KHÔNG ĐẠT', 'FAIL', 'inactive', 'rejected'].includes(raw)) {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${STATUS_FAIL_FILL}` } };
          } else if (['CẢNH BÁO', 'WARNING', 'pending', 'reserve'].includes(raw)) {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${STATUS_WARN_FILL}` } };
          }
        }
        cell.fill = fill;

        cell.font = { name: 'Times New Roman', size: 10 };
        cell.alignment = {
          horizontal: col.type === 'number' || col.type === 'currency' || col.type === 'percent'
            ? 'right' : col.type === 'status' ? 'center' : 'left',
          vertical: 'middle',
        };
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' },
        };
      });
      dataRow.height = 18;
    });
  }

  // ─── Signature block (print artifact) ───────────────────────────────────────

  addSignatureBlock(
    sheet: ExcelJS.Worksheet,
    afterRow: number,
    opts: { position: string; location?: string },
  ): void {
    const cols = sheet.columnCount || 10;
    const loc = opts.location ?? 'Hồ Chí Minh';
    const now = new Date();
    const dateStr = `${loc}, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;

    const blankRow = sheet.getRow(afterRow + 1);
    blankRow.height = 12;

    const dateRow = sheet.getRow(afterRow + 2);
    const halfCol = Math.ceil(cols / 2);
    dateRow.getCell(halfCol).value = dateStr;
    dateRow.getCell(halfCol).font = { name: 'Times New Roman', size: 11, italic: true };
    dateRow.getCell(halfCol).alignment = { horizontal: 'center' };

    const posRow = sheet.getRow(afterRow + 3);
    posRow.getCell(halfCol).value = opts.position.toUpperCase();
    posRow.getCell(halfCol).font = { name: 'Times New Roman', size: 11, bold: true };
    posRow.getCell(halfCol).alignment = { horizontal: 'center' };
    // Note for screen users
    posRow.getCell(halfCol).note = 'In và ký tay theo quy định NĐ 30/2020';

    const nameRow = sheet.getRow(afterRow + 5);
    nameRow.getCell(halfCol).value = '(Ký, đóng dấu, ghi họ tên)';
    nameRow.getCell(halfCol).font = { name: 'Times New Roman', size: 10, italic: true };
    nameRow.getCell(halfCol).alignment = { horizontal: 'center' };
  }

  // ─── Legal references sheet ──────────────────────────────────────────────────

  addLegalReferencesSheet(workbook: ExcelJS.Workbook, regulations: string[]): void {
    const sheet = workbook.addWorksheet('Ghi chú');
    sheet.getColumn(1).width = 80;

    const titleRow = sheet.getRow(1);
    titleRow.getCell(1).value = 'CÁC QUY ĐỊNH PHÁP LUẬT ÁP DỤNG';
    titleRow.getCell(1).font = { name: 'Times New Roman', size: 12, bold: true };
    titleRow.height = 24;

    const noteRow = sheet.getRow(2);
    noteRow.getCell(1).value = 'Báo cáo này được in và ký tay trước khi nộp cơ quan cấp trên (NĐ 30/2020).';
    noteRow.getCell(1).font = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF666666' } };
    noteRow.height = 18;

    regulations.forEach((reg, i) => {
      const row = sheet.getRow(i + 4);
      row.getCell(1).value = `• ${reg}`;
      row.getCell(1).font = { name: 'Times New Roman', size: 10 };
      row.height = 16;
    });
  }

  // ─── Document hash footer (NĐ 30/2020) ──────────────────────────────────────

  addDocumentHash(sheet: ExcelJS.Worksheet, content: string): void {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const timestamp = new Date().toISOString();
    const lastRow = sheet.lastRow?.number ?? 1;
    const hashRow = sheet.getRow(lastRow + 2);
    const cols = sheet.columnCount || 10;

    hashRow.getCell(1).value = `Document hash (SHA-256): ${hash} — Generated by MMS at ${timestamp}`;
    hashRow.getCell(1).font = { name: 'Courier New', size: 8, color: { argb: 'FF999999' } };
    hashRow.getCell(1).alignment = { horizontal: 'left' };
    if (cols > 1) sheet.mergeCells(lastRow + 2, 1, lastRow + 2, cols);
    hashRow.height = 14;
  }

  // ─── Stream workbook to HTTP response ────────────────────────────────────────

  async streamToResponse(
    workbook: ExcelJS.Workbook,
    res: Response,
    filename: string,
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    await workbook.xlsx.write(res);
    res.end();
  }

  // ─── Helper: create base workbook ────────────────────────────────────────────

  createWorkbook(): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MMS — Hệ thống Quản lý Dân Quân Tự Vệ';
    wb.lastModifiedBy = 'MMS System';
    wb.created = new Date();
    wb.modified = new Date();
    return wb;
  }

  // ─── Helper: summary stats table (replaces charts — CEO Decision #2) ─────────

  addSummaryStatsTable(
    sheet: ExcelJS.Worksheet,
    afterRow: number,
    title: string,
    stats: Array<{ label: string; value: string | number; highlight?: boolean }>,
  ): void {
    const cols = sheet.columnCount || 10;
    const titleRow = sheet.getRow(afterRow + 1);
    titleRow.getCell(1).value = title;
    titleRow.getCell(1).font = { name: 'Times New Roman', size: 11, bold: true };
    if (cols > 1) sheet.mergeCells(afterRow + 1, 1, afterRow + 1, Math.min(4, cols));

    stats.forEach((stat, i) => {
      const r = sheet.getRow(afterRow + 2 + i);
      r.getCell(1).value = stat.label;
      r.getCell(1).font = { name: 'Times New Roman', size: 10 };
      r.getCell(2).value = stat.value;
      r.getCell(2).font = { name: 'Times New Roman', size: 10, bold: stat.highlight };
      if (stat.highlight) {
        r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${STATUS_WARN_FILL}` } };
      }
      r.height = 16;
    });
  }
}
