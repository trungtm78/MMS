import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { gradeOf } from './kpi-grades';
import {
  KPI_COMPONENT_CRITERIA,
  KpiService,
  kpiComponentScore,
} from './kpi.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ExcelExportService } from '../common/services/excel-export.service';

const mockDataSource = { query: jest.fn() };
const mockAssignmentsService = { getAssignedDqtvIds: jest.fn() };
const mockExcelService = {
  createWorkbook: jest.fn(),
  addGovernmentHeader: jest.fn().mockReturnValue(8),
  addStyledTable: jest.fn(),
  addDocumentHash: jest.fn(),
  streamToResponse: jest.fn(),
};

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];
const sqlOf = (mock: jest.Mock, call: number) => String(callsOf(mock)[call][0]);

const validDto = {
  targetUserId: 'user-target-1',
  criteria: [
    'Kỹ năng chuyên môn',
    'Tinh thần trách nhiệm',
    'Hiệu quả công tác',
    'Chấm công',
    'Thái độ tác phong',
  ],
  scores: [8, 7, 9, 8, 9],
  recommendation: 'maintain',
  notes: 'Thực hiện nhiệm vụ tốt.',
};

const adminEvaluator = {
  sub: 'evaluator-1',
  role: 'system_admin',
  unitScope: null,
};
const caEvaluator = { sub: 'ca-user-1', role: 'ca_officer', unitScope: 'KV2' };
const areaCa = { sub: 'area-1', role: 'ca_area', unitScope: 'KV2' };
const dqtvSelf = { sub: 'user-1', role: 'dqtv', unitScope: null };

// Target lookup row: account exists, holds a DQTV role, militia profile units
const target = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-target-1',
  isDqtv: true,
  units: ['KV2'],
  ...overrides,
});

