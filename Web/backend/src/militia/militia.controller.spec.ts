import { Test, TestingModule } from '@nestjs/testing';
import { MilitiaController } from './militia.controller';
import { MilitiaService } from './militia.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

const mockMilitiaService = {
  searchMilitia: jest.fn(),
  exportMyData: jest.fn(),
  requestDataCorrection: jest.fn(),
  search: jest.fn(),
  getMilitiaHistory: jest.fn(),
  getMilitiaRewards: jest.fn(),
  getMilitiaDocuments: jest.fn(),
  getMilitiaById: jest.fn(),
  quickCreate: jest.fn(),
  updateMilitia: jest.fn(),
  deleteMilitia: jest.fn(),
  exportMilitiaRoster: jest.fn(),
};

const mockExcelExportService = { streamToResponse: jest.fn() };

const sysAdmin = { sub: 'admin-1', username: 'admin', role: 'system_admin', unitScope: null };
const officeStaff = { sub: 'staff-1', username: 'staff1', role: 'office_staff', unitScope: 'UNIT_001' };

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

  describe('listMilitia', () => {
    it('delegates to searchMilitia with user scope', async () => {
      const paginated = { data: [], total: 0, page: 1, limit: 20 };
      mockMilitiaService.searchMilitia.mockResolvedValueOnce(paginated);

      const result = await controller.listMilitia({ user: sysAdmin }, undefined, undefined, 1, 20, undefined);

      expect(result).toEqual(paginated);
      expect(mockMilitiaService.searchMilitia).toHaveBeenCalledWith(
        { role: 'system_admin', unitScope: null, sub: 'admin-1' },
        { q: undefined, unitCode: undefined, page: 1, limit: 20, excludeAssignedTo: undefined },
      );
    });

    it('passes query params through to service', async () => {
      mockMilitiaService.searchMilitia.mockResolvedValueOnce({ data: [], total: 0, page: 2, limit: 10 });

      await controller.listMilitia({ user: officeStaff }, 'Nguyen', 'UNIT_001', 2, 10, 'ca-1');

      expect(mockMilitiaService.searchMilitia).toHaveBeenCalledWith(
        { role: 'office_staff', unitScope: 'UNIT_001', sub: 'staff-1' },
        { q: 'Nguyen', unitCode: 'UNIT_001', page: 2, limit: 10, excludeAssignedTo: 'ca-1' },
      );
    });
  });

  describe('exportMyData', () => {
    it('returns data bundle for calling user', async () => {
      const bundle = { profile: { id: 'mp-1' }, training: [], exportedAt: new Date().toISOString() };
      mockMilitiaService.exportMyData.mockResolvedValueOnce(bundle);

      const result = await controller.exportMyData({ user: sysAdmin });

      expect(result).toEqual(bundle);
      expect(mockMilitiaService.exportMyData).toHaveBeenCalledWith('admin-1');
    });
  });

  describe('requestDataCorrection', () => {
    it('delegates correction request to service', async () => {
      const dto = { field: 'bloodType', requestedValue: 'B+', reason: 'Wrong value' };
      mockMilitiaService.requestDataCorrection.mockResolvedValueOnce({ accepted: true });

      const result = await controller.requestDataCorrection({ user: sysAdmin }, dto as any);

      expect(result).toEqual({ accepted: true });
      expect(mockMilitiaService.requestDataCorrection).toHaveBeenCalledWith('admin-1', dto);
    });
  });

  describe('search', () => {
    it('returns search results from service', async () => {
      const rows = [{ id: '1', fullName: 'Nguyen Van A' }];
      mockMilitiaService.search.mockResolvedValueOnce(rows);

      const result = await controller.search({ q: 'Nguyen', limit: 10 } as any);

      expect(result).toEqual(rows);
      expect(mockMilitiaService.search).toHaveBeenCalledWith('Nguyen', undefined, 10);
    });

    it('uses defaults when query params omitted', async () => {
      mockMilitiaService.search.mockResolvedValueOnce([]);

      await controller.search({} as any);

      expect(mockMilitiaService.search).toHaveBeenCalledWith('', undefined, 20);
    });
  });

  describe('getMilitiaById', () => {
    it('returns militia member for valid id', async () => {
      const member = { id: 'mp-1', fullName: 'Nguyen Van A' };
      mockMilitiaService.getMilitiaById.mockResolvedValueOnce(member);

      const result = await controller.getMilitiaById({ user: sysAdmin }, 'mp-1');

      expect(result).toEqual(member);
      expect(mockMilitiaService.getMilitiaById).toHaveBeenCalledWith(sysAdmin, 'mp-1');
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockMilitiaService.getMilitiaById.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.getMilitiaById({ user: sysAdmin }, 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propagates ForbiddenException for out-of-scope unit', async () => {
      mockMilitiaService.getMilitiaById.mockRejectedValueOnce(new ForbiddenException());

      await expect(
        controller.getMilitiaById({ user: officeStaff }, 'mp-other-unit'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMilitiaHistory', () => {
    it('delegates to service and returns history', async () => {
      const history = [{ taskId: 't1', type: 'patrol' }];
      mockMilitiaService.getMilitiaHistory.mockResolvedValueOnce(history);

      const result = await controller.getMilitiaHistory('mp-1');

      expect(result).toEqual(history);
      expect(mockMilitiaService.getMilitiaHistory).toHaveBeenCalledWith('mp-1');
    });
  });

  describe('getMilitiaRewards', () => {
    it('delegates to service and returns rewards', async () => {
      const rewards = [{ id: 'r1', type: 'commendation' }];
      mockMilitiaService.getMilitiaRewards.mockResolvedValueOnce(rewards);

      const result = await controller.getMilitiaRewards('mp-1');

      expect(result).toEqual(rewards);
    });
  });

  describe('getMilitiaDocuments', () => {
    it('delegates to service and returns documents', async () => {
      const docs = [{ id: 'd1', name: 'cert.pdf' }];
      mockMilitiaService.getMilitiaDocuments.mockResolvedValueOnce(docs);

      const result = await controller.getMilitiaDocuments('mp-1');

      expect(result).toEqual(docs);
    });
  });

  describe('quickCreate', () => {
    const dto = { militiaCode: 'DQTV001', fullName: 'Nguyen Van A', unitCode: 'UNIT_001' };

    it('returns created militia member', async () => {
      const created = { id: 'mp-new', ...dto };
      mockMilitiaService.quickCreate.mockResolvedValueOnce(created);

      const result = await controller.quickCreate(dto as any);

      expect(result).toEqual(created);
      expect(mockMilitiaService.quickCreate).toHaveBeenCalledWith(dto);
    });

    it('propagates BadRequestException on duplicate code', async () => {
      mockMilitiaService.quickCreate.mockRejectedValueOnce(new BadRequestException('duplicate'));

      await expect(controller.quickCreate(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('propagates BadRequestException for invalid unit', async () => {
      mockMilitiaService.quickCreate.mockRejectedValueOnce(new BadRequestException('unit not found'));

      await expect(controller.quickCreate({ ...dto, unitCode: 'BAD' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateMilitia', () => {
    it('returns updated militia member', async () => {
      const updated = { id: 'mp-1', fullName: 'New Name' };
      mockMilitiaService.updateMilitia.mockResolvedValueOnce(updated);

      const result = await controller.updateMilitia('mp-1', { fullName: 'New Name' } as any, { user: sysAdmin });

      expect(result).toEqual(updated);
      expect(mockMilitiaService.updateMilitia).toHaveBeenCalledWith('mp-1', { fullName: 'New Name' }, sysAdmin);
    });

    it('propagates BadRequestException when no fields provided', async () => {
      mockMilitiaService.updateMilitia.mockRejectedValueOnce(new BadRequestException());

      await expect(controller.updateMilitia('mp-1', {} as any, { user: sysAdmin })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockMilitiaService.updateMilitia.mockRejectedValueOnce(new NotFoundException());

      await expect(
        controller.updateMilitia('bad-id', { rank: 'Trung sĩ' } as any, { user: sysAdmin }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMilitia', () => {
    it('soft-deletes and returns void', async () => {
      mockMilitiaService.deleteMilitia.mockResolvedValueOnce(undefined);

      await expect(controller.deleteMilitia('mp-1', { user: sysAdmin })).resolves.toBeUndefined();
      expect(mockMilitiaService.deleteMilitia).toHaveBeenCalledWith('mp-1', sysAdmin);
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockMilitiaService.deleteMilitia.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.deleteMilitia('bad-id', { user: sysAdmin })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
