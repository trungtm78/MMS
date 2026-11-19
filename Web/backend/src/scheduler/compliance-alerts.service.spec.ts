import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ComplianceAlertsService } from './compliance-alerts.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TenantContext } from '../database/tenancy/tenant-context';
import { TenantJobRunner } from '../database/tenancy/tenant-job-runner';
import { useUtcServerClock, VN_NEW_YEAR_0030 } from '../../test/support/clock';

const mockDataSource = { query: jest.fn() };
const mockGateway = {
  broadcastNotification: jest.fn(),
  emitToTenant: jest.fn(),
};
const mockJobs = {
  run: jest.fn((job: (tenantId: string | null) => Promise<void>) =>
    job(null).then(() => []),
  ),
};
const TID = 'a1000000-0000-4000-8000-000000000001';

describe('ComplianceAlertsService', () => {
  let service: ComplianceAlertsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceAlertsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: NotificationsGateway, useValue: mockGateway },
        { provide: TenantJobRunner, useValue: mockJobs },
      ],
    }).compile();

    service = module.get<ComplianceAlertsService>(ComplianceAlertsService);
    jest.clearAllMocks();
  });

  describe('Vietnamese training year', () => {
    describe('just after Vietnamese new year', () => {
      useUtcServerClock(VN_NEW_YEAR_0030);

      it('treats the year end as a year away', async () => {
        await service.checkComplianceAlerts();

        expect(mockDataSource.query).not.toHaveBeenCalled();
      });
    });

    describe('on the last Vietnamese day of the year', () => {
      // 31 December 2026 01:00 in Vietnam, still 30 December in UTC
      useUtcServerClock(new Date('2026-12-30T18:00:00Z'));

      it('reports no days left for that year', async () => {
        mockDataSource.query
          .mockResolvedValueOnce([
            {
              militiaId: 'uuid-1',
              militiaName: 'A',
              unitCode: 'KP1',
              totalDays: '8',
            },
          ])
          .mockResolvedValueOnce([]);

        await service.checkComplianceAlerts();

        const calls = mockDataSource.query.mock.calls as unknown[][];
        expect(calls[0][1]).toEqual([2026]);
        const summary = JSON.parse((calls[1][1] as string[])[0]) as {
          year: number;
          daysUntilYearEnd: number;
        };
        expect(summary).toMatchObject({ year: 2026, daysUntilYearEnd: 0 });
      });
    });
  });

  describe('checkComplianceAlerts', () => {
    it('skips DB query when year-end is more than 60 days away (mid-June)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-15'));

      await service.checkComplianceAlerts();

      expect(mockDataSource.query).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('queries at-risk DQTV when within 60 days of year-end (late November)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-15'));

      mockDataSource.query.mockResolvedValueOnce([
        {
          militiaId: 'uuid-1',
          militiaName: 'Nguyễn Văn A',
          unitCode: 'KP1',
          totalDays: '8',
        },
      ]);

      await service.checkComplianceAlerts();

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('training_records'),
        expect.any(Array),
      );
      jest.useRealTimers();
    });

    it('returns without broadcasting when no DQTV are at-risk', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-20'));
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.checkComplianceAlerts();

      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      expect(mockGateway.broadcastNotification).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('tenancy', () => {
    describe('scheduling', () => {
      useUtcServerClock(new Date('2026-12-20T03:00:00Z'));

      it('runs the check through the job runner, which decides the tenants', async () => {
        mockDataSource.query.mockResolvedValueOnce([]);

        await service.checkComplianceAlerts();

        expect(mockJobs.run).toHaveBeenCalledTimes(1);
        // The closure ran the check: it read the at-risk members
        expect(mockDataSource.query).toHaveBeenCalledWith(
          expect.stringContaining('FROM militia_profiles mp'),
          [2026],
        );
      });

      it('lets a failed check fail its tenant, logged with the tenant, instead of swallowing it', async () => {
        const error = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation();
        try {
          mockDataSource.query.mockRejectedValueOnce(new Error('db down'));
          await expect(
            TenantContext.runAs({ tenantId: TID }, () => service.runCheck()),
          ).rejects.toMatchObject({ message: 'db down' });
          expect(error).toHaveBeenCalledWith(
            expect.stringContaining(`tenant ${TID}`),
            expect.anything(),
          );
        } finally {
          error.mockRestore();
        }
      });
    });

    describe('in December', () => {
      useUtcServerClock(new Date('2026-12-20T03:00:00Z'));

      it('announces an alert to the tenant it was computed for', async () => {
        mockDataSource.query
          .mockResolvedValueOnce([
            {
              militiaId: 'm',
              militiaName: 'n',
              unitCode: 'KP1',
              totalDays: '3',
            },
          ])
          .mockResolvedValueOnce([]);
        await service.runCheck();
        expect(mockGateway.emitToTenant).toHaveBeenCalledWith(
          'compliance_alert',
          expect.objectContaining({ atRiskCount: 1 }),
        );
      });
    });
  });
});
