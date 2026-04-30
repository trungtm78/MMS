import { Test } from '@nestjs/testing'
import { WeaponsService } from './weapons.service'
import { getRepositoryToken } from '@nestjs/typeorm'
import { WeaponItem } from './entities/weapon-item.entity'
import { WeaponAllocation } from './entities/weapon-allocation.entity'
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'

describe('WeaponsService', () => {
  let service: WeaponsService
  let weaponRepo: jest.Mocked<any>
  let allocationRepo: jest.Mocked<any>

  beforeEach(async () => {
    weaponRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() }
    allocationRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() }
    const module = await Test.createTestingModule({
      providers: [
        WeaponsService,
        { provide: getRepositoryToken(WeaponItem), useValue: weaponRepo },
        { provide: getRepositoryToken(WeaponAllocation), useValue: allocationRepo },
      ],
    }).compile()
    service = module.get(WeaponsService)
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
})
