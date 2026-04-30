import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { OrganizationUnit } from './entities/organization-unit.entity';

const mockUnit: Partial<OrganizationUnit> = {
  id: 'unit-1',
  name: 'Tiểu đội 1',
  type: 'tieu_doi',
  parentId: null,
  commanderId: null,
  capacity: 10,
  wardId: null,
  children: [],
};

const mockRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('OrganizationService', () => {
  let service: OrganizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: getRepositoryToken(OrganizationUnit), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<OrganizationService>(OrganizationService);
    jest.clearAllMocks();
  });

  describe('getStructure', () => {
    it('returns only root units (no parentId)', async () => {
      const root = { ...mockUnit, parentId: null };
      const child = { ...mockUnit, id: 'unit-2', parentId: 'unit-1' };
      mockRepo.find.mockResolvedValue([root, child]);
      const result = await service.getStructure();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('unit-1');
    });
  });

  describe('createUnit', () => {
    it('creates and saves a new unit', async () => {
      const dto = { type: 'tieu_doi' as const, name: 'Test Unit', capacity: 5 };
      mockRepo.create.mockReturnValue({ ...dto, id: 'new-id' });
      mockRepo.save.mockResolvedValue({ ...dto, id: 'new-id' });
      const result = await service.createUnit(dto);
      expect(mockRepo.create).toHaveBeenCalledWith(dto);
      expect(mockRepo.save).toHaveBeenCalled();
      expect(result.id).toBe('new-id');
    });
  });

  describe('getUnitById', () => {
    it('returns unit when found', async () => {
      mockRepo.findOne.mockResolvedValue(mockUnit);
      const result = await service.getUnitById('unit-1');
      expect(result).toEqual(mockUnit);
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'unit-1' },
        relations: ['children', 'parent'],
      });
    });

    it('throws NotFoundException when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.getUnitById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUnit', () => {
    it('updates unit fields and returns updated unit', async () => {
      const dto = { name: 'Updated Name' };
      const updatedUnit = { ...mockUnit, name: 'Updated Name' };
      mockRepo.findOne.mockResolvedValueOnce(mockUnit);
      mockRepo.save.mockResolvedValue(updatedUnit);
      const result = await service.updateUnit('unit-1', dto);
      expect(result.name).toBe('Updated Name');
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when unit not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.updateUnit('bad-id', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no fields provided', async () => {
      mockRepo.findOne.mockResolvedValue(mockUnit);
      await expect(service.updateUnit('unit-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteUnit', () => {
    it('deletes unit with no sub-units', async () => {
      const unitNoChildren = { ...mockUnit, children: [] };
      mockRepo.findOne.mockResolvedValue(unitNoChildren);
      mockRepo.remove.mockResolvedValue(undefined);
      await expect(service.deleteUnit('unit-1')).resolves.toBeUndefined();
      expect(mockRepo.remove).toHaveBeenCalledWith(unitNoChildren);
    });

    it('throws ConflictException when sub-units exist', async () => {
      const unitWithChildren = { ...mockUnit, children: [{ id: 'child-1' }] };
      mockRepo.findOne.mockResolvedValue(unitWithChildren);
      await expect(service.deleteUnit('unit-1')).rejects.toThrow(ConflictException);
      expect(mockRepo.remove).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when unit not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteUnit('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePosition', () => {
    it('updates position and returns updated record', async () => {
      const dto = { name: 'New Position Name' };
      const updated = { ...mockUnit, name: 'New Position Name' };
      mockRepo.update.mockResolvedValue({ affected: 1 });
      mockRepo.findOne.mockResolvedValue(updated);
      const result = await service.updatePosition('unit-1', dto);
      expect(mockRepo.update).toHaveBeenCalledWith('unit-1', dto);
      expect(result.name).toBe('New Position Name');
    });

    it('throws NotFoundException when position not found after update', async () => {
      mockRepo.update.mockResolvedValue({ affected: 0 });
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.updatePosition('bad-id', { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });
});
