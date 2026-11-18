import { Test } from '@nestjs/testing';
import { ParseUUIDPipe } from '@nestjs/common';
import {
  GUARDS_METADATA,
  MODULE_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { WeaponInventoryController } from './weapon-inventory.controller';
import { WeaponInventoryService } from './weapon-inventory.service';
import { WeaponsController } from './weapons.controller';
import { WeaponsModule } from './weapons.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../auth/auth.service';

const mockInventory = {
  record: jest.fn(),
  list: jest.fn(),
  findOne: jest.fn(),
};

const user = {
  sub: 'u-1',
  role: 'office_staff',
  unitScope: null,
} as JwtPayload;
const req = { user, ip: '10.0.0.1', headers: { 'user-agent': 'jest' } };
const ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';

describe('WeaponInventoryController', () => {
  let controller: WeaponInventoryController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [WeaponInventoryController],
      providers: [{ provide: WeaponInventoryService, useValue: mockInventory }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(WeaponInventoryController);
    jest.resetAllMocks();
  });

  describe('access control', () => {
    it('requires authentication and the weapons roles on every route', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, WeaponInventoryController),
      ).toEqual([JwtAuthGuard, RolesGuard]);
      expect(Reflect.getMetadata(ROLES_KEY, WeaponInventoryController)).toEqual(
        Reflect.getMetadata(ROLES_KEY, WeaponsController),
      );
    });

    // Express matches routes in registration order: /weapons/inventory must not reach
    // WeaponsController's GET /weapons/:id
    it('is registered before the weapons controller', () => {
      const controllers = Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        WeaponsModule,
      ) as unknown[];
      expect(controllers.indexOf(WeaponInventoryController)).toBe(0);
      expect(controllers.indexOf(WeaponsController)).toBeGreaterThan(0);
    });

    it('parses the id of a check as a UUID', () => {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        WeaponInventoryController,
        'findOne',
      ) as Record<string, { pipes?: unknown[] }>;
      expect(
        Object.values(args).some((arg) => arg.pipes?.includes(ParseUUIDPipe)),
      ).toBe(true);
    });
  });

  it('records a check with where the request came from', async () => {
    mockInventory.record.mockResolvedValueOnce({ id: 'ic-1' });

    await expect(
      controller.record(req, { confirmedCount: 3, notes: 'Đủ' }),
    ).resolves.toEqual({ id: 'ic-1' });
    expect(mockInventory.record).toHaveBeenCalledWith(
      user,
      { confirmedCount: 3, notes: 'Đủ' },
      { ip: '10.0.0.1', userAgent: 'jest' },
    );
  });

  it('lists and reads checks', async () => {
    await controller.list({ from: '2026-01-01' });
    await controller.findOne(ID);

    expect(mockInventory.list).toHaveBeenCalledWith({ from: '2026-01-01' });
    expect(mockInventory.findOne).toHaveBeenCalledWith(ID);
  });
});
