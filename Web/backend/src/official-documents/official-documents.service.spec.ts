import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { OfficialDocumentsService } from './official-documents.service';

const mockDataSource = { query: jest.fn() };

describe('OfficialDocumentsService', () => {
  let service: OfficialDocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfficialDocumentsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<OfficialDocumentsService>(OfficialDocumentsService);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated documents with total', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ id: 'doc-1', title: 'Decree 01/2025', status: 'active' }]);

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

      const [sql, params] = mockDataSource.query.mock.calls[0];
      expect(sql).toContain('doc_type = ');
      expect(params).toContain('decree');
    });

    it('returns empty result when no documents match', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      const result = await service.list({ type: 'nonexistent', page: 1, limit: 20 });

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });

    it('caps limit at 100', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.list({ page: 1, limit: 999 });

      const [, params] = mockDataSource.query.mock.calls[1];
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

      expect(result).toEqual(row);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO official_documents'),
        expect.any(Array),
      );
    });

    it('SQL uses RETURNING clause', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'doc-1' }]);

      await service.create('admin-1', { docType: 'decree', title: 'X' });

      const [sql] = mockDataSource.query.mock.calls[0];
      expect(sql).toContain('RETURNING');
    });
  });

  describe('getById', () => {
    it('returns document when found', async () => {
      const doc = { id: 'doc-1', title: 'Decree 01/2025', status: 'active' };
      mockDataSource.query.mockResolvedValueOnce([doc]);

      const result = await service.getById('doc-1');

      expect(result).toEqual(doc);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['doc-1'],
      );
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

      await expect(service.update('bad', { title: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('returns existing document when no fields to update', async () => {
      const existing = { id: 'doc-1', title: 'Existing', status: 'active' };
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
