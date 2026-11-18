import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DisciplineService } from './discipline.service';
import { AssignmentsService } from '../assignments/assignments.service';

const mockManager = { query: jest.fn() };
const mockDataSource = { query: jest.fn(), transaction: jest.fn() };
const mockAssignments = { getAssignedDqtvIds: jest.fn() };

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];
const sqlOf = (mock: jest.Mock, call: number) => String(callsOf(mock)[call][0]);
const paramsOf = (mock: jest.Mock, call: number) =>
  callsOf(mock)[call][1] as unknown[];

const admin = { sub: 'admin-1', role: 'system_admin', unitScope: null };
const staffKv1 = { sub: 'staff-1', role: 'office_staff', unitScope: 'KV1' };
const dqtv = { sub: 'dqtv-user', role: 'dqtv', unitScope: null };
const leader = { sub: 'leader-1', role: 'ubnd_leader', unitScope: null };
const origin = { ip: '10.0.0.9', userAgent: 'jest' };

// 01:30 on 14 September 2026 in Vietnam, still 13 September in UTC
const VN_14_SEPTEMBER_0130 = new Date('2026-09-13T18:30:00Z');

const record = {
  id: 'dd-1',
  militiaId: 'mp-1',
  militiaName: 'Trần Văn B',
  disciplineType: 'khien_trach',
  violation: 'Vắng trực',
  decisionDate: '2026-09-01',
  status: 'active',
  appeals: [],
};

const validInput = {
  militiaId: 'mp-1',
  disciplineType: 'khien_trach' as const,
  violation: 'Vắng trực không lý do',
  decisionDate: '2026-09-01',
};

// A decision row as the locking read returns it
const locked = (change: Record<string, unknown> = {}) => [
  {
    id: 'dd-1',
    status: 'active',
    decisionDate: '2026-09-01',
    rounds: 0,
    ...change,
  },
];

