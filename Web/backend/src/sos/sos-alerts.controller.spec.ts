import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import { SosAlertsService } from './sos-alerts.service';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';

const alerts = { list: jest.fn() };

describe('SosController.listAlerts', () => {
  let controller: SosController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SosController],
      providers: [
        { provide: SosService, useValue: {} },
        { provide: SosAlertsService, useValue: alerts },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(SosController);
    alerts.list.mockReset();
  });

  // Express matches routes in registration order: /sos/:id declared first would swallow
  // /sos/alerts and answer 404 incident_not_found
  it('registers /sos/alerts before /sos/:id', () => {
    const methods = Object.getOwnPropertyNames(SosController.prototype);
    expect(methods.indexOf('listAlerts')).toBeGreaterThan(-1);
    expect(methods.indexOf('listAlerts')).toBeLessThan(
      methods.indexOf('getById'),
    );
  });

  it('keeps the SOS readers of the controller', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        Object.getOwnPropertyDescriptor(SosController.prototype, 'listAlerts')
          ?.value as object,
      ),
    ).toBeUndefined();
    expect(
      [...(Reflect.getMetadata(ROLES_KEY, SosController) as string[])].sort(),
    ).toEqual(
      [
        'ca_area',
        'ca_officer',
        'ca_ward',
        'dqtv',
        'dqtv_member',
        'office_staff',
        'police_area',
        'police_ward',
        'system_admin',
      ].sort(),
    );
  });

  it('passes the caller, filters and paging', async () => {
    const req = {
      user: {
        sub: 'u-1',
        username: 'u',
        role: 'office_staff',
        unitScope: 'KV-A',
      },
    };
    alerts.list.mockResolvedValueOnce({ data: [] });

    await controller.listAlerts(req, 'active', 'urgent', 'KV-B', 2, 50);

    expect(alerts.list).toHaveBeenCalledWith(req.user, {
      status: 'active',
      severity: 'urgent',
      unitCode: 'KV-B',
      page: 2,
      limit: 50,
    });
  });
});
