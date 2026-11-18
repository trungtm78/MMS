import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AttachMilitiaDocumentsDto,
  MilitiaController,
} from './militia.controller';
import { MilitiaService } from './militia.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { IsoDatePipe } from '../common/pipes/query-pipes';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';

const mockMilitiaService = {
  searchMilitia: jest.fn(),
  exportMyData: jest.fn(),
  requestDataCorrection: jest.fn(),
  search: jest.fn(),
  getMilitiaHistory: jest.fn(),
  getMilitiaRewards: jest.fn(),
  getMilitiaDocuments: jest.fn(),
  attachMilitiaDocuments: jest.fn(),
  getMilitiaById: jest.fn(),
  quickCreate: jest.fn(),
  updateMilitia: jest.fn(),
  deleteMilitia: jest.fn(),
  exportMilitiaRoster: jest.fn(),
  getRewardsReport: jest.fn(),
  exportRewardsReport: jest.fn(),
};

const mockExcelExportService = { streamToResponse: jest.fn() };

// @Roles metadata of one route handler
const rolesOnHandler = (name: keyof MilitiaController): string[] =>
  Reflect.getMetadata(
    ROLES_KEY,
    Object.getOwnPropertyDescriptor(MilitiaController.prototype, name)
      ?.value as object,
  ) as string[];

// Pipes of each named @Query argument of one route handler
const queryPipes = (method: keyof MilitiaController) =>
  Object.fromEntries(
    Object.values(
      (Reflect.getMetadata(ROUTE_ARGS_METADATA, MilitiaController, method) ??
        {}) as Record<string, { data?: unknown; pipes?: unknown[] }>,
    )
      .filter((arg) => typeof arg.data === 'string')
      .map((arg) => [arg.data as string, arg.pipes ?? []]),
  ) as Record<string, unknown[]>;

const sysAdmin = {
  sub: 'admin-1',
  username: 'admin',
  role: 'system_admin',
  unitScope: null,
};
const officeStaff = {
  sub: 'staff-1',
  username: 'staff1',
  role: 'office_staff',
  unitScope: 'UNIT_001',
};

