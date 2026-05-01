import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExemptionService } from './exemption.service';
import { Exemption } from './entities/exemption.entity';

const mockRepo = {
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  findOneOrFail: jest.fn(),
};

describe('ExemptionService', () => {
  let service: ExemptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExemptionService,
        { provide: getRepositoryToken(Exemption), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<ExemptionService>(ExemptionService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns array of exemptions', async () => {
      const exemptions = [
        { id: 'ex-1', militiaId: 'mp-1', type: 'exemption', status: 'active' },
        { id: 'ex-2', militiaId: 'mp-2', type: 'deferral', status: 'active' },
      ];
      mockRepo.find.mockResolvedValueOnce(exemptions);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(mockRepo.find).toHaveBeenCalled();
    });

    it('returns empty array when no exemptions exist', async () => {
      mockRepo.find.mockResolvedValueOnce([]);

      const result = await service.findAll();

      expect(result).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('creates and saves exemption entity', async () => {
      const dto: Partial<Exemption> = {
        militiaId: 'mp-1',
        type: 'exemption',
        reason: 'Health condition',
        legalBasis: 'NĐ 03/2016',
        effectiveDate: '2025-01-01',
        status: 'active',
      };
      const entity = { id: 'ex-new', ...dto };

      mockRepo.create.mockReturnValueOnce(entity);
      mockRepo.save.mockResolvedValueOnce(entity);

      const result = await service.create(dto);

      expect(result).toEqual(entity);
      expect(mockRepo.create).toHaveBeenCalledWith(dto);
      expect(mockRepo.save).toHaveBeenCalledWith(entity);
    });

    it('propagates error from repository save', async () => {
      mockRepo.create.mockReturnValueOnce({});
      mockRepo.save.mockRejectedValueOnce(new Error('db_error'));

      await expect(service.create({})).rejects.toThrow('db_error');
    });
  });

  describe('review', () => {
    it('updates exemption and returns updated record', async () => {
      const updated = {
        id: 'ex-1',
        militiaId: 'mp-1',
        type: 'exemption' as const,
        status: 'revoked' as const,
        reason: 'Health condition',
        legalBasis: 'NĐ 03/2016',
        effectiveDate: '2025-01-01',
        expiryDate: null,
        documents: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.update.mockResolvedValueOnce({ affected: 1 });
      mockRepo.findOneOrFail.mockResolvedValueOnce(updated);

      const result = await service.review('ex-1', { status: 'revoked' });

      expect(result).toEqual(updated);
      expect(mockRepo.update).toHaveBeenCalledWith('ex-1', { status: 'revoked' });
      expect(mockRepo.findOneOrFail).toHaveBeenCalledWith({ where: { id: 'ex-1' } });
    });

    it('propagates error when exemption not found', async () => {
      mockRepo.update.mockResolvedValueOnce({ affected: 0 });
      mockRepo.findOneOrFail.mockRejectedValueOnce(new Error('EntityNotFoundError'));

      await expect(service.review('bad-id', { status: 'revoked' })).rejects.toThrow('EntityNotFoundError');
    });

    it('updates and returns approved exemption', async () => {
      const approved = { id: 'ex-1', status: 'active' as const };
      mockRepo.update.mockResolvedValueOnce({ affected: 1 });
      mockRepo.findOneOrFail.mockResolvedValueOnce(approved as any);

      const result = await service.review('ex-1', { status: 'active' });

      expect(result.status).toBe('active');
    });
  });
});
