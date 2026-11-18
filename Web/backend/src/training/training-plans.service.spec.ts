import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TrainingPlansService } from './training-plans.service';

const mockManager = { query: jest.fn() };
const mockDataSource = { query: jest.fn(), transaction: jest.fn() };

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];
const sqlOf = (mock: jest.Mock, call: number) => String(callsOf(mock)[call][0]);
const paramsOf = (mock: jest.Mock, call: number) =>
  callsOf(mock)[call][1] as unknown[];

const admin = { sub: 'admin-1', role: 'system_admin', unitScope: null };
const areaKv1 = { sub: 'area-1', role: 'police_area', unitScope: 'KV1' };
const areaWithoutScope = {
  sub: 'area-2',
  role: 'police_area',
  unitScope: null,
};
const dqtv = { sub: 'dqtv-user', role: 'dqtv', unitScope: null };

const TODAY_SQL = "(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date";
// Plans of the actor's unit and ward-wide plans
const VISIBLE_SQL = '($1::text IS NULL OR pu.code = $1 OR p.unit_id IS NULL)';

// 01:30 on 14 September 2026 in Vietnam, still 13 September in UTC
const VN_14_SEPTEMBER_0130 = new Date('2026-09-13T18:30:00Z');

const plan = { id: 'tp-1', year: 2026, type: 'military', status: 'draft' };
const sessionRow = (change: Record<string, unknown> = {}) => ({
  id: 'ts-1',
  planId: 'tp-1',
  name: 'Đợt 1',
  type: 'military',
  startDate: '2026-10-01',
  endDate: '2026-10-05',
  location: 'Thao trường',
  daysCount: 5,
  status: 'upcoming',
  recordedCount: 0,
  attendedCount: 0,
  ...change,
});

