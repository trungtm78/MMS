import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ComplianceAlertsService } from './compliance-alerts.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

const mockDataSource = { query: jest.fn() };
const mockGateway = { broadcastNotification: jest.fn() };

describe('ComplianceAlertsService', () => {
  let service: ComplianceAlertsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceAlertsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: NotificationsGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<ComplianceAlertsService>(ComplianceAlertsService);
    jest.clearAllMocks();
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
        { militiaId: 'uuid-1', militiaName: 'Nguyễn Văn A', unitCode: 'KP1', totalDays: '8' },
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

    it('does not throw when DB query fails', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-12-01'));
      mockDataSource.query.mockRejectedValueOnce(new Error('DB connection failed'));

      await expect(service.checkComplianceAlerts()).resolves.not.toThrow();
      jest.useRealTimers();
    });
  });
});
