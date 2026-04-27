import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { GpsRetentionService } from './gps-retention.service';

describe('GpsRetentionService', () => {
  let service: GpsRetentionService;
  let mockQuery: jest.Mock;

  beforeEach(async () => {
    mockQuery = jest.fn().mockResolvedValue([null, 5]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GpsRetentionService,
        {
          provide: getDataSourceToken(),
          useValue: { query: mockQuery },
        },
      ],
    }).compile();

    service = module.get<GpsRetentionService>(GpsRetentionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('purgeOldGpsPoints', () => {
    it('calls dataSource.query with a cutoff ~90 days ago (within 5 seconds)', async () => {
      const before = new Date();
      before.setDate(before.getDate() - 90);

      await service.purgeOldGpsPoints();

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('DELETE FROM gps_points');
      expect(sql).toContain('captured_at < $1::timestamptz');

      const passedCutoff = new Date(params[0] as string);
      const diff = Math.abs(passedCutoff.getTime() - before.getTime());
      expect(diff).toBeLessThanOrEqual(5000); // within 5 seconds
    });

    it('logs a message containing "GPS retention"', async () => {
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => undefined);

      await service.purgeOldGpsPoints();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('GPS retention'),
      );
    });

    it('reports the correct deleted row count from query result', async () => {
      mockQuery.mockResolvedValueOnce([null, 42]);
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => undefined);

      await service.purgeOldGpsPoints();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('42'));
    });

    it('swallows errors and logs them without rethrowing', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
      const errorSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);

      await expect(service.purgeOldGpsPoints()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
