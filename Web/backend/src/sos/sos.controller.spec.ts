import { ParseUUIDPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateSosBodyDto,
  SosController,
  UpdateStatusBodyDto,
} from './sos.controller';
import { SosService } from './sos.service';
import { SosAlertsService } from './sos-alerts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSosService = { create: jest.fn(), updateStatus: jest.fn() };
const mockAlerts = { list: jest.fn(), findOne: jest.fn() };

const ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';
const dqtvReq = {
  user: { sub: 'dqtv-1', role: 'dqtv_member', unitScope: 'UNIT_001' },
};
const caReq = {
  user: { sub: 'ca-1', role: 'ca_officer', unitScope: 'UNIT_001' },
};

const usesUuidPipe = (method: keyof SosController) =>
  Object.values(
    (Reflect.getMetadata(ROUTE_ARGS_METADATA, SosController, method) ??
      {}) as Record<string, { pipes?: unknown[] }>,
  ).some((arg) => arg.pipes?.includes(ParseUUIDPipe));

describe('SosController', () => {
  let controller: SosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SosController],
      providers: [
        { provide: SosService, useValue: mockSosService },
        { provide: SosAlertsService, useValue: mockAlerts },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SosController>(SosController);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      incidentType: 'fire',
      severity: 'high' as const,
      title: 'Fire in Zone A',
      lat: 10.5,
      lng: 106.5,
    };

    it('raises the alert for the caller and their unit', async () => {
      const created = { id: 'sos-1', ...dto, status: 'open' };
      mockSosService.create.mockResolvedValueOnce(created);

      await expect(controller.create(dqtvReq as never, dto)).resolves.toEqual(
        created,
      );
      expect(mockSosService.create).toHaveBeenCalledWith(
        'dqtv-1',
        'UNIT_001',
        dto,
      );
    });

    it('passes no unit when the caller has none', async () => {
      const adminReq = {
        user: { sub: 'admin-1', role: 'system_admin', unitScope: undefined },
      };
      mockSosService.create.mockResolvedValueOnce({});

      await controller.create(adminReq as never, dto);

      expect(mockSosService.create).toHaveBeenCalledWith('admin-1', null, dto);
    });
  });

  // T23 agent: GET /sos and GET /sos/:id showed every unit's alerts to any reader
  describe('reading alerts', () => {
    it('lists only the alerts of the caller scope', async () => {
      const page = { data: [], total: 0, page: 2, limit: 10, counts: {} };
      mockAlerts.list.mockResolvedValueOnce(page);

      await expect(
        controller.list(dqtvReq as never, 'open', 'urgent', 2, 10),
      ).resolves.toEqual(page);
      expect(mockAlerts.list).toHaveBeenCalledWith(dqtvReq.user, {
        status: 'open',
        severity: 'urgent',
        page: 2,
        limit: 10,
      });
    });

    it('reads one alert of the caller scope', async () => {
      mockAlerts.findOne.mockResolvedValueOnce({ id: ID });

      await expect(controller.getById(caReq as never, ID)).resolves.toEqual({
        id: ID,
      });
      expect(mockAlerts.findOne).toHaveBeenCalledWith(caReq.user, ID);
    });
  });

  describe('updateStatus', () => {
    it('changes the status as the responder, whose scope decides what they reach', async () => {
      const dto = { status: 'responding', assignedTo: ID };
      mockSosService.updateStatus.mockResolvedValueOnce({
        id: ID,
        status: 'responding',
      });

      await controller.updateStatus(caReq as never, ID, dto);

      expect(mockSosService.updateStatus).toHaveBeenCalledWith(
        caReq.user,
        ID,
        dto,
      );
    });
  });

  it.each(['getById', 'updateStatus'] as const)(
    'validates the alert id of %s as a UUID',
    (method) => {
      expect(usesUuidPipe(method)).toBe(true);
    },
  );

  // Values the incidents table refuses (migration 007 CHECKs) used to reach PostgreSQL
  describe('request bodies', () => {
    const errorsOf = async (type: new () => object, body: object) =>
      (await validate(plainToInstance(type, body))).map((e) => e.property);
    const alert = {
      incidentType: 'fire',
      severity: 'high',
      title: 'Cháy kho',
      lat: 10.5,
      lng: 106.5,
    };

    it('accepts a complete alert and a known status change', async () => {
      expect(await errorsOf(CreateSosBodyDto, alert)).toEqual([]);
      expect(
        await errorsOf(UpdateStatusBodyDto, {
          status: 'resolved',
          assignedTo: ID,
          resolutionNote: 'Đã xử lý',
        }),
      ).toEqual([]);
    });

    it.each<[Record<string, unknown>, string]>([
      [{ incidentType: 'earthquake' }, 'incidentType'],
      [{ severity: 'extreme' }, 'severity'],
      [{ title: '' }, 'title'],
      [{ title: 'x'.repeat(256) }, 'title'],
      [{ lat: 91 }, 'lat'],
      [{ lng: 181 }, 'lng'],
      [{ message: 'x'.repeat(2001) }, 'message'],
    ])('refuses an alert with %j', async (change, property) => {
      expect(await errorsOf(CreateSosBodyDto, { ...alert, ...change })).toEqual(
        [property],
      );
    });

    it.each<[Record<string, unknown>, string]>([
      [{ status: 'in_progress' }, 'status'],
      [{ status: 'resolved', assignedTo: 'ca-1' }, 'assignedTo'],
      [
        { status: 'resolved', resolutionNote: 'x'.repeat(2001) },
        'resolutionNote',
      ],
    ])('refuses a status change %j', async (body, property) => {
      expect(await errorsOf(UpdateStatusBodyDto, body)).toEqual([property]);
    });
  });
});
