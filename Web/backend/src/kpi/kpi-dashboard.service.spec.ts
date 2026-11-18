// GET /kpi/dashboard: KPI overview of a month for the caller's unit scope
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';
import { KpiTargetsService } from '../settings/kpi-targets.service';
import { KpiDashboardService } from './kpi-dashboard.service';

const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
const kpiTargets = { getEffective: jest.fn() };

const admin = { sub: 'admin-1', role: 'system_admin', unitScope: null };

const TARGETS = {
  minAttendanceDays: 20,
  minTasksCompleted: 5,
  maxOverdueTasks: 1,
  minTrainingHours: 40,
  evaluationPeriod: 'monthly' as const,
  effectiveFrom: '2026-01-01',
  updatedAt: null,
  updatedBy: null,
  isDefault: false,
};

const TOP = [
  {
    militiaId: 'm1',
    userId: 'u1',
    fullName: 'Nguyễn Văn An',
    militiaCode: 'DQ-1',
    unitCode: 'KV-A',
    score: 95,
  },
];
const BOTTOM = [
  {
    militiaId: 'm9',
    userId: 'u9',
    fullName: 'Lê Văn Cường',
    militiaCode: 'DQ-9',
    unitCode: 'KV-B',
    score: 55.5,
  },
];
const BY_UNIT = [
  {
    unitCode: 'KV-A',
    unitName: 'Khu vực A',
    memberCount: 6,
    evaluatedCount: 5,
    averageScore: 81.2,
  },
  {
    unitCode: 'KV-B',
    unitName: 'Khu vực B',
    memberCount: 4,
    evaluatedCount: 3,
    averageScore: 73.4,
  },
];
const TREND = [4, 5, 6, 7, 8, 9].map((month) => ({
  year: 2026,
  month,
  averageScore: month === 4 ? null : 70 + month,
  evaluatedCount: month === 4 ? 0 : 8,
}));

function respond({
  summary = {
    memberCount: 10,
    evaluatedCount: 8,
    averageScore: 78.4,
    excellent: 2,
    good: 3,
    fair: 2,
    needsImprovement: 1,
  } as Record<string, unknown>,
  metrics = {
    memberCount: 10,
    attendanceDays: 21.5,
    attendanceMeeting: 7,
    tasksCompleted: 4.2,
    tasksMeeting: 3,
    overdueTasks: 0.8,
    overdueMeeting: 9,
    trainingHours: 44,
    trainingMeeting: 6,
  } as Record<string, unknown>,
} = {}) {
  query
    .mockResolvedValueOnce([summary])
    .mockResolvedValueOnce(BY_UNIT)
    .mockResolvedValueOnce(TOP)
    .mockResolvedValueOnce(BOTTOM)
    .mockResolvedValueOnce([
      { recommendation: 'reward', count: 2 },
      { recommendation: 'maintain', count: 5 },
      { recommendation: 'warning', count: 1 },
    ])
    .mockResolvedValueOnce(TREND)
    .mockResolvedValueOnce([metrics]);
}

const sqlOf = (call: number) => query.mock.calls[call][0];
const paramsOf = (call: number) => query.mock.calls[call][1] as unknown[];

