import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ExcelExportService } from '../common/services/excel-export.service';

const mockDataSource = { query: jest.fn() };

const mockExcelExportService = {
  createWorkbook: jest.fn().mockReturnValue({
    addWorksheet: jest.fn().mockReturnValue({
      columnCount: 9,
      getRow: jest.fn().mockReturnValue({
        getCell: jest.fn().mockReturnValue({ value: '', font: {}, fill: {}, alignment: {}, border: {}, note: '' }),
        height: 0,
      }),
      getColumn: jest.fn().mockReturnValue({ key: '', width: 0 }),
      mergeCells: jest.fn(),
      views: [],
      autoFilter: null,
      lastRow: { number: 10 },
    }),
    creator: '', lastModifiedBy: '', created: new Date(), modified: new Date(),
  }),
  addGovernmentHeader: jest.fn().mockReturnValue(8),
  addStyledTable: jest.fn(),
  addSummaryStatsTable: jest.fn(),
  addDocumentHash: jest.fn(),
  streamToResponse: jest.fn(),
};

const systemAdmin = { role: 'system_admin', unitScope: null };
const officeStaff = { role: 'office_staff', unitScope: 'UNIT_001' };

describe('AttendanceService', () => {
  let service: AttendanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: ExcelExportService, useValue: mockExcelExportService },
      ],
    }).compile();
    service = module.get<AttendanceService>(AttendanceService);
    jest.clearAllMocks();
    mockExcelExportService.createWorkbook.mockReturnValue({
      addWorksheet: jest.fn().mockReturnValue({
        columnCount: 9,
        getRow: jest.fn().mockReturnValue({
          getCell: jest.fn().mockReturnValue({ value: '', font: {}, fill: {}, alignment: {}, border: {}, note: '' }),
          height: 0,
        }),
        getColumn: jest.fn().mockReturnValue({ key: '', width: 0 }),
        mergeCells: jest.fn(),
        views: [],
        autoFilter: null,
        lastRow: { number: 10 },
      }),
      creator: '', lastModifiedBy: '', created: new Date(), modified: new Date(),
    });
    mockExcelExportService.addGovernmentHeader.mockReturnValue(8);
  });

  describe('record (checkIn)', () => {
    const validDto = {
      militiaId: 'militia-1',
      workDate: '2026-04-18',
      status: 'present' as const,
    };

    it('creates attendance record successfully', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1', fullName: 'Nguyen Van A', militiaCode: 'DQTV001' }]) // militia exists
        .mockResolvedValueOnce([]) // no duplicate
        .mockResolvedValueOnce([{ id: 'rec-1' }]); // insert

      const result = await service.record(validDto);
      expect(result.id).toBe('rec-1');
      expect(result.status).toBe('checked_in');
    });

    it('throws NotFoundException when militia not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.record(validDto)).rejects.toThrow(NotFoundException);
    });

    it('prevents duplicate attendance for same date (idempotency)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1', fullName: 'X', militiaCode: 'DQTV001' }])
        .mockResolvedValueOnce([{ id: 'existing-rec' }]); // duplicate found
      await expect(service.record(validDto)).rejects.toThrow(ConflictException);
    });

    it('maps status correctly: present → checked_in', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1', fullName: 'X', militiaCode: 'DQTV001' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'rec-1' }]);
      const result = await service.record({ ...validDto, status: 'present' });
      expect(result.status).toBe('checked_in');
    });

    it('maps status correctly: late → late', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1', fullName: 'X', militiaCode: 'DQTV001' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'rec-1' }]);
      const result = await service.record({ ...validDto, status: 'late' });
      expect(result.status).toBe('late');
    });
  });

  describe('list', () => {
    it('filters by militiaId and workDate', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await service.list({ militiaId: 'militia-1', workDate: '2026-04-18' });
      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params).toContain('militia-1');
      expect(params).toContain('2026-04-18');
    });
  });

  describe('listAttendancePaginated', () => {
    it('scopes to unit for office_staff', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([]);
      await service.listAttendancePaginated(officeStaff, { date: '2026-04-18' });
      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params).toContain('UNIT_001');
    });

    it('returns paginated structure', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '42' }])
        .mockResolvedValueOnce([]);
      const result = await service.listAttendancePaginated(systemAdmin, { page: 1, limit: 20 });
      expect(result.total).toBe(42);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('passes from+to range params when provided', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '28' }])
        .mockResolvedValueOnce([]);
      const result = await service.listAttendancePaginated(systemAdmin, {
        from: '2026-04-01',
        to: '2026-04-30',
        limit: 31,
      });
      expect(result.total).toBe(28);
      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params).toContain('2026-04-01');
      expect(params).toContain('2026-04-30');
      // singleDate should be null when range is provided
      expect(params[0]).toBeNull();
    });

    it('falls back to today when no date/range provided', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);
      await service.listAttendancePaginated(systemAdmin, {});
      const [, params] = mockDataSource.query.mock.calls[0];
      // effectiveSingleDate should be today's date (non-null)
      expect(params[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(params[1]).toBeNull(); // fromDate null
      expect(params[2]).toBeNull(); // toDate null
    });

    it('single date takes precedence over range', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([]);
      await service.listAttendancePaginated(systemAdmin, {
        date: '2026-04-15',
        from: '2026-04-01',
        to: '2026-04-30',
      });
      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params[0]).toBe('2026-04-15');
    });
  });

  // ── Mobile check-in / check-out / today / stats ──────────────────────

  describe('checkIn', () => {
    it('returns checked_in for valid user', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1', fullName: 'Nguyen Van A', militiaCode: 'DQTV001' }]) // find militia
        .mockResolvedValueOnce([]) // no existing record
        .mockResolvedValueOnce([{ id: 'rec-1', checkin_at: new Date('2026-04-27T08:00:00Z') }]); // insert

      const result = await service.checkIn('user-1', { source: 'mobile' });
      expect(result.status).toBe('checked_in');
      expect(result.id).toBe('rec-1');
      expect(result.militiaId).toBe('militia-1');
    });

    it('throws ConflictException when already checked in today', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1', fullName: 'X', militiaCode: 'D001' }])
        .mockResolvedValueOnce([{ id: 'existing-rec' }]); // duplicate

      await expect(service.checkIn('user-1', {})).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when no militia profile found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.checkIn('unknown-user', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkOut', () => {
    it('updates checkout_at and returns checked_out status', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1' }]) // find militia
        .mockResolvedValueOnce([{ id: 'rec-1', checkout_at: new Date('2026-04-27T17:00:00Z') }]); // update

      const result = await service.checkOut('user-1', {});
      expect(result.status).toBe('checked_out');
      expect(result.id).toBe('rec-1');
    });

    it('throws NotFoundException when no open check-in record', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1' }])
        .mockResolvedValueOnce([]); // no open record

      await expect(service.checkOut('user-1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTodayStatus', () => {
    it('returns null when no militia profile exists', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const result = await service.getTodayStatus('user-1');
      expect(result).toBeNull();
    });

    it('returns null when no attendance record for today', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1' }])
        .mockResolvedValueOnce([]); // no record
      const result = await service.getTodayStatus('user-1');
      expect(result).toBeNull();
    });

    it('returns status/checkinAt/checkoutAt/workDate when record exists', async () => {
      const fakeCheckin = new Date('2026-04-27T08:00:00Z');
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1' }])
        .mockResolvedValueOnce([{
          status: 'checked_in',
          checkin_at: fakeCheckin,
          checkout_at: null,
          work_date: '2026-04-27',
        }]);

      const result = await service.getTodayStatus('user-1');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('checked_in');
      expect(result!.checkinAt).toBe(fakeCheckin);
      expect(result!.checkoutAt).toBeNull();
    });
  });

  describe('getStats', () => {
    it('returns correct counts from DB', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1' }])
        .mockResolvedValueOnce([{
          totalDays: '20',
          presentDays: '18',
          lateDays: '1',
          absentDays: '1',
        }]);

      const result = await service.getStats('user-1');
      expect(result.totalDays).toBe(20);
      expect(result.presentDays).toBe(18);
      expect(result.lateDays).toBe(1);
      expect(result.absentDays).toBe(1);
      expect(result.currentMonth).toBeGreaterThanOrEqual(1);
      expect(result.currentYear).toBeGreaterThanOrEqual(2026);
    });

    it('throws NotFoundException when no militia profile', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.getStats('unknown-user')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getAttendanceSummary ──────────────────────────────────────────────────

  describe('getAttendanceSummary', () => {
    const mockSummaryRow = {
      militiaId: 'militia-1',
      militiaName: 'Nguyễn Văn A',
      militiaCode: 'DQ001',
      unitCode: 'UNIT_001',
      totalDays: '22',
      onTimeDays: '18',
      lateDays: '2',
      absentDays: '2',
    };

    it('returns summary with computed attendancePct', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockSummaryRow]);
      const result = await service.getAttendanceSummary(systemAdmin, '2026-04-01', '2026-04-30');
      expect(result).toHaveLength(1);
      expect(result[0].totalDays).toBe(22);
      expect(result[0].onTimeDays).toBe(18);
      expect(result[0].attendancePct).toBeCloseTo(81.8, 1);
    });

    it('handles zero totalDays without division error', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { ...mockSummaryRow, totalDays: '0', onTimeDays: '0', lateDays: '0', absentDays: '0' },
      ]);
      const result = await service.getAttendanceSummary(systemAdmin, '2026-04-01', '2026-04-30');
      expect(result[0].attendancePct).toBe(0);
    });

    it('non-admin locked to unitScope', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await service.getAttendanceSummary(officeStaff, '2026-04-01', '2026-04-30');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params[2]).toBe('UNIT_001');
    });

    it('system_admin can filter by unitCode param', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await service.getAttendanceSummary(systemAdmin, '2026-04-01', '2026-04-30', 'UNIT_002');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params[2]).toBe('UNIT_002');
    });

    it('sorted ascending by attendance % (lowest first)', async () => {
      // SQL ORDER BY handles this — just verify query is called
      mockDataSource.query.mockResolvedValueOnce([mockSummaryRow]);
      const result = await service.getAttendanceSummary(systemAdmin, '2026-04-01', '2026-04-30');
      expect(result).toHaveLength(1);
      const sql = mockDataSource.query.mock.calls[0][0] as string;
      expect(sql.toUpperCase()).toContain('ORDER BY');
      expect(sql.toUpperCase()).toContain('ASC');
    });
  });
});
