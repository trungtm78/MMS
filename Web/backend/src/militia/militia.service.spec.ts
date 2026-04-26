import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { MilitiaService } from './militia.service';
import { AssignmentsService } from '../assignments/assignments.service';

const mockDataSource = { query: jest.fn() };
const mockAssignmentsService = { getAssignedDqtvIds: jest.fn() };

const systemAdmin = { role: 'system_admin', unitScope: null };
const officeStaff = { role: 'office_staff', unitScope: 'UNIT_001' };
const caOfficer = { role: 'ca_officer', unitScope: 'UNIT_001', sub: 'ca-user-1' };

describe('MilitiaService', () => {
  let service: MilitiaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MilitiaService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AssignmentsService, useValue: mockAssignmentsService },
      ],
    }).compile();
    service = module.get<MilitiaService>(MilitiaService);
    jest.clearAllMocks();
  });

  describe('search (existing)', () => {
    it('returns search results', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: '1', militiaCode: 'DQTV001', fullName: 'Nguyen Van A', phone: null, rank: null, status: 'active', unitCode: 'UNIT_001', unitName: 'Khu phố 1' },
      ]);
      const result = await service.search('Nguyen', 'UNIT_001', 10);
      expect(result).toHaveLength(1);
      expect(result[0].fullName).toBe('Nguyen Van A');
    });

    it('returns empty array when no match', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const result = await service.search('zzz', undefined, 5);
      expect(result).toHaveLength(0);
    });
  });

  describe('searchMilitia (paginated)', () => {
    it('returns paginated results with total', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([
          { id: '1', militiaCode: 'DQTV001', fullName: 'Nguyen Van A', phone: null, rank: null, status: 'active', unitCode: 'UNIT_001', unitName: 'Khu phố 1' },
        ]);
      const result = await service.searchMilitia(systemAdmin, { q: 'Nguyen', page: 1, limit: 20 });
      expect(result.total).toBe(10);
      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('scopes search to unit for office_staff', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([]);
      await service.searchMilitia(officeStaff, { q: '', page: 1, limit: 20 });
      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params).toContain('UNIT_001');
    });

    it('limits max page size to 100', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);
      await service.searchMilitia(systemAdmin, { q: '', page: 1, limit: 999 });
      const [, params] = mockDataSource.query.mock.calls[1];
      expect(params[2]).toBe(100);
    });
  });

  describe('getMilitiaById', () => {
    const mockRow = { id: '1', militiaCode: 'DQTV001', fullName: 'Nguyen Van A', phone: null, rank: null, status: 'active', unitCode: 'UNIT_001', unitName: 'Khu phố 1' };

    it('returns militia member for system_admin', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockRow]);
      const result = await service.getMilitiaById(systemAdmin, '1');
      expect(result.id).toBe('1');
    });

    it('throws NotFoundException for unknown id', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.getMilitiaById(systemAdmin, 'unknown')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when office_staff accesses different unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ ...mockRow, unitCode: 'UNIT_999' }]);
      await expect(service.getMilitiaById(officeStaff, '1')).rejects.toThrow(ForbiddenException);
    });

    it('allows office_staff to access their own unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockRow]);
      const result = await service.getMilitiaById(officeStaff, '1');
      expect(result.id).toBe('1');
    });
  });

  describe('quickCreate', () => {
    it('throws BadRequestException for non-existent unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // unit not found
      await expect(service.quickCreate({
        militiaCode: 'DQTV999',
        fullName: 'Test',
        unitCode: 'INVALID',
      })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for duplicate militia code', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'unit-1' }]) // unit found
        .mockResolvedValueOnce([{ id: 'existing' }]); // duplicate found
      await expect(service.quickCreate({
        militiaCode: 'DQTV001',
        fullName: 'Test',
        unitCode: 'UNIT_001',
      })).rejects.toThrow(BadRequestException);
    });
  });

  // ── CA assignment scope regression tests ──────────────────────────────

  describe('searchMilitia — CA assignment scope', () => {
    const militiaRow = { id: '1', militiaCode: 'DQTV001', fullName: 'Nguyen Van A', phone: null, rank: null, status: 'active', unitCode: 'UNIT_001', unitName: 'Khu phố 1' };

    it('CA with explicit assignments: returns only assigned DQTV', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce(['user-1', 'user-2']);
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '1' }]) // count
        .mockResolvedValueOnce([militiaRow]);     // rows

      const result = await service.searchMilitia(caOfficer, { q: '', page: 1, limit: 20 });

      expect(mockAssignmentsService.getAssignedDqtvIds).toHaveBeenCalledWith('ca-user-1');
      expect(result.data).toHaveLength(1);
      // Verify the ANY($1) filter was used (first SQL param is the id array)
      const [sql, params] = mockDataSource.query.mock.calls[0];
      expect(params[0]).toEqual(['user-1', 'user-2']);
    });

    it('CA with ZERO assignments: falls back to unitScope', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([]); // no assignments
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([militiaRow]);

      const result = await service.searchMilitia(caOfficer, { q: '', page: 1, limit: 20 });

      // Falls back to unitScope path — second call uses unitScope 'UNIT_001'
      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params).toContain('UNIT_001');
      expect(result.data).toHaveLength(1);
    });

    it('system_admin: returns all (assignment service not called)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([militiaRow]);

      await service.searchMilitia(systemAdmin, { q: '', page: 1, limit: 20 });
      expect(mockAssignmentsService.getAssignedDqtvIds).not.toHaveBeenCalled();
    });
  });
});
