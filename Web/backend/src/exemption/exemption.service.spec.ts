import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ExemptionService } from './exemption.service';

const mockManager = { query: jest.fn() };
const mockDataSource = { query: jest.fn(), transaction: jest.fn() };

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];
const sqlOf = (mock: jest.Mock, call: number) => String(callsOf(mock)[call][0]);
const paramsOf = (mock: jest.Mock, call: number) =>
  callsOf(mock)[call][1] as unknown[];

const admin = { role: 'system_admin', unitScope: null };
const areaOfficer = { role: 'police_area', unitScope: 'KV2' };
const staffKv2 = { role: 'office_staff', unitScope: 'KV2' };
const wardStaff = { role: 'office_staff', unitScope: null };

const record = {
  id: 'ex-1',
  militiaId: 'mp-1',
  militiaName: 'Nguyễn Văn A',
  militiaCode: 'DQ-001',
  unitCode: 'KV1',
  type: 'deferral',
  reason: 'Học đại học',
  legalBasis: 'Điều 12 Luật DQTV 2019',
  effectiveDate: '2026-09-01',
  expiryDate: '2027-06-30',
  status: 'active',
  documents: [],
};

const validInput = {
  militiaId: 'mp-1',
  type: 'deferral' as const,
  reason: '  Học đại học ',
  legalBasis: ' Điều 12 Luật DQTV 2019 ',
  effectiveDate: '2026-09-01',
  expiryDate: '2027-06-30',
};

