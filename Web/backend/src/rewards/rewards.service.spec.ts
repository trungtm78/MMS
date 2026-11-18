import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { AssignmentsService } from '../assignments/assignments.service';

const mockManager = { query: jest.fn() };
const mockDataSource = { query: jest.fn(), transaction: jest.fn() };
const mockAssignments = { getAssignedDqtvIds: jest.fn() };

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];
const sqlOf = (mock: jest.Mock, call: number) => String(callsOf(mock)[call][0]);
const paramsOf = (mock: jest.Mock, call: number) =>
  callsOf(mock)[call][1] as unknown[];

const SCOPE_SQL =
  '($1::text IS NULL OR u.code = $1) AND ($2::uuid[] IS NULL OR mp.user_id = ANY($2::uuid[]))';

const admin = { sub: 'admin-1', role: 'system_admin', unitScope: null };
const staffKv1 = { sub: 'staff-1', role: 'office_staff', unitScope: 'KV1' };
const dqtv = { sub: 'dqtv-user', role: 'dqtv', unitScope: null };
const leader = { sub: 'leader-1', role: 'ubnd_leader', unitScope: null };
const origin = { ip: '10.0.0.9', userAgent: 'jest' };

// 01:30 on 14 September 2026 in Vietnam, still 13 September in UTC
const VN_14_SEPTEMBER_0130 = new Date('2026-09-13T18:30:00Z');

const record = {
  id: 'rd-1',
  militiaId: 'mp-1',
  militiaName: 'Nguyễn Văn A',
  rewardType: 'giay_khen',
  issuedDate: '2026-09-01',
};

const validInput = {
  militiaId: 'mp-1',
  rewardType: 'giay_khen' as const,
  issuingAuthority: 'commune' as const,
  criteria: 'Hoàn thành xuất sắc nhiệm vụ',
  issuedDate: '2026-09-01',
};

