import { Test } from '@nestjs/testing'
import { WeaponsService } from './weapons.service'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { WeaponItem } from './entities/weapon-item.entity'
import { WeaponAllocation } from './entities/weapon-allocation.entity'
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'
import { ExcelExportService } from '../common/services/excel-export.service'

const mockExcelService = {
  createWorkbook: jest.fn().mockReturnValue({ addWorksheet: jest.fn().mockReturnValue({ getCell: jest.fn().mockReturnValue({ note: '' }) }) }),
  addGovernmentHeader: jest.fn().mockReturnValue(8),
  addStyledTable: jest.fn(),
  addSummaryStatsTable: jest.fn(),
  addSignatureBlock: jest.fn(),
  addDocumentHash: jest.fn(),
  streamToResponse: jest.fn(),
}

describe('WeaponsService', () => {
  let service: WeaponsService
  let weaponRepo: jest.Mocked<any>
  let allocationRepo: jest.Mocked<any>
  let mockDataSource: jest.Mocked<any>

  beforeEach(async () => {
    weaponRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() }
    allocationRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() }
    mockDataSource = {
      query: jest.fn(),
      transaction: jest.fn((cb: (mgr: any) => Promise<any>) =>
        cb({ query: jest.fn().mockResolvedValue([]) })
      ),
    }
    const module = await Test.createTestingModule({
      providers: [
        WeaponsService,
        { provide: getRepositoryToken(WeaponItem), useValue: weaponRepo },
        { provide: getRepositoryToken(WeaponAllocation), useValue: allocationRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ExcelExportService, useValue: mockExcelService },
      ],
    }).compile()
    service = module.get(WeaponsService)
    jest.clearAllMocks()
  })

  describe('findOne', () => {
    it('returns weapon when found', async () => {
      weaponRepo.findOne.mockResolvedValue({ id: '1', status: 'active' })
      const result = await service.findOne('1')
      expect(result).toBeDefined()
    })
    it('throws NotFoundException when not found', async () => {
      weaponRepo.findOne.mockResolvedValue(null)
      await expect(service.findOne('1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('create', () => {
    it('creates weapon with unique serial', async () => {
      weaponRepo.findOne.mockResolvedValue(null) // no duplicate
      weaponRepo.create.mockReturnValue({ serialNumber: 'SN001' })
      weaponRepo.save.mockResolvedValue({ id: '1', serialNumber: 'SN001', status: 'active' })
      const result = await service.create({ serialNumber: 'SN001', type: 'rifle', acquiredAt: '2024-01-01', condition: 'good', storageLocation: 'Room A' })
      expect(result.status).toBe('active')
    })
    it('throws ConflictException on duplicate serial', async () => {
      weaponRepo.findOne.mockResolvedValue({ id: 'existing' })
      await expect(service.create({ serialNumber: 'SN001', type: 'rifle', acquiredAt: '2024-01-01', condition: 'good', storageLocation: 'Room A' })).rejects.toThrow(ConflictException)
    })
  })

  describe('returnAllocation', () => {
    it('throws BadRequestException when return date before issue date', async () => {
      allocationRepo.findOne.mockResolvedValue({ id: '1', issuedAt: new Date('2024-06-01'), returnedAt: null })
      await expect(service.returnAllocation('1', { returnedAt: '2024-01-01' })).rejects.toThrow(BadRequestException)
    })
    it('throws ConflictException when already returned', async () => {
      allocationRepo.findOne.mockResolvedValue({ id: '1', issuedAt: new Date('2024-01-01'), returnedAt: new Date() })
      await expect(service.returnAllocation('1', { returnedAt: '2024-06-01' })).rejects.toThrow(ConflictException)
    })
  })

  // ── getInventoryReport ───────────────────────────────────────────────────

  describe('getInventoryReport', () => {
    it('returns inventory rows from DB query', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'w-1', weaponType: 'AK-47', serialNumber: 'AK-001',
          condition: 'good', storageLocation: 'Kho A', acquiredAt: '2023-01-01',
          status: 'active', responsiblePersonName: 'Nguyễn A',
          currentHolder: null, issuedAt: null, returnedAt: null, overdue: false,
        },
        {
          id: 'w-2', weaponType: 'Súng lục', serialNumber: 'SL-001',
          condition: 'damaged', storageLocation: 'Kho B', acquiredAt: '2020-05-01',
          status: 'active', responsiblePersonName: null,
          currentHolder: 'Trần B', issuedAt: '2023-10-01', returnedAt: null, overdue: true,
        },
      ])

      const result = await service.getInventoryReport() as any[]

      expect(result).toHaveLength(2)
      expect(result[0].weaponType).toBe('AK-47')
      expect(result[1].overdue).toBe(true)

      const sql = mockDataSource.query.mock.calls[0][0] as string
      expect(sql).toContain('weapon_allocations')
      expect(sql).toContain('180 days')
    })

    it('returns empty array when no active weapons', async () => {
      mockDataSource.query.mockResolvedValueOnce([])
      const result = await service.getInventoryReport()
      expect(result).toEqual([])
    })
  })
})
