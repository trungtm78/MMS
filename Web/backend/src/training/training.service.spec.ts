import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TrainingService } from './training.service';
import type { JwtPayload } from '../auth/auth.service';
import { CreateTrainingDto } from './dto/create-training.dto';

const mockDataSource = { query: jest.fn() };

// ── Fixture users ──────────────────────────────────────────────────────────

const systemAdmin: JwtPayload = {
  sub: 'admin-1',
  username: 'admin',
  role: 'system_admin',
  unitScope: null,
};

const policeWard: JwtPayload = {
  sub: 'police-1',
  username: 'police_ward_user',
  role: 'police_ward',
  unitScope: 'UNIT_001',
};

const dqtvUser: JwtPayload = {
  sub: 'dqtv-user-1',
  username: 'dqtv01',
  role: 'dqtv',
  unitScope: null,
};

const validDto: CreateTrainingDto = {
  militiaId: 'militia-uuid-1',
  trainingType: 'military',
  fromDate: '2026-01-10',
  toDate: '2026-01-20',
  totalDays: 10,
  location: 'Hà Nội',
  instructor: 'Nguyễn Văn A',
  result: 'pass',
  certificateNo: 'CERT-001',
  notes: null as unknown as undefined,
};

// ── Test suite ─────────────────────────────────────────────────────────────

