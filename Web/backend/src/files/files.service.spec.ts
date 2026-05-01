import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FilesService } from './files.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs and path modules
jest.mock('fs');
jest.mock('mime-types', () => ({
  lookup: jest.fn(),
}));

const mockLookup = require('mime-types').lookup as jest.Mock;
const mockExistsSync = fs.existsSync as jest.Mock;
const mockCreateReadStream = fs.createReadStream as jest.Mock;

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesService],
    }).compile();
    service = module.get<FilesService>(FilesService);
    jest.clearAllMocks();
  });

  describe('getMimeType', () => {
    it('returns correct MIME type for known extension', () => {
      mockLookup.mockReturnValueOnce('image/jpeg');

      const result = service.getMimeType('photo.jpg');

      expect(result).toBe('image/jpeg');
      expect(mockLookup).toHaveBeenCalledWith('photo.jpg');
    });

    it('returns application/octet-stream for unknown extension', () => {
      mockLookup.mockReturnValueOnce(false);

      const result = service.getMimeType('unknown.xyz');

      expect(result).toBe('application/octet-stream');
    });

    it('handles PDF files correctly', () => {
      mockLookup.mockReturnValueOnce('application/pdf');

      const result = service.getMimeType('document.pdf');

      expect(result).toBe('application/pdf');
    });
  });

  describe('getFilePath', () => {
    it('returns full path when file exists', () => {
      mockExistsSync.mockReturnValueOnce(true);

      const filePath = service.getFilePath('test.jpg');

      expect(filePath).toContain('test.jpg');
      expect(mockExistsSync).toHaveBeenCalled();
    });

    it('throws NotFoundException when file does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false);

      expect(() => service.getFilePath('missing.jpg')).toThrow(NotFoundException);
    });
  });

  describe('createReadStream', () => {
    it('creates and returns read stream for existing file', () => {
      const mockStream = { pipe: jest.fn() };
      mockExistsSync.mockReturnValueOnce(true);
      mockCreateReadStream.mockReturnValueOnce(mockStream);

      const result = service.createReadStream('test.jpg');

      expect(result).toBe(mockStream);
      expect(mockCreateReadStream).toHaveBeenCalled();
    });

    it('throws NotFoundException for missing file', () => {
      mockExistsSync.mockReturnValueOnce(false);

      expect(() => service.createReadStream('missing.jpg')).toThrow(NotFoundException);
    });
  });
});
