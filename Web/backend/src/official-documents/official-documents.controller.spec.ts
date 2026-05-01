import { Test, TestingModule } from '@nestjs/testing';
import { OfficialDocumentsController } from './official-documents.controller';
import { OfficialDocumentsService } from './official-documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException } from '@nestjs/common';

const mockOfficialDocumentsService = {
  list: jest.fn(),
  create: jest.fn(),
  getById: jest.fn(),
  update: jest.fn(),
  revoke: jest.fn(),
};

const adminReq = { user: { sub: 'admin-1', role: 'system_admin', unitScope: null } };

describe('OfficialDocumentsController', () => {
  let controller: OfficialDocumentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OfficialDocumentsController],
      providers: [{ provide: OfficialDocumentsService, useValue: mockOfficialDocumentsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OfficialDocumentsController>(OfficialDocumentsController);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated documents', () => {
      const paginated = { data: [{ id: 'doc-1' }], total: 1 };
      mockOfficialDocumentsService.list.mockReturnValueOnce(paginated);

      const result = controller.list(undefined, undefined, 1, 20);

      expect(result).toEqual(paginated);
      expect(mockOfficialDocumentsService.list).toHaveBeenCalledWith({ type: undefined, status: undefined, page: 1, limit: 20 });
    });

    it('filters by type and status', () => {
      mockOfficialDocumentsService.list.mockReturnValueOnce({ data: [], total: 0 });

      controller.list('decree', 'active', 1, 20);

      expect(mockOfficialDocumentsService.list).toHaveBeenCalledWith({ type: 'decree', status: 'active', page: 1, limit: 20 });
    });
  });

  describe('create', () => {
    it('creates and returns document', () => {
      const dto = { docType: 'decree', title: 'Decree 01/2025' };
      const created = { id: 'doc-new', ...dto };
      mockOfficialDocumentsService.create.mockReturnValueOnce(created);

      const result = controller.create(adminReq as any, dto as any);

      expect(result).toEqual(created);
      expect(mockOfficialDocumentsService.create).toHaveBeenCalledWith('admin-1', dto);
    });

    it('propagates error from service', () => {
      mockOfficialDocumentsService.create.mockImplementationOnce(() => {
        throw new Error('invalid_dto');
      });

      expect(() => controller.create(adminReq as any, {} as any)).toThrow('invalid_dto');
    });
  });

  describe('getById', () => {
    it('returns document by id', () => {
      const doc = { id: 'doc-1', title: 'Decree 01/2025' };
      mockOfficialDocumentsService.getById.mockReturnValueOnce(doc);

      const result = controller.getById('doc-1');

      expect(result).toEqual(doc);
    });

    it('propagates NotFoundException for unknown id', () => {
      mockOfficialDocumentsService.getById.mockImplementationOnce(() => {
        throw new NotFoundException();
      });

      expect(() => controller.getById('bad')).toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns document', () => {
      const updated = { id: 'doc-1', title: 'Updated Title' };
      mockOfficialDocumentsService.update.mockReturnValueOnce(updated);

      const result = controller.update('doc-1', { title: 'Updated Title' });

      expect(result).toEqual(updated);
    });

    it('propagates NotFoundException for unknown document', () => {
      mockOfficialDocumentsService.update.mockImplementationOnce(() => {
        throw new NotFoundException();
      });

      expect(() => controller.update('bad', {})).toThrow(NotFoundException);
    });
  });

  describe('revoke', () => {
    it('revokes document and returns void', async () => {
      mockOfficialDocumentsService.revoke.mockResolvedValueOnce(undefined);

      await expect(controller.revoke('doc-1')).resolves.toBeUndefined();
      expect(mockOfficialDocumentsService.revoke).toHaveBeenCalledWith('doc-1');
    });

    it('propagates NotFoundException for unknown document', async () => {
      mockOfficialDocumentsService.revoke.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.revoke('bad')).rejects.toThrow(NotFoundException);
    });
  });
});
