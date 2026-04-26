import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { AssignmentsService } from '../assignments/assignments.service';

const mockDataSource = { query: jest.fn() };
const mockAssignmentsService = { getAssignedDqtvIds: jest.fn() };

const validDto = {
  targetUserId: 'user-target-1',
  criteria: ['Kỹ năng chuyên môn', 'Tinh thần trách nhiệm', 'Hiệu quả công tác', 'Chấm công', 'Thái độ tác phong'],
  scores: [8, 7, 9, 8, 9],
  recommendation: 'maintain',
  notes: 'Thực hiện nhiệm vụ tốt.',
};

const adminEvaluator = { sub: 'evaluator-1', role: 'system_admin' };
const caEvaluator = { sub: 'ca-user-1', role: 'ca_officer' };

describe('KpiService', () => {
  let service: KpiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KpiService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AssignmentsService, useValue: mockAssignmentsService },
      ],
    }).compile();
    service = module.get<KpiService>(KpiService);
    jest.clearAllMocks();
  });

  describe('submitEvaluation', () => {
    it('creates evaluation and returns weighted score', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'user-target-1' }]) // user exists
        .mockResolvedValueOnce([]) // no duplicate this month
        .mockResolvedValueOnce([{ id: 'eval-1' }]); // insert
      const result = await service.submitEvaluation(validDto, adminEvaluator);
      expect(result.id).toBe('eval-1');
      // weighted: 8*0.30 + 7*0.25 + 9*0.20 + 8*0.15 + 9*0.10 = 2.4+1.75+1.8+1.2+0.9 = 8.05
      expect(result.weightedScore).toBe(8.05);
      expect(result.recommendation).toBe('maintain');
    });

    it('calculates weighted score correctly for all-10 inputs', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'user-target-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'eval-2' }]);
      const result = await service.submitEvaluation(
        { ...validDto, scores: [10, 10, 10, 10, 10] },
        adminEvaluator,
      );
      expect(result.weightedScore).toBe(10);
    });

    it('throws NotFoundException when target user not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.submitEvaluation(validDto, adminEvaluator)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when already evaluated this month', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'user-target-1' }])
        .mockResolvedValueOnce([{ id: 'existing-eval' }]); // duplicate found
      await expect(service.submitEvaluation(validDto, adminEvaluator)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when scores count != 5', async () => {
      await expect(
        service.submitEvaluation({ ...validDto, scores: [8, 7, 9] }, adminEvaluator),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when score out of range', async () => {
      await expect(
        service.submitEvaluation({ ...validDto, scores: [8, 7, 11, 8, 9] }, adminEvaluator),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid recommendation', async () => {
      await expect(
        service.submitEvaluation({ ...validDto, recommendation: 'invalid' }, adminEvaluator),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── CA assignment scope regression tests ──────────────────────────────

  describe('submitEvaluation — CA scope enforcement', () => {
    it('CA evaluates assigned DQTV → success', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce(['user-target-1']);
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'user-target-1' }]) // user exists
        .mockResolvedValueOnce([])                          // no duplicate
        .mockResolvedValueOnce([{ id: 'eval-1' }]);         // insert

      const result = await service.submitEvaluation(validDto, caEvaluator);
      expect(result.id).toBe('eval-1');
    });

    it('CA evaluates non-assigned DQTV → ForbiddenException', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce(['other-user']);
      mockDataSource.query.mockResolvedValueOnce([{ id: 'user-target-1' }]); // user exists

      await expect(service.submitEvaluation(validDto, caEvaluator)).rejects.toThrow(ForbiddenException);
    });

    it('CA with zero assignments evaluates any DQTV → success (fallback)', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([]); // no assignments → fallback
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'user-target-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'eval-1' }]);

      const result = await service.submitEvaluation(validDto, caEvaluator);
      expect(result.id).toBe('eval-1');
    });
  });
});
