import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { Response } from 'express';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';
import { ExcelExportService } from '../common/services/excel-export.service';
import { buildCustomReportQuery } from './custom-report.definitions';
import { CustomReportsService } from './custom-reports.service';

const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
const sheet = { name: 'sheet' };
const workbook = { addWorksheet: jest.fn(() => sheet) };
const excel = {
  createWorkbook: jest.fn(() => workbook),
  addGovernmentHeader: jest.fn(() => 8),
  addStyledTable: jest.fn(),
  addSummaryStatsTable: jest.fn(),
  addDocumentHash: jest.fn(),
  streamToResponse: jest.fn(),
};

const staff = { sub: 's-1', role: 'office_staff', unitScope: 'KV-A' };
const ward = { sub: 'w-1', role: 'police_ward', unitScope: null };

const SUMMARY = {
  records: 10,
  members: 4,
  present: 7,
  late: 1,
  earlyLeave: 0,
  absent: 2,
  workHours: 60.5,
  attendanceRate: 80,
};
const unitRow = (unitCode: string) => ({
  unitCode,
  unitName: `Khu vực ${unitCode}`,
  ...SUMMARY,
});

const sqlOf = (call: number) => query.mock.calls[call][0];
const paramsOf = (call: number) => query.mock.calls[call][1] as unknown[];

