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
});