describe('RewardsService', () => {
  let service: RewardsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RewardsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AssignmentsService, useValue: mockAssignments },
      ],
    }).compile();
    service = module.get(RewardsService);
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

  describe('list', () => {
    it('lets wide staff read every unit, filtered by dates, form and member', async () => {
      mockDataSource.query.mockResolvedValueOnce([record]);

      await expect(
        service.list(admin, {
          from: '2026-01-01',
          to: '2026-12-31',
          rewardType: 'giay_khen',
          militiaId: 'mp-1',
        }),
      ).resolves.toEqual([record]);

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toContain('FROM reward_decisions rd');
      expect(sql).toContain(SCOPE_SQL);
      expect(sql).toMatch(/ORDER BY rd\.issued_date DESC, rd\.created_at DESC/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual([
        null,
        null,
        '2026-01-01',
        '2026-12-31',
        'giay_khen',
        'mp-1',
      ]);
    });

    it('returns the form and authority labels beside their codes', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.list(admin, {});

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toContain("WHEN 'giay_khen' THEN 'Giấy khen'");
      expect(sql).toContain("WHEN 'commune' THEN 'Chủ tịch UBND cấp xã'");
      expect(sql).toMatch(
        /to_char\(rd\.issued_date, 'YYYY-MM-DD'\) AS "issuedDate"/,
      );
    });

    it('lets wide staff narrow to a unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.list(admin, { unitCode: 'KV2' });

      expect(paramsOf(mockDataSource.query, 0).slice(0, 2)).toEqual([
        'KV2',
        null,
      ]);
    });

    it('keeps scoped staff in their unit whatever unit they request', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.list(staffKv1, { unitCode: 'KV2' });

      expect(paramsOf(mockDataSource.query, 0).slice(0, 2)).toEqual([
        'KV1',
        null,
      ]);
    });

    it('limits DQTV members to their own decisions', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.list(dqtv, { unitCode: 'KV2' });

      expect(paramsOf(mockDataSource.query, 0).slice(0, 2)).toEqual([
        null,
        ['dqtv-user'],
      ]);
    });

    it('refuses other roles before reading anything', async () => {
      await expect(service.list(leader, {})).rejects.toThrow(
        new ForbiddenException('insufficient_role'),
      );
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('refuses a range that ends before it starts', async () => {
      await expect(
        service.list(admin, { from: '2026-05-01', to: '2026-04-30' }),
      ).rejects.toThrow(new BadRequestException('invalid_date_range'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('reads one decision within the caller scope', async () => {
      mockDataSource.query.mockResolvedValueOnce([record]);

      await expect(service.findOne(staffKv1, 'rd-1')).resolves.toEqual(record);

      expect(sqlOf(mockDataSource.query, 0)).toMatch(/rd\.id = \$3/);
      expect(sqlOf(mockDataSource.query, 0)).toContain(SCOPE_SQL);
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['KV1', null, 'rd-1']);
    });

    it('answers 404 for a missing decision and for one outside the scope alike', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.findOne(staffKv1, 'rd-9')).rejects.toThrow(
        new NotFoundException('reward_not_found'),
      );
    });
  });

  describe('create', () => {
    const recorded = () =>
      mockManager.query
        .mockResolvedValueOnce([{ id: 'rd-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([record]);

    it('records the decision for a member in the caller scope, audits it and returns it', async () => {
      recorded();

      await expect(
        service.create(staffKv1, validInput, origin),
      ).resolves.toEqual(record);

      const insert = sqlOf(mockManager.query, 0);
      expect(insert).toMatch(/INSERT INTO reward_decisions/);
      expect(insert).toMatch(
        /FROM militia_profiles mp\s+JOIN units u ON u\.id = mp\.unit_id/,
      );
      expect(insert).toContain(
        'WHERE mp.id = $1 AND ($2::text IS NULL OR u.code = $2) AND ($3::uuid[] IS NULL OR mp.user_id = ANY($3::uuid[]))',
      );
      expect(paramsOf(mockManager.query, 0)).toEqual([
        'mp-1',
        'KV1',
        null,
        'giay_khen',
        'commune',
        'achievement',
        'Hoàn thành xuất sắc nhiệm vụ',
        null,
        '2026-09-01',
        'staff-1',
      ]);

      expect(sqlOf(mockManager.query, 1)).toMatch(/INSERT INTO audit_logs/);
      expect(paramsOf(mockManager.query, 1)).toEqual([
        'staff-1',
        'reward.issued',
        'reward_decisions',
        'rd-1',
        JSON.stringify({
          militiaId: 'mp-1',
          rewardType: 'giay_khen',
          issuingAuthority: 'commune',
          basis: 'achievement',
          issuedDate: '2026-09-01',
          decisionNumber: null,
        }),
        '10.0.0.9',
        'jest',
      ]);

      expect(sqlOf(mockManager.query, 2)).toMatch(/rd\.id = \$1/);
      expect(paramsOf(mockManager.query, 2)).toEqual(['rd-1']);
    });

    it('stores blank optional text as absent', async () => {
      recorded();

      await service.create(
        admin,
        { ...validInput, criteria: '   ', decisionNumber: ' ' },
        origin,
      );

      const params = paramsOf(mockManager.query, 0);
      expect(params[6]).toBeNull();
      expect(params[7]).toBeNull();
    });

    it('answers 404 for a member outside the caller scope, as for a missing one', async () => {
      mockManager.query.mockResolvedValueOnce([]);

      await expect(
        service.create(staffKv1, validInput, origin),
      ).rejects.toThrow(new NotFoundException('militia_not_found'));
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it('accepts a decision dated today in Vietnam while UTC is still on the previous day', async () => {
      recorded();

      await expect(
        service.create(
          admin,
          { ...validInput, issuedDate: '2026-09-14' },
          origin,
        ),
      ).resolves.toEqual(record);
    });

    it('refuses a decision dated after today in Vietnam', async () => {
      await expect(
        service.create(
          admin,
          { ...validInput, issuedDate: '2026-09-15' },
          origin,
        ),
      ).rejects.toThrow(new BadRequestException('decision_date_in_future'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses an authority that does not confer the form', async () => {
      await expect(
        service.create(
          admin,
          { ...validInput, rewardType: 'bang_khen' },
          origin,
        ),
      ).rejects.toThrow(
        new BadRequestException('reward_authority_not_allowed'),
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses district-level decisions dated from the day that level ended', async () => {
      await expect(
        service.create(
          admin,
          {
            ...validInput,
            issuingAuthority: 'district',
            issuedDate: '2025-07-01',
          },
          origin,
        ),
      ).rejects.toThrow(
        new BadRequestException('reward_authority_not_allowed'),
      );
    });

    it('refuses DQTV members', async () => {
      await expect(service.create(dqtv, validInput, origin)).rejects.toThrow(
        new ForbiddenException('insufficient_role'),
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });
});
