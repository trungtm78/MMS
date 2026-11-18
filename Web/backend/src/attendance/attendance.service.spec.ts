import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';

const mockDataSource = { query: jest.fn() };
const mockAssignmentsService = { getAssignedDqtvIds: jest.fn() };

const mockExcelExportService = {
  createWorkbook: jest.fn().mockReturnValue({
    addWorksheet: jest.fn().mockReturnValue({
      columnCount: 9,
      getRow: jest.fn().mockReturnValue({
        getCell: jest.fn().mockReturnValue({
          value: '',
          font: {},
          fill: {},
          alignment: {},
          border: {},
          note: '',
        }),
        height: 0,
      }),
      getColumn: jest.fn().mockReturnValue({ key: '', width: 0 }),
      mergeCells: jest.fn(),
      views: [],
      autoFilter: null,
      lastRow: { number: 10 },
    }),
    creator: '',
    lastModifiedBy: '',
    created: new Date(),
    modified: new Date(),
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
        { provide: AssignmentsService, useValue: mockAssignmentsService },
      ],
    }).compile();
    service = module.get<AttendanceService>(AttendanceService);
    jest.clearAllMocks();
    mockExcelExportService.createWorkbook.mockReturnValue({
      addWorksheet: jest.fn().mockReturnValue({
        columnCount: 9,
        getRow: jest.fn().mockReturnValue({
          getCell: jest.fn().mockReturnValue({
            value: '',
            font: {},
            fill: {},
            alignment: {},
            border: {},
            note: '',
          }),
          height: 0,
        }),
        getColumn: jest.fn().mockReturnValue({ key: '', width: 0 }),
        mergeCells: jest.fn(),
        views: [],
        autoFilter: null,
        lastRow: { number: 10 },
      }),
      creator: '',
      lastModifiedBy: '',
      created: new Date(),
      modified: new Date(),
    });
    mockExcelExportService.addGovernmentHeader.mockReturnValue(8);
  });

  // Recording attendance for a member (web): only for members the caller may manage
  describe('record', () => {
    const validDto = {
      militiaId: 'militia-1',
      workDate: '2026-04-18',
      status: 'present' as const,
    };
    const member = (overrides: Record<string, unknown> = {}) => ({
      id: 'militia-1',
      fullName: 'Nguyen Van A',
      militiaCode: 'DQTV001',
      userId: 'user-a',
      ...overrides,
    });
    const sqlAt = (call: number) =>
      String((mockDataSource.query.mock.calls as unknown[][])[call][0]);
    const paramsAt = (call: number) =>
      (mockDataSource.query.mock.calls as unknown[][])[call][1] as unknown[];

    it('creates attendance record successfully', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([member()]) // member in scope
        .mockResolvedValueOnce([{ id: 'rec-1' }]); // insert

      const result = await service.record(systemAdmin, validDto);
      expect(result.id).toBe('rec-1');
      expect(result.status).toBe('checked_in');
      expect(paramsAt(0)).toEqual(['militia-1', null]);
    });

    // Codex round 2: a unit-scoped caller could record for a member of another unit
    it('looks the member up within the caller unit', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([member()])
        .mockResolvedValueOnce([{ id: 'rec-1' }]);

      await service.record(officeStaff, validDto);

      expect(sqlAt(0)).toMatch(
        /FROM militia_profiles mp[\s\S]*JOIN units u ON u\.id = mp\.unit_id[\s\S]*\(\$2::text IS NULL OR u\.code = \$2\)/,
      );
      expect(paramsAt(0)).toEqual(['militia-1', 'UNIT_001']);
    });

    it('answers 404 for a member outside the caller unit, as for a missing one', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.record(officeStaff, validDto)).rejects.toThrow(
        new NotFoundException('militia_not_found'),
      );
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    describe('as a CA officer', () => {
      const caOfficer = {
        role: 'ca_officer',
        unitScope: 'UNIT_001',
        sub: 'ca-1',
      };

      it('records for a DQTV member assigned to them', async () => {
        mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([
          'user-a',
        ]);
        mockDataSource.query
          .mockResolvedValueOnce([member()])
          .mockResolvedValueOnce([{ id: 'rec-1' }]);

        await expect(
          service.record(caOfficer, validDto),
        ).resolves.toMatchObject({
          id: 'rec-1',
        });
        expect(mockAssignmentsService.getAssignedDqtvIds).toHaveBeenCalledWith(
          'ca-1',
        );
      });

      it.each([
        ['assigned to someone else', ['user-z'], member()],
        ['without a linked account', ['user-a'], member({ userId: null })],
        ['while the officer has no assignments', [], member()],
      ])('answers 404 for a member %s', async (_label, assigned, row) => {
        mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce(
          assigned,
        );
        mockDataSource.query.mockResolvedValueOnce([row]);

        await expect(service.record(caOfficer, validDto)).rejects.toThrow(
          new NotFoundException('militia_not_found'),
        );
        expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      });
    });

    // Two requests for the same member and day can both pass a look-before-insert check;
    // the unique index decides, and the loser gets 409 instead of a database error
    it('answers 409 when the day is already recorded, even by a concurrent request', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([member()])
        .mockResolvedValueOnce([]); // ON CONFLICT DO NOTHING inserted nothing

      await expect(service.record(systemAdmin, validDto)).rejects.toThrow(
        new ConflictException('attendance_already_recorded'),
      );
      expect(sqlAt(1)).toMatch(
        /INSERT INTO attendance_records[\s\S]*ON CONFLICT \(militia_id, work_date\) DO NOTHING[\s\S]*RETURNING id/,
      );
    });

    it('maps status correctly: present → checked_in', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([member()])
        .mockResolvedValueOnce([{ id: 'rec-1' }]);
      const result = await service.record(systemAdmin, {
        ...validDto,
        status: 'present',
      });
      expect(result.status).toBe('checked_in');
    });

    it('maps status correctly: late → late', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([member()])
        .mockResolvedValueOnce([{ id: 'rec-1' }]);
      const result = await service.record(systemAdmin, {
        ...validDto,
        status: 'late',
      });
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
    const caOfficer = {
      role: 'ca_officer',
      unitScope: 'UNIT_001',
      sub: 'ca-1',
    };
    const listCalls = () => mockDataSource.query.mock.calls as unknown[][];

    // Codex round 3: a CA officer listed every member of the unit, not only the DQTV
    // assigned to them
    it('limits a CA officer to the DQTV members assigned to them, in the count and the page', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([
        'user-a',
        'user-b',
      ]);
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([]);

      await service.listAttendancePaginated(caOfficer, { date: '2026-04-18' });

      expect(mockAssignmentsService.getAssignedDqtvIds).toHaveBeenCalledWith(
        'ca-1',
      );
      for (const call of [0, 1]) {
        const [sql, params] = listCalls()[call] as [string, unknown[]];
        expect(sql).toMatch(
          /\(\$5::uuid\[\] IS NULL OR mp\.user_id = ANY\(\$5::uuid\[\]\)\)/,
        );
        expect(params[4]).toEqual(['user-a', 'user-b']);
      }
      expect((listCalls()[1][1] as unknown[]).slice(5)).toEqual([20, 0]);
    });

    it('shows a CA officer without assignments nothing, without querying', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([]);

      await expect(
        service.listAttendancePaginated(caOfficer, { date: '2026-04-18' }),
      ).resolves.toEqual({ data: [], total: 0, page: 1, limit: 20 });
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('does not limit other roles by assignment', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.listAttendancePaginated(officeStaff, {
        date: '2026-04-18',
      });

      expect((listCalls()[0][1] as unknown[])[4]).toBeNull();
      expect(mockAssignmentsService.getAssignedDqtvIds).not.toHaveBeenCalled();
    });

    it('scopes to unit for office_staff', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([]);
      await service.listAttendancePaginated(officeStaff, {
        date: '2026-04-18',
      });
      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params).toContain('UNIT_001');
    });

    it('returns paginated structure', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '42' }])
        .mockResolvedValueOnce([]);
      const result = await service.listAttendancePaginated(systemAdmin, {
        page: 1,
        limit: 20,
      });
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
        .mockResolvedValueOnce([
          { id: 'militia-1', fullName: 'Nguyen Van A', militiaCode: 'DQTV001' },
        ]) // find militia
        .mockResolvedValueOnce([]) // no existing record
        .mockResolvedValueOnce([
          { id: 'rec-1', checkin_at: new Date('2026-04-27T08:00:00Z') },
        ]); // insert

      const result = await service.checkIn('user-1', { source: 'mobile' });
      expect(result.status).toBe('checked_in');
      expect(result.id).toBe('rec-1');
      expect(result.militiaId).toBe('militia-1');
    });

    it('throws ConflictException when already checked in today', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          { id: 'militia-1', fullName: 'X', militiaCode: 'D001' },
        ])
        .mockResolvedValueOnce([{ id: 'existing-rec' }]); // duplicate

      await expect(service.checkIn('user-1', {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when no militia profile found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.checkIn('unknown-user', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkOut', () => {
    it('updates checkout_at and returns checked_out status', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1' }]) // find militia
        .mockResolvedValueOnce([
          { id: 'rec-1', checkout_at: new Date('2026-04-27T17:00:00Z') },
        ]); // update

      const result = await service.checkOut('user-1', {});
      expect(result.status).toBe('checked_out');
      expect(result.id).toBe('rec-1');
    });

    it('throws NotFoundException when no open check-in record', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1' }])
        .mockResolvedValueOnce([]); // no open record

      await expect(service.checkOut('user-1', {})).rejects.toThrow(
        NotFoundException,
      );
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
        .mockResolvedValueOnce([
          {
            status: 'checked_in',
            checkin_at: fakeCheckin,
            checkout_at: null,
            work_date: '2026-04-27',
          },
        ]);

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
        .mockResolvedValueOnce([
          {
            totalDays: '20',
            presentDays: '18',
            lateDays: '1',
            absentDays: '1',
          },
        ]);

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
      await expect(service.getStats('unknown-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getAttendanceSummary ──────────────────────────────────────────────────

  // Mobile clients act on Vietnamese calendar days; production servers run on UTC
  describe('business date', () => {
    useUtcServerClock(VN_1_OCTOBER_0130);
    const paramsOf = (call: number) =>
      (mockDataSource.query.mock.calls as unknown[][])[call][1] as unknown[];

    it('checks in against the Vietnamese date', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          { id: 'militia-1', fullName: 'A', militiaCode: 'D1' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'rec-1', checkin_at: VN_1_OCTOBER_0130 },
        ]);

      const result = await service.checkIn('user-1', {});

      expect(paramsOf(1)).toEqual(['militia-1', '2026-10-01']);
      expect(paramsOf(2)[1]).toBe('2026-10-01');
      expect(result.workDate).toBe('2026-10-01');
    });

    it("checks out the Vietnamese day's record", async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1' }])
        .mockResolvedValueOnce([
          { id: 'rec-1', checkout_at: VN_1_OCTOBER_0130 },
        ]);

      await service.checkOut('user-1', {});

      expect(paramsOf(1)).toEqual(['militia-1', '2026-10-01']);
    });

    it("reports today's status for the Vietnamese date", async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1' }])
        .mockResolvedValueOnce([]);

      await service.getTodayStatus('user-1');

      expect(paramsOf(1)).toEqual(['militia-1', '2026-10-01']);
    });

    it('defaults the attendance list to the Vietnamese date', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.listAttendancePaginated(systemAdmin, {});

      expect(paramsOf(0)[0]).toBe('2026-10-01');
    });

    it('counts monthly stats for the Vietnamese month', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-1' }])
        .mockResolvedValueOnce([
          { totalDays: '0', presentDays: '0', lateDays: '0', absentDays: '0' },
        ]);

      const result = await service.getStats('user-1');

      expect(paramsOf(1)).toEqual(['militia-1', 10, 2026]);
      expect(result.currentMonth).toBe(10);
    });
  });

  describe('unit scope', () => {
    it('lets wide roles see every unit', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.listAttendancePaginated(
        { role: 'police_ward', unitScope: 'KV1' },
        { date: '2026-04-18' },
      );

      // date, from, to, unit, assigned DQTV (none for roles other than CA officers)
      expect((mockDataSource.query.mock.calls as unknown[][])[0][1]).toEqual([
        '2026-04-18',
        null,
        null,
        null,
        null,
      ]);
    });

    it('refuses an area role without a unit scope', async () => {
      const areaWithoutScope = { role: 'police_area', unitScope: null };

      await expect(
        service.listAttendancePaginated(areaWithoutScope, {
          date: '2026-04-18',
        }),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      await expect(
        service.getAttendanceSummary(
          areaWithoutScope,
          '2026-04-01',
          '2026-04-30',
        ),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

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
      const result = await service.getAttendanceSummary(
        systemAdmin,
        '2026-04-01',
        '2026-04-30',
      );
      expect(result).toHaveLength(1);
      expect(result[0].totalDays).toBe(22);
      expect(result[0].onTimeDays).toBe(18);
      expect(result[0].attendancePct).toBeCloseTo(81.8, 1);
    });

    it('handles zero totalDays without division error', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          ...mockSummaryRow,
          totalDays: '0',
          onTimeDays: '0',
          lateDays: '0',
          absentDays: '0',
        },
      ]);
      const result = await service.getAttendanceSummary(
        systemAdmin,
        '2026-04-01',
        '2026-04-30',
      );
      expect(result[0].attendancePct).toBe(0);
    });

    it('non-admin locked to unitScope', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await service.getAttendanceSummary(
        officeStaff,
        '2026-04-01',
        '2026-04-30',
      );
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params[2]).toBe('UNIT_001');
    });

    it('system_admin can filter by unitCode param', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await service.getAttendanceSummary(
        systemAdmin,
        '2026-04-01',
        '2026-04-30',
        'UNIT_002',
      );
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params[2]).toBe('UNIT_002');
    });

    // Codex round 2: the test only looked for ORDER BY and ASC, so ordering by name or date
    // would have passed. Members with the same percentage are ordered by name, then id,
    // so pages and exports list them the same way every time.
    it('lists the lowest on-time share first, ties by name then id', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockSummaryRow]);
      const result = await service.getAttendanceSummary(
        systemAdmin,
        '2026-04-01',
        '2026-04-30',
      );
      expect(result).toHaveLength(1);
      const sql = String(
        (mockDataSource.query.mock.calls as unknown[][])[0][0],
      );
      expect(sql).toMatch(
        /ORDER BY\s+\(COUNT\(\*\) FILTER \(WHERE ar\.status IN \('checked_in', 'present'\)\) \* 100\.0 \/\s+NULLIF\(COUNT\(\*\), 0\)\) ASC,\s*mp\.full_name ASC,\s*mp\.id ASC\s*$/,
      );
      // The same share the response reports as attendancePct
      expect(sql).toMatch(
        /COUNT\(\*\) FILTER \(WHERE ar\.status IN \('checked_in', 'present'\)\)\s+AS "onTimeDays"/,
      );
    });
  });
});