describe('KpiService', () => {
  let service: KpiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KpiService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AssignmentsService, useValue: mockAssignmentsService },
        { provide: ExcelExportService, useValue: mockExcelService },
      ],
    }).compile();
    service = module.get<KpiService>(KpiService);
    jest.resetAllMocks();
  });

  describe('submitEvaluation', () => {
    it('creates evaluation and returns weighted score', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([target()]) // target lookup
        .mockResolvedValueOnce([{ id: 'eval-1' }]); // insert
      const result = await service.submitEvaluation(validDto, adminEvaluator);
      expect(result.id).toBe('eval-1');
      // weighted: 8*0.30 + 7*0.25 + 9*0.20 + 8*0.15 + 9*0.10 = 2.4+1.75+1.8+1.2+0.9 = 8.05
      expect(result.weightedScore).toBe(8.05);
      expect(result.recommendation).toBe('maintain');
      expect(sqlOf(mockDataSource.query, 1)).toMatch(
        /ON CONFLICT \(evaluator_id, target_user_id, year, month\) DO NOTHING/,
      );
    });

    it('calculates weighted score correctly for all-10 inputs', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([target()])
        .mockResolvedValueOnce([{ id: 'eval-2' }]);
      const result = await service.submitEvaluation(
        { ...validDto, scores: [10, 10, 10, 10, 10] },
        adminEvaluator,
      );
      expect(result.weightedScore).toBe(10);
    });

    it('throws NotFoundException when target user not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(
        service.submitEvaluation(validDto, adminEvaluator),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to evaluate an account that is not a DQTV member', async () => {
      mockDataSource.query.mockResolvedValueOnce([target({ isDqtv: false })]);

      await expect(
        service.submitEvaluation(validDto, adminEvaluator),
      ).rejects.toThrow(new BadRequestException('target_not_dqtv'));
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    // The (evaluator, target, year, month) unique index is the duplicate check: it
    // covers concurrent submissions and uses the Vietnamese month
    it('throws ConflictException when already evaluated this month', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([target()])
        .mockResolvedValueOnce([]); // ON CONFLICT DO NOTHING returned no row
      await expect(
        service.submitEvaluation(validDto, adminEvaluator),
      ).rejects.toThrow(
        new ConflictException('evaluation_already_submitted_this_month'),
      );
    });

    it('maps a unique violation to 409', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([target()])
        .mockRejectedValueOnce({ code: '23505' });
      await expect(
        service.submitEvaluation(validDto, adminEvaluator),
      ).rejects.toThrow(
        new ConflictException('evaluation_already_submitted_this_month'),
      );
    });

    it('throws BadRequestException when scores count != 5', async () => {
      await expect(
        service.submitEvaluation(
          { ...validDto, scores: [8, 7, 9] },
          adminEvaluator,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when score out of range', async () => {
      await expect(
        service.submitEvaluation(
          { ...validDto, scores: [8, 7, 11, 8, 9] },
          adminEvaluator,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid recommendation', async () => {
      await expect(
        service.submitEvaluation(
          { ...validDto, recommendation: 'invalid' },
          adminEvaluator,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitEvaluation — evaluator scope', () => {
    it('CA evaluates assigned DQTV → success', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([
        'user-target-1',
      ]);
      mockDataSource.query
        .mockResolvedValueOnce([target()])
        .mockResolvedValueOnce([{ id: 'eval-1' }]);

      const result = await service.submitEvaluation(validDto, caEvaluator);
      expect(result.id).toBe('eval-1');
    });

    it('CA evaluates non-assigned DQTV → ForbiddenException', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([
        'other-user',
      ]);
      mockDataSource.query.mockResolvedValueOnce([target()]);

      await expect(
        service.submitEvaluation(validDto, caEvaluator),
      ).rejects.toThrow(new ForbiddenException('dqtv_not_assigned_to_ca'));
    });

    // An empty assignment list must deny, not fall back to "anyone"
    it('CA with no assignments may not evaluate anyone', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([]);
      mockDataSource.query.mockResolvedValueOnce([target()]);

      await expect(
        service.submitEvaluation(validDto, caEvaluator),
      ).rejects.toThrow(new ForbiddenException('dqtv_not_assigned_to_ca'));
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('area CA evaluates a DQTV member of their unit', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([target({ units: ['KV2'] })])
        .mockResolvedValueOnce([{ id: 'eval-3' }]);

      await expect(
        service.submitEvaluation(validDto, areaCa),
      ).resolves.toMatchObject({ id: 'eval-3' });
    });

    it('area CA may not evaluate a DQTV member of another unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([target({ units: ['KV1'] })]);

      await expect(service.submitEvaluation(validDto, areaCa)).rejects.toThrow(
        new ForbiddenException('unit_scope_violation'),
      );
    });

    it('area CA without a unit scope is refused', async () => {
      mockDataSource.query.mockResolvedValueOnce([target()]);

      await expect(
        service.submitEvaluation(validDto, { ...areaCa, unitScope: null }),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
    });
  });

  // ── getCurrentScore / getHistory ────────────────────────────────────────

  describe('getCurrentScore', () => {
    // The criteria PoliceApp's evaluation form submits, in its order
    const policeAppCriteria = [
      'Kỹ năng chuyên môn',
      'Tinh thần trách nhiệm',
      'Hiệu quả công tác',
      'Chấm công',
      'Thái độ tác phong',
    ];
    const standing = (overrides: Record<string, unknown> = {}) => ({
      score: '8.05',
      rank: '4',
      rankInUnit: '2',
      unitSize: '5',
      previousScore: '7.50',
      evaluations: [{ criteria: policeAppCriteria, scores: [8, 7, 9, 8, 9] }],
      ...overrides,
    });

    it('returns the monthly score, change, ranks in the ward and unit, unit size and components', async () => {
      mockDataSource.query.mockResolvedValueOnce([standing()]);

      await expect(
        service.getCurrentScore(dqtvSelf, 'user-1', 4, 2026),
      ).resolves.toEqual({
        score: 8.05,
        totalScore: 8.05,
        change: 0.55,
        rank: 4,
        rankInUnit: 2,
        unitSize: 5,
        month: 4,
        year: 2026,
        // "Chấm công" and "Hiệu quả công tác" of the evaluation
        attendanceScore: 8,
        taskScore: 9,
        maxScore: 10,
      });
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    // Several evaluators may each score a member once a month: the monthly score is their
    // average, as in the summary report, and ranks compare those averages
    it('ranks monthly averages with standard competition ranking inside the unit and the ward', async () => {
      mockDataSource.query.mockResolvedValueOnce([standing()]);

      await service.getCurrentScore(dqtvSelf, 'user-1', 4, 2026);

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toMatch(
        /monthly AS \(\s*SELECT ke\.target_user_id AS user_id, AVG\(ke\.weighted_score\) AS score\s+FROM kpi_evaluations ke\s+WHERE ke\.year = \$2 AND ke\.month = \$3\s+GROUP BY ke\.target_user_id/,
      );
      // 1224 ranking: one more than the number of strictly higher averages
      expect(sql).toMatch(
        /\(SELECT COUNT\(\*\) FROM monthly m WHERE m\.score > \(SELECT score FROM own\)\) \+ 1 AS rank/,
      );
      expect(sql).toMatch(
        /\(SELECT COUNT\(\*\) FROM unit_monthly um WHERE um\.score > \(SELECT score FROM own\)\) \+ 1\s+END AS "rankInUnit"/,
      );
      // The unit: the member's militia profile, compared with the other scored members' profiles
      expect(sql).toMatch(
        /member_unit AS \(\s*SELECT mp\.unit_id FROM militia_profiles mp\s+WHERE mp\.user_id = \$1/,
      );
      expect(sql).toMatch(/ump\.unit_id = mu\.unit_id/);
      expect(sql).toMatch(/AS "unitSize"/);
      expect(callsOf(mockDataSource.query)[0][1]).toEqual([
        'user-1',
        2026,
        4,
        2026,
        3,
      ]);
    });

    it('compares January with December of the year before', async () => {
      mockDataSource.query.mockResolvedValueOnce([standing()]);

      await service.getCurrentScore(dqtvSelf, 'user-1', 1, 2027);

      expect(callsOf(mockDataSource.query)[0][1]).toEqual([
        'user-1',
        2027,
        1,
        2026,
        12,
      ]);
    });

    // Components come from the criteria each evaluation stored with its scores, whatever
    // position the evaluator's form gave them, averaged over the month's evaluations
    it('reads components by criterion name and averages them over evaluators', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        standing({
          evaluations: [
            {
              criteria: [
                'Kỷ luật',
                'Chuyên cần',
                'Huấn luyện',
                'Nhiệm vụ',
                'Tinh thần',
              ],
              scores: [8, 7, 9, 6, 7],
            },
            { criteria: policeAppCriteria, scores: [8, 7, 9, 8, 9] },
          ],
        }),
      ]);

      await expect(
        service.getCurrentScore(dqtvSelf, 'user-1', 4, 2026),
      ).resolves.toMatchObject({ attendanceScore: 7.5, taskScore: 7.5 });
    });

    it('leaves a component null when no evaluation of the month names it', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        standing({
          evaluations: [
            { criteria: ['A', 'B', 'C', 'D', 'E'], scores: [8, 7, 9, 8, 9] },
            { criteria: ['Chấm công'], scores: ['not a number'] },
          ],
        }),
      ]);

      await expect(
        service.getCurrentScore(dqtvSelf, 'user-1', 4, 2026),
      ).resolves.toMatchObject({
        score: 8.05,
        attendanceScore: null,
        taskScore: null,
      });
    });

    it('returns no score, ranks or components for a month without evaluations', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        standing({
          score: null,
          rank: '1',
          rankInUnit: '1',
          unitSize: '3',
          previousScore: '7.00',
          evaluations: [],
        }),
      ]);

      await expect(
        service.getCurrentScore(dqtvSelf, 'user-1', 4, 2026),
      ).resolves.toEqual({
        score: null,
        totalScore: null,
        change: null,
        rank: null,
        rankInUnit: null,
        unitSize: 3,
        month: 4,
        year: 2026,
        attendanceScore: null,
        taskScore: null,
        maxScore: 10,
      });
    });

    it('has no unit rank for a member without a militia profile unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        standing({ rankInUnit: null, unitSize: null, previousScore: null }),
      ]);

      await expect(
        service.getCurrentScore(dqtvSelf, 'user-1', 4, 2026),
      ).resolves.toMatchObject({
        rank: 4,
        rankInUnit: null,
        unitSize: null,
        change: null,
      });
    });

    it('rejects a month outside 1-12 without querying', async () => {
      await expect(
        service.getCurrentScore(dqtvSelf, 'user-1', 13, 2026),
      ).rejects.toThrow(new BadRequestException('invalid_month'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  // ?userId= must not expose other members' KPI to whoever asks
  describe('KPI visibility', () => {
    it.each([
      [
        'getCurrentScore',
        (s: KpiService) => s.getCurrentScore(dqtvSelf, 'someone-else', 4, 2026),
      ],
      ['getHistory', (s: KpiService) => s.getHistory(dqtvSelf, 'someone-else')],
    ])('DQTV members may only read their own KPI (%s)', async (_name, act) => {
      await expect(act(service)).rejects.toThrow(
        new ForbiddenException('kpi_not_visible'),
      );
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('CA officers read only the DQTV assigned to them', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([
        'user-1',
      ]);

      await expect(service.getHistory(caEvaluator, 'user-2')).rejects.toThrow(
        new ForbiddenException('kpi_not_visible'),
      );
    });

    it('area officers read DQTV members of their unit only', async () => {
      const areaOfficer = {
        sub: 'pa-1',
        role: 'police_area',
        unitScope: 'KV2',
      };
      mockDataSource.query.mockResolvedValueOnce([{ units: ['KV1'] }]);
      await expect(service.getHistory(areaOfficer, 'user-2')).rejects.toThrow(
        new ForbiddenException('kpi_not_visible'),
      );

      mockDataSource.query
        .mockResolvedValueOnce([{ units: ['KV2'] }])
        .mockResolvedValueOnce([]);
      await expect(service.getHistory(areaOfficer, 'user-2')).resolves.toEqual(
        [],
      );
    });

    it('wide roles read anyone', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.getHistory(adminEvaluator, 'user-2'),
      ).resolves.toEqual([]);
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });
  });

  // ── kpiComponentScore ─────────────────────────────────────────────────────

  describe('kpiComponentScore', () => {
    it('averages the criterion named for the component, ignoring case and diacritics', () => {
      expect(
        kpiComponentScore(
          [
            { criteria: ['KỶ LUẬT', 'Chấm công'], scores: [9, 6] },
            { criteria: ['Nhiệm vụ', 'ky luat'], scores: [5, 8] },
          ],
          KPI_COMPONENT_CRITERIA.discipline,
        ),
      ).toBe(8.5);
    });

    // PoliceApp lists Tinh thần trách nhiệm before Thái độ tác phong
    it('prefers the earliest name in the list over the order of the form', () => {
      expect(
        kpiComponentScore(
          [
            {
              criteria: ['Tinh thần trách nhiệm', 'Thái độ tác phong'],
              scores: [7, 9],
            },
          ],
          KPI_COMPONENT_CRITERIA.attitude,
        ),
      ).toBe(9);
    });

    it('gives no score when no evaluation names the component with a valid score', () => {
      expect(
        kpiComponentScore(
          [
            { criteria: ['Huấn luyện'], scores: [9] },
            { criteria: ['Kỷ luật'], scores: [11] },
            { criteria: ['Kỷ luật'], scores: ['9'] },
            { criteria: 'Kỷ luật', scores: [9] },
          ],
          KPI_COMPONENT_CRITERIA.discipline,
        ),
      ).toBeNull();
    });
  });

  // ── getSummaryReport ──────────────────────────────────────────────────────

  describe('getSummaryReport', () => {
    const adminUser = {
      sub: 'admin-1',
      username: 'admin',
      role: 'system_admin',
      unitScope: null,
    };

    it('returns empty array when no militia exists', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'period-1', month: 4, year: 2026 }]) // period check
        .mockResolvedValueOnce([]); // no militia

      const result = await service.getSummaryReport(adminUser, 'period-1');
      expect(result).toEqual([]);
    });

    // One row per active member as the report query answers it
    const memberRow = (overrides: Record<string, unknown> = {}) => ({
      militiaId: 'mp-1',
      name: 'A',
      code: 'A01',
      unit: 'ĐV1',
      evaluations: [],
      supervisorScore: null,
      total: null,
      rank: '1',
      rankInUnit: '1',
      ...overrides,
    });
    const reportCall = () => mockDataSource.query.mock.calls[1] as unknown[];
    const reportSql = () => String(reportCall()[0]);

    // Each client lists its criteria in its own order (T20): position says nothing
    it('reads each component from the criterion named for it, whatever order the form lists', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'period-1', month: 3, year: 2026 }])
        .mockResolvedValueOnce([
          memberRow({
            evaluations: [
              {
                criteria: [
                  'Kỹ năng chuyên môn',
                  'Tinh thần trách nhiệm',
                  'Hiệu quả công tác',
                  'Chấm công',
                  'Thái độ tác phong',
                ],
                scores: [8, 7, 9, 8, 9],
              },
              {
                criteria: [
                  'Kỷ luật',
                  'Chuyên cần',
                  'Huấn luyện',
                  'Nhiệm vụ',
                  'Tinh thần',
                ],
                scores: [8, 6, 9, 7, 7],
              },
            ],
            supervisorScore: 8,
            total: 80,
            rank: '2',
            rankInUnit: '1',
          }),
        ]);

      await expect(
        service.getSummaryReport(adminUser, 'period-1'),
      ).resolves.toEqual([
        {
          militiaId: 'mp-1',
          name: 'A',
          code: 'A01',
          unit: 'ĐV1',
          // Chấm công 8 and Chuyên cần 6
          attendanceScore: 7,
          // Hiệu quả công tác 9 and Nhiệm vụ 7
          taskScore: 8,
          // Only the second form names Kỷ luật
          disciplineScore: 8,
          // Thái độ tác phong 9 before Tinh thần trách nhiệm; Tinh thần 7
          attitudeScore: 8,
          // The evaluators' overall score
          supervisorScore: 8,
          total: 80,
          rank: 2,
          rankInUnit: 1,
          xepLoai: 'Tốt',
        },
      ]);
      expect(reportSql()).not.toMatch(/scores->/);
      expect(reportSql()).toMatch(
        /json_agg\(json_build_object\('criteria', ke\.criteria, 'scores', ke\.scores\)/,
      );
      expect(reportSql()).toMatch(
        /ROUND\(AVG\(ke\.weighted_score\), 2\) AS "supervisorScore"/,
      );
    });

    // Two units may share a name; ties share a rank as in /kpi/current
    it('ranks within the unit itself, with shared ranks for equal scores', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'period-1', month: 3, year: 2026 }])
        .mockResolvedValueOnce([memberRow()]);

      await service.getSummaryReport(adminUser, 'period-1');

      expect(reportSql()).toMatch(
        /RANK\(\) OVER \(PARTITION BY u\.id ORDER BY AVG\(ke\.weighted_score\) DESC NULLS LAST\) AS "rankInUnit"/,
      );
      expect(reportSql()).toMatch(
        /RANK\(\) OVER \(ORDER BY AVG\(ke\.weighted_score\) DESC NULLS LAST\) AS "rank"/,
      );
    });

    it('reports a member nobody evaluated with no scores', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'period-1', month: 3, year: 2026 }])
        .mockResolvedValueOnce([memberRow({ rank: '3', rankInUnit: '2' })]);

      const [item] = await service.getSummaryReport(adminUser, 'period-1');

      expect(item).toMatchObject({
        attendanceScore: null,
        taskScore: null,
        disciplineScore: null,
        attitudeScore: null,
        supervisorScore: null,
        total: null,
        rank: 3,
        rankInUnit: 2,
        xepLoai: 'Cần cải thiện',
      });
    });

    it('filters to the unit in scope', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'period-1', month: 3, year: 2026 }])
        .mockResolvedValueOnce([]);

      await service.getSummaryReport(adminUser, 'period-1', 'KV1');

      expect(reportSql()).toMatch(/AND u\.code = \$3/);
      expect(reportCall()[1]).toEqual([3, 2026, 'KV1']);
    });

    it('grades the total with the shared KPI grade bands', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'period-1', month: 4, year: 2026 }])
        .mockResolvedValueOnce(
          [90, 89.9, 75, 60, 59.9].map((total, i) =>
            memberRow({ militiaId: `mp-${i}`, total }),
          ),
        );

      const result = await service.getSummaryReport(adminUser, 'period-1');

      expect(result.map((item) => item.xepLoai)).toEqual(
        [90, 89.9, 75, 60, 59.9].map((score) => gradeOf(score).label),
      );
      expect(result.map((item) => item.xepLoai)).toEqual([
        'Xuất sắc',
        'Tốt',
        'Tốt',
        'Khá',
        'Cần cải thiện',
      ]);
    });

    it('throws NotFoundException when period not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // period not found
      await expect(
        service.getSummaryReport(adminUser, 'no-such'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getHistory', () => {
    it('returns empty array when no evaluations', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const result = await service.getHistory(dqtvSelf, 'user-1');
      expect(result).toEqual([]);
    });

    it('returns sorted array of history items', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        // ROUND over NUMERIC reaches JavaScript as a number (src/database/pg-types.ts)
        { month: 1, year: 2026, score: 7.5, recommendation: 'maintain' },
        { month: 2, year: 2026, score: 8, recommendation: 'reward' },
        { month: 3, year: 2026, score: 6.8, recommendation: 'training' },
      ]);
      const result = await service.getHistory(dqtvSelf, 'user-1');
      expect(result).toHaveLength(3);
      expect(result[0].month).toBe(1);
      expect(result[1].score).toBeCloseTo(8.0);
      expect(result[2].recommendation).toBe('training');
    });

    // Newest period first: year before month, so December 2025 follows January 2026
    it('lists one entry per month, newest year and month first, averaging its evaluations', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.getHistory(dqtvSelf, 'user-1');

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toMatch(/ROUND\(AVG\(ke\.weighted_score\), 2\) AS score/);
      expect(sql).toMatch(
        /\(ARRAY_AGG\(ke\.recommendation ORDER BY ke\.created_at DESC\)\)\[1\] AS recommendation/,
      );
      expect(sql).toMatch(/GROUP BY ke\.year, ke\.month/);
      expect(sql).toMatch(/ORDER BY ke\.year DESC, ke\.month DESC/);
    });
  });
});
