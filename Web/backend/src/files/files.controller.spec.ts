import { Test, TestingModule } from '@nestjs/testing';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockFilesService = {
  getMimeType: jest.fn(),
  createReadStream: jest.fn(),
};

describe('FilesController', () => {
  let controller: FilesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [{ provide: FilesService, useValue: mockFilesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FilesController>(FilesController);
    jest.clearAllMocks();
  });

  describe('upload', () => {
    it('returns file metadata when file provided', () => {
      const mockFile = {
        filename: 'abc123.jpg',
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as Express.Multer.File;

      const result = controller.upload(mockFile);

      expect(result).toEqual({
        fileId: 'abc123.jpg',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        url: '/api/v1/files/abc123.jpg',
      });
    });

    it('throws BadRequestException when no file provided', () => {
      expect(() => controller.upload(undefined as any)).toThrow(BadRequestException);
    });
  });

  describe('serve', () => {
    it('pipes file stream with correct content-type header', async () => {
      const mockStream = {
        pipe: jest.fn(),
      };
      const mockRes = {
        setHeader: jest.fn(),
        pipe: jest.fn(),
      };

      mockFilesService.getMimeType.mockReturnValueOnce('image/jpeg');
      mockFilesService.createReadStream.mockReturnValueOnce(mockStream);

      await controller.serve('abc123.jpg', mockRes as any);

      expect(mockFilesService.getMimeType).toHaveBeenCalledWith('abc123.jpg');
      expect(mockFilesService.createReadStream).toHaveBeenCalledWith('abc123.jpg');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
    });

    it('propagates NotFoundException when file not found', async () => {
      mockFilesService.getMimeType.mockReturnValueOnce('application/octet-stream');
      mockFilesService.createReadStream.mockImplementationOnce(() => {
        throw new NotFoundException('File not found');
      });

      const mockRes = { setHeader: jest.fn() };

      await expect(controller.serve('missing.jpg', mockRes as any)).rejects.toThrow(NotFoundException);
    });
  });
});