describe('DisciplineService', () => {
  let service: DisciplineService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DisciplineService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AssignmentsService, useValue: mockAssignments },
      ],
    }).compile();
    service = module.get(DisciplineService);
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
    it('filters by scope, dates, form, status and member, newest decision first', async () => {
      mockDataSource.query.mockResolvedValueOnce([record]);

      await expect(
        service.list(admin, {
          from: '2026-01-01',
          to: '2026-12-31',
          disciplineType: 'khien_trach',
          status: 'active',
          militiaId: 'mp-1',
        }),
      ).resolves.toEqual([record]);

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toContain('FROM discipline_decisions d');
      expect(sql).toContain(
        '($1::text IS NULL OR u.code = $1) AND ($2::uuid[] IS NULL OR mp.user_id = ANY($2::uuid[]))',
      );
      expect(sql).toMatch(/AS "appealedAt"/);
      expect(sql).toMatch(/ORDER BY d\.decision_date DESC, d\.created_at DESC/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual([
        null,
        null,
        '2026-01-01',
        '2026-12-31',
        'khien_trach',
        'active',
        'mp-1',
      ]);
    });

    it('limits DQTV members to their own decisions', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.list(dqtv, {});

      expect(paramsOf(mockDataSource.query, 0).slice(0, 2)).toEqual([
        null,
        ['dqtv-user'],
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

    it('refuses other roles and reversed ranges before reading anything', async () => {
      await expect(service.list(leader, {})).rejects.toThrow(
        new ForbiddenException('insufficient_role'),
      );
      await expect(
        service.list(admin, { from: '2026-05-01', to: '2026-04-30' }),
      ).rejects.toThrow(new BadRequestException('invalid_date_range'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('reads the decision with its appeals within the caller scope', async () => {
      mockDataSource.query.mockResolvedValueOnce([record]);

      await expect(service.findOne(staffKv1, 'dd-1')).resolves.toEqual(record);

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toMatch(/d\.id = \$3/);
      expect(sql).toMatch(/AS appeals/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['KV1', null, 'dd-1']);
    });

    it('answers 404 for a missing decision and for one outside the scope alike', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.findOne(dqtv, 'dd-1')).rejects.toThrow(
        new NotFoundException('discipline_decision_not_found'),
      );
    });
  });

  describe('create', () => {
    const recorded = () =>
      mockManager.query
        .mockResolvedValueOnce([{ id: 'dd-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([record]);

    it('records the decision for a member in the caller scope, audits it and returns it', async () => {
      recorded();

      await expect(
        service.create(
          staffKv1,
          {
            ...validInput,
            violationDate: '2026-08-30',
            decisionNumber: '05/QĐ-UBND',
            issuedBy: 'Chủ tịch UBND phường',
          },
          origin,
        ),
      ).resolves.toEqual(record);

      const insert = sqlOf(mockManager.query, 0);
      expect(insert).toMatch(/INSERT INTO discipline_decisions/);
      expect(insert).toContain(
        'WHERE mp.id = $1 AND ($2::text IS NULL OR u.code = $2) AND ($3::uuid[] IS NULL OR mp.user_id = ANY($3::uuid[]))',
      );
      expect(paramsOf(mockManager.query, 0)).toEqual([
        'mp-1',
        'KV1',
        null,
        'khien_trach',
        'Vắng trực không lý do',
        '2026-08-30',
        '2026-09-01',
        '05/QĐ-UBND',
        'Chủ tịch UBND phường',
        'staff-1',
      ]);
      expect(paramsOf(mockManager.query, 1)).toEqual([
        'staff-1',
        'discipline.issued',
        'discipline_decisions',
        'dd-1',
        JSON.stringify({
          militiaId: 'mp-1',
          disciplineType: 'khien_trach',
          decisionDate: '2026-09-01',
          decisionNumber: '05/QĐ-UBND',
        }),
        '10.0.0.9',
        'jest',
      ]);
      expect(paramsOf(mockManager.query, 2)).toEqual(['dd-1']);
    });

    it('answers 404 for a member outside the caller scope, as for a missing one', async () => {
      mockManager.query.mockResolvedValueOnce([]);

      await expect(
        service.create(staffKv1, validInput, origin),
      ).rejects.toThrow(new NotFoundException('militia_not_found'));
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it('refuses a decision dated after today in Vietnam, and accepts today', async () => {
      await expect(
        service.create(
          admin,
          { ...validInput, decisionDate: '2026-09-15' },
          origin,
        ),
      ).rejects.toThrow(new BadRequestException('decision_date_in_future'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();

      recorded();
      await expect(
        service.create(
          admin,
          { ...validInput, decisionDate: '2026-09-14' },
          origin,
        ),
      ).resolves.toEqual(record);
    });

    it('refuses a violation dated after the decision', async () => {
      await expect(
        service.create(
          admin,
          { ...validInput, violationDate: '2026-09-02' },
          origin,
        ),
      ).rejects.toThrow(new BadRequestException('violation_after_decision'));
    });

    it('refuses DQTV members', async () => {
      await expect(service.create(dqtv, validInput, origin)).rejects.toThrow(
        new ForbiddenException('insufficient_role'),
      );
    });
  });

  describe('fileAppeal', () => {
    const filed = (rounds = 0) =>
      mockManager.query
        .mockResolvedValueOnce(locked({ rounds }))
        .mockResolvedValueOnce([[{ id: 'dd-1' }], 1])
        .mockResolvedValueOnce([{ id: 'ap-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...record, status: 'appealed' }]);

    it('locks the decision in scope, marks it appealed, records round 1 and audits it', async () => {
      filed();

      await expect(
        service.fileAppeal(
          staffKv1,
          'dd-1',
          { reason: 'Chưa xét tình tiết giảm nhẹ', filedDate: '2026-09-05' },
          origin,
        ),
      ).resolves.toMatchObject({ status: 'appealed' });

      const lock = sqlOf(mockManager.query, 0);
      expect(lock).toMatch(/FOR UPDATE OF d FOR SHARE OF mp/);
      expect(lock).toContain(
        'WHERE d.id = $1 AND ($2::text IS NULL OR u.code = $2) AND ($3::uuid[] IS NULL OR mp.user_id = ANY($3::uuid[]))',
      );
      expect(paramsOf(mockManager.query, 0)).toEqual(['dd-1', 'KV1', null]);

      expect(sqlOf(mockManager.query, 1)).toMatch(
        /UPDATE discipline_decisions SET status = 'appealed', updated_at = now\(\)\s+WHERE id = \$1 AND status = 'active'/,
      );
      expect(sqlOf(mockManager.query, 2)).toMatch(
        /INSERT INTO discipline_appeals/,
      );
      expect(paramsOf(mockManager.query, 2)).toEqual([
        'dd-1',
        1,
        'Chưa xét tình tiết giảm nhẹ',
        '2026-09-05',
        'staff-1',
      ]);
      expect(paramsOf(mockManager.query, 3)).toEqual([
        'staff-1',
        'discipline.appeal_filed',
        'discipline_appeals',
        'ap-1',
        JSON.stringify({
          decisionId: 'dd-1',
          round: 1,
          filedDate: '2026-09-05',
        }),
        '10.0.0.9',
        'jest',
      ]);
      expect(paramsOf(mockManager.query, 4)).toEqual(['dd-1']);
    });

    it('files on today in Vietnam when no date is given', async () => {
      filed();

      await service.fileAppeal(admin, 'dd-1', { reason: 'Khiếu nại' }, origin);

      expect(paramsOf(mockManager.query, 2)[3]).toBe('2026-09-14');
    });

    it('lets a DQTV member appeal their own decision', async () => {
      filed();

      await service.fileAppeal(dqtv, 'dd-1', { reason: 'Khiếu nại' }, origin);

      expect(paramsOf(mockManager.query, 0)).toEqual([
        'dd-1',
        null,
        ['dqtv-user'],
      ]);
      expect(paramsOf(mockManager.query, 2)[4]).toBe('dqtv-user');
    });

    it('opens a second round after the first appeal was upheld', async () => {
      filed(1);

      await service.fileAppeal(admin, 'dd-1', { reason: 'Lần hai' }, origin);

      expect(paramsOf(mockManager.query, 2)[1]).toBe(2);
    });

    it('answers 404 for a missing decision and for one outside the scope alike', async () => {
      mockManager.query.mockResolvedValueOnce([]);

      await expect(
        service.fileAppeal(staffKv1, 'dd-1', { reason: 'x' }, origin),
      ).rejects.toThrow(new NotFoundException('discipline_decision_not_found'));
    });

    it.each([
      [
        'an appeal is already open',
        { status: 'appealed' },
        'appeal_already_open',
      ],
      [
        'the decision was overturned',
        { status: 'overturned', rounds: 1 },
        'discipline_decision_overturned',
      ],
      [
        'both rounds were used',
        { status: 'active', rounds: 2 },
        'appeal_rounds_exhausted',
      ],
    ])('answers 409 when %s', async (_label, change, code) => {
      mockManager.query.mockResolvedValueOnce(locked(change));

      await expect(
        service.fileAppeal(admin, 'dd-1', { reason: 'x' }, origin),
      ).rejects.toThrow(new ConflictException(code));
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it('answers 409 when a concurrent filing won the open-appeal index', async () => {
      mockManager.query
        .mockResolvedValueOnce(locked())
        .mockResolvedValueOnce([[{ id: 'dd-1' }], 1])
        .mockRejectedValueOnce(
          Object.assign(new Error('duplicate key'), { code: '23505' }),
        );

      await expect(
        service.fileAppeal(admin, 'dd-1', { reason: 'x' }, origin),
      ).rejects.toThrow(new ConflictException('appeal_already_open'));
    });

    it('refuses an appeal dated before the decision', async () => {
      mockManager.query.mockResolvedValueOnce(locked());

      await expect(
        service.fileAppeal(
          admin,
          'dd-1',
          { reason: 'x', filedDate: '2026-08-31' },
          origin,
        ),
      ).rejects.toThrow(new BadRequestException('appeal_before_decision'));
    });

    it('refuses an appeal dated after today in Vietnam', async () => {
      await expect(
        service.fileAppeal(
          admin,
          'dd-1',
          { reason: 'x', filedDate: '2026-09-15' },
          origin,
        ),
      ).rejects.toThrow(new BadRequestException('appeal_date_in_future'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses other roles', async () => {
      await expect(
        service.fileAppeal(leader, 'dd-1', { reason: 'x' }, origin),
      ).rejects.toThrow(new ForbiddenException('insufficient_role'));
    });
  });

  describe('decideAppeal', () => {
    const open = (change: Record<string, unknown> = {}) => [
      {
        id: 'dd-1',
        status: 'appealed',
        appealId: 'ap-1',
        round: 1,
        filedDate: '2026-09-05',
        ...change,
      },
    ];
    const decided = (status: string) =>
      mockManager.query
        .mockResolvedValueOnce(open())
        .mockResolvedValueOnce([[{ id: 'ap-1' }], 1])
        .mockResolvedValueOnce([[{ id: 'dd-1' }], 1])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...record, status }]);

    it('closes the open appeal as upheld and puts the decision back in force', async () => {
      decided('active');

      await expect(
        service.decideAppeal(
          staffKv1,
          'dd-1',
          {
            outcome: 'upheld',
            resolution: 'Giữ nguyên quyết định',
            decidedDate: '2026-09-10',
          },
          origin,
        ),
      ).resolves.toMatchObject({ status: 'active' });

      expect(sqlOf(mockManager.query, 0)).toMatch(
        /FOR UPDATE OF d FOR SHARE OF mp/,
      );
      expect(sqlOf(mockManager.query, 0)).toMatch(/a\.outcome IS NULL/);
      expect(paramsOf(mockManager.query, 0)).toEqual(['dd-1', 'KV1', null]);
      expect(sqlOf(mockManager.query, 1)).toMatch(
        /UPDATE discipline_appeals[\s\S]+WHERE id = \$1 AND outcome IS NULL/,
      );
      expect(paramsOf(mockManager.query, 1)).toEqual([
        'ap-1',
        'upheld',
        'Giữ nguyên quyết định',
        '2026-09-10',
        'staff-1',
      ]);
      expect(sqlOf(mockManager.query, 2)).toMatch(
        /UPDATE discipline_decisions SET status = \$2, updated_at = now\(\)\s+WHERE id = \$1 AND status = 'appealed'/,
      );
      expect(paramsOf(mockManager.query, 2)).toEqual(['dd-1', 'active']);
      expect(paramsOf(mockManager.query, 3)).toEqual([
        'staff-1',
        'discipline.appeal_decided',
        'discipline_appeals',
        'ap-1',
        JSON.stringify({
          decisionId: 'dd-1',
          round: 1,
          outcome: 'upheld',
          decidedDate: '2026-09-10',
        }),
        '10.0.0.9',
        'jest',
      ]);
    });

    it('overturns the decision when the appeal succeeds, dated today by default', async () => {
      decided('overturned');

      await service.decideAppeal(
        admin,
        'dd-1',
        { outcome: 'overturned', resolution: 'Hủy quyết định' },
        origin,
      );

      expect(paramsOf(mockManager.query, 1)[3]).toBe('2026-09-14');
      expect(paramsOf(mockManager.query, 2)).toEqual(['dd-1', 'overturned']);
    });

    it('answers 409 when no appeal is open', async () => {
      mockManager.query.mockResolvedValueOnce(
        open({
          status: 'active',
          appealId: null,
          round: null,
          filedDate: null,
        }),
      );

      await expect(
        service.decideAppeal(
          admin,
          'dd-1',
          { outcome: 'upheld', resolution: 'x' },
          origin,
        ),
      ).rejects.toThrow(new ConflictException('no_open_appeal'));
    });

    it('answers 404 for a missing decision and for one outside the scope alike', async () => {
      mockManager.query.mockResolvedValueOnce([]);

      await expect(
        service.decideAppeal(
          staffKv1,
          'dd-1',
          { outcome: 'upheld', resolution: 'x' },
          origin,
        ),
      ).rejects.toThrow(new NotFoundException('discipline_decision_not_found'));
    });

    it('refuses a decision dated before the appeal was filed, or after today', async () => {
      mockManager.query.mockResolvedValueOnce(open());

      await expect(
        service.decideAppeal(
          admin,
          'dd-1',
          { outcome: 'upheld', resolution: 'x', decidedDate: '2026-09-04' },
          origin,
        ),
      ).rejects.toThrow(new BadRequestException('decided_before_filed'));
      await expect(
        service.decideAppeal(
          admin,
          'dd-1',
          { outcome: 'upheld', resolution: 'x', decidedDate: '2026-09-15' },
          origin,
        ),
      ).rejects.toThrow(new BadRequestException('decided_date_in_future'));
    });

    it('refuses DQTV members, who may appeal but not decide', async () => {
      await expect(
        service.decideAppeal(
          dqtv,
          'dd-1',
          { outcome: 'overturned', resolution: 'x' },
          origin,
        ),
      ).rejects.toThrow(new ForbiddenException('insufficient_role'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });
});