describe('CustomReportsService', () => {
  useUtcServerClock(VN_1_OCTOBER_0130);

  let service: CustomReportsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomReportsService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: ExcelExportService, useValue: excel },
      ],
    }).compile();
    service = moduleRef.get(CustomReportsService);
    query.mockReset();
    jest.clearAllMocks();
  });

  describe('generate', () => {
    it('runs the summary and the breakdown within the caller unit', async () => {
      query
        .mockResolvedValueOnce([SUMMARY])
        .mockResolvedValueOnce([unitRow('KV-A')]);

      const result = await service.generate(staff, {
        dataset: 'attendance',
        from: '2026-09-01',
        to: '2026-09-30',
        groupBy: 'unit',
        unitCode: 'KV-B',
      });

      const summaryQuery = buildCustomReportQuery('attendance', 'none');
      const unitQuery = buildCustomReportQuery('attendance', 'unit');
      expect(sqlOf(0)).toBe(summaryQuery.sql);
      expect(paramsOf(0)).toEqual(['2026-09-01', '2026-09-30', 'KV-A']);
      expect(sqlOf(1)).toBe(unitQuery.sql);
      // one row past the limit tells whether the breakdown was cut
      expect(paramsOf(1)).toEqual(['2026-09-01', '2026-09-30', 'KV-A', 501]);
      expect(result).toEqual({
        dataset: 'attendance',
        title: 'Báo cáo chấm công',
        from: '2026-09-01',
        to: '2026-09-30',
        unitCode: 'KV-A',
        groupBy: 'unit',
        status: null,
        generatedAt: expect.any(Date) as Date,
        columns: unitQuery.columns,
        rows: [unitRow('KV-A')],
        rowCount: 1,
        rowLimit: 500,
        truncated: false,
        summary: summaryQuery.measures.map((m) => ({
          key: m.key,
          label: m.label,
          value: SUMMARY[m.key as keyof typeof SUMMARY],
        })),
      });
    });

    it('lets a wide role narrow to a unit and filter on a status', async () => {
      query.mockResolvedValueOnce([SUMMARY]).mockResolvedValueOnce([]);
      const result = await service.generate(ward, {
        dataset: 'tasks',
        from: '2026-09-01',
        to: '2026-09-30',
        groupBy: 'type',
        status: 'overdue',
        unitCode: 'KV-B',
      });
      expect(paramsOf(0)).toEqual(['2026-09-01', '2026-09-30', 'KV-B']);
      expect(sqlOf(1)).toBe(
        buildCustomReportQuery('tasks', 'type', 'overdue').sql,
      );
      expect(result.status).toBe('overdue');
    });

    it('refuses an area role without a unit scope', async () => {
      const unscopedArea = { sub: 'a-1', role: 'police_area', unitScope: null };
      await expect(
        service.generate(unscopedArea, { dataset: 'attendance' }),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(query).not.toHaveBeenCalled();
    });

    it('defaults to a summary of the Vietnamese month to date, in one query', async () => {
      query.mockResolvedValueOnce([SUMMARY]);

      const result = await service.generate(staff, { dataset: 'attendance' });

      expect(query).toHaveBeenCalledTimes(1);
      expect(paramsOf(0)).toEqual(['2026-10-01', '2026-10-01', 'KV-A']);
      expect(result).toMatchObject({
        from: '2026-10-01',
        to: '2026-10-01',
        groupBy: 'none',
        columns: buildCustomReportQuery('attendance', 'none').columns,
        rows: [SUMMARY],
        rowCount: 1,
        truncated: false,
      });
    });

    it('reads blank filters as absent', async () => {
      query.mockResolvedValueOnce([SUMMARY]);
      const result = await service.generate(ward, {
        dataset: 'kpi',
        groupBy: '',
        status: '',
        unitCode: '',
      } as never);
      expect(paramsOf(0)[2]).toBeNull();
      expect(result).toMatchObject({
        groupBy: 'none',
        status: null,
        unitCode: null,
      });
    });

    it('marks a cut breakdown and returns only the rows asked for', async () => {
      query
        .mockResolvedValueOnce([SUMMARY])
        .mockResolvedValueOnce([unitRow('A'), unitRow('B'), unitRow('C')]);

      const result = await service.generate(ward, {
        dataset: 'attendance',
        groupBy: 'unit',
        limit: 2,
      });

      expect(paramsOf(1)[3]).toBe(3);
      expect(result).toMatchObject({
        rows: [unitRow('A'), unitRow('B')],
        rowCount: 2,
        rowLimit: 2,
        truncated: true,
      });
    });

    it('bounds the row limit to 1-5000', async () => {
      query.mockResolvedValue([]);
      const high = await service.generate(ward, {
        dataset: 'payroll',
        groupBy: 'unit',
        limit: 99_999,
      });
      expect(paramsOf(1)[3]).toBe(5001);
      expect(high.rowLimit).toBe(5000);

      query.mockReset().mockResolvedValue([]);
      const low = await service.generate(ward, {
        dataset: 'payroll',
        groupBy: 'unit',
        limit: 0,
      });
      expect(paramsOf(1)[3]).toBe(2);
      expect(low.rowLimit).toBe(1);
    });

    it.each<[string, Record<string, string>, string]>([
      [
        'a range longer than 366 days',
        { from: '2025-01-01', to: '2026-01-02' },
        'date_range_too_long',
      ],
      [
        'an unordered range',
        { from: '2026-09-02', to: '2026-09-01' },
        'invalid_date_range',
      ],
      ['an unknown dataset', { dataset: 'users' }, 'invalid_dataset'],
      [
        'a breakdown the dataset lacks',
        { groupBy: 'priority' },
        'group_by_not_supported',
      ],
      [
        'a status the dataset lacks',
        { status: 'late' },
        'status_not_supported',
      ],
    ])('refuses %s before querying', async (_label, change, code) => {
      await expect(
        service.generate(ward, { dataset: 'payroll', ...change }),
      ).rejects.toThrow(new BadRequestException(code));
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    it('writes the breakdown and the summary to a workbook and streams it', async () => {
      const rows = [{ type: 'patrol', typeLabel: 'Tuần tra', tasks: 3 }];
      query.mockResolvedValueOnce([{ tasks: 3 }]).mockResolvedValueOnce(rows);
      const res = {} as Response;

      await service.export(
        ward,
        {
          dataset: 'tasks',
          from: '2026-09-01',
          to: '2026-09-30',
          groupBy: 'type',
        },
        res,
      );

      // exports take up to 5000 rows unless asked for fewer
      expect(paramsOf(1)[3]).toBe(5001);
      const { columns } = buildCustomReportQuery('tasks', 'type');
      expect(excel.addStyledTable).toHaveBeenCalledWith(
        sheet,
        8,
        columns.map((c) => ({
          header: c.label,
          key: c.key,
          width: expect.any(Number) as number,
          type: c.type === 'date' ? 'text' : c.type,
        })),
        rows,
      );
      expect(excel.addDocumentHash).toHaveBeenCalled();
      expect(excel.streamToResponse).toHaveBeenCalledWith(
        workbook,
        res,
        'BaoCao_tasks_2026-09-01_2026-09-30.xlsx',
      );
    });
  });
});
