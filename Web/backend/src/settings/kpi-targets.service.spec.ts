import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';
import {
  DEFAULT_KPI_TARGETS,
  KpiTargetsService,
  type KpiTargets,
} from './kpi-targets.service';

const query = jest.fn();
const manager = { query };
const dataSource = {
  query,
  transaction: jest.fn((work: (m: typeof manager) => unknown) => work(manager)),
};

const admin = {
  sub: '11111111-1111-4111-8111-111111111111',
  role: 'system_admin',
  unitScope: null,
};
const origin = { ip: '10.0.0.7', userAgent: 'jest' };

const storedRow = {
  id: 'v-2',
  minAttendanceDays: 20,
  minTasksCompleted: 8,
  maxOverdueTasks: 3,
  minTrainingHours: 60,
  evaluationPeriod: 'quarterly',
  effectiveFrom: '2026-10-01',
  updatedAt: new Date('2026-09-30T18:30:00Z'),
  updatedById: admin.sub,
  updatedByName: 'Quản trị hệ thống',
};

const newTargets: KpiTargets = {
  minAttendanceDays: 20,
  minTasksCompleted: 8,
  maxOverdueTasks: 3,
  minTrainingHours: 60,
  evaluationPeriod: 'quarterly',
};

describe('KpiTargetsService', () => {
  // 01:30 on 1 October in Vietnam, still 30 September on the UTC server clock
  useUtcServerClock(VN_1_OCTOBER_0130);

  let service: KpiTargetsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        KpiTargetsService,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(KpiTargetsService);
    query.mockReset();
    dataSource.transaction.mockClear();
  });

  describe('getEffective', () => {
    it('answers the declared defaults while no version is in force', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.getEffective()).resolves.toEqual({
        ...DEFAULT_KPI_TARGETS,
        effectiveFrom: null,
        updatedAt: null,
        updatedBy: null,
        isDefault: true,
      });
      // "today" is the Vietnamese business day, not the server's UTC date
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('k.effective_from <= $1::date'),
        ['2026-10-01'],
      );
    });

    it('answers the latest version effective on the day asked for', async () => {
      query.mockResolvedValueOnce([storedRow]);

      await expect(service.getEffective('2026-12-31')).resolves.toEqual({
        ...newTargets,
        effectiveFrom: '2026-10-01',
        updatedAt: storedRow.updatedAt,
        updatedBy: { id: admin.sub, fullName: 'Quản trị hệ thống' },
        isDefault: false,
      });
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(
        /ORDER BY k\.effective_from DESC, k\.created_at DESC, k\.id DESC\s+LIMIT 1/,
      );
      expect(params).toEqual(['2026-12-31']);
    });

    it('keeps the frontend defaults', () => {
      expect(DEFAULT_KPI_TARGETS).toEqual({
        minAttendanceDays: 22,
        minTasksCompleted: 10,
        maxOverdueTasks: 2,
        minTrainingHours: 40,
        evaluationPeriod: 'monthly',
      });
    });
  });

  describe('update', () => {
    it('serialises writers, appends a version effective today and audits before and after in the same transaction', async () => {
      query
        .mockResolvedValueOnce(undefined) // LOCK TABLE
        .mockResolvedValueOnce([]) // version in force before: none
        .mockResolvedValueOnce([{ id: 'v-2' }]) // INSERT ... RETURNING
        .mockResolvedValueOnce([storedRow]) // version in force after
        .mockResolvedValueOnce(undefined); // audit row

      const result = await service.update(admin, newTargets, origin);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const calls = query.mock.calls as [string, unknown[]?][];
      expect(calls[0][0]).toMatch(
        /LOCK TABLE kpi_target_settings IN SHARE ROW EXCLUSIVE MODE/,
      );
      expect(calls[2][0]).toMatch(/INSERT INTO kpi_target_settings/);
      // clock_timestamp(): a later writer always gets a later created_at
      expect(calls[2][0]).toMatch(/clock_timestamp\(\)/);
      expect(calls[2][1]).toEqual([
        '2026-10-01',
        20,
        8,
        3,
        60,
        'quarterly',
        admin.sub,
      ]);
      expect(calls[4][0]).toMatch(/INSERT INTO audit_logs/);
      const auditParams = calls[4][1] as unknown[];
      expect(auditParams.slice(0, 4)).toEqual([
        admin.sub,
        'kpi_targets.updated',
        'kpi_target_settings',
        'v-2',
      ]);
      expect(JSON.parse(auditParams[4] as string)).toEqual({
        before: {
          ...DEFAULT_KPI_TARGETS,
          effectiveFrom: null,
          isDefault: true,
        },
        after: { ...newTargets, effectiveFrom: '2026-10-01', isDefault: false },
      });
      expect(auditParams.slice(5)).toEqual(['10.0.0.7', 'jest']);
      expect(result).toMatchObject({ ...newTargets, isDefault: false });
    });

    it.each<[string, Partial<KpiTargets>]>([
      ['attendance days below 1', { minAttendanceDays: 0 }],
      ['attendance days above 31', { minAttendanceDays: 32 }],
      ['a fractional task count', { minTasksCompleted: 1.5 }],
      ['tasks above 100', { minTasksCompleted: 101 }],
      ['negative overdue tasks', { maxOverdueTasks: -1 }],
      ['overdue tasks above 20', { maxOverdueTasks: 21 }],
      ['training hours above 500', { minTrainingHours: 501 }],
      ['an unknown evaluation period', { evaluationPeriod: 'weekly' as never }],
    ])('refuses %s before touching the database', async (_label, change) => {
      await expect(
        service.update(admin, { ...newTargets, ...change }, origin),
      ).rejects.toThrow(new BadRequestException('invalid_kpi_targets'));
      expect(query).not.toHaveBeenCalled();
    });
  });
});
