import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockAttendanceService = {
  listAttendancePaginated: jest.fn(),
  record: jest.fn(),
  checkIn: jest.fn(),
  checkOut: jest.fn(),
  getTodayStatus: jest.fn(),
  getStats: jest.fn(),
  getAttendanceSummary: jest.fn(),
  exportAttendanceSummary: jest.fn(),
};

const mockExcelExportService = { streamToResponse: jest.fn() };

const adminUser = { sub: 'admin-1', username: 'admin', role: 'system_admin', unitScope: null };
const dqtvUser = { sub: 'dqtv-1', username: 'dqtv1', role: 'dqtv_member', unitScope: 'UNIT_001' };

describe('AttendanceController', () => {
  let controller: AttendanceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        { provide: AttendanceService, useValue: mockAttendanceService },
        { provide: ExcelExportService, useValue: mockExcelExportService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AttendanceController>(AttendanceController);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated attendance list', async () => {
      const paginated = { data: [{ id: 'att-1' }], total: 1, page: 1, limit: 20 };
      mockAttendanceService.listAttendancePaginated.mockResolvedValueOnce(paginated);

      const result = await controller.list({ user: adminUser }, undefined, undefined, undefined, 1, 20);

      expect(result).toEqual(paginated);
      expect(mockAttendanceService.listAttendancePaginated).toHaveBeenCalledWith(
        adminUser,
        { date: undefined, from: undefined, to: undefined, page: 1, limit: 20 },
      );
    });

    it('passes date filter to service', async () => {
      mockAttendanceService.listAttendancePaginated.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });

      await controller.list({ user: adminUser }, '2025-01-15', undefined, undefined, 1, 20);

      expect(mockAttendanceService.listAttendancePaginated).toHaveBeenCalledWith(
        adminUser,
        { date: '2025-01-15', from: undefined, to: undefined, page: 1, limit: 20 },
      );
    });

    it('passes from/to date range filter to service', async () => {
      mockAttendanceService.listAttendancePaginated.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });

      await controller.list({ user: adminUser }, undefined, '2025-01-01', '2025-01-31', 1, 20);

      expect(mockAttendanceService.listAttendancePaginated).toHaveBeenCalledWith(
        adminUser,
        { date: undefined, from: '2025-01-01', to: '2025-01-31', page: 1, limit: 20 },
      );
    });

    it('returns empty array when no records match', async () => {
      mockAttendanceService.listAttendancePaginated.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });

      const result = await controller.list({ user: adminUser }, '2099-01-01', undefined, undefined, 1, 20);

      expect(result.data).toHaveLength(0);
    });
  });

  describe('record', () => {
    const dto = {
      militiaId: 'mp-1',
      workDate: '2025-01-15',
      status: 'present' as const,
    };

    it('records attendance and returns created record', async () => {
      const created = { id: 'att-new', ...dto };
      mockAttendanceService.record.mockResolvedValueOnce(created);

      const result = await controller.record(dto);

      expect(result).toEqual(created);
      expect(mockAttendanceService.record).toHaveBeenCalledWith(dto);
    });

    it('propagates error from service', async () => {
      mockAttendanceService.record.mockRejectedValueOnce(new Error('duplicate_entry'));

      await expect(controller.record(dto)).rejects.toThrow('duplicate_entry');
    });
  });

  describe('checkIn', () => {
    it('records check-in and returns result', async () => {
      const result = { id: 'att-1', checkinAt: '08:00:00' };
      mockAttendanceService.checkIn.mockResolvedValueOnce(result);

      const response = await controller.checkIn(
        { user: dqtvUser },
        { location: { lat: 10.5, lng: 106.5 } },
      );

      expect(response).toEqual(result);
      expect(mockAttendanceService.checkIn).toHaveBeenCalledWith(
        'dqtv-1',
        { location: { lat: 10.5, lng: 106.5 } },
      );
    });

    it('check-in without location still works', async () => {
      mockAttendanceService.checkIn.mockResolvedValueOnce({ id: 'att-1' });

      const response = await controller.checkIn({ user: dqtvUser }, {});

      expect(response).toBeDefined();
      expect(mockAttendanceService.checkIn).toHaveBeenCalledWith('dqtv-1', {});
    });

    it('propagates error on duplicate check-in', async () => {
      mockAttendanceService.checkIn.mockRejectedValueOnce(new Error('already_checked_in'));

      await expect(controller.checkIn({ user: dqtvUser }, {})).rejects.toThrow('already_checked_in');
    });
  });

  describe('checkOut', () => {
    it('records check-out and returns result', async () => {
      const result = { id: 'att-1', checkoutAt: '17:00:00' };
      mockAttendanceService.checkOut.mockResolvedValueOnce(result);

      const response = await controller.checkOut({ user: dqtvUser }, {});

      expect(response).toEqual(result);
      expect(mockAttendanceService.checkOut).toHaveBeenCalledWith('dqtv-1', {});
    });

    it('propagates error when no active check-in', async () => {
      mockAttendanceService.checkOut.mockRejectedValueOnce(new Error('no_active_checkin'));

      await expect(controller.checkOut({ user: dqtvUser }, {})).rejects.toThrow('no_active_checkin');
    });
  });

  describe('getToday', () => {
    it('returns today status for calling user', async () => {
      const status = { status: 'present', checkinAt: '08:00', checkoutAt: null };
      mockAttendanceService.getTodayStatus.mockResolvedValueOnce(status);

      const result = await controller.getToday({ user: dqtvUser });

      expect(result).toEqual(status);
      expect(mockAttendanceService.getTodayStatus).toHaveBeenCalledWith('dqtv-1');
    });

    it('returns null when not yet checked in', async () => {
      mockAttendanceService.getTodayStatus.mockResolvedValueOnce(null);

      const result = await controller.getToday({ user: dqtvUser });

      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    it('returns monthly stats for calling user', async () => {
      const stats = { present: 20, absent: 2, late: 1, total: 23 };
      mockAttendanceService.getStats.mockResolvedValueOnce(stats);

      const result = await controller.getStats({ user: dqtvUser });

      expect(result).toEqual(stats);
      expect(mockAttendanceService.getStats).toHaveBeenCalledWith('dqtv-1');
    });
  });
});
