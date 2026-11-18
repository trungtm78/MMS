import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { MilitiaService } from './militia.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { FilesService } from '../files/files.service';

const mockDataSource = { query: jest.fn(), transaction: jest.fn() };
// The transaction's manager shares the query mock, so call order stays observable
mockDataSource.transaction.mockImplementation(
  (work: (manager: typeof mockDataSource) => Promise<unknown>) =>
    work(mockDataSource),
);
const mockFiles = { attach: jest.fn(), views: jest.fn() };
const mockAssignmentsService = { getAssignedDqtvIds: jest.fn() };
const mockExcelExportService = {
  createWorkbook: jest.fn().mockReturnValue({
    addWorksheet: jest.fn().mockReturnValue({
      columnCount: 19,
      getRow: jest.fn().mockReturnValue({
        getCell: jest.fn().mockReturnValue({
          value: '',
          font: {},
          fill: {},
          alignment: {},
          border: {},
          note: '',
        }),
        height: 0,
      }),
      getColumn: jest.fn().mockReturnValue({ key: '', width: 0 }),
      mergeCells: jest.fn(),
      views: [],
      autoFilter: null,
      lastRow: { number: 5 },
    }),
    creator: '',
    lastModifiedBy: '',
    created: new Date(),
    modified: new Date(),
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
const caOfficer = {
  role: 'ca_officer',
  unitScope: 'UNIT_001',
  sub: 'ca-user-1',
};

describe('MilitiaService', () => {
  let service: MilitiaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MilitiaService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AssignmentsService, useValue: mockAssignmentsService },
        { provide: ExcelExportService, useValue: mockExcelExportService },
        { provide: FilesService, useValue: mockFiles },
      ],
    }).compile();
    service = module.get<MilitiaService>(MilitiaService);
    jest.clearAllMocks();
    // Queued answers a failing test did not use must not reach the next test
    mockDataSource.query.mockReset();
    mockFiles.attach.mockReset();
    mockFiles.views.mockReset();
    mockExcelExportService.createWorkbook.mockReturnValue({
      addWorksheet: jest.fn().mockReturnValue({
        columnCount: 19,
        getRow: jest.fn().mockReturnValue({
          getCell: jest.fn().mockReturnValue({
            value: '',
            font: {},
            fill: {},
            alignment: {},
            border: {},
            note: '',
          }),
          height: 0,
        }),
        getColumn: jest.fn().mockReturnValue({ key: '', width: 0 }),
        mergeCells: jest.fn(),
        views: [],
        autoFilter: null,
        lastRow: { number: 5 },
      }),
      creator: '',
      lastModifiedBy: '',
      created: new Date(),
      modified: new Date(),
    });
    mockExcelExportService.addGovernmentHeader.mockReturnValue(8);
  });

  // The picker behind the web forms: it must not reveal members (names, phones)
  // outside what the caller may act on
  describe('search (picker)', () => {
    const row = {
      id: '1',
      militiaCode: 'DQTV001',
      fullName: 'Nguyen Van A',
      phone: null,
      rank: null,
      status: 'active',
      unitCode: 'UNIT_001',
      unitName: 'Khu phố 1',
    };
    const callsOf = () => mockDataSource.query.mock.calls as unknown[][];

    it('returns results for wide roles, narrowed to a requested unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([row]);

      const result = await service.search(
        systemAdmin,
        'Nguyen',
        'UNIT_001',
        10,
      );

      expect(result).toHaveLength(1);
      expect(result[0].fullName).toBe('Nguyen Van A');
      expect(callsOf()[0][1]).toEqual(['Nguyen', 'UNIT_001', null, 10]);
    });

    it('locks scoped callers to their own unit whatever they request', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.search(officeStaff, 'Nguyen', 'UNIT_999', 10);

      expect(callsOf()[0][1]).toEqual(['Nguyen', 'UNIT_001', null, 10]);
    });

    it('limits CA officers to the DQTV assigned to them', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([
        'u-1',
        'u-2',
      ]);
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.search(caOfficer, '', undefined, 20);

      expect(mockAssignmentsService.getAssignedDqtvIds).toHaveBeenCalledWith(
        'ca-user-1',
      );
      expect(String(callsOf()[0][0])).toMatch(
        /\$3::uuid\[\] IS NULL OR mp\.user_id = ANY\(\$3::uuid\[\]\)/,
      );
      expect(callsOf()[0][1]).toEqual(['', null, ['u-1', 'u-2'], 20]);
    });

    it('shows CA officers without assignments nobody', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([]);

      await expect(
        service.search(caOfficer, '', undefined, 20),
      ).resolves.toEqual([]);
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('refuses an area role without a unit scope', async () => {
      await expect(
        service.search({ role: 'police_area', unitScope: null }, 'Nguyen'),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('returns empty array when no match', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const result = await service.search(systemAdmin, 'zzz', undefined, 5);
      expect(result).toHaveLength(0);
    });
  });

  describe('searchMilitia (paginated)', () => {
    it('returns paginated results with total', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([
          {
            id: '1',
            militiaCode: 'DQTV001',
            fullName: 'Nguyen Van A',
            phone: null,
            rank: null,
            status: 'active',
            unitCode: 'UNIT_001',
            unitName: 'Khu phố 1',
          },
        ]);
      const result = await service.searchMilitia(systemAdmin, {
        q: 'Nguyen',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(10);
      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    // The list feeds the DQTV list (email column) and the Mẫu 01-BC roster (birth date,
    // gender, occupation and education columns)
    it('answers the contact and roster fields of each member', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);
      await service.searchMilitia(systemAdmin, { q: '', page: 1, limit: 20 });
      const sql = (
        mockDataSource.query.mock.calls as unknown[][]
      )[1][0] as string;
      expect(sql).toMatch(/mp\.email/);
      expect(sql).toMatch(/mp\.gender/);
      expect(sql).toMatch(/mp\.dob\s+AS "dateOfBirth"/);
      expect(sql).toMatch(/mp\.occupation/);
      expect(sql).toMatch(/mp\.education_level\s+AS "educationLevel"/);
    });

    it('answers the same fields to a CA officer listing their assigned members', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce(['u-1']);
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);
      await service.searchMilitia(caOfficer, { q: '', page: 1, limit: 20 });
      const sql = (
        mockDataSource.query.mock.calls as unknown[][]
      )[1][0] as string;
      expect(sql).toMatch(/mp\.email/);
      expect(sql).toMatch(/mp\.dob\s+AS "dateOfBirth"/);
      expect(sql).toMatch(/mp\.education_level\s+AS "educationLevel"/);
    });

    it('scopes search to unit for office_staff', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([]);
      await service.searchMilitia(officeStaff, { q: '', page: 1, limit: 20 });
      const params = (mockDataSource.query.mock.calls as unknown[][])[0][1];
      expect(params).toContain('UNIT_001');
    });

    it('limits max page size to 100', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);
      await service.searchMilitia(systemAdmin, { q: '', page: 1, limit: 999 });
      const params = (
        mockDataSource.query.mock.calls as unknown[][]
      )[1][1] as unknown[];
      expect(params[2]).toBe(100);
    });
  });

  describe('getMilitiaById', () => {
    const mockRow = {
      id: '1',
      userId: null,
      militiaCode: 'DQTV001',
      fullName: 'Nguyen Van A',
      phone: null,
      email: null,
      rank: null,
      status: 'active',
      avatarUrl: null,
      unitCode: 'UNIT_001',
      unitName: 'Khu phố 1',
      occupation: 'Kỹ sư',
      educationLevel: 'Đại học',
      healthStatus: 'good',
      bloodType: 'A+',
      permanentAddress: '123 Đường X',
      judicialClearanceStatus: 'clear',
    };

    it('returns militia member for system_admin', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockRow]);
      const result = await service.getMilitiaById(systemAdmin, '1');
      expect(result.id).toBe('1');
    });

    it('throws NotFoundException for unknown id', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(
        service.getMilitiaById(systemAdmin, 'unknown'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when office_staff accesses different unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { ...mockRow, unitCode: 'UNIT_999' },
      ]);
      await expect(service.getMilitiaById(officeStaff, '1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows office_staff to access their own unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockRow]);
      const result = await service.getMilitiaById(officeStaff, '1');
      expect(result.id).toBe('1');
    });
  });

  // ── Profile documents ─────────────────────────────────────────────────
  // GET /militia/:id/documents selected a url column files never had and a related_type the
  // files CHECK refused, so it always answered 500 (web agent T29). Migration 034.
  describe('profile documents', () => {
    const lookup = [{ userId: 'owner-user', unitCode: 'UNIT_001' }];
    const view = {
      id: 'f-1',
      url: '/api/v1/mms_core/files/f-1',
      name: 'Quyết định.pdf',
      mimeType: 'application/pdf',
      size: 120,
    };
    const staff = { ...officeStaff, sub: 'staff-1' };

    it('lists the files attached to the profile, newest first, as FileViews', async () => {
      const stored = [
        {
          id: 'f-1',
          name: 'Quyết định.pdf',
          mimeType: 'application/pdf',
          size: '120',
        },
      ];
      mockDataSource.query
        .mockResolvedValueOnce(lookup)
        .mockResolvedValueOnce(stored);
      mockFiles.views.mockReturnValueOnce([view]);

      await expect(service.getMilitiaDocuments(staff, 'mp-1')).resolves.toEqual(
        [view],
      );

      const [sql, params] = mockDataSource.query.mock.calls[1] as [
        string,
        unknown[],
      ];
      expect(sql).toMatch(
        /FROM files f\s+WHERE f\.related_type = 'militia_profile' AND f\.related_id = \$1/,
      );
      expect(sql).toMatch(/ORDER BY f\.created_at DESC, f\.id/);
      expect(sql).not.toMatch(/\burl\b/);
      expect(params).toEqual(['mp-1']);
      expect(mockFiles.views).toHaveBeenCalledWith(stored);
    });

    it('attaches the staff member uploads to a profile in their scope, in one transaction', async () => {
      mockDataSource.query.mockResolvedValueOnce(lookup);
      mockFiles.attach.mockResolvedValueOnce([view]);

      await expect(
        service.attachMilitiaDocuments(staff, 'mp-1', ['f-1']),
      ).resolves.toEqual([view]);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockFiles.attach).toHaveBeenCalledWith(mockDataSource, {
        ownerId: 'staff-1',
        fileIds: ['f-1'],
        relatedType: 'militia_profile',
        relatedId: 'mp-1',
      });
    });

    it('refuses a profile outside the staff scope before attaching anything', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { userId: 'owner-user', unitCode: 'UNIT_999' },
      ]);

      await expect(
        service.attachMilitiaDocuments(staff, 'mp-1', ['f-1']),
      ).rejects.toThrow(new ForbiddenException('unit_scope_violation'));
      expect(mockFiles.attach).not.toHaveBeenCalled();
    });

    // A member reads their own profile, and with it its documents, but never adds to it
    it('refuses members attaching documents, even to their own profile', async () => {
      await expect(
        service.attachMilitiaDocuments(
          { role: 'dqtv', unitScope: null, sub: 'owner-user' },
          'mp-1',
          ['f-1'],
        ),
      ).rejects.toThrow(new ForbiddenException('insufficient_role'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(mockFiles.attach).not.toHaveBeenCalled();
    });
  });

  // Profiles carry personal data (phone, health, address): DQTV members may read only
  // their own, CA officers those assigned to them, and staff those in their unit scope
  describe('profile access', () => {
    const profile = {
      id: 'mp-1',
      userId: 'owner-user',
      militiaCode: 'DQTV001',
      fullName: 'Nguyen Van A',
      phone: null,
      email: null,
      rank: null,
      status: 'active',
      avatarUrl: null,
      unitCode: 'UNIT_001',
      unitName: 'Khu phố 1',
      occupation: null,
      educationLevel: null,
      healthStatus: null,
      bloodType: null,
      permanentAddress: null,
      judicialClearanceStatus: null,
    };
    const lookup = { id: 'mp-1', userId: 'owner-user', unitCode: 'UNIT_001' };
    const dqtv = { role: 'dqtv', unitScope: null, sub: 'dqtv-user-1' };
    const areaWithoutScope = {
      role: 'police_area',
      unitScope: null,
      sub: 'area-1',
    };
    const subRecords = [
      'getMilitiaHistory',
      'getMilitiaRewards',
      'getMilitiaDocuments',
    ] as const;

    it('lets DQTV members read their own profile', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { ...profile, userId: dqtv.sub },
      ]);

      await expect(service.getMilitiaById(dqtv, 'mp-1')).resolves.toMatchObject(
        { id: 'mp-1' },
      );
    });

    it("hides other members' profiles from DQTV members", async () => {
      mockDataSource.query.mockResolvedValueOnce([profile]);

      await expect(service.getMilitiaById(dqtv, 'mp-1')).rejects.toThrow(
        new NotFoundException('militia_not_found'),
      );
    });

    it('refuses an area role without a unit scope', async () => {
      mockDataSource.query.mockResolvedValueOnce([profile]);

      await expect(
        service.getMilitiaById(areaWithoutScope, 'mp-1'),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
    });

    it('limits CA officers to the DQTV assigned to them', async () => {
      mockAssignmentsService.getAssignedDqtvIds
        .mockResolvedValueOnce(['owner-user'])
        .mockResolvedValueOnce(['owner-user']);
      mockDataSource.query
        .mockResolvedValueOnce([profile])
        .mockResolvedValueOnce([{ ...profile, userId: 'someone-else' }]);

      await expect(
        service.getMilitiaById(caOfficer, 'mp-1'),
      ).resolves.toMatchObject({ id: 'mp-1' });
      await expect(service.getMilitiaById(caOfficer, 'mp-1')).rejects.toThrow(
        new NotFoundException('militia_not_found'),
      );
    });

    it.each(subRecords)(
      '%s checks access before reading anything else',
      async (method) => {
        mockDataSource.query.mockResolvedValueOnce([
          { ...lookup, unitCode: 'UNIT_999' },
        ]);

        await expect(service[method](officeStaff, 'mp-1')).rejects.toThrow(
          new ForbiddenException('unit_scope_violation'),
        );
        expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      },
    );

    it.each(subRecords)(
      "%s hides other members' records from DQTV members",
      async (method) => {
        mockDataSource.query.mockResolvedValueOnce([lookup]);

        await expect(service[method](dqtv, 'mp-1')).rejects.toThrow(
          new NotFoundException('militia_not_found'),
        );
      },
    );

    it.each(subRecords)(
      '%s answers 404 for an unknown profile',
      async (method) => {
        mockDataSource.query.mockResolvedValueOnce([]);

        await expect(service[method](officeStaff, 'missing')).rejects.toThrow(
          new NotFoundException('militia_not_found'),
        );
      },
    );

    it('reads rewards once access is granted', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([lookup])
        .mockResolvedValueOnce([{ id: 'r1' }]);

      await expect(
        service.getMilitiaRewards(officeStaff, 'mp-1'),
      ).resolves.toEqual([{ id: 'r1' }]);
      expect((mockDataSource.query.mock.calls as unknown[][])[1][1]).toEqual([
        'mp-1',
      ]);
      const sql = String(
        (mockDataSource.query.mock.calls as unknown[][])[1][0],
      );
      expect(sql).toMatch(/FROM militia_rewards/);
      expect(sql).toMatch(/FROM reward_decisions/);
      expect(sql).toMatch(/FROM discipline_decisions/);
    });
  });

  describe('unit scope for lists and reports', () => {
    const areaWithoutScope = {
      role: 'police_area',
      unitScope: null,
      sub: 'area-1',
    };
    const wardOfficer = {
      role: 'police_ward',
      unitScope: 'UNIT_001',
      sub: 'ward-1',
    };
    const paramsOf = (call: number) =>
      (mockDataSource.query.mock.calls as unknown[][])[call][1] as unknown[];

    it('lets wide roles narrow the paginated list to a requested unit', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.searchMilitia(wardOfficer, { unitCode: 'UNIT_002' });

      expect(paramsOf(0)).toEqual(['', 'UNIT_002']);
    });

    it('refuses the paginated list to an area role without a unit scope', async () => {
      await expect(service.searchMilitia(areaWithoutScope, {})).rejects.toThrow(
        new ForbiddenException('no_unit_scope'),
      );
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('refuses CCCD lookup to an area role without a unit scope', async () => {
      process.env.AES_CCCD_KEY = 'deadbeef'.repeat(8);
      try {
        mockDataSource.query.mockResolvedValueOnce([
          { id: '1', unitCode: 'UNIT_001' },
        ]);

        await expect(
          service.searchByCccd(areaWithoutScope, '123456789012'),
        ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      } finally {
        delete process.env.AES_CCCD_KEY;
      }
    });

    it('lets wide roles export the roster of a requested unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.exportMilitiaRoster(wardOfficer as never, {
        unitCode: 'UNIT_002',
      });

      expect(paramsOf(0)).toEqual(['UNIT_002', null]);
    });

    // Decisions recorded through /rewards and /discipline appear in the profile tab and
    // the rewards report beside the older militia_rewards rows
    it('reports rewards and discipline decisions from every ledger', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.getRewardsReport(wardOfficer as never, {
        unitCode: 'UNIT_002',
      });

      const sql = String(
        (mockDataSource.query.mock.calls as unknown[][])[0][0],
      );
      expect(sql).toMatch(/FROM militia_rewards/);
      expect(sql).toMatch(/FROM reward_decisions/);
      expect(sql).toMatch(/FROM discipline_decisions/);
      expect(sql).toMatch(/mr\.status AS "status"/);
    });

    it('refuses the roster export and rewards report to an area role without a unit scope', async () => {
      await expect(
        service.exportMilitiaRoster(areaWithoutScope as never, {}),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      await expect(
        service.getRewardsReport(areaWithoutScope as never, {}),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('quickCreate', () => {
    it('throws BadRequestException for non-existent unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // unit not found
      await expect(
        service.quickCreate(systemAdmin, {
          militiaCode: 'DQTV999',
          fullName: 'Test',
          unitCode: 'INVALID',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for duplicate militia code', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'unit-1' }]) // unit found
        .mockResolvedValueOnce([{ id: 'existing' }]); // duplicate found
      await expect(
        service.quickCreate(systemAdmin, {
          militiaCode: 'DQTV001',
          fullName: 'Test',
          unitCode: 'UNIT_001',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores encrypted CCCD columns when AES_CCCD_KEY is set', async () => {
      const testKey = 'a'.repeat(64); // valid 64-char hex key
      process.env.AES_CCCD_KEY = testKey;
      try {
        const returnedRow = {
          id: 'new-1',
          militiaCode: 'DQTV002',
          fullName: 'Test User',
          phone: null,
          rank: null,
          status: 'active',
          unitCode: 'UNIT_001',
          unitName: 'Khu phố 1',
        };
        mockDataSource.query
          .mockResolvedValueOnce([{ id: 'unit-1' }]) // unit found
          .mockResolvedValueOnce([]) // no duplicate
          .mockResolvedValueOnce([{ id: 'new-1' }]) // INSERT RETURNING
          .mockResolvedValueOnce([returnedRow]); // search read-back

        await service.quickCreate(systemAdmin, {
          militiaCode: 'DQTV002',
          fullName: 'Test User',
          unitCode: 'UNIT_001',
        });

        // Third call is the INSERT — check that cccd_lookup_hash and cccd_encrypted params are set
        const insertParams = (
          mockDataSource.query.mock.calls as unknown[][]
        )[2][1] as unknown[];
        // $3 = cccdPlaintext (should be null when key is set)
        expect(insertParams[2]).toBeNull();
        // $4 = cccdLookupHash (should be a non-empty string)
        expect(typeof insertParams[3]).toBe('string');
        expect(insertParams[3]).toHaveLength(64); // HMAC-SHA256 hex = 64 chars
        // $5 = cccdEncrypted (should be a non-empty base64url string)
        expect(typeof insertParams[4]).toBe('string');
        expect((insertParams[4] as string).length).toBeGreaterThan(0);
      } finally {
        delete process.env.AES_CCCD_KEY;
      }
    });

    it('stores plaintext CCCD when AES_CCCD_KEY is not set', async () => {
      delete process.env.AES_CCCD_KEY;
      const returnedRow = {
        id: 'new-2',
        militiaCode: 'DQTV003',
        fullName: 'Test User2',
        phone: null,
        rank: null,
        status: 'active',
        unitCode: 'UNIT_001',
        unitName: 'Khu phố 1',
      };
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'unit-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'new-2' }])
        .mockResolvedValueOnce([returnedRow]);

      await service.quickCreate(systemAdmin, {
        militiaCode: 'DQTV003',
        fullName: 'Test User2',
        unitCode: 'UNIT_001',
        cccd: '123456789012',
      });

      const insertParams = (
        mockDataSource.query.mock.calls as unknown[][]
      )[2][1] as unknown[];
      // $3 = cccdPlaintext should be the actual value
      expect(insertParams[2]).toBe('123456789012');
      // $4 = cccdLookupHash should be null
      expect(insertParams[3]).toBeNull();
      // $5 = cccdEncrypted should be null
      expect(insertParams[4]).toBeNull();
    });

    it('refuses a unit outside the caller scope before touching the database', async () => {
      await expect(
        service.quickCreate(officeStaff, {
          militiaCode: 'DQTV010',
          fullName: 'Ngoài đơn vị',
          unitCode: 'UNIT_999',
        }),
      ).rejects.toThrow(new ForbiddenException('unit_scope_violation'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    // The picker search is scoped and fuzzy; the new row is read back by its id
    it('reads the created member back by id', async () => {
      const row = {
        id: 'new-3',
        militiaCode: 'DQTV011',
        fullName: 'Lê Văn F',
        phone: null,
        rank: null,
        status: 'active',
        unitCode: 'UNIT_001',
        unitName: 'Khu phố 1',
      };
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'unit-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'new-3' }])
        .mockResolvedValueOnce([row]);

      await expect(
        service.quickCreate(officeStaff, {
          militiaCode: 'DQTV011',
          fullName: 'Lê Văn F',
          unitCode: 'UNIT_001',
        }),
      ).resolves.toEqual(row);

      const [readSql, readParams] = (
        mockDataSource.query.mock.calls as unknown[][]
      )[3];
      expect(String(readSql)).toMatch(/WHERE mp\.id = \$1/);
      expect(readParams).toEqual(['new-3']);
    });

    it('maps a concurrent duplicate code to 400', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'unit-1' }])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce({
          code: '23505',
          constraint: 'militia_profiles_militia_code_key',
        });

      await expect(
        service.quickCreate(systemAdmin, {
          militiaCode: 'DQTV012',
          fullName: 'Trùng mã',
          unitCode: 'UNIT_001',
        }),
      ).rejects.toThrow(new BadRequestException('militia_code_duplicate'));
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
    const mockRow = {
      id: '1',
      militiaCode: 'DQTV001',
      fullName: 'Nguyen Van A',
      phone: null,
      rank: null,
      status: 'active',
      unitCode: 'UNIT_001',
      unitName: 'Khu phố 1',
    };

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

      const [sql, params] = (
        mockDataSource.query.mock.calls as unknown[][]
      )[0] as [string, unknown[]];
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
      mockDataSource.query.mockResolvedValueOnce([
        { ...mockRow, unitCode: 'UNIT_999' },
      ]);
      await expect(
        service.searchByCccd(
          { role: 'office_staff', unitScope: 'UNIT_001' },
          '123456789012',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns result when unit scope matches', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockRow]);
      const result = await service.searchByCccd(
        { role: 'office_staff', unitScope: 'UNIT_001' },
        '123456789012',
      );
      expect(result).not.toBeNull();
      expect(result!.unitCode).toBe('UNIT_001');
    });
  });

  // ── Data subject rights (NĐ 13/2023) ────────────────────────────────────

  describe('exportMyData', () => {
    it('returns full data bundle for existing user', async () => {
      const profileRow = {
        id: 'mp-1',
        militiaCode: 'DQTV001',
        fullName: 'Nguyen Van A',
        phone: null,
        email: null,
        rank: null,
        status: 'active',
        occupation: null,
        educationLevel: null,
        healthStatus: null,
        bloodType: null,
        permanentAddress: null,
        judicialClearanceStatus: null,
        unitCode: 'UNIT_001',
        unitName: 'Khu phố 1',
      };
      mockDataSource.query
        .mockResolvedValueOnce([profileRow]) // profile
        .mockResolvedValueOnce([{ id: 't1', trainingType: 'physical' }]) // training
        .mockResolvedValueOnce([{ id: 'a1', workDate: '2025-01-01' }]) // attendance
        .mockResolvedValueOnce([{ id: 'l1', leaveType: 'annual' }]) // leaveRequests
        .mockResolvedValueOnce([{ id: 'k1', score: 90 }]); // kpiScores

      const result = await service.exportMyData('user-1');

      expect(result.profile).toBeDefined();
      expect(result.exportedAt).toBeDefined();
      expect(Array.isArray(result.training)).toBe(true);
      expect(Array.isArray(result.attendance)).toBe(true);
      expect(result.note).toContain('180');

      // Every child query reads columns that exist in the migrated schema
      const [, trainingSql, attendanceSql, leaveSql, kpiSql] = (
        mockDataSource.query.mock.calls as unknown[][]
      ).map((call) => String(call[0]));
      expect(trainingSql).toMatch(/from_date AS "fromDate"/);
      expect(trainingSql).toMatch(/total_days AS "totalDays"/);
      expect(trainingSql).not.toMatch(/start_date|days_count/);
      expect(attendanceSql).toMatch(/checkin_at AS "checkinAt"/);
      expect(attendanceSql).not.toMatch(/check_in_time|check_out_time/);
      expect(leaveSql).toMatch(
        /JOIN leave_types lt ON lt\.id = lr\.leave_type_id/,
      );
      expect(leaveSql).not.toMatch(/start_date|end_date/);
      expect(kpiSql).toMatch(/total_score AS "totalScore"/);
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
      const [sql, params] = (
        mockDataSource.query.mock.calls as unknown[][]
      )[0] as [string, unknown[]];
      expect(sql).toContain('DATA_CORRECTION_REQUEST');
      expect(sql).toContain('audit_logs');
      const payload = JSON.parse(params[1] as string) as {
        field: string;
        requestedValue: string;
      };
      expect(payload.field).toBe('bloodType');
      expect(payload.requestedValue).toBe('B+');
    });
  });

  // ── updateMilitia ──────────────────────────────────────────────────────

  describe('updateMilitia', () => {
    const actor = { ...systemAdmin, sub: 'admin-1' };

    // Codex round 2: office staff of one unit could edit a profile of another unit
    it('limits the update to the caller unit within the same statement', async () => {
      mockDataSource.query.mockResolvedValueOnce([[{ id: 'mp-1' }], 1]);

      await service.updateMilitia(
        'mp-1',
        { phone: '0901' },
        { ...officeStaff, sub: 'staff-1' },
      );

      const [sql, params] = mockDataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toMatch(
        /UPDATE militia_profiles mp SET[\s\S]*FROM units u[\s\S]*u\.id = mp\.unit_id[\s\S]*\(\$\d+::text IS NULL OR u\.code = \$\d+\)/,
      );
      expect(sql).toMatch(/RETURNING mp\.id/);
      expect(params).toEqual(['0901', 'mp-1', 'UNIT_001']);
    });

    it('answers 404 for a profile outside the caller unit, as for a missing one', async () => {
      mockDataSource.query.mockResolvedValueOnce([[], 0]);

      await expect(
        service.updateMilitia(
          'mp-other-unit',
          { phone: '0901' },
          { ...officeStaff, sub: 'staff-1' },
        ),
      ).rejects.toThrow(new NotFoundException('militia_not_found'));
    });

    it('lets a ward-wide administrator update a profile of any unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([[{ id: 'mp-1' }], 1]);

      await service.updateMilitia('mp-1', { phone: '0901' }, actor);

      const [, params] = mockDataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(params).toEqual(['0901', 'mp-1', null]);
    });

    it('updates provided fields and returns updated row', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'mp-1',
          fullName: 'Nguyen Van B',
          phone: '0901234567',
          status: 'active',
          updatedAt: new Date().toISOString(),
        },
      ]);
      const result = await service.updateMilitia(
        'mp-1',
        { fullName: 'Nguyen Van B', phone: '0901234567' },
        actor,
      );
      expect(result['id']).toBe('mp-1');
      expect(result['fullName']).toBe('Nguyen Van B');
      const [sql, params] = (
        mockDataSource.query.mock.calls as unknown[][]
      )[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE militia_profiles mp SET');
      expect(sql).toContain('full_name');
      expect(sql).toContain('RETURNING');
      expect(params).toContain('Nguyen Van B');
      expect(params).toContain('mp-1');
    });

    it('throws BadRequestException when no fields provided', async () => {
      await expect(service.updateMilitia('mp-1', {}, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when id does not match any record', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(
        service.updateMilitia('bad-id', { rank: 'Trung sĩ' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps all supported fields to correct DB columns', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'mp-1',
          fullName: 'X',
          phone: null,
          status: 'active',
          updatedAt: '',
        },
      ]);
      await service.updateMilitia(
        'mp-1',
        {
          fullName: 'A',
          phone: '0901',
          address: 'Hanoi',
          position: 'P1',
          rank: 'R1',
          gender: 'male',
          dob: '1990-01-01',
          joinDate: '2020-01-01',
          emergencyContactName: 'B',
          emergencyContactPhone: '0902',
          emergencyContactRelationship: 'Sibling',
        },
        actor,
      );
      const [sql] = (mockDataSource.query.mock.calls as unknown[][])[0] as [
        string,
      ];
      [
        'full_name',
        'phone',
        'address',
        'position',
        'rank',
        'gender',
        'dob',
        'join_date',
        'emergency_contact_name',
        'emergency_contact_phone',
        'emergency_contact_relationship',
      ].forEach((col) => expect(sql).toContain(col));
    });
  });

  // ── deleteMilitia ─────────────────────────────────────────────────────

  describe('deleteMilitia', () => {
    const actor = { sub: 'admin-1' };

    it('sets status to inactive and returns void', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'mp-1' }]);
      await expect(
        service.deleteMilitia('mp-1', actor),
      ).resolves.toBeUndefined();
      const [sql, params] = (
        mockDataSource.query.mock.calls as unknown[][]
      )[0] as [string, unknown[]];
      expect(sql).toContain("status = 'inactive'");
      expect(params[0]).toBe('mp-1');
    });

    it('throws NotFoundException when militia not found or already inactive', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.deleteMilitia('bad-id', actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── CA assignment scope regression tests ──────────────────────────────

  describe('searchMilitia — CA assignment scope', () => {
    const militiaRow = {
      id: '1',
      militiaCode: 'DQTV001',
      fullName: 'Nguyen Van A',
      phone: null,
      rank: null,
      status: 'active',
      unitCode: 'UNIT_001',
      unitName: 'Khu phố 1',
    };

    it('CA with explicit assignments: returns only assigned DQTV', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([
        'user-1',
        'user-2',
      ]);
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '1' }]) // count
        .mockResolvedValueOnce([militiaRow]); // rows

      const result = await service.searchMilitia(caOfficer, {
        q: '',
        page: 1,
        limit: 20,
      });

      expect(mockAssignmentsService.getAssignedDqtvIds).toHaveBeenCalledWith(
        'ca-user-1',
      );
      expect(result.data).toHaveLength(1);
      // Verify the ANY($1) filter was used (first SQL param is the id array)
      const params = (
        mockDataSource.query.mock.calls as unknown[][]
      )[0][1] as unknown[];
      expect(params[0]).toEqual(['user-1', 'user-2']);
    });

    // Same rule as the picker, KPI and work reports: no assignment, no DQTV
    it('CA with ZERO assignments: sees nobody', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([]); // no assignments

      const result = await service.searchMilitia(caOfficer, {
        q: '',
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      expect(mockDataSource.query).not.toHaveBeenCalled();
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
