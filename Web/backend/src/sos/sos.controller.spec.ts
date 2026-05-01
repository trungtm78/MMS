import { Test, TestingModule } from '@nestjs/testing';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException } from '@nestjs/common';

const mockSosService = {
  create: jest.fn(),
  list: jest.fn(),
  getById: jest.fn(),
  updateStatus: jest.fn(),
};

const dqtvReq = { user: { sub: 'dqtv-1', role: 'dqtv_member', unitScope: 'UNIT_001' } };
const caReq = { user: { sub: 'ca-1', role: 'ca_officer', unitScope: 'UNIT_001' } };

describe('SosController', () => {
  let controller: SosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SosController],
      providers: [{ provide: SosService, useValue: mockSosService }],
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

    it('creates SOS incident and returns it', () => {
      const created = { id: 'sos-1', ...dto, status: 'open' };
      mockSosService.create.mockReturnValueOnce(created);

      const result = controller.create(dqtvReq as any, dto);

      expect(result).toEqual(created);
      expect(mockSosService.create).toHaveBeenCalledWith('dqtv-1', 'UNIT_001', dto);
    });

    it('passes null unitScope when user has no unit', () => {
      const adminReq = { user: { sub: 'admin-1', role: 'system_admin', unitScope: undefined } };
      mockSosService.create.mockReturnValueOnce({});

      controller.create(adminReq as any, dto);

      expect(mockSosService.create).toHaveBeenCalledWith('admin-1', null, dto);
    });
  });

  describe('list', () => {
    it('returns paginated SOS incidents', () => {
      const paginated = { data: [{ id: 'sos-1' }], total: 1 };
      mockSosService.list.mockReturnValueOnce(paginated);

      const result = controller.list(undefined, undefined, 1, 20);

      expect(result).toEqual(paginated);
      expect(mockSosService.list).toHaveBeenCalledWith({ status: undefined, severity: undefined, page: 1, limit: 20 });
    });

    it('filters by status and severity', () => {
      mockSosService.list.mockReturnValueOnce({ data: [], total: 0 });

      controller.list('open', 'urgent', 1, 20);

      expect(mockSosService.list).toHaveBeenCalledWith({ status: 'open', severity: 'urgent', page: 1, limit: 20 });
    });
  });

  describe('getById', () => {
    it('returns single SOS incident', () => {
      const sos = { id: 'sos-1', title: 'Fire', status: 'open' };
      mockSosService.getById.mockReturnValueOnce(sos);

      const result = controller.getById('sos-1');

      expect(result).toEqual(sos);
      expect(mockSosService.getById).toHaveBeenCalledWith('sos-1');
    });

    it('propagates NotFoundException for unknown id', () => {
      mockSosService.getById.mockImplementationOnce(() => {
        throw new NotFoundException();
      });

      expect(() => controller.getById('bad')).toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    const statusDto = { status: 'in_progress', assignedTo: 'ca-1' };

    it('updates SOS status and returns result', () => {
      const updated = { id: 'sos-1', status: 'in_progress' };
      mockSosService.updateStatus.mockReturnValueOnce(updated);

      const result = controller.updateStatus(caReq as any, 'sos-1', statusDto);

      expect(result).toEqual(updated);
      expect(mockSosService.updateStatus).toHaveBeenCalledWith('sos-1', statusDto, 'ca-1');
    });

    it('propagates NotFoundException for unknown incident', () => {
      mockSosService.updateStatus.mockImplementationOnce(() => {
        throw new NotFoundException();
      });

      expect(() => controller.updateStatus(caReq as any, 'bad', statusDto)).toThrow(NotFoundException);
    });
  });
});
