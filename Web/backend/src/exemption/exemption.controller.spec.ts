import { Test, TestingModule } from '@nestjs/testing';
import { ExemptionController } from './exemption.controller';
import { ExemptionService } from './exemption.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockExemptionService = {
  findAll: jest.fn(),
  create: jest.fn(),
  review: jest.fn(),
};

describe('ExemptionController', () => {
  let controller: ExemptionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExemptionController],
      providers: [{ provide: ExemptionService, useValue: mockExemptionService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExemptionController>(ExemptionController);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all exemptions', async () => {
      const exemptions = [{ id: 'ex-1', type: 'exemption', status: 'active' }];
      mockExemptionService.findAll.mockResolvedValueOnce(exemptions);

      const result = await controller.findAll();

      expect(result).toEqual(exemptions);
      expect(mockExemptionService.findAll).toHaveBeenCalled();
    });

    it('returns empty array when no exemptions', async () => {
      mockExemptionService.findAll.mockResolvedValueOnce([]);

      const result = await controller.findAll();

      expect(result).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('creates and returns exemption', async () => {
      const dto = { militiaId: 'mp-1', type: 'exemption', reason: 'Health', legalBasis: 'NĐ 03/2016' };
      const created = { id: 'ex-new', ...dto };
      mockExemptionService.create.mockResolvedValueOnce(created);

      const result = await controller.create(dto);

      expect(result).toEqual(created);
      expect(mockExemptionService.create).toHaveBeenCalledWith(dto);
    });

    it('propagates error from service', async () => {
      mockExemptionService.create.mockRejectedValueOnce(new Error('militia_not_found'));

      await expect(controller.create({})).rejects.toThrow('militia_not_found');
    });
  });

  describe('review', () => {
    it('updates and returns reviewed exemption', async () => {
      const updated = { id: 'ex-1', status: 'revoked' };
      mockExemptionService.review.mockResolvedValueOnce(updated);

      const result = await controller.review('ex-1', { status: 'revoked' });

      expect(result).toEqual(updated);
      expect(mockExemptionService.review).toHaveBeenCalledWith('ex-1', { status: 'revoked' });
    });

    it('propagates error for unknown exemption', async () => {
      mockExemptionService.review.mockRejectedValueOnce(new Error('not_found'));

      await expect(controller.review('bad', {})).rejects.toThrow('not_found');
    });
  });
});
