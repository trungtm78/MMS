import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ROLE_CODES } from '../common/constants/roles';
import { SettingsController } from './settings.controller';
import { KpiTargetsService } from './kpi-targets.service';
import { NotificationPreferencesService } from './notification-preferences.service';

const kpiTargets = { getEffective: jest.fn(), update: jest.fn() };
const preferences = { get: jest.fn(), update: jest.fn() };

const rolesOf = (handler: keyof SettingsController) =>
  Reflect.getMetadata(
    ROLES_KEY,
    SettingsController.prototype[handler] as object,
  ) as string[];

describe('SettingsController', () => {
  let controller: SettingsController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: KpiTargetsService, useValue: kpiTargets },
        { provide: NotificationPreferencesService, useValue: preferences },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(SettingsController);
    jest.clearAllMocks();
  });

  const admin = { sub: 'admin-1', role: 'system_admin', unitScope: null };
  const req = {
    user: admin,
    ip: '10.1.2.3',
    headers: { 'user-agent': 'Mozilla/5.0' },
  };

  describe('roles', () => {
    it('lets every staff role read the KPI targets, but no militia member', () => {
      expect([...rolesOf('getKpiTargets')].sort()).toEqual(
        [
          'ca_area',
          'ca_officer',
          'ca_ward',
          'office_staff',
          'police_area',
          'police_ward',
          'system_admin',
          'ubnd_leader',
        ].sort(),
      );
    });

    it('lets only system_admin change the KPI targets', () => {
      expect(rolesOf('updateKpiTargets')).toEqual(['system_admin']);
    });

    it('lets every role read and change their own notification preferences', () => {
      expect([...rolesOf('getNotificationPreferences')].sort()).toEqual(
        [...ROLE_CODES].sort(),
      );
      expect([...rolesOf('updateNotificationPreferences')].sort()).toEqual(
        [...ROLE_CODES].sort(),
      );
    });
  });

  it('reads the KPI targets in force on the day asked for', async () => {
    kpiTargets.getEffective.mockResolvedValueOnce({ minAttendanceDays: 22 });
    await expect(controller.getKpiTargets('2026-09-01')).resolves.toEqual({
      minAttendanceDays: 22,
    });
    expect(kpiTargets.getEffective).toHaveBeenCalledWith('2026-09-01');
  });

  it('changes the KPI targets with the caller and where the request came from', async () => {
    const dto = {
      minAttendanceDays: 20,
      minTasksCompleted: 8,
      maxOverdueTasks: 3,
      minTrainingHours: 60,
      evaluationPeriod: 'quarterly' as const,
    };
    kpiTargets.update.mockResolvedValueOnce(dto);

    await controller.updateKpiTargets(req, dto);

    expect(kpiTargets.update).toHaveBeenCalledWith(admin, dto, {
      ip: '10.1.2.3',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('reads and changes only the caller preferences', async () => {
    const body = {
      channels: { inApp: true, push: true, email: false },
      categories: {
        taskAssigned: true,
        taskOverdue: true,
        attendanceReminder: true,
        leaveApproval: true,
        systemAnnouncements: true,
        sosAlerts: true,
      },
    };
    preferences.get.mockResolvedValueOnce(body);
    preferences.update.mockResolvedValueOnce(body);

    await controller.getNotificationPreferences(req);
    await controller.updateNotificationPreferences(req, body);

    expect(preferences.get).toHaveBeenCalledWith(admin);
    expect(preferences.update).toHaveBeenCalledWith(admin, body);
  });
});
