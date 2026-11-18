import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import { ExcelExportService } from '../common/services/excel-export.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

const attendance = { getTimesheet: jest.fn() };

describe('AttendanceController.getTimesheet', () => {
  useUtcServerClock(VN_1_OCTOBER_0130);

  let controller: AttendanceController;
  const req = {
    user: {
      sub: 'staff-1',
      username: 'staff',
      role: 'office_staff',
      unitScope: 'KV-A',
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        { provide: AttendanceService, useValue: attendance },
        { provide: ExcelExportService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(AttendanceController);
    attendance.getTimesheet.mockReset().mockResolvedValue({ data: [] });
  });

  it('is open to the staff who read attendance, and to militia members for themselves', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      Object.getOwnPropertyDescriptor(
        AttendanceController.prototype,
        'getTimesheet',
      )?.value as object,
    ) as string[];
    expect([...roles].sort()).toEqual(
      [
        'ca_officer',
        'dqtv',
        'dqtv_member',
        'office_staff',
        'police_area',
        'police_ward',
        'system_admin',
      ].sort(),
    );
  });

  it('defaults to the current month in Vietnam', async () => {
    await controller.getTimesheet(req);
    expect(attendance.getTimesheet).toHaveBeenCalledWith(req.user, {
      from: '2026-10-01',
      to: '2026-10-31',
      unitCode: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('reads a month with the unit and paging asked for', async () => {
    await controller.getTimesheet(
      req,
      { year: 2026, month: 9 },
      undefined,
      undefined,
      'KV-B',
      2,
      50,
    );
    expect(attendance.getTimesheet).toHaveBeenCalledWith(req.user, {
      from: '2026-09-01',
      to: '2026-09-30',
      unitCode: 'KV-B',
      page: 2,
      limit: 50,
    });
  });

  it('passes an explicit range, and reads a blank unit as none', async () => {
    await controller.getTimesheet(
      req,
      undefined,
      '2026-09-15',
      '2026-10-15',
      '',
    );
    expect(attendance.getTimesheet).toHaveBeenCalledWith(req.user, {
      from: '2026-09-15',
      to: '2026-10-15',
      unitCode: undefined,
      page: 1,
      limit: 20,
    });
  });

  it.each<[string, Parameters<AttendanceController['getTimesheet']>, string]>([
    [
      'a month with a range',
      [req, { year: 2026, month: 9 }, '2026-09-01', '2026-09-30'],
      'month_conflicts_with_range',
    ],
    ['half a range', [req, undefined, '2026-09-01'], 'incomplete_date_range'],
    [
      'more than 62 days',
      [req, undefined, '2026-08-01', '2026-10-02'],
      'date_range_too_long',
    ],
  ])('refuses %s', async (_label, args, code) => {
    await expect(controller.getTimesheet(...args)).rejects.toThrow(
      new BadRequestException(code),
    );
    expect(attendance.getTimesheet).not.toHaveBeenCalled();
  });
});
