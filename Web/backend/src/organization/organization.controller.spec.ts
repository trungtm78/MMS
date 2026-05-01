import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException } from '@nestjs/common';

const mockOrganizationService = {
  getStructure: jest.fn(),
  createUnit: jest.fn(),
  getUnitById: jest.fn(),
  updateUnit: jest.fn(),
  deleteUnit: jest.fn(),
  updatePosition: jest.fn(),
};

describe('OrganizationController', () => {
  let controller: OrganizationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationController],
      providers: [{ provide: OrganizationService, useValue: mockOrganizationService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationController>(OrganizationController);
    jest.clearAllMocks();
  });

  describe('getStructure', () => {
    it('returns org structure tree', async () => {
      const structure = [{ id: 'unit-1', name: 'Khu phố 1', children: [] }];
      mockOrganizationService.getStructure.mockResolvedValueOnce(structure);

      const result = await controller.getStructure();

      expect(result).toEqual(structure);
      expect(mockOrganizationService.getStructure).toHaveBeenCalled();
    });

    it('returns empty array when no units', async () => {
      mockOrganizationService.getStructure.mockResolvedValueOnce([]);

      const result = await controller.getStructure();

      expect(result).toHaveLength(0);
    });
  });

  describe('createUnit', () => {
    it('creates and returns unit', async () => {
      const dto = { unitCode: 'UNIT_002', name: 'Khu phố 2', unitType: 'ward' };
      const created = { id: 'unit-new', ...dto };
      mockOrganizationService.createUnit.mockResolvedValueOnce(created);

      const result = await controller.createUnit(dto as any);

      expect(result).toEqual(created);
      expect(mockOrganizationService.createUnit).toHaveBeenCalledWith(dto);
    });

    it('propagates error on duplicate unit code', async () => {
      mockOrganizationService.createUnit.mockRejectedValueOnce(new Error('duplicate_code'));

      await expect(controller.createUnit({} as any)).rejects.toThrow('duplicate_code');
    });
  });

  describe('getUnit', () => {
    it('returns unit by id', async () => {
      const unit = { id: 'unit-1', unitCode: 'UNIT_001', name: 'Khu phố 1' };
      mockOrganizationService.getUnitById.mockResolvedValueOnce(unit);

      const result = await controller.getUnit('unit-1');

      expect(result).toEqual(unit);
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockOrganizationService.getUnitById.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.getUnit('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUnit', () => {
    it('updates and returns unit', async () => {
      const updated = { id: 'unit-1', name: 'New Name' };
      mockOrganizationService.updateUnit.mockResolvedValueOnce(updated);

      const result = await controller.updateUnit('unit-1', { name: 'New Name' } as any);

      expect(result).toEqual(updated);
      expect(mockOrganizationService.updateUnit).toHaveBeenCalledWith('unit-1', { name: 'New Name' });
    });

    it('propagates NotFoundException', async () => {
      mockOrganizationService.updateUnit.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.updateUnit('bad', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteUnit', () => {
    it('deletes unit and returns void', async () => {
      mockOrganizationService.deleteUnit.mockResolvedValueOnce(undefined);

      await expect(controller.deleteUnit('unit-1')).resolves.toBeUndefined();
      expect(mockOrganizationService.deleteUnit).toHaveBeenCalledWith('unit-1');
    });

    it('propagates NotFoundException for unknown unit', async () => {
      mockOrganizationService.deleteUnit.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.deleteUnit('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePosition', () => {
    it('updates position and returns result', async () => {
      const updated = { id: 'pos-1', title: 'Commander' };
      mockOrganizationService.updatePosition.mockResolvedValueOnce(updated);

      const result = await controller.updatePosition('pos-1', { title: 'Commander' } as any);

      expect(result).toEqual(updated);
      expect(mockOrganizationService.updatePosition).toHaveBeenCalledWith('pos-1', { title: 'Commander' });
    });

    it('propagates NotFoundException for unknown position', async () => {
      mockOrganizationService.updatePosition.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.updatePosition('bad', {} as any)).rejects.toThrow(NotFoundException);
    });
  });
});
