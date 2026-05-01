import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { MilitiaService } from './militia.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ExcelExportService } from '../common/services/excel-export.service';

const mockDataSource = { query: jest.fn() };
const mockAssignmentsService = { getAssignedDqtvIds: jest.fn() };
const mockExcelExportService = {
  createWorkbook: jest.fn().mockReturnValue({
    addWorksheet: jest.fn().mockReturnValue({
      columnCount: 19,
      getRow: jest.fn().mockReturnValue({
        getCell: jest.fn().mockReturnValue({ value: '', font: {}, fill: {}, alignment: {}, border: {}, note: '' }),
        height: 0,
      }),
      getColumn: jest.fn().mockReturnValue({ key: '', width: 0 }),
      mergeCells: jest.fn(),
      views: [],
      autoFilter: null,
      lastRow: { number: 5 },
    }),
    creator: '', lastModifiedBy: '', created: new Date(), modified: new Date(),
  }),
  addGovernmentHeader: jest.fn().mockReturnValue(8),
  addStyledTable: jest.fn(),
  addSummaryStatsTable: jest.fn(),
  addSignatureBlock: jest.fn(),
  addDocumentHash: jest.fn(),
  streamToResponse: jest.fn(),
};

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
        { provide: ExcelExportService, useValue: mockExcelExportService },
      ],
    }).compile();
    service = module.get<MilitiaService>(MilitiaService);
    jest.clearAllMocks();
    mockExcelExportService.createWorkbook.mockReturnValue({
      addWorksheet: jest.fn().mockReturnValue({
        columnCount: 19,
        getRow: jest.fn().mockReturnValue({
          getCell: jest.fn().mockReturnValue({ value: '', font: {}, fill: {}, alignment: {}, border: {}, note: '' }),
          height: 0,
        }),
        getColumn: jest.fn().mockReturnValue({ key: '', width: 0 }),
        mergeCells: jest.fn(),
        views: [],
        autoFilter: null,
        lastRow: { number: 5 },
      }),
      creator: '', lastModifiedBy: '', created: new Date(), modified: new Date(),
    });
    mockExcelExportService.addGovernmentHeader.mockReturnValue(8);
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
    const mockRow = {
      id: '1', userId: null, militiaCode: 'DQTV001', fullName: 'Nguyen Van A',
      phone: null, email: null, rank: null, status: 'active', avatarUrl: null,
      unitCode: 'UNIT_001', unitName: 'Khu phố 1',
      occupation: 'Kỹ sư', educationLevel: 'Đại học', healthStatus: 'good',
      bloodType: 'A+', permanentAddress: '123 Đường X', judicialClearanceStatus: 'clear',
    };

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

    it('stores encrypted CCCD columns when AES_CCCD_KEY is set', async () => {
      const testKey = 'a'.repeat(64); // valid 64-char hex key
      process.env.AES_CCCD_KEY = testKey;
      try {
        const returnedRow = { id: 'new-1', militiaCode: 'DQTV002', fullName: 'Test User', phone: null, rank: null, status: 'active', unitCode: 'UNIT_001', unitName: 'Khu phố 1' };
        mockDataSource.query
          .mockResolvedValueOnce([{ id: 'unit-1' }])  // unit found
          .mockResolvedValueOnce([])                   // no duplicate
          .mockResolvedValueOnce([{ id: 'new-1' }])   // INSERT RETURNING
          .mockResolvedValueOnce([returnedRow]);        // search read-back

        await service.quickCreate({ militiaCode: 'DQTV002', fullName: 'Test User', unitCode: 'UNIT_001' });

        // Third call is the INSERT — check that cccd_lookup_hash and cccd_encrypted params are set
        const insertCall = mockDataSource.query.mock.calls[2];
        const insertParams = insertCall[1];
        // $3 = cccdPlaintext (should be null when key is set)
        expect(insertParams[2]).toBeNull();
        // $4 = cccdLookupHash (should be a non-empty string)
        expect(typeof insertParams[3]).toBe('string');
        expect(insertParams[3]).toHaveLength(64); // HMAC-SHA256 hex = 64 chars
        // $5 = cccdEncrypted (should be a non-empty base64url string)
        expect(typeof insertParams[4]).toBe('string');
        expect(insertParams[4].length).toBeGreaterThan(0);
      } finally {
        delete process.env.AES_CCCD_KEY;
      }
    });

    it('stores plaintext CCCD when AES_CCCD_KEY is not set', async () => {
      delete process.env.AES_CCCD_KEY;
      const returnedRow = { id: 'new-2', militiaCode: 'DQTV003', fullName: 'Test User2', phone: null, rank: null, status: 'active', unitCode: 'UNIT_001', unitName: 'Khu phố 1' };
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'unit-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'new-2' }])
        .mockResolvedValueOnce([returnedRow]);

      await service.quickCreate({ militiaCode: 'DQTV003', fullName: 'Test User2', unitCode: 'UNIT_001', cccd: '123456789012' });

      const insertParams = mockDataSource.query.mock.calls[2][1];
      // $3 = cccdPlaintext should be the actual value
      expect(insertParams[2]).toBe('123456789012');
      // $4 = cccdLookupHash should be null
      expect(insertParams[3]).toBeNull();
      // $5 = cccdEncrypted should be null
      expect(insertParams[4]).toBeNull();
    });
  });

  // ── CCCD encryption helpers ────────────────────────────────────────────

  describe('CCCD crypto helpers', () => {
    const TEST_KEY = 'deadbeef'.repeat(8); // 64-char hex = 32-byte key

    beforeEach(() => {
      process.env.AES_CCCD_KEY = TEST_KEY;
    });

    afterEach(() => {
      delete process.env.AES_CCCD_KEY;
    });

    it('encryptCccd produces a string different from the plaintext input', () => {
      const { encrypted } = service.encryptCccd('123456789012');
      expect(encrypted).not.toBe('123456789012');
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('decryptCccd round-trips correctly (decrypt(encrypt(x)) === x)', () => {
      const plaintext = '098765432100';
      const { encrypted } = service.encryptCccd(plaintext);
      const decrypted = service.decryptCccd(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('encryptCccd produces unique ciphertexts for the same input (random IV)', () => {
      const { encrypted: enc1 } = service.encryptCccd('123456789012');
      const { encrypted: enc2 } = service.encryptCccd('123456789012');
      expect(enc1).not.toBe(enc2); // different IVs → different ciphertexts
    });

    it('computeLookupHash is deterministic (same input → same hash)', () => {
      const h1 = service.computeLookupHash('123456789012');
      const h2 = service.computeLookupHash('123456789012');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64); // HMAC-SHA256 hex
    });

    it('computeLookupHash differs for different inputs', () => {
      const h1 = service.computeLookupHash('123456789012');
      const h2 = service.computeLookupHash('000000000000');
      expect(h1).not.toBe(h2);
    });

    it('lookupHash in encryptCccd matches computeLookupHash', () => {
      const plaintext = '111222333444';
      const { lookupHash } = service.encryptCccd(plaintext);
      const hash = service.computeLookupHash(plaintext);
      expect(lookupHash).toBe(hash);
    });
  });

  // ── searchByCccd ───────────────────────────────────────────────────────

  describe('searchByCccd', () => {
    const TEST_KEY = 'deadbeef'.repeat(8);
    const mockRow = { id: '1', militiaCode: 'DQTV001', fullName: 'Nguyen Van A', phone: null, rank: null, status: 'active', unitCode: 'UNIT_001', unitName: 'Khu phố 1' };

    beforeEach(() => {
      process.env.AES_CCCD_KEY = TEST_KEY;
    });

    afterEach(() => {
      delete process.env.AES_CCCD_KEY;
    });

    it('returns null when no record matches the lookup hash', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const result = await service.searchByCccd(systemAdmin, '123456789012');
      expect(result).toBeNull();
    });

    it('queries by lookup hash, not plaintext CCCD', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockRow]);
      const cccd = '123456789012';
      await service.searchByCccd(systemAdmin, cccd);

      const [sql, params] = mockDataSource.query.mock.calls[0];
      const expectedHash = service.computeLookupHash(cccd);
      // The query param should be the hash, not the plaintext
      expect(params[0]).toBe(expectedHash);
      expect(params[0]).not.toBe(cccd);
      expect(sql).toContain('cccd_lookup_hash');
    });

    it('returns the matched militia member for system_admin', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockRow]);
      const result = await service.searchByCccd(systemAdmin, '123456789012');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('1');
    });

    it('throws ForbiddenException when unit scope does not match', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ ...mockRow, unitCode: 'UNIT_999' }]);
      await expect(
        service.searchByCccd({ role: 'office_staff', unitScope: 'UNIT_001' }, '123456789012'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns result when unit scope matches', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockRow]);
      const result = await service.searchByCccd({ role: 'office_staff', unitScope: 'UNIT_001' }, '123456789012');
      expect(result).not.toBeNull();
      expect(result!.unitCode).toBe('UNIT_001');
    });
  });

  // ── Data subject rights (NĐ 13/2023) ────────────────────────────────────

  describe('exportMyData', () => {
    it('returns full data bundle for existing user', async () => {
      const profileRow = { id: 'mp-1', militiaCode: 'DQTV001', fullName: 'Nguyen Van A', phone: null, email: null, rank: null, status: 'active', occupation: null, educationLevel: null, healthStatus: null, bloodType: null, permanentAddress: null, judicialClearanceStatus: null, unitCode: 'UNIT_001', unitName: 'Khu phố 1' };
      mockDataSource.query
        .mockResolvedValueOnce([profileRow])  // profile
        .mockResolvedValueOnce([{ id: 't1', trainingType: 'physical' }])   // training
        .mockResolvedValueOnce([{ id: 'a1', workDate: '2025-01-01' }])     // attendance
        .mockResolvedValueOnce([{ id: 'l1', leaveType: 'annual' }])        // leaveRequests
        .mockResolvedValueOnce([{ id: 'k1', score: 90 }]);                 // kpiScores

      const result = await service.exportMyData('user-1');

      expect(result.profile).toBeDefined();
      expect(result.exportedAt).toBeDefined();
      expect(Array.isArray(result.training)).toBe(true);
      expect(Array.isArray(result.attendance)).toBe(true);
      expect(result.note).toContain('180');
    });

    it('returns empty bundle when user has no profile', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const result = await service.exportMyData('unknown-user');
      expect(result.profile).toBeNull();
      expect(result.training).toHaveLength(0);
    });
  });

  describe('requestDataCorrection', () => {
    it('inserts audit log with DATA_CORRECTION_REQUEST action', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const result = await service.requestDataCorrection('user-1', {
        field: 'bloodType',
        requestedValue: 'B+',
        reason: 'Incorrect value in system',
      });

      expect(result.accepted).toBe(true);
      const [sql, params] = mockDataSource.query.mock.calls[0];
      expect(sql).toContain('DATA_CORRECTION_REQUEST');
      expect(sql).toContain('audit_logs');
      const payload = JSON.parse(params[1]);
      expect(payload.field).toBe('bloodType');
      expect(payload.requestedValue).toBe('B+');
    });
  });

  // ── updateMilitia ──────────────────────────────────────────────────────

  describe('updateMilitia', () => {
    const actor = { sub: 'admin-1' };

    it('updates provided fields and returns updated row', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: 'mp-1', fullName: 'Nguyen Van B', phone: '0901234567', status: 'active', updatedAt: new Date().toISOString() },
      ]);
      const result = await service.updateMilitia('mp-1', { fullName: 'Nguyen Van B', phone: '0901234567' }, actor);
      expect(result['id']).toBe('mp-1');
      expect(result['fullName']).toBe('Nguyen Van B');
      const [sql, params] = mockDataSource.query.mock.calls[0];
      expect(sql).toContain('UPDATE militia_profiles SET');
      expect(sql).toContain('full_name');
      expect(sql).toContain('RETURNING');
      expect(params).toContain('Nguyen Van B');
      expect(params).toContain('mp-1');
    });

    it('throws BadRequestException when no fields provided', async () => {
      await expect(service.updateMilitia('mp-1', {}, actor)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when id does not match any record', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.updateMilitia('bad-id', { rank: 'Trung sĩ' }, actor)).rejects.toThrow(NotFoundException);
    });

    it('maps all supported fields to correct DB columns', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'mp-1', fullName: 'X', phone: null, status: 'active', updatedAt: '' }]);
      await service.updateMilitia('mp-1', {
        fullName: 'A', phone: '0901', address: 'Hanoi', position: 'P1', rank: 'R1',
        gender: 'male', dob: '1990-01-01', joinDate: '2020-01-01',
        emergencyContactName: 'B', emergencyContactPhone: '0902', emergencyContactRelationship: 'Sibling',
      }, actor);
      const [sql] = mockDataSource.query.mock.calls[0];
      ['full_name', 'phone', 'address', 'position', 'rank', 'gender', 'dob', 'join_date',
        'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
      ].forEach(col => expect(sql).toContain(col));
    });
  });

  // ── deleteMilitia ─────────────────────────────────────────────────────

  describe('deleteMilitia', () => {
    const actor = { sub: 'admin-1' };

    it('sets status to inactive and returns void', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'mp-1' }]);
      await expect(service.deleteMilitia('mp-1', actor)).resolves.toBeUndefined();
      const [sql, params] = mockDataSource.query.mock.calls[0];
      expect(sql).toContain("status = 'inactive'");
      expect(params[0]).toBe('mp-1');
    });

    it('throws NotFoundException when militia not found or already inactive', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.deleteMilitia('bad-id', actor)).rejects.toThrow(NotFoundException);
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
