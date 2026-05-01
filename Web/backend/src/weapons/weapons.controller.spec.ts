import { Test, TestingModule } from '@nestjs/testing';
import { WeaponsController } from './weapons.controller';
import { WeaponsService } from './weapons.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException } from '@nestjs/common';

const mockWeaponsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  retire: jest.fn(),
  getAllocations: jest.fn(),
  createAllocation: jest.fn(),
  returnAllocation: jest.fn(),
};

describe('WeaponsController', () => {
  let controller: WeaponsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WeaponsController],
      providers: [{ provide: WeaponsService, useValue: mockWeaponsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WeaponsController>(WeaponsController);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all weapons', async () => {
      const weapons = [{ id: 'w1', serialNumber: 'SN001' }];
      mockWeaponsService.findAll.mockResolvedValueOnce(weapons);

      const result = await controller.findAll();

      expect(result).toEqual(weapons);
      expect(mockWeaponsService.findAll).toHaveBeenCalled();
    });

    it('returns empty array when no weapons', async () => {
      mockWeaponsService.findAll.mockResolvedValueOnce([]);

      const result = await controller.findAll();

      expect(result).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('returns single weapon by id', async () => {
      const weapon = { id: 'w1', serialNumber: 'SN001', status: 'available' };
      mockWeaponsService.findOne.mockResolvedValueOnce(weapon);

      const result = await controller.findOne('w1');

      expect(result).toEqual(weapon);
      expect(mockWeaponsService.findOne).toHaveBeenCalledWith('w1');
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockWeaponsService.findOne.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.findOne('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates and returns weapon', async () => {
      const dto = { serialNumber: 'SN002', weaponType: 'pistol', unitId: 'u1' };
      const created = { id: 'w-new', ...dto };
      mockWeaponsService.create.mockResolvedValueOnce(created);

      const result = await controller.create(dto as any);

      expect(result).toEqual(created);
      expect(mockWeaponsService.create).toHaveBeenCalledWith(dto);
    });

    it('propagates error on duplicate serial', async () => {
      mockWeaponsService.create.mockRejectedValueOnce(new Error('duplicate_serial'));

      await expect(controller.create({ serialNumber: 'SN001' } as any)).rejects.toThrow('duplicate_serial');
    });
  });

  describe('update', () => {
    it('updates and returns weapon', async () => {
      const updated = { id: 'w1', status: 'maintenance' };
      mockWeaponsService.update.mockResolvedValueOnce(updated);

      const result = await controller.update('w1', { status: 'maintenance' } as any);

      expect(result).toEqual(updated);
      expect(mockWeaponsService.update).toHaveBeenCalledWith('w1', { status: 'maintenance' });
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockWeaponsService.update.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.update('bad', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('retire', () => {
    it('retires weapon and returns void (204)', async () => {
      mockWeaponsService.retire.mockResolvedValueOnce(undefined);

      await expect(controller.retire('w1')).resolves.toBeUndefined();
      expect(mockWeaponsService.retire).toHaveBeenCalledWith('w1');
    });

    it('propagates NotFoundException for unknown weapon', async () => {
      mockWeaponsService.retire.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.retire('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllocations', () => {
    it('returns all allocations', async () => {
      const allocs = [{ id: 'a1', weaponId: 'w1', militiaId: 'mp-1' }];
      mockWeaponsService.getAllocations.mockResolvedValueOnce(allocs);

      const result = await controller.getAllocations();

      expect(result).toEqual(allocs);
    });
  });

  describe('createAllocation', () => {
    it('creates allocation and returns it', async () => {
      const dto = { weaponId: 'w1', militiaId: 'mp-1', allocatedDate: '2025-01-01' };
      const created = { id: 'a-new', ...dto };
      mockWeaponsService.createAllocation.mockResolvedValueOnce(created);

      const result = await controller.createAllocation(dto as any);

      expect(result).toEqual(created);
      expect(mockWeaponsService.createAllocation).toHaveBeenCalledWith(dto);
    });

    it('propagates error when weapon unavailable', async () => {
      mockWeaponsService.createAllocation.mockRejectedValueOnce(new Error('not_available'));

      await expect(controller.createAllocation({} as any)).rejects.toThrow('not_available');
    });
  });

  describe('returnAllocation', () => {
    it('records weapon return and returns result', async () => {
      const returned = { id: 'a1', returnedDate: '2025-03-01', status: 'returned' };
      mockWeaponsService.returnAllocation.mockResolvedValueOnce(returned);

      const result = await controller.returnAllocation('a1', { returnedDate: '2025-03-01' } as any);

      expect(result).toEqual(returned);
      expect(mockWeaponsService.returnAllocation).toHaveBeenCalledWith('a1', { returnedDate: '2025-03-01' });
    });

    it('propagates NotFoundException for unknown allocation', async () => {
      mockWeaponsService.returnAllocation.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.returnAllocation('bad', {} as any)).rejects.toThrow(NotFoundException);
    });
  });
});
