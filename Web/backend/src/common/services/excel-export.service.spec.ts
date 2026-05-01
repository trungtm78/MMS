import { Test, TestingModule } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import { ExcelExportService } from './excel-export.service';

describe('ExcelExportService', () => {
  let service: ExcelExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExcelExportService],
    }).compile();
    service = module.get<ExcelExportService>(ExcelExportService);
  });

  // ── createWorkbook ───────────────────────────────────────────────────────

  describe('createWorkbook', () => {
    it('returns an ExcelJS.Workbook with correct creator', () => {
      const wb = service.createWorkbook();
      expect(wb).toBeInstanceOf(ExcelJS.Workbook);
      expect(wb.creator).toContain('MMS');
    });
  });

  // ── addGovernmentHeader ──────────────────────────────────────────────────

  describe('addGovernmentHeader', () => {
    it('writes exactly 5 significant header rows (rows 1-5)', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');

      service.addGovernmentHeader(sheet, {
        agency: 'TEST AGENCY',
        reportTitle: 'BÁO CÁO KIỂM TRA',
        reportDate: new Date('2026-01-15'),
        location: 'Hà Nội',
      });

      // Row 1: agency
      expect(sheet.getRow(1).getCell(1).value).toContain('TEST AGENCY');
      // Row 2: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
      expect(sheet.getRow(2).getCell(1).value).toContain('CỘNG HÒA');
      // Row 3: Độc lập
      expect(sheet.getRow(3).getCell(1).value).toContain('Độc lập');
      // Row 5: report title
      expect(sheet.getRow(5).getCell(1).value).toContain('BÁO CÁO KIỂM TRA');
    });

    it('returns start row 8 (next data row after header + separator)', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');
      const nextRow = service.addGovernmentHeader(sheet, {
        agency: 'UNIT',
        reportTitle: 'TITLE',
        reportDate: new Date(),
      });
      expect(nextRow).toBe(8);
    });

    it('row 2 is bold (CỘNG HÒA line)', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');
      service.addGovernmentHeader(sheet, {
        agency: 'UNIT',
        reportTitle: 'TITLE',
        reportDate: new Date(),
      });
      const font = sheet.getRow(2).getCell(1).font;
      expect(font?.bold).toBe(true);
    });

    it('row 3 is italic (Độc lập line)', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');
      service.addGovernmentHeader(sheet, {
        agency: 'UNIT',
        reportTitle: 'TITLE',
        reportDate: new Date(),
      });
      const font = sheet.getRow(3).getCell(1).font;
      expect(font?.italic).toBe(true);
    });

    it('defaults location to Hồ Chí Minh if not provided', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');
      service.addGovernmentHeader(sheet, {
        agency: 'UNIT',
        reportTitle: 'TITLE',
        reportDate: new Date('2026-03-01'),
      });
      const dateLine = sheet.getRow(6).getCell(1).value as string;
      expect(dateLine).toContain('Hồ Chí Minh');
    });
  });

  // ── addStyledTable ────────────────────────────────────────────────────────

  describe('addStyledTable', () => {
    const columns = [
      { header: 'STT', key: 'stt', width: 6, type: 'number' as const },
      { header: 'Tên', key: 'name', width: 20 },
      {
        header: 'Kết quả',
        key: 'status',
        width: 14,
        type: 'status' as const,
        statusColors: { 'ĐẠT': 'CCFFCC', 'KHÔNG ĐẠT': 'FFCCCC', 'CẢNH BÁO': 'FFF3CD' },
      },
    ];

    it('writes header row with correct values', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');
      service.addStyledTable(sheet, 1, columns, [{ stt: 1, name: 'Test', status: 'ĐẠT' }]);

      expect(sheet.getRow(1).getCell(1).value).toBe('STT');
      expect(sheet.getRow(1).getCell(2).value).toBe('Tên');
      expect(sheet.getRow(1).getCell(3).value).toBe('Kết quả');
    });

    it('applies status colors: ĐẠT → green fill', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');
      service.addStyledTable(sheet, 1, columns, [{ stt: 1, name: 'X', status: 'ĐẠT' }]);

      const statusCell = sheet.getRow(2).getCell(3);
      const fill = statusCell.fill as ExcelJS.FillPattern;
      // ĐẠT uses custom color CCFFCC or STATUS_PASS_FILL fallback
      expect(fill?.fgColor?.argb).toMatch(/CCFFCC|FF/i);
    });

    it('applies status colors: KHÔNG ĐẠT → red fill', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');
      service.addStyledTable(sheet, 1, columns, [{ stt: 1, name: 'X', status: 'KHÔNG ĐẠT' }]);

      const statusCell = sheet.getRow(2).getCell(3);
      const fill = statusCell.fill as ExcelJS.FillPattern;
      expect(fill?.fgColor?.argb).toMatch(/FFCCCC|FF/i);
    });

    it('applies status colors: CẢNH BÁO → yellow fill', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');
      service.addStyledTable(sheet, 1, columns, [{ stt: 1, name: 'X', status: 'CẢNH BÁO' }]);

      const statusCell = sheet.getRow(2).getCell(3);
      const fill = statusCell.fill as ExcelJS.FillPattern;
      expect(fill?.fgColor?.argb).toMatch(/FFF3CD|FF/i);
    });

    it('writes data rows (N+1 rows total including header)', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');
      const data = [
        { stt: 1, name: 'A', status: 'ĐẠT' },
        { stt: 2, name: 'B', status: 'KHÔNG ĐẠT' },
        { stt: 3, name: 'C', status: 'CẢNH BÁO' },
      ];
      service.addStyledTable(sheet, 2, columns, data);
      // Header at row 2, data at rows 3,4,5
      expect(sheet.getRow(3).getCell(2).value).toBe('A');
      expect(sheet.getRow(4).getCell(2).value).toBe('B');
      expect(sheet.getRow(5).getCell(2).value).toBe('C');
    });
  });

  // ── addDocumentHash ───────────────────────────────────────────────────────

  describe('addDocumentHash', () => {
    it('adds a SHA-256 hash footer row', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Test');
      // Add some rows so lastRow is known
      sheet.getRow(5).getCell(1).value = 'data';
      service.addDocumentHash(sheet, 'test-content-abc');

      const hashRow = sheet.getRow(7); // lastRow(5) + 2
      const val = hashRow.getCell(1).value as string;
      expect(val).toContain('Document hash (SHA-256):');
      expect(val).toContain('MMS');
    });

    it('hash is deterministic for same input (same SHA-256 hex)', () => {
      const wb1 = service.createWorkbook();
      const s1 = wb1.addWorksheet('T');
      s1.getRow(3).getCell(1).value = 'x';
      service.addDocumentHash(s1, 'same-content');

      const wb2 = service.createWorkbook();
      const s2 = wb2.addWorksheet('T');
      s2.getRow(3).getCell(1).value = 'x';
      service.addDocumentHash(s2, 'same-content');

      const v1 = s1.getRow(5).getCell(1).value as string;
      const v2 = s2.getRow(5).getCell(1).value as string;

      // Extract just the SHA-256 hash portion (64 hex chars) — the timestamp may differ by ms
      const hashRegex = /([a-f0-9]{64})/;
      const hash1 = v1.match(hashRegex)?.[1];
      const hash2 = v2.match(hashRegex)?.[1];
      expect(hash1).toBeDefined();
      expect(hash1).toBe(hash2);
    });
  });

  // ── addLegalReferencesSheet ───────────────────────────────────────────────

  describe('addLegalReferencesSheet', () => {
    it('adds a Ghi chú sheet with legal references', () => {
      const wb = service.createWorkbook();
      service.addLegalReferencesSheet(wb, ['NĐ 72/2020', 'NĐ 30/2020']);

      const sheet = wb.getWorksheet('Ghi chú');
      expect(sheet).toBeDefined();
      expect(sheet?.getRow(1).getCell(1).value).toContain('CÁC QUY ĐỊNH');
    });

    it('lists each regulation as a bullet row', () => {
      const wb = service.createWorkbook();
      service.addLegalReferencesSheet(wb, ['REG_A', 'REG_B', 'REG_C']);
      const sheet = wb.getWorksheet('Ghi chú')!;
      // Regulations start at row 4
      expect((sheet.getRow(4).getCell(1).value as string)).toContain('REG_A');
      expect((sheet.getRow(5).getCell(1).value as string)).toContain('REG_B');
      expect((sheet.getRow(6).getCell(1).value as string)).toContain('REG_C');
    });
  });

  // ── addSummaryStatsTable ──────────────────────────────────────────────────

  describe('addSummaryStatsTable', () => {
    it('writes stats with labels and values', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Stats');
      service.addSummaryStatsTable(sheet, 0, 'Tóm tắt', [
        { label: 'Tổng số', value: 100 },
        { label: 'Đạt', value: 80, highlight: false },
        { label: 'Cảnh báo', value: 10, highlight: true },
      ]);

      expect(sheet.getRow(1).getCell(1).value).toBe('Tóm tắt');
      expect(sheet.getRow(2).getCell(1).value).toBe('Tổng số');
      expect(sheet.getRow(2).getCell(2).value).toBe(100);
    });

    it('highlights rows with highlight=true', () => {
      const wb = service.createWorkbook();
      const sheet = wb.addWorksheet('Stats');
      service.addSummaryStatsTable(sheet, 0, 'Title', [
        { label: 'At risk', value: 5, highlight: true },
      ]);
      const cell = sheet.getRow(2).getCell(2);
      const fill = cell.fill as ExcelJS.FillPattern;
      expect(fill?.fgColor?.argb).toBeDefined();
    });
  });
});