describe('KpiDashboardService', () => {
  // 1 October in Vietnam, 30 September on the UTC server clock
  useUtcServerClock(VN_1_OCTOBER_0130);

  let service: KpiDashboardService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        KpiDashboardService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: KpiTargetsService, useValue: kpiTargets },
      ],
    }).compile();
    service = moduleRef.get(KpiDashboardService);
    query.mockReset();
    kpiTargets.getEffective.mockReset().mockResolvedValue(TARGETS);
  });

  it('assembles the overview of a month against the targets in force at its end', async () => {
    respond();

    const result = await service.getDashboard(admin, { year: 2026, month: 9 });

    expect(kpiTargets.getEffective).toHaveBeenCalledWith('2026-09-30');
    expect(query).toHaveBeenCalledTimes(7);
    expect(paramsOf(0)).toEqual([null, 2026, 9]);
    expect(paramsOf(1)).toEqual([null, 2026, 9]);
    expect(paramsOf(2)).toEqual([null, 2026, 9, 5]);
    expect(paramsOf(3)).toEqual([null, 2026, 9, 5]);
    expect(paramsOf(4)).toEqual([null, 2026, 9]);
    expect(paramsOf(5)).toEqual([null, '2026-04-01', '2026-09-01']);
    expect(paramsOf(6)).toEqual([
      null,
      '2026-09-01',
      '2026-09-30',
      '2026-09-01',
      '2026-09-30',
      '2026-01-01',
      '2026-12-31',
      20,
      5,
      1,
      40,
    ]);

    expect(result).toEqual({
      period: {
        year: 2026,
        month: 9,
        label: '09/2026',
        from: '2026-09-01',
        to: '2026-09-30',
        periodId: null,
      },
      unitCode: null,
      generatedAt: expect.any(Date) as Date,
      memberCount: 10,
      evaluatedCount: 8,
      notEvaluatedCount: 2,
      coverageRate: 80,
      averageScore: 78.4,
      distribution: [
        {
          grade: 'excellent',
          label: 'Xuất sắc',
          minScore: 90,
          count: 2,
          pct: 25,
        },
        { grade: 'good', label: 'Tốt', minScore: 75, count: 3, pct: 37.5 },
        { grade: 'fair', label: 'Khá', minScore: 60, count: 2, pct: 25 },
        {
          grade: 'needs_improvement',
          label: 'Cần cải thiện',
          minScore: 0,
          count: 1,
          pct: 12.5,
        },
      ],
      recommendations: [
        { recommendation: 'reward', label: 'Khen thưởng', count: 2 },
        { recommendation: 'maintain', label: 'Duy trì', count: 5 },
        { recommendation: 'training', label: 'Bồi dưỡng thêm', count: 0 },
        { recommendation: 'warning', label: 'Nhắc nhở', count: 1 },
        { recommendation: 'discipline', label: 'Xem xét kỷ luật', count: 0 },
      ],
      byUnit: BY_UNIT,
      top: [{ ...TOP[0], grade: 'excellent', gradeLabel: 'Xuất sắc' }],
      bottom: [
        {
          ...BOTTOM[0],
          grade: 'needs_improvement',
          gradeLabel: 'Cần cải thiện',
        },
      ],
      trend: TREND.map((t) => ({ ...t, label: `2026-0${t.month}` })),
      targets: TARGETS,
      metrics: [
        {
          key: 'attendanceDays',
          name: 'Ngày chấm công',
          unit: 'ngày',
          comparison: 'min',
          window: { from: '2026-09-01', to: '2026-09-30' },
          current: 21.5,
          target: 20,
          met: true,
          membersMeeting: 7,
          memberCount: 10,
        },
        {
          key: 'tasksCompleted',
          name: 'Nhiệm vụ hoàn thành',
          unit: 'nhiệm vụ',
          comparison: 'min',
          window: { from: '2026-09-01', to: '2026-09-30' },
          current: 4.2,
          target: 5,
          met: false,
          membersMeeting: 3,
          memberCount: 10,
        },
        {
          key: 'overdueTasks',
          name: 'Nhiệm vụ quá hạn',
          unit: 'nhiệm vụ',
          comparison: 'max',
          window: { from: '2026-09-01', to: '2026-09-30' },
          current: 0.8,
          target: 1,
          met: true,
          membersMeeting: 9,
          memberCount: 10,
        },
        {
          key: 'trainingHours',
          name: 'Giờ huấn luyện',
          unit: 'giờ',
          comparison: 'min',
          window: { from: '2026-01-01', to: '2026-12-31' },
          current: 44,
          target: 40,
          met: true,
          membersMeeting: 6,
          memberCount: 10,
        },
      ],
    });
  });

  it('scores a member as the average of their evaluations on the 100-point scale, graded by the declared bands', async () => {
    respond();
    await service.getDashboard(admin, { year: 2026, month: 9 });
    expect(sqlOf(0)).toContain('AVG(ke.weighted_score) * 10');
    expect(sqlOf(0)).toContain("mp.status = 'active'");
    expect(sqlOf(0)).toContain('score >= 90');
    expect(sqlOf(0)).toContain('score >= 75');
    expect(sqlOf(0)).toContain('score >= 60');
    // top and bottom only rank members who were evaluated
    expect(sqlOf(2)).toMatch(/score IS NOT NULL[\s\S]*ORDER BY score DESC/);
    expect(sqlOf(3)).toMatch(/score IS NOT NULL[\s\S]*ORDER BY score ASC/);
    // training is recorded in days: 8 hours a day
    expect(sqlOf(6)).toContain('SUM(tr.total_days), 0) * 8');
  });

  it('measures completed and overdue tasks over the evaluation period containing the month', async () => {
    kpiTargets.getEffective.mockResolvedValueOnce({
      ...TARGETS,
      evaluationPeriod: 'quarterly',
    });
    respond();

    const result = await service.getDashboard(admin, { year: 2026, month: 8 });

    expect(paramsOf(6).slice(1, 7)).toEqual([
      '2026-08-01',
      '2026-08-31',
      '2026-07-01',
      '2026-09-30',
      '2026-01-01',
      '2026-12-31',
    ]);
    expect(result.metrics[1].window).toEqual({
      from: '2026-07-01',
      to: '2026-09-30',
    });
  });

  it('reads the month of a payroll period, as /kpi/summary-report does', async () => {
    query.mockResolvedValueOnce([{ year: 2026, month: 8 }]);
    respond();

    const result = await service.getDashboard(admin, {
      periodId: 'a3b1c2d4-0000-4000-8000-000000000001',
    });

    expect(sqlOf(0)).toMatch(/FROM payroll_periods WHERE id = \$1/);
    expect(paramsOf(0)).toEqual(['a3b1c2d4-0000-4000-8000-000000000001']);
    expect(kpiTargets.getEffective).toHaveBeenCalledWith('2026-08-31');
    expect(result.period).toEqual({
      year: 2026,
      month: 8,
      label: '08/2026',
      from: '2026-08-01',
      to: '2026-08-31',
      periodId: 'a3b1c2d4-0000-4000-8000-000000000001',
    });
  });

  it('answers 404 for an unknown period', async () => {
    query.mockResolvedValueOnce([]);
    await expect(
      service.getDashboard(admin, {
        periodId: 'a3b1c2d4-0000-4000-8000-000000000009',
      }),
    ).rejects.toThrow(new NotFoundException('period_not_found'));
    expect(kpiTargets.getEffective).not.toHaveBeenCalled();
  });

  it('refuses a conflicting or incomplete period before querying', async () => {
    await expect(
      service.getDashboard(admin, { periodId: 'p', year: 2026, month: 9 }),
    ).rejects.toThrow(new BadRequestException('period_conflict'));
    await expect(service.getDashboard(admin, { month: 9 })).rejects.toThrow(
      new BadRequestException('incomplete_period'),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('defaults to the current month in Vietnam', async () => {
    respond();
    const result = await service.getDashboard(admin, {});
    expect(paramsOf(0)).toEqual([null, 2026, 10]);
    expect(kpiTargets.getEffective).toHaveBeenCalledWith('2026-10-31');
    expect(result.period.label).toBe('10/2026');
  });

  describe('scope', () => {
    it('locks unit staff to their unit whatever they request', async () => {
      respond();
      const result = await service.getDashboard(
        { sub: 's-1', role: 'office_staff', unitScope: 'KV-A' },
        { year: 2026, month: 9, unitCode: 'KV-B' },
      );
      for (let call = 0; call < 7; call++) {
        expect(paramsOf(call)[0]).toBe('KV-A');
      }
      expect(result.unitCode).toBe('KV-A');
    });

    it('lets a wide role narrow to a unit', async () => {
      respond();
      await service.getDashboard(
        { sub: 'w-1', role: 'police_ward', unitScope: null },
        { year: 2026, month: 9, unitCode: 'KV-B' },
      );
      expect(paramsOf(0)[0]).toBe('KV-B');
    });

    it('refuses an area role without a unit scope', async () => {
      await expect(
        service.getDashboard(
          { sub: 'a-1', role: 'police_area', unitScope: null },
          { year: 2026, month: 9 },
        ),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(query).not.toHaveBeenCalled();
    });
  });

  it('bounds the ranking to 1-20 members and the trend to 1-24 months', async () => {
    respond();
    await service.getDashboard(admin, {
      year: 2026,
      month: 9,
      top: 100,
      trendMonths: 50,
    });
    expect(paramsOf(2)[3]).toBe(20);
    expect(paramsOf(5)).toEqual([null, '2024-10-01', '2026-09-01']);

    query.mockReset();
    respond();
    await service.getDashboard(admin, {
      year: 2026,
      month: 9,
      top: 0,
      trendMonths: 0,
    });
    expect(paramsOf(2)[3]).toBe(1);
    expect(paramsOf(5)).toEqual([null, '2026-09-01', '2026-09-01']);
  });

  it('reports nothing evaluated without dividing by zero', async () => {
    respond({
      summary: {
        memberCount: 0,
        evaluatedCount: 0,
        averageScore: null,
        excellent: 0,
        good: 0,
        fair: 0,
        needsImprovement: 0,
      },
      metrics: {
        memberCount: 0,
        attendanceDays: null,
        attendanceMeeting: 0,
        tasksCompleted: null,
        tasksMeeting: 0,
        overdueTasks: null,
        overdueMeeting: 0,
        trainingHours: null,
        trainingMeeting: 0,
      },
    });

    const result = await service.getDashboard(admin, { year: 2026, month: 9 });

    expect(result).toMatchObject({
      memberCount: 0,
      evaluatedCount: 0,
      notEvaluatedCount: 0,
      coverageRate: 0,
      averageScore: null,
    });
    expect(result.distribution.map((d) => d.pct)).toEqual([0, 0, 0, 0]);
    expect(result.metrics.map((m) => [m.current, m.met])).toEqual([
      [null, false],
      [null, false],
      [null, false],
      [null, false],
    ]);
  });
});
