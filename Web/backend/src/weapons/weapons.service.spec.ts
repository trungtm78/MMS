import { Test } from '@nestjs/testing';
import { WeaponsService } from './weapons.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WeaponItem } from './entities/weapon-item.entity';
import { WeaponAllocation } from './entities/weapon-allocation.entity';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ExcelExportService } from '../common/services/excel-export.service';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';

const mockExcelService = {
  createWorkbook: jest.fn().mockReturnValue({
    addWorksheet: jest
      .fn()
      .mockReturnValue({ getCell: jest.fn().mockReturnValue({ note: '' }) }),
  }),
  addGovernmentHeader: jest.fn().mockReturnValue(8),
  addStyledTable: jest.fn(),
  addSummaryStatsTable: jest.fn(),
  addSignatureBlock: jest.fn(),
  addDocumentHash: jest.fn(),
  streamToResponse: jest.fn(),
};

describe('WeaponsService', () => {
  let service: WeaponsService;
  type RepoMock = {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let weaponRepo: RepoMock;
  let allocationRepo: RepoMock;
  let mockDataSource: { query: jest.Mock; transaction: jest.Mock };

  beforeEach(async () => {
    weaponRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    allocationRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    mockDataSource = {
      query: jest.fn(),
      transaction: jest.fn(
        (cb: (mgr: { query: jest.Mock }) => Promise<unknown>) =>
          cb({ query: jest.fn().mockResolvedValue([]) }),
      ),
    };
    const module = await Test.createTestingModule({
      providers: [
        WeaponsService,
        { provide: getRepositoryToken(WeaponItem), useValue: weaponRepo },
        {
          provide: getRepositoryToken(WeaponAllocation),
          useValue: allocationRepo,
        },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ExcelExportService, useValue: mockExcelService },
      ],
    }).compile();
    service = module.get(WeaponsService);
    jest.clearAllMocks();
  });

  describe('exportInventory', () => {
    useUtcServerClock(VN_1_OCTOBER_0130);

    it('stamps the inventory file with the Vietnamese date', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      allocationRepo.find.mockResolvedValueOnce([]);
      const res = {};

      await service.exportInventory(res as never);

      expect(mockExcelService.streamToResponse).toHaveBeenLastCalledWith(
        expect.anything(),
        res,
        'KiemKe_VuKhi_2026-10-01.xlsx',
      );
    });
  });

  // The web register named nobody: it read one GET /militia/:id per row
  describe('findAll', () => {
    it('lists active weapons with the name of the person responsible', async () => {
      const rows = [
        {
          id: 'w-1',
          type: 'AK-47',
          serialNumber: 'AK-001',
          responsiblePersonId: 'mp-1',
          responsiblePersonName: 'Nguyễn Văn An',
        },
      ];
      mockDataSource.query.mockResolvedValueOnce(rows);

      await expect(service.findAll()).resolves.toEqual(rows);

      const sql = String((mockDataSource.query.mock.calls[0] as unknown[])[0]);
      expect(sql).toMatch(
        /FROM weapons w\s+LEFT JOIN militia_profiles rp ON rp\.id = w\.responsible_person_id/,
      );
      expect(sql).toContain('rp.full_name AS "responsiblePersonName"');
      for (const column of [
        'w.serial_number AS "serialNumber"',
        'w.acquired_at AS "acquiredAt"',
        'w.storage_location AS "storageLocation"',
        'w.responsible_person_id AS "responsiblePersonId"',
        'w.created_at AS "createdAt"',
        'w.updated_at AS "updatedAt"',
      ]) {
        expect(sql).toContain(column);
      }
      expect(sql).toMatch(
        /WHERE w\.status = 'active'\s+ORDER BY w\.type, w\.serial_number/,
      );
      expect(weaponRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('getAllocations', () => {
    it('lists allocations newest first with the weapon and the recipient named', async () => {
      const rows = [
        {
          id: 'a-1',
          weaponId: 'w-1',
          weaponSerialNumber: 'AK-001',
          weaponType: 'AK-47',
          recipientId: 'mp-1',
          recipientName: 'Nguyễn Văn An',
          recipientCode: 'DQ-001',
        },
      ];
      mockDataSource.query.mockResolvedValueOnce(rows);

      await expect(service.getAllocations()).resolves.toEqual(rows);

      const sql = String((mockDataSource.query.mock.calls[0] as unknown[])[0]);
      expect(sql).toMatch(
        /FROM weapon_allocations wa\s+JOIN weapons w ON w\.id = wa\.weapon_id\s+JOIN militia_profiles mp ON mp\.id = wa\.recipient_id/,
      );
      for (const column of [
        'wa.weapon_id AS "weaponId"',
        'wa.recipient_id AS "recipientId"',
        'wa.issued_at AS "issuedAt"',
        'wa.returned_at AS "returnedAt"',
        'wa.created_at AS "createdAt"',
        'w.serial_number AS "weaponSerialNumber"',
        'w.type AS "weaponType"',
        'mp.full_name AS "recipientName"',
        'mp.militia_code AS "recipientCode"',
      ]) {
        expect(sql).toContain(column);
      }
      expect(sql).toMatch(/ORDER BY wa\.issued_at DESC, wa\.id/);
      expect(allocationRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns weapon when found', async () => {
      weaponRepo.findOne.mockResolvedValue({ id: '1', status: 'active' });
      const result = await service.findOne('1');
      expect(result).toBeDefined();
    });
    it('throws NotFoundException when not found', async () => {
      weaponRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates weapon with unique serial', async () => {
      weaponRepo.findOne.mockResolvedValue(null); // no duplicate
      weaponRepo.create.mockReturnValue({ serialNumber: 'SN001' });
      weaponRepo.save.mockResolvedValue({
        id: '1',
        serialNumber: 'SN001',
        status: 'active',
      });
      const result = await service.create({
        serialNumber: 'SN001',
        type: 'rifle',
        acquiredAt: '2024-01-01',
        condition: 'good',
        storageLocation: 'Room A',
      });
      expect(result.status).toBe('active');
    });
    it('throws ConflictException on duplicate serial', async () => {
      weaponRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create({
          serialNumber: 'SN001',
          type: 'rifle',
          acquiredAt: '2024-01-01',
          condition: 'good',
          storageLocation: 'Room A',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // Allocation reads and writes must use the transaction's connection: an insert on
  // another connection waits for the FOR UPDATE lock this transaction holds
  describe('createAllocation (transaction connection)', () => {
    const dto = {
      weaponId: 'w1',
      recipientId: 'mp-1',
      issuedAt: '2026-09-01',
      purpose: 'Tuần tra',
    };

    it('reads and saves the allocation through the transaction manager', async () => {
      const mgrRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((value: object) => value),
        save: jest.fn((value: object) =>
          Promise.resolve({ id: 'a1', ...value }),
        ),
      };
      const mgr = {
        query: jest.fn().mockResolvedValue([{ id: 'w1', status: 'active' }]),
        getRepository: jest.fn(() => mgrRepo),
      };
      mockDataSource.transaction.mockImplementationOnce(
        (cb: (m: typeof mgr) => Promise<unknown>) => cb(mgr),
      );

      await expect(
        service.createAllocation(dto as never),
      ).resolves.toMatchObject({ id: 'a1', weaponId: 'w1' });
      expect(mgr.getRepository).toHaveBeenCalledWith(WeaponAllocation);
      expect(allocationRepo.findOne).not.toHaveBeenCalled();
      expect(allocationRepo.save).not.toHaveBeenCalled();
    });

    it('refuses a weapon that already has an open allocation', async () => {
      const mgrRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'old' }),
        create: jest.fn(),
        save: jest.fn(),
      };
      const mgr = {
        query: jest.fn().mockResolvedValue([{ id: 'w1', status: 'active' }]),
        getRepository: jest.fn(() => mgrRepo),
      };
      mockDataSource.transaction.mockImplementationOnce(
        (cb: (m: typeof mgr) => Promise<unknown>) => cb(mgr),
      );

      await expect(service.createAllocation(dto as never)).rejects.toThrow(
        ConflictException,
      );
      expect(mgrRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('retire (transaction connection)', () => {
    it('checks open allocations through the transaction manager', async () => {
      const mgrRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const mgr = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'w1', status: 'active' }])
          .mockResolvedValueOnce([]),
        getRepository: jest.fn(() => mgrRepo),
      };
      mockDataSource.transaction.mockImplementationOnce(
        (cb: (m: typeof mgr) => Promise<unknown>) => cb(mgr),
      );

      await service.retire('w1');

      expect(mgr.getRepository).toHaveBeenCalledWith(WeaponAllocation);
      expect(mgrRepo.findOne).toHaveBeenCalled();
      expect(allocationRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('returnAllocation', () => {
    it('throws BadRequestException when return date before issue date', async () => {
      allocationRepo.findOne.mockResolvedValue({
        id: '1',
        issuedAt: new Date('2024-06-01'),
        returnedAt: null,
      });
      await expect(
        service.returnAllocation('1', { returnedAt: '2024-01-01' }),
      ).rejects.toThrow(BadRequestException);
    });
    it('throws ConflictException when already returned', async () => {
      allocationRepo.findOne.mockResolvedValue({
        id: '1',
        issuedAt: new Date('2024-01-01'),
        returnedAt: new Date(),
      });
      await expect(
        service.returnAllocation('1', { returnedAt: '2024-06-01' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── getInventoryReport ───────────────────────────────────────────────────

  describe('getInventoryReport', () => {
    it('returns inventory rows from DB query', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'w-1',
          weaponType: 'AK-47',
          serialNumber: 'AK-001',
          condition: 'good',
          storageLocation: 'Kho A',
          acquiredAt: '2023-01-01',
          status: 'active',
          responsiblePersonName: 'Nguyễn A',
          currentHolder: null,
          issuedAt: null,
          returnedAt: null,
          overdue: false,
        },
        {
          id: 'w-2',
          weaponType: 'Súng lục',
          serialNumber: 'SL-001',
          condition: 'damaged',
          storageLocation: 'Kho B',
          acquiredAt: '2020-05-01',
          status: 'active',
          responsiblePersonName: null,
          currentHolder: 'Trần B',
          issuedAt: '2023-10-01',
          returnedAt: null,
          overdue: true,
        },
      ]);

      const result = (await service.getInventoryReport()) as Record<
        string,
        unknown
      >[];

      expect(result).toHaveLength(2);
      expect(result[0].weaponType).toBe('AK-47');
      expect(result[1].overdue).toBe(true);

      const [sql] = mockDataSource.query.mock.calls[0] as [string];
      expect(sql).toContain('weapon_allocations');
      expect(sql).toContain('180 days');
    });

    it('returns empty array when no active weapons', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const result = await service.getInventoryReport();
      expect(result).toEqual([]);
    });
  });
});
