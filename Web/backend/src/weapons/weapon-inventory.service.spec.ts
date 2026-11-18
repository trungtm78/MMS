import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WeaponInventoryService } from './weapon-inventory.service';

const mockManager = { query: jest.fn() };
const mockDataSource = { query: jest.fn(), transaction: jest.fn() };

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];
const sqlOf = (mock: jest.Mock, call: number) => String(callsOf(mock)[call][0]);
const paramsOf = (mock: jest.Mock, call: number) =>
  callsOf(mock)[call][1] as unknown[];

const admin = { sub: 'admin-1', role: 'system_admin', unitScope: null };
const wardStaff = { sub: 'staff-1', role: 'office_staff', unitScope: null };
const unitStaff = { sub: 'staff-2', role: 'office_staff', unitScope: 'KV1' };
const origin = { ip: '10.0.0.9', userAgent: 'jest' };

const detail = { id: 'ic-1', expectedCount: 2, confirmedCount: 2, items: [] };

describe('WeaponInventoryService', () => {
  let service: WeaponInventoryService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WeaponInventoryService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get(WeaponInventoryService);
    jest.resetAllMocks();
    mockDataSource.transaction.mockImplementation(
      (work: (mgr: typeof mockManager) => unknown) => work(mockManager),
    );
  });

  describe('record', () => {
    const register = (ids = ['w1', 'w2']) =>
      mockManager.query.mockResolvedValueOnce(ids.map((id) => ({ id })));
    const saved = () =>
      mockManager.query
        .mockResolvedValueOnce([{ id: 'ic-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([detail]);

    it('locks the register, saves the count against it with a snapshot of every weapon, and audits it', async () => {
      register();
      saved();

      await expect(
        service.record(wardStaff, { confirmedCount: 2, notes: ' Đủ ' }, origin),
      ).resolves.toEqual(detail);

      expect(sqlOf(mockManager.query, 0)).toMatch(
        /FROM weapons w\s+WHERE w\.status = 'active'[\s\S]*FOR SHARE/,
      );

      expect(sqlOf(mockManager.query, 1)).toMatch(
        /INSERT INTO weapon_inventory_checks/,
      );
      expect(paramsOf(mockManager.query, 1)).toEqual(['staff-1', 2, 2, 'Đủ']);

      const snapshot = sqlOf(mockManager.query, 2);
      expect(snapshot).toMatch(/INSERT INTO weapon_inventory_items/);
      expect(snapshot).toMatch(
        /LEFT JOIN weapon_allocations wa ON wa\.weapon_id = w\.id AND wa\.returned_at IS NULL/,
      );
      // Exactly the weapons counted: none added by a concurrent request in between
      expect(snapshot).toMatch(/WHERE w\.id = ANY\(\$5::uuid\[\]\)/);
      expect(paramsOf(mockManager.query, 2)).toEqual([
        'ic-1',
        [],
        [],
        [],
        ['w1', 'w2'],
      ]);

      expect(sqlOf(mockManager.query, 3)).toMatch(/INSERT INTO audit_logs/);
      expect(paramsOf(mockManager.query, 3)).toEqual([
        'staff-1',
        'weapons.inventory_recorded',
        'weapon_inventory_checks',
        'ic-1',
        JSON.stringify({
          expectedCount: 2,
          confirmedCount: 2,
          discrepancy: 0,
          itemCount: 2,
          verifiedItems: 0,
        }),
        '10.0.0.9',
        'jest',
      ]);
      expect(paramsOf(mockManager.query, 4)).toEqual(['ic-1']);
    });

    it('records a shortfall as a negative discrepancy, with blank notes absent', async () => {
      register();
      saved();

      await service.record(admin, { confirmedCount: 1, notes: '   ' }, origin);

      expect(paramsOf(mockManager.query, 1)).toEqual(['admin-1', 2, 1, null]);
      expect(
        JSON.parse(paramsOf(mockManager.query, 3)[4] as string),
      ).toMatchObject({ discrepancy: -1 });
    });

    it('stores item-level results when every active weapon is accounted for', async () => {
      register();
      saved();

      await service.record(
        admin,
        {
          confirmedCount: 1,
          items: [
            { weaponId: 'w1', found: true, observedCondition: 'damaged' },
            { weaponId: 'w2', found: false },
          ],
        },
        origin,
      );

      expect(paramsOf(mockManager.query, 2)).toEqual([
        'ic-1',
        ['w1', 'w2'],
        [true, false],
        ['damaged', null],
        ['w1', 'w2'],
      ]);
    });

    it('answers 409 when an item names a weapon no longer active', async () => {
      register();

      await expect(
        service.record(
          admin,
          {
            confirmedCount: 2,
            items: [
              { weaponId: 'w1', found: true },
              { weaponId: 'w2', found: true },
              { weaponId: 'w9', found: true },
            ],
          },
          origin,
        ),
      ).rejects.toThrow(new ConflictException('inventory_register_changed'));
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it('answers 409 when the items miss a weapon added to the register', async () => {
      register(['w1', 'w2', 'w3']);

      await expect(
        service.record(
          admin,
          {
            confirmedCount: 2,
            items: [
              { weaponId: 'w1', found: true },
              { weaponId: 'w2', found: true },
            ],
          },
          origin,
        ),
      ).rejects.toThrow(new ConflictException('inventory_register_changed'));
    });

    it('refuses a count that disagrees with the weapons found', async () => {
      register();

      await expect(
        service.record(
          admin,
          {
            confirmedCount: 2,
            items: [
              { weaponId: 'w1', found: true },
              { weaponId: 'w2', found: false },
            ],
          },
          origin,
        ),
      ).rejects.toThrow(new BadRequestException('inventory_count_mismatch'));
    });

    it('refuses a condition observed on a weapon that was not found', async () => {
      await expect(
        service.record(
          admin,
          {
            confirmedCount: 0,
            items: [
              { weaponId: 'w1', found: false, observedCondition: 'good' },
            ],
          },
          origin,
        ),
      ).rejects.toThrow(
        new BadRequestException('observed_condition_without_found'),
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    // The armoury is the ward's: staff limited to one unit cannot certify it
    it('refuses staff limited to a unit', async () => {
      await expect(
        service.record(unitStaff, { confirmedCount: 2 }, origin),
      ).rejects.toThrow(new ForbiddenException('ward_scope_required'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('lists checks newest first within the date range', async () => {
      mockDataSource.query.mockResolvedValueOnce([detail]);

      await expect(
        service.list({ from: '2026-01-01', to: '2026-12-31' }),
      ).resolves.toEqual([detail]);

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toMatch(/FROM weapon_inventory_checks c/);
      expect(sql).toMatch(/ORDER BY c\.check_date DESC, c\.created_at DESC/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual([
        '2026-01-01',
        '2026-12-31',
      ]);
    });

    it('refuses a range that ends before it starts', async () => {
      await expect(
        service.list({ from: '2026-05-01', to: '2026-04-30' }),
      ).rejects.toThrow(new BadRequestException('invalid_date_range'));
    });
  });

  describe('findOne', () => {
    it('reads a check with its items', async () => {
      mockDataSource.query.mockResolvedValueOnce([detail]);

      await expect(service.findOne('ic-1')).resolves.toEqual(detail);
      expect(sqlOf(mockDataSource.query, 0)).toMatch(/AS items/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['ic-1']);
    });

    it('answers 404 for an unknown check', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.findOne('ic-9')).rejects.toThrow(
        new NotFoundException('inventory_check_not_found'),
      );
    });
  });
});
