import { Test, TestingModule } from '@nestjs/testing';
import { GpsController } from './gps.controller';
import { GpsService } from './gps.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockGpsService = {
  recordLocation: jest.fn(),
  getLive: jest.fn(),
  getHistory: jest.fn(),
};

const dqtvReq = { user: { sub: 'dqtv-1', role: 'dqtv_member', unitScope: 'UNIT_001' } };
const caReq = { user: { sub: 'ca-1', role: 'ca_officer', unitScope: 'UNIT_001' } };

describe('GpsController', () => {
  let controller: GpsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GpsController],
      providers: [{ provide: GpsService, useValue: mockGpsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GpsController>(GpsController);
    jest.clearAllMocks();
  });

  describe('record', () => {
    it('records GPS location and returns ok', async () => {
      mockGpsService.recordLocation.mockResolvedValueOnce(undefined);

      const result = await controller.record(dqtvReq as any, { lat: 10.5, lng: 106.5 });

      expect(result).toEqual({ ok: true });
      expect(mockGpsService.recordLocation).toHaveBeenCalledWith('dqtv-1', { lat: 10.5, lng: 106.5 });
    });

    it('propagates error from service', async () => {
      mockGpsService.recordLocation.mockRejectedValueOnce(new Error('militia_not_found'));

      await expect(controller.record(dqtvReq as any, { lat: 10.5, lng: 106.5 })).rejects.toThrow(
        'militia_not_found',
      );
    });
  });

  describe('getLive', () => {
    it('returns live positions', () => {
      const positions = [{ militiaId: 'mp-1', lat: 10.5, lng: 106.5 }];
      mockGpsService.getLive.mockReturnValueOnce(positions);

      const result = controller.getLive();

      expect(result).toEqual(positions);
      expect(mockGpsService.getLive).toHaveBeenCalled();
    });

    it('returns empty array when no active positions', () => {
      mockGpsService.getLive.mockReturnValueOnce([]);

      const result = controller.getLive();

      expect(result).toHaveLength(0);
    });
  });

  describe('getTeam', () => {
    it('calls getLive and returns same result as live endpoint', () => {
      const positions = [{ militiaId: 'mp-1', lat: 10.5, lng: 106.5 }];
      mockGpsService.getLive.mockReturnValueOnce(positions);

      const result = controller.getTeam();

      expect(result).toEqual(positions);
      expect(mockGpsService.getLive).toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('returns paginated GPS history for militia member', async () => {
      const history = { data: [{ lat: 10.5, lng: 106.5 }], total: 1 };
      mockGpsService.getHistory.mockResolvedValueOnce(history);

      const result = await controller.getHistory('mp-1', '2025-01-01', '2025-01-31', 1, 50);

      expect(result).toEqual(history);
      expect(mockGpsService.getHistory).toHaveBeenCalledWith('mp-1', '2025-01-01', '2025-01-31', 1, 50);
    });

    it('returns empty history for unknown militia member', async () => {
      mockGpsService.getHistory.mockResolvedValueOnce({ data: [], total: 0 });

      const result = await controller.getHistory('bad', undefined, undefined, 1, 50);

      expect((result as any).data).toHaveLength(0);
    });
  });
});
