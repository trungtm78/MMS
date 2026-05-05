import { Test, TestingModule } from '@nestjs/testing';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockKpiService = {
  submitEvaluation: jest.fn(),
  getCurrentScore: jest.fn(),
  getHistory: jest.fn(),
};

const caReq = { user: { sub: 'ca-1', username: 'ca_user', role: 'ca_officer', unitScope: null } };
const dqtvReq = { user: { sub: 'dqtv-1', username: 'dqtv_user', role: 'dqtv_member', unitScope: null } };

describe('KpiController', () => {
  let controller: KpiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KpiController],
      providers: [{ provide: KpiService, useValue: mockKpiService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<KpiController>(KpiController);
    jest.clearAllMocks();
  });

  describe('evaluate', () => {
    const dto = {
      targetUserId: 'dqtv-1',
      criteria: ['a', 'b', 'c', 'd', 'e'],
      scores: [8, 7, 9, 6, 8],
      recommendation: 'reward',
    };

    it('submits evaluation and returns result', async () => {
      const result = { id: 'eval-1', totalScore: 7.6 };
      mockKpiService.submitEvaluation.mockResolvedValueOnce(result);

      const response = await controller.evaluate(dto as any, caReq);

      expect(response).toEqual(result);
      expect(mockKpiService.submitEvaluation).toHaveBeenCalledWith(dto, { sub: 'ca-1', role: 'ca_officer' });
    });

    it('propagates error from service', async () => {
      mockKpiService.submitEvaluation.mockRejectedValueOnce(new Error('target_not_found'));

      await expect(controller.evaluate(dto as any, caReq)).rejects.toThrow('target_not_found');
    });
  });

  describe('getCurrent', () => {
    it('returns current score for calling user when userId not provided', async () => {
      const score = { userId: 'dqtv-1', score: 82, month: 1, year: 2025 };
      mockKpiService.getCurrentScore.mockResolvedValueOnce(score);

      const result = await controller.getCurrent(dqtvReq, undefined, 0, 0);

      expect(result).toEqual(score);
      expect(mockKpiService.getCurrentScore).toHaveBeenCalledWith('dqtv-1', undefined, undefined);
    });

    it('returns score for specified userId (admin view)', async () => {
      const score = { userId: 'other-1', score: 75 };
      mockKpiService.getCurrentScore.mockResolvedValueOnce(score);

      const result = await controller.getCurrent(caReq, 'other-1', 2, 2025);

      expect(result).toEqual(score);
      expect(mockKpiService.getCurrentScore).toHaveBeenCalledWith('other-1', 2, 2025);
    });

    it('uses undefined for month/year when zero', async () => {
      mockKpiService.getCurrentScore.mockResolvedValueOnce({});

      await controller.getCurrent(dqtvReq, undefined, 0, 0);

      expect(mockKpiService.getCurrentScore).toHaveBeenCalledWith('dqtv-1', undefined, undefined);
    });
  });

  describe('getHistory', () => {
    it('returns history for calling user', async () => {
      const history = [{ month: 1, year: 2025, score: 80 }];
      mockKpiService.getHistory.mockResolvedValueOnce(history);

      const result = await controller.getHistory(dqtvReq, undefined);

      expect(result).toEqual(history);
      expect(mockKpiService.getHistory).toHaveBeenCalledWith('dqtv-1');
    });

    it('returns history for specified userId', async () => {
      const history = [{ month: 12, year: 2024, score: 90 }];
      mockKpiService.getHistory.mockResolvedValueOnce(history);

      const result = await controller.getHistory(caReq, 'other-1');

      expect(result).toEqual(history);
      expect(mockKpiService.getHistory).toHaveBeenCalledWith('other-1');
    });
  });
});
