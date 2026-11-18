// GET /attendance/timesheet: who each caller reaches, and the grid assembled from the SQL
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';
import { AssignmentsService } from '../assignments/assignments.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { AttendanceService } from './attendance.service';

const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
const assignments = { getAssignedDqtvIds: jest.fn() };

const range = { from: '2026-10-01', to: '2026-10-03' };
const member = {
  militiaId: 'm1',
  userId: 'u1',
  fullName: 'Nguyễn Văn An',
  militiaCode: 'DQ-1',
  unitCode: 'KV-A',
  unitName: 'Khu vực A',
};

function respond({
  total = 1,
  members = [member] as Record<string, unknown>[],
  records = [] as Record<string, unknown>[],
  leaves = [] as Record<string, unknown>[],
} = {}) {
  query
    .mockResolvedValueOnce([{ total }])
    .mockResolvedValueOnce(members)
    .mockResolvedValueOnce(records)
    .mockResolvedValueOnce(leaves);
}

const sqlOf = (call: number) => query.mock.calls[call][0];
const paramsOf = (call: number) => query.mock.calls[call][1] as unknown[];

describe('AttendanceService.getTimesheet', () => {
  // Today is 1 October in Vietnam while the UTC server clock still reads 30 September
  useUtcServerClock(VN_1_OCTOBER_0130);

  let service: AttendanceService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: ExcelExportService, useValue: {} },
        { provide: AssignmentsService, useValue: assignments },
      ],
    }).compile();
    service = moduleRef.get(AttendanceService);
    query.mockReset();
    assignments.getAssignedDqtvIds.mockReset();
  });

  it('lets a wide role narrow to a requested unit and assembles the grid', async () => {
    respond({
      records: [
        {
          militiaId: 'm1',
          workDate: '2026-10-01',
          status: 'checked_in',
          checkIn: '07:45',
          checkOut: null,
          workHours: null,
        },
      ],
      leaves: [{ userId: 'u1', from: '2026-10-02', to: '2026-10-03' }],
    });

    const result = await service.getTimesheet(
      { sub: 'admin-1', role: 'system_admin', unitScope: null },
      { ...range, unitCode: 'KV-B', page: 1, limit: 20 },
    );

    expect(paramsOf(0)).toEqual(['KV-B', null, '2026-10-01', '2026-10-03']);
    expect(paramsOf(1)).toEqual([
      'KV-B',
      null,
      '2026-10-01',
      '2026-10-03',
      20,
      0,
    ]);
    expect(paramsOf(2)).toEqual([['m1'], '2026-10-01', '2026-10-03']);
    expect(paramsOf(3)).toEqual([['u1'], '2026-10-01', '2026-10-03']);
    expect(result).toEqual({
      from: '2026-10-01',
      to: '2026-10-03',
      unitCode: 'KV-B',
      dates: ['2026-10-01', '2026-10-02', '2026-10-03'],
      total: 1,
      page: 1,
      limit: 20,
      data: [
        expect.objectContaining({
          militiaId: 'm1',
          totals: {
            present: 1,
            late: 0,
            earlyLeave: 0,
            absent: 0,
            leave: 2,
            unrecorded: 0,
          },
        }),
      ],
    });
  });

  it('lists every member in scope, not only those with records, and keeps members who left during the range', () => {
    respond();
    return service
      .getTimesheet(
        { sub: 'admin-1', role: 'system_admin', unitScope: null },
        range,
      )
      .then(() => {
        expect(sqlOf(0)).toMatch(/FROM militia_profiles mp/);
        expect(sqlOf(0)).toMatch(
          /mp\.status = 'active' OR EXISTS \(\s*SELECT 1 FROM attendance_records/,
        );
        expect(sqlOf(1)).toMatch(
          /ORDER BY u\.code, mp\.full_name, mp\.militia_code, mp\.id/,
        );
        // check-in times read in Vietnam, not in the server's UTC
        expect(sqlOf(2)).toContain("AT TIME ZONE 'Asia/Ho_Chi_Minh'");
        expect(sqlOf(3)).toContain("lr.status = 'approved'");
      });
  });

  it('locks unit staff to their unit whatever they request', async () => {
    respond();
    await service.getTimesheet(
      { sub: 'staff-1', role: 'office_staff', unitScope: 'KV-A' },
      { ...range, unitCode: 'KV-B' },
    );
    expect(paramsOf(0).slice(0, 2)).toEqual(['KV-A', null]);
  });

  it('refuses an area role without a unit scope', async () => {
    await expect(
      service.getTimesheet(
        { sub: 'area-1', role: 'police_area', unitScope: null },
        range,
      ),
    ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
    expect(query).not.toHaveBeenCalled();
  });

  it('limits a CA officer to the DQTV assigned to them, within their unit', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValueOnce(['u1', 'u3']);
    respond();

    await service.getTimesheet(
      { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV-A' },
      { ...range, unitCode: 'KV-B' },
    );

    expect(assignments.getAssignedDqtvIds).toHaveBeenCalledWith('ca-1');
    expect(paramsOf(0).slice(0, 2)).toEqual(['KV-A', ['u1', 'u3']]);
  });

  it('answers an empty page to a CA officer with no assigned DQTV without reading attendance', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValueOnce([]);

    await expect(
      service.getTimesheet(
        { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV-A' },
        range,
      ),
    ).resolves.toEqual({
      from: '2026-10-01',
      to: '2026-10-03',
      unitCode: 'KV-A',
      dates: ['2026-10-01', '2026-10-02', '2026-10-03'],
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('limits a militia member to themselves, ignoring a requested unit', async () => {
    respond();
    const result = await service.getTimesheet(
      { sub: 'dqtv-1', role: 'dqtv', unitScope: 'KV-A' },
      { ...range, unitCode: 'KV-B' },
    );
    expect(paramsOf(0).slice(0, 2)).toEqual([null, ['dqtv-1']]);
    expect(result.unitCode).toBeNull();
  });

  it('treats a militia member who also holds a staff role as staff', async () => {
    respond();
    await service.getTimesheet(
      {
        sub: 'u-9',
        role: 'office_staff',
        roles: ['office_staff', 'dqtv'],
        unitScope: 'KV-A',
      },
      range,
    );
    expect(paramsOf(0).slice(0, 2)).toEqual(['KV-A', null]);
  });

  it('refuses a role without timesheet access', async () => {
    await expect(
      service.getTimesheet(
        { sub: 'leader-1', role: 'ubnd_leader', unitScope: null },
        range,
      ),
    ).rejects.toThrow(new ForbiddenException('insufficient_role'));
    expect(query).not.toHaveBeenCalled();
  });

  it('clamps paging to 1-100 rows and computes the offset', async () => {
    respond();
    const clamped = await service.getTimesheet(
      { sub: 'admin-1', role: 'system_admin', unitScope: null },
      { ...range, page: 0, limit: 1000 },
    );
    expect(paramsOf(1).slice(4)).toEqual([100, 0]);
    expect(clamped).toMatchObject({ page: 1, limit: 100 });

    query.mockReset();
    respond();
    await service.getTimesheet(
      { sub: 'admin-1', role: 'system_admin', unitScope: null },
      { ...range, page: 3, limit: 10 },
    );
    expect(paramsOf(1).slice(4)).toEqual([10, 20]);
  });

  it('stops after the member page when it is empty', async () => {
    query.mockResolvedValueOnce([{ total: 4 }]).mockResolvedValueOnce([]);
    const result = await service.getTimesheet(
      { sub: 'admin-1', role: 'system_admin', unitScope: null },
      { ...range, page: 9 },
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ data: [], total: 4, page: 9 });
  });

  it('does not look up leave when no member on the page has an account', async () => {
    query
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ ...member, userId: null }])
      .mockResolvedValueOnce([]);
    await service.getTimesheet(
      { sub: 'admin-1', role: 'system_admin', unitScope: null },
      range,
    );
    expect(query).toHaveBeenCalledTimes(3);
  });
});
