import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OfficialDocumentsService } from './official-documents.service';
import { FilesService } from '../files/files.service';

const mockDataSource = { query: jest.fn(), transaction: jest.fn() };
// The transaction's manager shares the query mock, so call order stays observable
mockDataSource.transaction.mockImplementation(
  (work: (mgr: typeof mockDataSource) => Promise<unknown>) =>
    work(mockDataSource),
);
const mockFiles = { attach: jest.fn(), views: jest.fn() };

describe('OfficialDocumentsService', () => {
  let service: OfficialDocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfficialDocumentsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: FilesService, useValue: mockFiles },
      ],
    }).compile();
    service = module.get<OfficialDocumentsService>(OfficialDocumentsService);
    jest.clearAllMocks();
    mockFiles.attach.mockResolvedValue([]);
    mockFiles.views.mockReturnValue([]);
  });

  // fileId is an id from POST /files/upload, uploaded by the creator and not yet attached
  describe('create with a file', () => {
    const view = {
      id: 'f-1',
      url: '/api/v1/mms_core/files/f-1',
      name: 'QĐ 12.pdf',
      mimeType: 'application/pdf',
      size: 100,
    };

    it('attaches the creator upload to the document in the same transaction', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: 'doc-1', title: 'QĐ 12' },
      ]);
      mockFiles.attach.mockResolvedValueOnce([view]);

      await expect(
        service.create('staff-1', {
          docType: 'quyet_dinh',
          title: 'QĐ 12',
          fileId: 'f-1',
        }),
      ).resolves.toEqual({
        id: 'doc-1',
        title: 'QĐ 12',
        fileId: 'f-1',
        file: view,
      });
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockFiles.attach).toHaveBeenCalledWith(mockDataSource, {
        ownerId: 'staff-1',
        fileIds: ['f-1'],
        relatedType: 'official_document',
        relatedId: 'doc-1',
      });
      expect((mockDataSource.query.mock.calls[0] as unknown[][])[1][8]).toBe(
        'f-1',
      );
    });

    it('answers a document without a file with file null', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'doc-2' }]);

      await expect(
        service.create('staff-1', { docType: 'cong_van', title: 'CV' }),
      ).resolves.toEqual({ id: 'doc-2', fileId: null, file: null });
      expect(mockFiles.attach).not.toHaveBeenCalled();
    });

    it('propagates a refused file', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'doc-3' }]);
      mockFiles.attach.mockRejectedValueOnce(
        new BadRequestException('file_not_found'),
      );

      await expect(
        service.create('staff-1', {
          docType: 'cong_van',
          title: 'CV',
          fileId: 'someone-elses',
        }),
      ).rejects.toThrow(new BadRequestException('file_not_found'));
    });
  });

  describe('list', () => {
    it('returns paginated documents with total', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([
          { id: 'doc-1', title: 'Decree 01/2025', status: 'active' },
        ]);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.total).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('filters by docType when provided', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([{ id: 'doc-1' }]);

      await service.list({ type: 'decree', page: 1, limit: 20 });

      const [sql, params] = mockDataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('doc_type = ');
      expect(params).toContain('decree');
    });

    it('returns empty result when no documents match', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      const result = await service.list({
        type: 'nonexistent',
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });

    it('caps limit at 100', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.list({ page: 1, limit: 999 });

      const [, params] = mockDataSource.query.mock.calls[1] as [
        string,
        unknown[],
      ];
      // limit param should be capped at 100
      expect(params[0]).toBe(100);
    });
  });

  describe('create', () => {
    it('inserts document and returns created row', async () => {
      const row = {
        id: 'doc-new',
        docNumber: 'D001',
        docType: 'decree',
        title: 'Decree 01/2025',
        issuedDate: '2025-01-01',
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      mockDataSource.query.mockResolvedValueOnce([row]);

      const result = await service.create('admin-1', {
        docType: 'decree',
        title: 'Decree 01/2025',
        issuedDate: '2025-01-01',
      });

      expect(result).toEqual({ ...row, fileId: null, file: null });
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO official_documents'),
        expect.any(Array),
      );
    });

    it('SQL uses RETURNING clause', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'doc-1' }]);

      await service.create('admin-1', { docType: 'decree', title: 'X' });

      const [sql] = mockDataSource.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('RETURNING');
    });
  });

  describe('getById', () => {
    const storedFile = {
      id: 'f-1',
      name: 'QĐ 12.pdf',
      mimeType: 'application/pdf',
      size: '100',
    };
    const view = {
      id: 'f-1',
      url: '/api/v1/mms_core/files/f-1',
      name: 'QĐ 12.pdf',
      mimeType: 'application/pdf',
      size: 100,
    };

    // The web page downloads the file under its own name and type, as create answers it
    it('returns the document with its file as the files endpoint serves it', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: 'doc-1', title: 'QĐ 12', fileId: 'f-1', file: storedFile },
      ]);
      mockFiles.views.mockReturnValueOnce([view]);

      await expect(service.getById('doc-1')).resolves.toEqual({
        id: 'doc-1',
        title: 'QĐ 12',
        fileId: 'f-1',
        file: view,
      });
      expect(mockFiles.views).toHaveBeenCalledWith([storedFile]);
      const [sql, params] = mockDataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toMatch(/LEFT JOIN files f ON f\.id = od\.file_id/);
      expect(sql).toMatch(
        /json_build_object\('id', f\.id, 'name', f\.original_name, 'mimeType', f\.mime_type, 'size', f\.size\)/,
      );
      expect(sql).toMatch(/WHERE od\.id = \$1/);
      expect(params).toEqual(['doc-1']);
    });

    it('answers a document without a file with file null', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: 'doc-2', title: 'CV', fileId: null, file: null },
      ]);

      await expect(service.getById('doc-2')).resolves.toEqual({
        id: 'doc-2',
        title: 'CV',
        fileId: null,
        file: null,
      });
      expect(mockFiles.views).toHaveBeenCalledWith([]);
    });

    it('throws NotFoundException when document not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getById('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates document and returns updated row', async () => {
      const updated = { id: 'doc-1', title: 'Updated Title', status: 'active' };
      mockDataSource.query.mockResolvedValueOnce([updated]);

      const result = await service.update('doc-1', { title: 'Updated Title' });

      expect(result).toEqual(updated);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE official_documents SET'),
        expect.arrayContaining(['Updated Title', 'doc-1']),
      );
    });

    it('throws NotFoundException when document not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.update('bad', { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns existing document when no fields to update', async () => {
      const existing = {
        id: 'doc-1',
        title: 'Existing',
        status: 'active',
        file: null,
      };
      mockDataSource.query.mockResolvedValueOnce([existing]);

      // No fields provided — falls back to getById
      const result = await service.update('doc-1', {});

      expect(result).toEqual(existing);
    });
  });

  describe('revoke', () => {
    it('sets status to revoked and returns void', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'doc-1' }]);

      await expect(service.revoke('doc-1')).resolves.toBeUndefined();

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'revoked'"),
        ['doc-1'],
      );
    });

    it('throws NotFoundException when document not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.revoke('bad')).rejects.toThrow(NotFoundException);
    });
  });
});