describe('MilitiaController', () => {
  let controller: MilitiaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MilitiaController],
      providers: [
        { provide: MilitiaService, useValue: mockMilitiaService },
        { provide: ExcelExportService, useValue: mockExcelExportService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MilitiaController>(MilitiaController);
    jest.clearAllMocks();
  });

  // T18 follow-up: the report date filters reached PostgreSQL unvalidated
  describe('rewards report filters', () => {
    const req = { user: officeStaff };

    it.each(['getRewardsReport', 'exportRewardsReport'] as const)(
      'validates the from and to dates of %s as calendar dates',
      (method) => {
        const pipes = queryPipes(method);
        expect(pipes.from).toContain(IsoDatePipe);
        expect(pipes.to).toContain(IsoDatePipe);
      },
    );

    it('refuses a report whose end falls before its start, without querying', async () => {
      await expect(
        controller.getRewardsReport(req, '2026-03-10', '2026-03-01'),
      ).rejects.toThrow(new BadRequestException('invalid_date_range'));
      expect(mockMilitiaService.getRewardsReport).not.toHaveBeenCalled();
    });

    it('refuses an export whose end falls before its start, without querying', async () => {
      await expect(
        controller.exportRewardsReport(
          req,
          '2026-03-10',
          '2026-03-01',
          undefined,
          undefined,
          {} as never,
        ),
      ).rejects.toThrow(new BadRequestException('invalid_date_range'));
      expect(mockMilitiaService.exportRewardsReport).not.toHaveBeenCalled();
    });

    it('passes a valid range and filters to the service', async () => {
      mockMilitiaService.getRewardsReport.mockResolvedValueOnce([]);

      await controller.getRewardsReport(
        req,
        '2026-03-01',
        '2026-03-10',
        'commendation',
        'UNIT_001',
      );

      expect(mockMilitiaService.getRewardsReport).toHaveBeenCalledWith(
        officeStaff,
        {
          from: '2026-03-01',
          to: '2026-03-10',
          type: 'commendation',
          unitCode: 'UNIT_001',
        },
      );
    });
  });

  describe('listMilitia', () => {
    it('delegates to searchMilitia with user scope', async () => {
      const paginated = { data: [], total: 0, page: 1, limit: 20 };
      mockMilitiaService.searchMilitia.mockResolvedValueOnce(paginated);

      const result = await controller.listMilitia(
        { user: sysAdmin },
        undefined,
        undefined,
        1,
        20,
        undefined,
      );

      expect(result).toEqual(paginated);
      // The whole caller, so every role it holds counts
      expect(mockMilitiaService.searchMilitia).toHaveBeenCalledWith(sysAdmin, {
        q: undefined,
        unitCode: undefined,
        page: 1,
        limit: 20,
        excludeAssignedTo: undefined,
      });
    });

    it('passes query params through to service', async () => {
      mockMilitiaService.searchMilitia.mockResolvedValueOnce({
        data: [],
        total: 0,
        page: 2,
        limit: 10,
      });

      await controller.listMilitia(
        { user: officeStaff },
        'Nguyen',
        'UNIT_001',
        2,
        10,
        'ca-1',
      );

      expect(mockMilitiaService.searchMilitia).toHaveBeenCalledWith(
        officeStaff,
        {
          q: 'Nguyen',
          unitCode: 'UNIT_001',
          page: 2,
          limit: 10,
          excludeAssignedTo: 'ca-1',
        },
      );
    });
  });

  describe('exportMilitiaRoster', () => {
    useUtcServerClock(VN_1_OCTOBER_0130);

    it('stamps the roster file with the Vietnamese date', async () => {
      const workbook = {};
      const res = {};
      mockMilitiaService.exportMilitiaRoster.mockResolvedValueOnce(workbook);

      await controller.exportMilitiaRoster({ user: sysAdmin }, res as never);

      expect(mockExcelExportService.streamToResponse).toHaveBeenCalledWith(
        workbook,
        res,
        'DanhSach_DQTV_ToanBo_2026-10-01.xlsx',
      );
    });
  });

  describe('exportMyData', () => {
    it('returns data bundle for calling user', async () => {
      const bundle = {
        profile: { id: 'mp-1' },
        training: [],
        exportedAt: new Date().toISOString(),
      };
      mockMilitiaService.exportMyData.mockResolvedValueOnce(bundle);

      const result = await controller.exportMyData({ user: sysAdmin });

      expect(result).toEqual(bundle);
      expect(mockMilitiaService.exportMyData).toHaveBeenCalledWith('admin-1');
    });
  });

  describe('requestDataCorrection', () => {
    it('delegates correction request to service', async () => {
      const dto = {
        field: 'bloodType',
        requestedValue: 'B+',
        reason: 'Wrong value',
      };
      mockMilitiaService.requestDataCorrection.mockResolvedValueOnce({
        accepted: true,
      });

      const result = await controller.requestDataCorrection(
        { user: sysAdmin },
        dto as never,
      );

      expect(result).toEqual({ accepted: true });
      expect(mockMilitiaService.requestDataCorrection).toHaveBeenCalledWith(
        'admin-1',
        dto,
      );
    });
  });

  describe('search', () => {
    it('passes the caller so the service can scope the results', async () => {
      const rows = [{ id: '1', fullName: 'Nguyen Van A' }];
      mockMilitiaService.search.mockResolvedValueOnce(rows);

      const result = await controller.search({ user: officeStaff }, {
        q: 'Nguyen',
        limit: 10,
      } as never);

      expect(result).toEqual(rows);
      expect(mockMilitiaService.search).toHaveBeenCalledWith(
        officeStaff,
        'Nguyen',
        undefined,
        10,
      );
    });

    it('uses defaults when query params omitted', async () => {
      mockMilitiaService.search.mockResolvedValueOnce([]);

      await controller.search({ user: sysAdmin }, {} as never);

      expect(mockMilitiaService.search).toHaveBeenCalledWith(
        sysAdmin,
        '',
        undefined,
        20,
      );
    });

    // Every web form that picks a member: attendance, task assignment, payroll KPI, exemptions
    it('is open to the roles that pick militia members, and not to DQTV members', () => {
      const roles = rolesOnHandler('search');

      expect([...roles].sort()).toEqual(
        [
          'ca_area',
          'ca_officer',
          'ca_ward',
          'office_staff',
          'police_area',
          'police_ward',
          'system_admin',
          'ubnd_leader',
        ].sort(),
      );
      expect(roles).not.toContain('dqtv');
      expect(roles).not.toContain('dqtv_member');
    });
  });

  describe('getMilitiaById', () => {
    it('returns militia member for valid id', async () => {
      const member = { id: 'mp-1', fullName: 'Nguyen Van A' };
      mockMilitiaService.getMilitiaById.mockResolvedValueOnce(member);

      const result = await controller.getMilitiaById(
        { user: sysAdmin },
        'mp-1',
      );

      expect(result).toEqual(member);
      expect(mockMilitiaService.getMilitiaById).toHaveBeenCalledWith(
        sysAdmin,
        'mp-1',
      );
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockMilitiaService.getMilitiaById.mockRejectedValueOnce(
        new NotFoundException(),
      );

      await expect(
        controller.getMilitiaById({ user: sysAdmin }, 'bad-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates ForbiddenException for out-of-scope unit', async () => {
      mockMilitiaService.getMilitiaById.mockRejectedValueOnce(
        new ForbiddenException(),
      );

      await expect(
        controller.getMilitiaById({ user: officeStaff }, 'mp-other-unit'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // The service checks the caller may read the profile before returning its records
  describe('getMilitiaHistory', () => {
    it('delegates to service and returns history', async () => {
      const history = [{ taskId: 't1', type: 'patrol' }];
      mockMilitiaService.getMilitiaHistory.mockResolvedValueOnce(history);

      const result = await controller.getMilitiaHistory(
        { user: officeStaff },
        'mp-1',
      );

      expect(result).toEqual(history);
      expect(mockMilitiaService.getMilitiaHistory).toHaveBeenCalledWith(
        officeStaff,
        'mp-1',
      );
    });
  });

  describe('getMilitiaRewards', () => {
    it('delegates to service and returns rewards', async () => {
      const rewards = [{ id: 'r1', type: 'commendation' }];
      mockMilitiaService.getMilitiaRewards.mockResolvedValueOnce(rewards);

      const result = await controller.getMilitiaRewards(
        { user: officeStaff },
        'mp-1',
      );

      expect(result).toEqual(rewards);
      expect(mockMilitiaService.getMilitiaRewards).toHaveBeenCalledWith(
        officeStaff,
        'mp-1',
      );
    });
  });

  describe('getMilitiaDocuments', () => {
    it('delegates to service and returns documents', async () => {
      const docs = [{ id: 'd1', name: 'cert.pdf' }];
      mockMilitiaService.getMilitiaDocuments.mockResolvedValueOnce(docs);

      const result = await controller.getMilitiaDocuments(
        { user: officeStaff },
        'mp-1',
      );

      expect(result).toEqual(docs);
      expect(mockMilitiaService.getMilitiaDocuments).toHaveBeenCalledWith(
        officeStaff,
        'mp-1',
      );
    });
  });

  // POST /militia/:id/documents — staff attach uploads (POST /files/upload) to a profile
  describe('attachMilitiaDocuments', () => {
    const PROFILE_ID = '5b0c3f7e-8f6a-4d52-9d8b-2f6f7a1c9e01';
    const FILE_ID = '0a3f6c1e-2b4d-4e8f-9a1b-3c5d7e9f1a2b';

    it('attaches the files as the caller and answers their views', async () => {
      const views = [{ id: FILE_ID }];
      mockMilitiaService.attachMilitiaDocuments.mockResolvedValueOnce(views);

      await expect(
        controller.attachMilitiaDocuments({ user: officeStaff }, PROFILE_ID, {
          fileIds: [FILE_ID],
        }),
      ).resolves.toEqual(views);
      expect(mockMilitiaService.attachMilitiaDocuments).toHaveBeenCalledWith(
        officeStaff,
        PROFILE_ID,
        [FILE_ID],
      );
    });

    it('parses the profile id as a UUID', () => {
      const args = Object.values(
        (Reflect.getMetadata(
          ROUTE_ARGS_METADATA,
          MilitiaController,
          'attachMilitiaDocuments',
        ) ?? {}) as Record<string, { pipes?: unknown[] }>,
      );
      expect(args.some((arg) => arg.pipes?.includes(ParseUUIDPipe))).toBe(true);
    });

    it.each([
      ['no files', { fileIds: [] }],
      ['a file id that is not a UUID', { fileIds: ['f-1'] }],
      ['the same file twice', { fileIds: [FILE_ID, FILE_ID] }],
      [
        'more than ten files',
        {
          fileIds: Array.from(
            { length: 11 },
            (_, i) =>
              `0a3f6c1e-2b4d-4e8f-9a1b-3c5d7e9f1a${String(i).padStart(2, '0')}`,
          ),
        },
      ],
      ['no fileIds', {}],
    ])('refuses a body with %s', async (_label, body) => {
      const errors = await validate(
        plainToInstance(AttachMilitiaDocumentsDto, body),
      );
      expect(errors.map((error) => error.property)).toEqual(['fileIds']);
    });

    it('accepts up to ten distinct file ids', async () => {
      await expect(
        validate(
          plainToInstance(AttachMilitiaDocumentsDto, { fileIds: [FILE_ID] }),
        ),
      ).resolves.toEqual([]);
    });
  });

  // DQTV members reach only the /me routes and their own profile; the roster is for staff
  describe('route roles', () => {
    const STAFF = [
      'ca_area',
      'ca_officer',
      'ca_ward',
      'office_staff',
      'police_area',
      'police_ward',
      'system_admin',
      'ubnd_leader',
    ];
    const rolesOf = (name: keyof MilitiaController) =>
      [...rolesOnHandler(name)].sort();

    it('keeps the paginated roster to staff', () => {
      expect(rolesOf('listMilitia')).toEqual(STAFF);
    });

    it('lets only staff attach documents to a profile', () => {
      expect(rolesOf('attachMilitiaDocuments')).toEqual(STAFF);
    });

    it('lets staff and DQTV members read a profile and its records, the service deciding which', () => {
      for (const name of [
        'getMilitiaById',
        'getMilitiaHistory',
        'getMilitiaRewards',
        'getMilitiaDocuments',
      ] as const) {
        expect(rolesOf(name)).toEqual([...STAFF, 'dqtv', 'dqtv_member'].sort());
      }
    });
  });

  describe('quickCreate', () => {
    const dto = {
      militiaCode: 'DQTV001',
      fullName: 'Nguyen Van A',
      unitCode: 'UNIT_001',
    };

    it('returns created militia member', async () => {
      const created = { id: 'mp-new', ...dto };
      mockMilitiaService.quickCreate.mockResolvedValueOnce(created);

      const result = await controller.quickCreate(
        { user: officeStaff },
        dto as never,
      );

      expect(result).toEqual(created);
      expect(mockMilitiaService.quickCreate).toHaveBeenCalledWith(
        officeStaff,
        dto,
      );
    });

    it('propagates BadRequestException on duplicate code', async () => {
      mockMilitiaService.quickCreate.mockRejectedValueOnce(
        new BadRequestException('duplicate'),
      );

      await expect(
        controller.quickCreate({ user: officeStaff }, dto as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates BadRequestException for invalid unit', async () => {
      mockMilitiaService.quickCreate.mockRejectedValueOnce(
        new BadRequestException('unit not found'),
      );

      await expect(
        controller.quickCreate({ user: officeStaff }, {
          ...dto,
          unitCode: 'BAD',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateMilitia', () => {
    it('returns updated militia member', async () => {
      const updated = { id: 'mp-1', fullName: 'New Name' };
      mockMilitiaService.updateMilitia.mockResolvedValueOnce(updated);

      const result = await controller.updateMilitia(
        'mp-1',
        { fullName: 'New Name' },
        { user: sysAdmin },
      );

      expect(result).toEqual(updated);
      expect(mockMilitiaService.updateMilitia).toHaveBeenCalledWith(
        'mp-1',
        { fullName: 'New Name' },
        sysAdmin,
      );
    });

    it('propagates BadRequestException when no fields provided', async () => {
      mockMilitiaService.updateMilitia.mockRejectedValueOnce(
        new BadRequestException(),
      );

      await expect(
        controller.updateMilitia('mp-1', {}, { user: sysAdmin }),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockMilitiaService.updateMilitia.mockRejectedValueOnce(
        new NotFoundException(),
      );

      await expect(
        controller.updateMilitia(
          'bad-id',
          { rank: 'Trung sĩ' },
          {
            user: sysAdmin,
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMilitia', () => {
    it('soft-deletes and returns void', async () => {
      mockMilitiaService.deleteMilitia.mockResolvedValueOnce(undefined);

      await expect(
        controller.deleteMilitia('mp-1', { user: sysAdmin }),
      ).resolves.toBeUndefined();
      expect(mockMilitiaService.deleteMilitia).toHaveBeenCalledWith(
        'mp-1',
        sysAdmin,
      );
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockMilitiaService.deleteMilitia.mockRejectedValueOnce(
        new NotFoundException(),
      );

      await expect(
        controller.deleteMilitia('bad-id', { user: sysAdmin }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