describe('ExemptionService', () => {
  let service: ExemptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExemptionService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get(ExemptionService);
    jest.resetAllMocks();
    mockDataSource.transaction.mockImplementation(
      (work: (mgr: typeof mockManager) => unknown) => work(mockManager),
    );
  });

  describe('findAll', () => {
    it('returns date strings, the militia name and the effective status', async () => {
      mockDataSource.query.mockResolvedValueOnce([record]);

      await expect(service.findAll(admin, {})).resolves.toEqual([record]);

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toMatch(
        /to_char\(e\.effective_date, 'YYYY-MM-DD'\) AS "effectiveDate"/,
      );
      expect(sql).toMatch(
        /to_char\(e\.expiry_date, 'YYYY-MM-DD'\) AS "expiryDate"/,
      );
      expect(sql).toMatch(/mp\.full_name AS "militiaName"/);
      expect(sql).toMatch(
        /WHEN e\.status = 'active'\s+AND e\.expiry_date < \(now\(\) AT TIME ZONE 'Asia\/Ho_Chi_Minh'\)::date\s+THEN 'expired'/,
      );
      expect(sql).toMatch(/COALESCE\(e\.documents, '\{\}'\) AS documents/);
    });

    it('lets wide roles see every unit or narrow to one', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.findAll(admin, {});
      await service.findAll(admin, { unitCode: 'KV1' });

      expect(paramsOf(mockDataSource.query, 0)).toEqual([null, null, null]);
      expect(paramsOf(mockDataSource.query, 1)[0]).toBe('KV1');
    });

    it('locks other roles to their own unit whatever they ask for', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.findAll(areaOfficer, { unitCode: 'KV9' });

      expect(paramsOf(mockDataSource.query, 0)[0]).toBe('KV2');
    });

    it('refuses an area role without a unit scope', async () => {
      await expect(
        service.findAll({ role: 'police_area', unitScope: null }, {}),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('filters by effective status and militia', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.findAll(admin, { status: 'expired', militiaId: 'mp-1' });

      expect(paramsOf(mockDataSource.query, 0)).toEqual([
        null,
        'expired',
        'mp-1',
      ]);
      expect(sqlOf(mockDataSource.query, 0)).toMatch(
        /\$2::text IS NULL OR x\.status = \$2/,
      );
    });
  });

  describe('create', () => {
    it('rejects an expiry date before the effective date without querying', async () => {
      await expect(
        service.create(admin, { ...validInput, expiryDate: '2026-08-31' }),
      ).rejects.toThrow(new BadRequestException('expiry_before_effective'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a militia member that does not exist', async () => {
      mockManager.query.mockResolvedValueOnce([]);

      await expect(service.create(admin, validInput)).rejects.toThrow(
        new BadRequestException('militia_not_found'),
      );
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it('locks the militia member and refuses one outside the caller unit', async () => {
      mockManager.query.mockResolvedValueOnce([
        { id: 'mp-1', unitCode: 'KV1' },
      ]);

      await expect(service.create(staffKv2, validInput)).rejects.toThrow(
        new ForbiddenException('unit_scope_violation'),
      );
      expect(sqlOf(mockManager.query, 0)).toMatch(/FOR UPDATE OF mp/);
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it('refuses an area role without a unit scope', async () => {
      mockManager.query.mockResolvedValueOnce([
        { id: 'mp-1', unitCode: 'KV1' },
      ]);

      await expect(
        service.create({ role: 'police_area', unitScope: null }, validInput),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
    });

    // Two active decisions covering the same days for one member contradict each other
    it('refuses a decision overlapping an active one for the same member', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'mp-1', unitCode: 'KV1' }])
        .mockResolvedValueOnce([{ id: 'ex-old' }]);

      await expect(service.create(admin, validInput)).rejects.toThrow(
        new ConflictException('overlapping_active_exemption'),
      );
      const overlapSql = sqlOf(mockManager.query, 1);
      expect(overlapSql).toMatch(
        /daterange\(e\.effective_date, e\.expiry_date, '\[\]'\) && daterange\(\$2::date, \$3::date, '\[\]'\)/,
      );
      expect(overlapSql).toMatch(/e\.status = 'active'/);
      expect(paramsOf(mockManager.query, 1)).toEqual([
        'mp-1',
        '2026-09-01',
        '2027-06-30',
      ]);
      expect(mockManager.query).toHaveBeenCalledTimes(2);
    });

    it('stores an active decision with trimmed text and returns it from the same transaction', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'mp-1', unitCode: 'KV1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'ex-1' }])
        .mockResolvedValueOnce([record]);

      await expect(service.create(admin, validInput)).resolves.toEqual(record);

      expect(sqlOf(mockManager.query, 2)).toMatch(
        /INSERT INTO exemptions \(militia_id, type, reason, legal_basis, effective_date, expiry_date, status, documents\)\s+VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, 'active', \$7\)/,
      );
      expect(paramsOf(mockManager.query, 2)).toEqual([
        'mp-1',
        'deferral',
        'Học đại học',
        'Điều 12 Luật DQTV 2019',
        '2026-09-01',
        '2027-06-30',
        [],
      ]);
      expect(paramsOf(mockManager.query, 3)).toEqual(['ex-1']);
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('stores open-ended decisions with a null expiry date', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'mp-1', unitCode: 'KV1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'ex-1' }])
        .mockResolvedValueOnce([record]);

      await service.create(wardStaff, {
        ...validInput,
        expiryDate: undefined,
        documents: ['qd-12.pdf'],
      });

      expect(paramsOf(mockManager.query, 1)).toEqual([
        'mp-1',
        '2026-09-01',
        null,
      ]);
      expect(paramsOf(mockManager.query, 2).slice(5)).toEqual([
        null,
        ['qd-12.pdf'],
      ]);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for an unknown id', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.findOne('missing')).rejects.toThrow(
        new NotFoundException('exemption_not_found'),
      );
    });
  });

  describe('review', () => {
    it('throws NotFoundException for an unknown id', async () => {
      mockManager.query.mockResolvedValueOnce([]);

      await expect(service.review(admin, 'missing', 'revoked')).rejects.toThrow(
        new NotFoundException('exemption_not_found'),
      );
    });

    it('locks the row and refuses decisions outside the caller unit', async () => {
      mockManager.query.mockResolvedValueOnce([
        { id: 'ex-1', status: 'active', unitCode: 'KV1' },
      ]);

      await expect(service.review(staffKv2, 'ex-1', 'revoked')).rejects.toThrow(
        new ForbiddenException('unit_scope_violation'),
      );
      expect(sqlOf(mockManager.query, 0)).toMatch(/FOR UPDATE OF e/);
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it.each(['expired', 'revoked'])(
      'refuses to change a decision that is already %s',
      async (current) => {
        mockManager.query.mockResolvedValueOnce([
          { id: 'ex-1', status: current, unitCode: 'KV1' },
        ]);

        await expect(service.review(admin, 'ex-1', 'revoked')).rejects.toThrow(
          new ConflictException('invalid_status_transition'),
        );
        expect(mockManager.query).toHaveBeenCalledTimes(1);
      },
    );

    it('updates an active decision and returns it from the same transaction', async () => {
      mockManager.query
        .mockResolvedValueOnce([
          { id: 'ex-1', status: 'active', unitCode: 'KV1' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...record, status: 'revoked' }]);

      await expect(service.review(admin, 'ex-1', 'revoked')).resolves.toEqual({
        ...record,
        status: 'revoked',
      });

      expect(sqlOf(mockManager.query, 1)).toMatch(
        /UPDATE exemptions SET status = \$2, updated_at = now\(\) WHERE id = \$1/,
      );
      expect(paramsOf(mockManager.query, 1)).toEqual(['ex-1', 'revoked']);
      expect(paramsOf(mockManager.query, 2)).toEqual(['ex-1']);
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });
});
