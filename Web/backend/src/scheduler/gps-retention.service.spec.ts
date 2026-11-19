import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { TenantJobRunner } from '../database/tenancy/tenant-job-runner';
import { GpsRetentionService } from './gps-retention.service';

describe('GpsRetentionService', () => {
  let service: GpsRetentionService;
  let mockQuery: jest.Mock<Promise<unknown>, [sql: string, params: unknown[]]>;
  let mockJobs: { run: jest.Mock };

  beforeEach(async () => {
    mockQuery = jest
      .fn<Promise<unknown>, [sql: string, params: unknown[]]>()
      .mockResolvedValue([[], 5]);

    // By default the runner runs the job once, unscoped, as in legacy mode
    mockJobs = {
      run: jest.fn(
        (_name: string, job: (tenantId: string | null) => Promise<void>) =>
          job(null).then(() => []),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GpsRetentionService,
        {
          provide: getDataSourceToken(),
          useValue: { query: mockQuery },
        },
        { provide: TenantJobRunner, useValue: mockJobs },
      ],
    }).compile();

    service = module.get<GpsRetentionService>(GpsRetentionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Undo the Logger.prototype spies so they do not leak into other suites
    jest.restoreAllMocks();
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
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      await service.purgeOldGpsPoints();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('GPS retention'),
      );
    });

    it('reports the correct deleted row count from query result', async () => {
      mockQuery.mockResolvedValueOnce([[], 42]);
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      await service.purgeOldGpsPoints();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('42'));
    });

    it('purges each tenant through the job runner and logs the count of each', async () => {
      const log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      mockJobs.run.mockImplementation(
        async (
          _name: string,
          job: (tenantId: string | null) => Promise<void>,
        ) => {
          await job('a1000000-0000-4000-8000-000000000001');
          await job('b2000000-0000-4000-8000-000000000002');
          return [];
        },
      );

      await service.purgeOldGpsPoints();

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          'a1000000-0000-4000-8000-000000000001: deleted 5',
        ),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          'b2000000-0000-4000-8000-000000000002: deleted 5',
        ),
      );
    });

    it('waits for a run to complete before the next tick starts another', () => {
      const options: unknown = Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        Object.getOwnPropertyDescriptor(
          GpsRetentionService.prototype,
          'purgeOldGpsPoints',
        )?.value as object,
      );
      expect(options).toMatchObject({
        cronTime: '0 2 * * *',
        waitForCompletion: true,
      });
    });

    describe('with the real job runner', () => {
      const previousMode = process.env.TENANCY_MODE;
      const NAME = 'GpsRetentionService.purgeOldGpsPoints';
      let error: jest.SpyInstance;

      beforeEach(() => {
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      });

      afterEach(() => {
        if (previousMode === undefined) delete process.env.TENANCY_MODE;
        else process.env.TENANCY_MODE = previousMode;
      });

      const useRealRunner = (runnerQuery: jest.Mock) => {
        const runner = new TenantJobRunner({
          query: runnerQuery,
        } as unknown as DataSource);
        mockJobs.run.mockImplementation(
          (name: string, job: (tenantId: string | null) => Promise<void>) =>
            runner.run(name, job),
        );
      };

      it('resolves and logs the failure when the purge fails', async () => {
        delete process.env.TENANCY_MODE;
        useRealRunner(jest.fn());
        mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

        await expect(service.purgeOldGpsPoints()).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledWith(
          `${NAME}: Job failed (legacy mode): DB connection lost`,
          expect.stringContaining('DB connection lost'),
        );
      });

      it('resolves and logs under the job name when the tenants cannot be listed', async () => {
        process.env.TENANCY_MODE = 'enforced';
        useRealRunner(jest.fn().mockRejectedValue(new Error('listing failed')));

        await expect(service.purgeOldGpsPoints()).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledWith(
          `${NAME}: could not list the tenants: listing failed`,
          expect.any(String),
        );
        expect(mockQuery).not.toHaveBeenCalled();
      });
    });
  });
});
