import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';

const mockDataSource = { query: jest.fn() };

const systemAdmin = { role: 'system_admin', unitScope: null };
const officeStaff = { role: 'office_staff', unitScope: 'UNIT_001' };

describe('AttendanceService', () => {
  let service: AttendanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<AttendanceService>(AttendanceService);
    jest.clearAllMocks();
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
});
