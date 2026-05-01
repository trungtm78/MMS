import { Test, TestingModule } from '@nestjs/testing';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException } from '@nestjs/common';

const mockTrainingService = {
  listRecords: jest.fn(),
  getReport: jest.fn(),
  getRecord: jest.fn(),
  createRecord: jest.fn(),
  updateRecord: jest.fn(),
  deleteRecord: jest.fn(),
  getComplianceReport: jest.fn(),
  exportComplianceReport: jest.fn(),
};

const mockExcelExportService = {
  streamToResponse: jest.fn(),
  createWorkbook: jest.fn(),
};

const adminUser = { sub: 'admin-1', role: 'system_admin', unitScope: null };
const adminReq = { user: adminUser };

describe('TrainingController', () => {
  let controller: TrainingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingController],
      providers: [
        { provide: TrainingService, useValue: mockTrainingService },
        { provide: ExcelExportService, useValue: mockExcelExportService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TrainingController>(TrainingController);
    jest.clearAllMocks();
  });

  describe('listRecords', () => {
    it('returns paginated training records', async () => {
      const paginated = { data: [{ id: 'tr-1' }], total: 1 };
      mockTrainingService.listRecords.mockResolvedValueOnce(paginated);

      const result = await controller.listRecords(adminReq as any, undefined, 0, 1, 20);

      expect(result).toEqual(paginated);
      expect(mockTrainingService.listRecords).toHaveBeenCalledWith(adminUser, {
        militiaId: undefined,
        year: undefined,
        page: 1,
        limit: 20,
      });
    });

    it('filters by militiaId and year', async () => {
      mockTrainingService.listRecords.mockResolvedValueOnce({ data: [], total: 0 });

      await controller.listRecords(adminReq as any, 'mp-1', 2025, 1, 20);

      expect(mockTrainingService.listRecords).toHaveBeenCalledWith(adminUser, {
        militiaId: 'mp-1',
        year: 2025,
        page: 1,
        limit: 20,
      });
    });
  });

  describe('getReport', () => {
    it('returns yearly training report', async () => {
      const report = { year: 2025, totalHours: 240, completionRate: 0.85 };
      mockTrainingService.getReport.mockResolvedValueOnce(report);

      const result = await controller.getReport(adminReq as any, 2025, 'UNIT_001');

      expect(result).toEqual(report);
      expect(mockTrainingService.getReport).toHaveBeenCalledWith(adminUser, {
        year: 2025,
        unitCode: 'UNIT_001',
      });
    });
  });

  describe('getRecord', () => {
    it('returns single training record', async () => {
      const record = { id: 'tr-1', trainingType: 'physical' };
      mockTrainingService.getRecord.mockResolvedValueOnce(record);

      const result = await controller.getRecord(adminReq as any, 'tr-1');

      expect(result).toEqual(record);
    });

    it('propagates NotFoundException for unknown record', async () => {
      mockTrainingService.getRecord.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.getRecord(adminReq as any, 'bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createRecord', () => {
    it('creates training record and returns it', async () => {
      const dto = { militiaId: 'mp-1', trainingType: 'physical', hours: 8 };
      const created = { id: 'tr-new', ...dto };
      mockTrainingService.createRecord.mockResolvedValueOnce(created);

      const result = await controller.createRecord(adminReq as any, dto as any);

      expect(result).toEqual(created);
      expect(mockTrainingService.createRecord).toHaveBeenCalledWith(adminUser, dto);
    });

    it('propagates error from service', async () => {
      mockTrainingService.createRecord.mockRejectedValueOnce(new Error('militia_not_found'));

      await expect(controller.createRecord(adminReq as any, {} as any)).rejects.toThrow('militia_not_found');
    });
  });

  describe('updateRecord', () => {
    it('updates training record and returns result', async () => {
      const updated = { id: 'tr-1', hours: 16 };
      mockTrainingService.updateRecord.mockResolvedValueOnce(updated);

      const result = await controller.updateRecord(adminReq as any, 'tr-1', { hours: 16 } as any);

      expect(result).toEqual(updated);
    });
  });

  describe('deleteRecord', () => {
    it('deletes training record and returns void', async () => {
      mockTrainingService.deleteRecord.mockResolvedValueOnce(undefined);

      await expect(controller.deleteRecord(adminReq as any, 'tr-1')).resolves.toBeUndefined();
      expect(mockTrainingService.deleteRecord).toHaveBeenCalledWith(adminUser, 'tr-1');
    });
  });
});