describe('TrainingService', () => {
  let service: TrainingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<TrainingService>(TrainingService);
    jest.clearAllMocks();
  });

  // ── listRecords ──────────────────────────────────────────────────────────

  describe('listRecords', () => {
    it('returns paginated structure with data and total', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([]);

      const result = await service.listRecords(systemAdmin, { page: 1, limit: 20 });

      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('filters by unitScope for police_ward', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '3' }])
        .mockResolvedValueOnce([]);

      await service.listRecords(policeWard, { page: 1, limit: 10 });

      // Both COUNT and SELECT queries are called with the same params
      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params).toContain('UNIT_001');
    });

    it('scopes dqtv user to own militia via user_id filter', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([]);

      await service.listRecords(dqtvUser, {});

      const [, params] = mockDataSource.query.mock.calls[0];
      // userIdFilter ($4) should be dqtv-user-1
      expect(params).toContain('dqtv-user-1');
      // unitCodeFilter ($3) should be null for dqtv
      expect(params[2]).toBeNull();
    });

    it('system_admin has no unit or user filter', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '100' }])
        .mockResolvedValueOnce([]);

      await service.listRecords(systemAdmin, {});

      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params[2]).toBeNull(); // unitCodeFilter
      expect(params[3]).toBeNull(); // userIdFilter
    });
  });

  // ── createRecord ─────────────────────────────────────────────────────────

  describe('createRecord', () => {
    it('creates record and returns TrainingRecord for system_admin', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          { id: 'militia-uuid-1', fullName: 'Trần Văn B', militiaCode: 'DQTV001' },
        ]) // militia exists
        .mockResolvedValueOnce([{ id: 'rec-1', created_at: new Date('2026-01-10') }]); // insert

      const result = await service.createRecord(systemAdmin, validDto);

      expect(result.id).toBe('rec-1');
      expect(result.militiaName).toBe('Trần Văn B');
      expect(result.trainingType).toBe('military');
      expect(result.result).toBe('pass');
    });

    it('creates record for police_ward role', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-uuid-1', fullName: 'Lê Thị C', militiaCode: 'DQTV002' }])
        .mockResolvedValueOnce([{ id: 'rec-2', created_at: new Date() }]);

      const result = await service.createRecord(policeWard, validDto);
      expect(result.id).toBe('rec-2');
    });

    it('throws ForbiddenException for dqtv role', async () => {
      await expect(service.createRecord(dqtvUser, validDto)).rejects.toThrow(ForbiddenException);
      // No DB call should have been made
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when militia_id does not exist', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // militia not found

      await expect(service.createRecord(systemAdmin, validDto)).rejects.toThrow(NotFoundException);
    });

    it('defaults result to pass when not provided', async () => {
      const dtoWithoutResult = { ...validDto, result: undefined };
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'militia-uuid-1', fullName: 'X', militiaCode: 'DQTV001' }])
        .mockResolvedValueOnce([{ id: 'rec-3', created_at: new Date() }]);

      const result = await service.createRecord(systemAdmin, dtoWithoutResult as CreateTrainingDto);
      expect(result.result).toBe('pass');
    });
  });

  // ── getRecord ─────────────────────────────────────────────────────────────

  describe('getRecord', () => {
    it('returns record when found', async () => {
      const fakeRecord = {
        id: 'rec-1',
        militiaId: 'militia-uuid-1',
        militiaName: 'X',
        militiaCode: 'DQTV001',
        trainingType: 'military',
        fromDate: '2026-01-10',
        toDate: '2026-01-20',
        totalDays: 10,
        location: null,
        instructor: null,
        result: 'pass',
        certificateNo: null,
        notes: null,
        createdAt: new Date(),
      };
      mockDataSource.query.mockResolvedValueOnce([fakeRecord]);

      const result = await service.getRecord(systemAdmin, 'rec-1');
      expect(result.id).toBe('rec-1');
    });

    it('throws NotFoundException when record not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getRecord(systemAdmin, 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── deleteRecord ─────────────────────────────────────────────────────────

  describe('deleteRecord', () => {
    it('throws NotFoundException if record does not exist', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // not found

      await expect(service.deleteRecord(systemAdmin, 'fake-id')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-admin tries to delete another user record', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: 'rec-1', createdBy: 'other-user-id' }, // created by someone else
      ]);

      await expect(service.deleteRecord(policeWard, 'rec-1')).rejects.toThrow(ForbiddenException);
    });

    it('allows system_admin to delete any record', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'rec-1', createdBy: 'other-user-id' }]) // fetch
        .mockResolvedValueOnce([]); // delete

      await expect(service.deleteRecord(systemAdmin, 'rec-1')).resolves.toBeUndefined();
    });

    it('allows creator to delete their own record', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'rec-1', createdBy: policeWard.sub }]) // creator = policeWard
        .mockResolvedValueOnce([]); // delete

      await expect(service.deleteRecord(policeWard, 'rec-1')).resolves.toBeUndefined();
    });
  });

  // ── getReport ─────────────────────────────────────────────────────────────

  describe('getReport', () => {
    it('calculates meetsRequirement correctly — below threshold (14 days)', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { militiaId: 'm-1', militiaName: 'Nguyen Van A', militiaCode: 'DQTV001', totalDays: '14' },
      ]);

      const result = await service.getReport(systemAdmin, { year: 2026 });

      expect(result[0].totalDays).toBe(14);
      expect(result[0].requiredDays).toBe(15);
      expect(result[0].meetsRequirement).toBe(false);
    });

    it('calculates meetsRequirement correctly — exactly at threshold (15 days)', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { militiaId: 'm-1', militiaName: 'Nguyen Van A', militiaCode: 'DQTV001', totalDays: '15' },
      ]);

      const result = await service.getReport(systemAdmin, { year: 2026 });

      expect(result[0].totalDays).toBe(15);
      expect(result[0].meetsRequirement).toBe(true);
    });

    it('calculates meetsRequirement correctly — above threshold (20 days)', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { militiaId: 'm-1', militiaName: 'Nguyen Van B', militiaCode: 'DQTV002', totalDays: '20' },
      ]);

      const result = await service.getReport(systemAdmin, { year: 2026 });

      expect(result[0].totalDays).toBe(20);
      expect(result[0].meetsRequirement).toBe(true);
    });

    it('returns requiredDays = 15 (Luật DQTV 2019)', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { militiaId: 'm-1', militiaName: 'X', militiaCode: 'DQTV001', totalDays: '0' },
      ]);

      const [report] = await service.getReport(systemAdmin, { year: 2026 });
      expect(report.requiredDays).toBe(15);
    });

    it('scopes to unitScope for police_ward', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.getReport(policeWard, { year: 2026 });

      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params).toContain('UNIT_001');
    });

    it('handles multiple militia entries in report', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { militiaId: 'm-1', militiaName: 'A', militiaCode: 'DQTV001', totalDays: '20' },
        { militiaId: 'm-2', militiaName: 'B', militiaCode: 'DQTV002', totalDays: '10' },
        { militiaId: 'm-3', militiaName: 'C', militiaCode: 'DQTV003', totalDays: '15' },
      ]);

      const result = await service.getReport(systemAdmin, { year: 2026 });

      expect(result).toHaveLength(3);
      expect(result[0].meetsRequirement).toBe(true);  // 20 >= 15
      expect(result[1].meetsRequirement).toBe(false); // 10 < 15
      expect(result[2].meetsRequirement).toBe(true);  // 15 >= 15
    });
  });
});