describe('TrainingPlansService', () => {
  let service: TrainingPlansService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TrainingPlansService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get(TrainingPlansService);
    jest.resetAllMocks();
    mockDataSource.transaction.mockImplementation(
      (work: (mgr: typeof mockManager) => unknown) => work(mockManager),
    );
    jest.useFakeTimers({
      now: VN_14_SEPTEMBER_0130,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'queueMicrotask',
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('access', () => {
    it('refuses an area officer without a unit scope', async () => {
      await expect(service.listPlans(areaWithoutScope, {})).rejects.toThrow(
        new ForbiddenException('no_unit_scope'),
      );
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('refuses roles that do not manage training', async () => {
      await expect(service.listSessions(dqtv, {})).rejects.toThrow(
        new ForbiddenException('insufficient_role'),
      );
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('listPlans', () => {
    it('shows a scoped officer the plans of their unit and the ward-wide plans', async () => {
      mockDataSource.query.mockResolvedValueOnce([plan]);

      await expect(
        service.listPlans(areaKv1, {
          year: 2026,
          status: 'active',
          unitCode: 'KV2',
        }),
      ).resolves.toEqual([plan]);

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toContain(VISIBLE_SQL);
      expect(sql).toMatch(/ORDER BY p\.year DESC/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual([
        'KV1',
        2026,
        'active',
      ]);
    });

    it('counts completed days from sessions that ended before today in Vietnam', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.listPlans(admin, {});

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toContain(`ts.end_date < ${TODAY_SQL}`);
      expect(sql).toMatch(/::float8 AS "completedDays"/);
      expect(sql).toMatch(/::float8 AS "requiredDays"/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual([null, null, null]);
    });

    it('lets wide roles narrow to a unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.listPlans(admin, { unitCode: 'KV2' });

      expect(paramsOf(mockDataSource.query, 0)[0]).toBe('KV2');
    });
  });

  describe('getPlan', () => {
    it('answers 404 for a plan outside the scope, as for a missing one', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getPlan(areaKv1, 'tp-9')).rejects.toThrow(
        new NotFoundException('training_plan_not_found'),
      );
      expect(sqlOf(mockDataSource.query, 0)).toContain(VISIBLE_SQL);
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['KV1', 'tp-9']);
    });
  });

  describe('createPlan', () => {
    const input = { year: 2026, type: 'military' as const, requiredDays: 15 };

    it('creates a ward-wide draft plan for a wide role that names no unit', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'tp-1' }])
        .mockResolvedValueOnce([plan]);

      await expect(service.createPlan(admin, input)).resolves.toEqual(plan);

      const insert = sqlOf(mockDataSource.query, 0);
      expect(insert).toMatch(/INSERT INTO training_plans/);
      expect(insert).toMatch(
        /ON CONFLICT ON CONSTRAINT uq_training_plans_unit_year_type DO NOTHING/,
      );
      expect(paramsOf(mockDataSource.query, 0)).toEqual([
        null,
        2026,
        'military',
        null,
        15,
        'admin-1',
      ]);
      expect(paramsOf(mockDataSource.query, 1)).toEqual([null, 'tp-1']);
    });

    it("creates the plan for a scoped officer's own unit", async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'unit-kv1' }])
        .mockResolvedValueOnce([{ id: 'tp-1' }])
        .mockResolvedValueOnce([plan]);

      await service.createPlan(areaKv1, { ...input, title: ' Chiến đấu ' });

      expect(sqlOf(mockDataSource.query, 0)).toMatch(
        /SELECT id FROM units WHERE code = \$1/,
      );
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['KV1']);
      expect(paramsOf(mockDataSource.query, 1)).toEqual([
        'unit-kv1',
        2026,
        'military',
        'Chiến đấu',
        15,
        'area-1',
      ]);
    });

    it('lets a wide role create the plan of a named unit', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'unit-kv2' }])
        .mockResolvedValueOnce([{ id: 'tp-1' }])
        .mockResolvedValueOnce([plan]);

      await service.createPlan(admin, { ...input, unitCode: 'KV2' });

      expect(paramsOf(mockDataSource.query, 0)).toEqual(['KV2']);
    });

    it('refuses a scoped officer naming another unit', async () => {
      await expect(
        service.createPlan(areaKv1, { ...input, unitCode: 'KV2' }),
      ).rejects.toThrow(new ForbiddenException('unit_scope_violation'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('refuses an unknown unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.createPlan(admin, { ...input, unitCode: 'NOPE' }),
      ).rejects.toThrow(new BadRequestException('unit_not_found'));
    });

    it('answers 409 when the plan already exists, also when a concurrent request created it', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.createPlan(admin, input)).rejects.toThrow(
        new ConflictException('training_plan_exists'),
      );
    });
  });

  describe('updatePlanStatus', () => {
    it('activates a draft plan in one guarded UPDATE', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([[{ id: 'tp-1' }], 1])
        .mockResolvedValueOnce([{ ...plan, status: 'active' }]);

      await expect(
        service.updatePlanStatus(areaKv1, 'tp-1', 'active'),
      ).resolves.toMatchObject({ status: 'active' });

      const update = sqlOf(mockDataSource.query, 0);
      expect(update).toMatch(/UPDATE training_plans p/);
      expect(update).toMatch(/WHERE p\.id = \$1 AND p\.status = \$3/);
      expect(update).toMatch(/wu\.code = \$4/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual([
        'tp-1',
        'active',
        'draft',
        'KV1',
      ]);
    });

    it('completes an active plan', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([[{ id: 'tp-1' }], 1])
        .mockResolvedValueOnce([{ ...plan, status: 'completed' }]);

      await service.updatePlanStatus(admin, 'tp-1', 'completed');

      expect(paramsOf(mockDataSource.query, 0)).toEqual([
        'tp-1',
        'completed',
        'active',
        null,
      ]);
    });

    it('answers 404 for a plan outside the scope, as for a missing one', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([[], 0])
        .mockResolvedValueOnce([]);

      await expect(
        service.updatePlanStatus(areaKv1, 'tp-1', 'active'),
      ).rejects.toThrow(new NotFoundException('training_plan_not_found'));
    });

    it('answers 403 for a ward-wide plan a scoped officer can see but not manage', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([[], 0])
        .mockResolvedValueOnce([{ status: 'draft', unitCode: null }]);

      await expect(
        service.updatePlanStatus(areaKv1, 'tp-1', 'active'),
      ).rejects.toThrow(new ForbiddenException('training_plan_not_managed'));
    });

    it('answers 409 when the plan is not in the status the transition needs', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([[], 0])
        .mockResolvedValueOnce([{ status: 'completed', unitCode: 'KV1' }]);

      await expect(
        service.updatePlanStatus(areaKv1, 'tp-1', 'completed'),
      ).rejects.toThrow(new ConflictException('invalid_status_transition'));
    });
  });

  describe('createSession', () => {
    const input = {
      planId: 'tp-1',
      name: 'Đợt 1',
      startDate: '2026-10-01',
      endDate: '2026-10-05',
      location: 'Thao trường',
      daysCount: 5,
    };
    const lockedPlan = (change: Record<string, unknown> = {}) => [
      { id: 'tp-1', year: 2026, status: 'active', unitCode: 'KV1', ...change },
    ];

    it('schedules a session in a plan the officer manages', async () => {
      mockManager.query
        .mockResolvedValueOnce(lockedPlan())
        .mockResolvedValueOnce([{ id: 'ts-1' }])
        .mockResolvedValueOnce([sessionRow()]);

      const created = await service.createSession(areaKv1, input);

      expect(created).toMatchObject({ id: 'ts-1', status: 'upcoming' });
      expect(created).not.toHaveProperty('attendancePercent');
      expect(sqlOf(mockManager.query, 0)).toMatch(/FOR SHARE OF p/);
      expect(sqlOf(mockManager.query, 0)).toContain(
        '($2::text IS NULL OR pu.code = $2 OR p.unit_id IS NULL)',
      );
      expect(paramsOf(mockManager.query, 0)).toEqual(['tp-1', 'KV1']);
      expect(sqlOf(mockManager.query, 1)).toMatch(
        /INSERT INTO training_sessions/,
      );
      expect(paramsOf(mockManager.query, 1)).toEqual([
        'tp-1',
        'Đợt 1',
        '2026-10-01',
        '2026-10-05',
        'Thao trường',
        5,
        'area-1',
      ]);
      expect(paramsOf(mockManager.query, 2)).toEqual(['KV1', 'ts-1']);
    });

    it('schedules sessions while the plan is still a draft', async () => {
      mockManager.query
        .mockResolvedValueOnce(lockedPlan({ status: 'draft' }))
        .mockResolvedValueOnce([{ id: 'ts-1' }])
        .mockResolvedValueOnce([sessionRow()]);

      await expect(
        service.createSession(areaKv1, input),
      ).resolves.toBeDefined();
    });

    it('refuses a session that ends before it starts or counts more days than it spans', async () => {
      await expect(
        service.createSession(admin, { ...input, endDate: '2026-09-30' }),
      ).rejects.toThrow(new BadRequestException('session_end_before_start'));
      await expect(
        service.createSession(admin, { ...input, daysCount: 6 }),
      ).rejects.toThrow(new BadRequestException('session_days_exceed_span'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('answers 404 for a plan outside the scope', async () => {
      mockManager.query.mockResolvedValueOnce([]);

      await expect(service.createSession(areaKv1, input)).rejects.toThrow(
        new NotFoundException('training_plan_not_found'),
      );
    });

    it('answers 403 for a ward-wide plan a scoped officer can see but not manage', async () => {
      mockManager.query.mockResolvedValueOnce(lockedPlan({ unitCode: null }));

      await expect(service.createSession(areaKv1, input)).rejects.toThrow(
        new ForbiddenException('training_plan_not_managed'),
      );
    });

    it('answers 409 for a completed plan', async () => {
      mockManager.query.mockResolvedValueOnce(
        lockedPlan({ status: 'completed' }),
      );

      await expect(service.createSession(admin, input)).rejects.toThrow(
        new ConflictException('training_plan_completed'),
      );
    });

    it('refuses a session outside the plan year', async () => {
      mockManager.query.mockResolvedValueOnce(lockedPlan({ year: 2025 }));

      await expect(service.createSession(admin, input)).rejects.toThrow(
        new BadRequestException('session_outside_plan_year'),
      );
    });
  });

  describe('listSessions', () => {
    it('derives the status from the Vietnamese calendar day and the attendance rate from scoped rows', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        sessionRow({ recordedCount: 4, attendedCount: 3, status: 'completed' }),
        sessionRow({ id: 'ts-2' }),
      ]);

      const sessions = await service.listSessions(areaKv1, {
        planId: 'tp-1',
        year: 2026,
      });

      expect(sessions[0]).toMatchObject({ id: 'ts-1', attendancePercent: 75 });
      expect(sessions[1]).not.toHaveProperty('attendancePercent');
      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toContain(
        `WHEN ts.start_date > ${TODAY_SQL} THEN 'upcoming'`,
      );
      expect(sql).toContain(`WHEN ts.end_date < ${TODAY_SQL} THEN 'completed'`);
      expect(sql).toContain(VISIBLE_SQL);
      expect(sql).toMatch(/\(\$1::text IS NULL OR au\.code = \$1\)/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['KV1', 'tp-1', 2026]);
    });
  });

  describe('getSession', () => {
    it('answers 404 for a session outside the scope, as for a missing one', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getSession(areaKv1, 'ts-9')).rejects.toThrow(
        new NotFoundException('training_session_not_found'),
      );
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['KV1', 'ts-9']);
    });
  });

  describe('sessionMembers', () => {
    it("lists the plan unit's active members in scope and everyone already recorded", async () => {
      const members = [
        {
          id: 'm1',
          name: 'Nguyễn Văn A',
          militiaCode: 'DQ1',
          unitCode: 'KV1',
          attended: true,
        },
        {
          id: 'm2',
          name: 'Trần Văn B',
          militiaCode: 'DQ2',
          unitCode: 'KV1',
          attended: null,
        },
      ];
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'ts-1', planUnitId: 'unit-kv1' }])
        .mockResolvedValueOnce(members);

      await expect(service.sessionMembers(areaKv1, 'ts-1')).resolves.toEqual(
        members,
      );

      expect(sqlOf(mockDataSource.query, 0)).toContain(
        '($2::text IS NULL OR pu.code = $2 OR p.unit_id IS NULL)',
      );
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['ts-1', 'KV1']);
      const roster = sqlOf(mockDataSource.query, 1);
      expect(roster).toMatch(/LEFT JOIN training_session_attendance a/);
      expect(roster).toMatch(
        /a\.militia_id IS NOT NULL OR \(mp\.status = 'active' AND \(\$3::uuid IS NULL OR mp\.unit_id = \$3\)\)/,
      );
      expect(paramsOf(mockDataSource.query, 1)).toEqual([
        'ts-1',
        'KV1',
        'unit-kv1',
      ]);
    });

    it('answers 404 for a session outside the scope', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.sessionMembers(areaKv1, 'ts-1')).rejects.toThrow(
        new NotFoundException('training_session_not_found'),
      );
    });
  });

  describe('recordAttendance', () => {
    const entries = [
      { memberId: 'm1', attended: true },
      { memberId: 'm2', attended: false },
    ];
    const lockedSession = (change: Record<string, unknown> = {}) => [
      {
        id: 'ts-1',
        planStatus: 'active',
        startDate: '2026-09-10',
        planUnitId: 'unit-kv1',
        ...change,
      },
    ];

    it('records attendance and keeps the training records of those who attended', async () => {
      mockManager.query
        .mockResolvedValueOnce(lockedSession())
        .mockResolvedValueOnce([{ id: 'm1' }, { id: 'm2' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          sessionRow({ recordedCount: 2, attendedCount: 1, status: 'ongoing' }),
        ]);

      await expect(
        service.recordAttendance(areaKv1, 'ts-1', entries),
      ).resolves.toMatchObject({ id: 'ts-1', attendancePercent: 50 });

      expect(sqlOf(mockManager.query, 0)).toMatch(
        /FOR UPDATE OF ts FOR SHARE OF p/,
      );
      expect(paramsOf(mockManager.query, 0)).toEqual(['ts-1', 'KV1']);

      expect(sqlOf(mockManager.query, 1)).toMatch(/FOR SHARE OF mp/);
      expect(paramsOf(mockManager.query, 1)).toEqual([
        'ts-1',
        ['m1', 'm2'],
        'KV1',
        'unit-kv1',
      ]);

      expect(sqlOf(mockManager.query, 2)).toMatch(
        /INSERT INTO training_session_attendance[\s\S]+ON CONFLICT \(session_id, militia_id\) DO UPDATE/,
      );
      expect(paramsOf(mockManager.query, 2)).toEqual([
        'ts-1',
        ['m1', 'm2'],
        [true, false],
        'area-1',
      ]);

      expect(sqlOf(mockManager.query, 3)).toMatch(
        /INSERT INTO training_records[\s\S]+session_id[\s\S]+ON CONFLICT \(session_id, militia_id\) WHERE session_id IS NOT NULL DO NOTHING/,
      );
      expect(paramsOf(mockManager.query, 3)).toEqual([
        'ts-1',
        ['m1'],
        'area-1',
      ]);

      expect(sqlOf(mockManager.query, 4)).toMatch(
        /DELETE FROM training_records\s+WHERE session_id = \$1 AND militia_id = ANY\(\$2::uuid\[\]\)/,
      );
      expect(paramsOf(mockManager.query, 4)).toEqual(['ts-1', ['m2']]);
      expect(paramsOf(mockManager.query, 5)).toEqual(['KV1', 'ts-1']);
    });

    it('accepts attendance for a session starting today in Vietnam', async () => {
      mockManager.query
        .mockResolvedValueOnce(lockedSession({ startDate: '2026-09-14' }))
        .mockResolvedValueOnce([{ id: 'm1' }, { id: 'm2' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sessionRow()]);

      await expect(
        service.recordAttendance(admin, 'ts-1', entries),
      ).resolves.toBeDefined();
    });

    it('answers 404 for a session outside the scope', async () => {
      mockManager.query.mockResolvedValueOnce([]);

      await expect(
        service.recordAttendance(areaKv1, 'ts-1', entries),
      ).rejects.toThrow(new NotFoundException('training_session_not_found'));
    });

    it.each(['draft', 'completed'])(
      'answers 409 while the plan is %s',
      async (planStatus) => {
        mockManager.query.mockResolvedValueOnce(lockedSession({ planStatus }));

        await expect(
          service.recordAttendance(admin, 'ts-1', entries),
        ).rejects.toThrow(new ConflictException('training_plan_not_active'));
      },
    );

    it('answers 409 before the session starts', async () => {
      mockManager.query.mockResolvedValueOnce(
        lockedSession({ startDate: '2026-09-15' }),
      );

      await expect(
        service.recordAttendance(admin, 'ts-1', entries),
      ).rejects.toThrow(new ConflictException('training_session_not_started'));
    });

    it('answers 404 when a member is outside the scope or not on the roster, writing nothing', async () => {
      mockManager.query
        .mockResolvedValueOnce(lockedSession())
        .mockResolvedValueOnce([{ id: 'm1' }]);

      await expect(
        service.recordAttendance(areaKv1, 'ts-1', entries),
      ).rejects.toThrow(new NotFoundException('militia_not_found'));
      expect(mockManager.query).toHaveBeenCalledTimes(2);
    });
  });
});
