import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { lastValueFrom, of, throwError } from 'rxjs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  StreamableFile,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { FilesController, UploadFileDto } from './files.controller';
import { FilesService } from './files.service';
import { contentDispositionOf } from './content-disposition';
import { uploadError, withStoredFileCleanup } from './upload.interceptor';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockFilesService = {
  record: jest.fn(),
  openForDownload: jest.fn(),
  uploadDir: jest.fn(() => os.tmpdir()),
};

const req = {
  user: { sub: 'user-1', role: 'dqtv', unitScope: 'KV1', username: 'u1' },
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
    it('records the verified upload as the caller file and answers {id, url, name, mimeType, size}', async () => {
      const view = {
        id: '0b9f7f0e-2b8a-4a5e-9d0c-3f1e2d4c5b6a',
        url: '/api/v1/mms_core/files/0b9f7f0e-2b8a-4a5e-9d0c-3f1e2d4c5b6a',
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      };
      mockFilesService.record.mockResolvedValueOnce(view);
      const stored = {
        filename: 'b1c9a7f2-4d3e-4f5a-8b6c-7d8e9f0a1b2c',
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        sha256: 'cd'.repeat(32),
        path: '/uploads/b1c9a7f2-4d3e-4f5a-8b6c-7d8e9f0a1b2c',
      };

      await expect(
        controller.upload(req as never, stored as never, {
          purpose: 'work_report',
        }),
      ).resolves.toEqual(view);
      expect(mockFilesService.record).toHaveBeenCalledWith(
        'user-1',
        {
          storageKey: stored.filename,
          originalName: 'photo.jpg',
          mimeType: 'image/jpeg',
          size: 1024,
          sha256: stored.sha256,
        },
        'work_report',
      );
    });

    it('answers 400 file_required without a file part', async () => {
      await expect(
        controller.upload(req as never, undefined, {}),
      ).rejects.toThrow(new BadRequestException('file_required'));
      expect(mockFilesService.record).not.toHaveBeenCalled();
    });

    it('accepts only known purposes', async () => {
      const errors = async (body: Record<string, unknown>) =>
        (await validate(plainToInstance(UploadFileDto, body))).map(
          (e) => e.property,
        );

      expect(await errors({})).toEqual([]);
      for (const purpose of [
        'general',
        'task_report',
        'work_report',
        'official_document',
      ]) {
        expect(await errors({ purpose })).toEqual([]);
      }
      expect(await errors({ purpose: 'avatar' })).toEqual(['purpose']);
    });
  });

  describe('download', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-files-ctl-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('streams a readable file with its type, length, name and protective headers', async () => {
      const stored = path.join(dir, 'content');
      fs.writeFileSync(stored, 'abc');
      mockFilesService.openForDownload.mockResolvedValueOnce({
        file: {
          id: 'f-1',
          url: '/x',
          name: 'Biên bản.pdf',
          mimeType: 'application/pdf',
          size: 3,
        },
        path: stored,
      });
      const res = { set: jest.fn() };

      const result = await controller.download(
        req as never,
        'f-1',
        res as never,
      );

      expect(mockFilesService.openForDownload).toHaveBeenCalledWith(
        req.user,
        'f-1',
      );
      expect(result).toBeInstanceOf(StreamableFile);
      expect(result.getHeaders()).toEqual({
        type: 'application/pdf',
        length: 3,
        disposition: contentDispositionOf('Biên bản.pdf', 'application/pdf'),
      });
      expect(res.set).toHaveBeenCalledWith({
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=3600',
      });
      // Read it to the end before the directory goes (the stream opens lazily)
      const chunks: Buffer[] = [];
      for await (const chunk of result.getStream())
        chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).toString()).toBe('abc');
    });

    it('propagates 404 for a file the caller may not read', async () => {
      mockFilesService.openForDownload.mockRejectedValueOnce(
        new NotFoundException('file_not_found'),
      );

      await expect(
        controller.download(req as never, 'f-1', { set: jest.fn() } as never),
      ).rejects.toThrow(new NotFoundException('file_not_found'));
    });
  });
});

// RFC 6266 with an RFC 8187 UTF-8 name: images and PDFs open in place, the rest download
describe('contentDispositionOf', () => {
  it('shows images and PDFs inline and downloads other documents', () => {
    expect(contentDispositionOf('a.png', 'image/png')).toMatch(/^inline;/);
    expect(contentDispositionOf('a.pdf', 'application/pdf')).toMatch(
      /^inline;/,
    );
    expect(
      contentDispositionOf(
        'a.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toMatch(/^attachment;/);
  });

  it('gives an ASCII fallback name and the exact UTF-8 name', () => {
    expect(contentDispositionOf('Biên bản "số 1".pdf', 'application/pdf')).toBe(
      `inline; filename="Bi_n b_n _s_ 1_.pdf"; filename*=UTF-8''Bi%C3%AAn%20b%E1%BA%A3n%20%22s%E1%BB%91%201%22.pdf`,
    );
  });

  it('cannot be broken out of by line breaks or separators in the name', () => {
    const header = contentDispositionOf(
      "a\r\nSet-Cookie: x;'.png",
      'image/png',
    );
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toBe(
      `inline; filename="a__Set-Cookie_ x_'.png"; filename*=UTF-8''a%0D%0ASet-Cookie%3A%20x%3B%27.png`,
    );
  });
});

describe('uploadError', () => {
  it.each([
    [
      new PayloadTooLargeException('File too large'),
      new PayloadTooLargeException('file_too_large'),
    ],
    [
      new BadRequestException('Unexpected field - photo'),
      new BadRequestException('file_field_invalid'),
    ],
    [
      new BadRequestException('Too many files'),
      new BadRequestException('file_field_invalid'),
    ],
    [
      new BadRequestException('Field value too long'),
      new BadRequestException('file_field_invalid'),
    ],
    [
      new BadRequestException('Multipart: Unexpected end of form'),
      new BadRequestException('multipart_malformed'),
    ],
    [
      new BadRequestException('Multipart: Boundary not found'),
      new BadRequestException('multipart_malformed'),
    ],
  ])('maps multer %p to a snake_case code', (raw, mapped) => {
    const error = uploadError(raw);
    expect(error).toEqual(mapped);
    expect(error.constructor).toBe(mapped.constructor);
  });

  it('keeps errors that already carry a code', () => {
    const typed = new UnsupportedMediaTypeException('file_type_not_allowed');
    expect(uploadError(typed)).toBe(typed);
    const other = new Error('disk full');
    expect(uploadError(other)).toBe(other);
  });
});

// A request refused after multer stored the file (validation, database) leaves no content behind
describe('withStoredFileCleanup', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-upload-cleanup-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('removes the stored file when the handler fails, and rethrows', async () => {
    const stored = path.join(dir, 'f');
    fs.writeFileSync(stored, 'x');
    const request = { file: { path: stored } };
    const failure = new BadRequestException('validation_failed');

    await expect(
      lastValueFrom(
        withStoredFileCleanup(request, {
          handle: () => throwError(() => failure),
        }).handle(),
      ),
    ).rejects.toBe(failure);
    await new Promise((r) => setImmediate(r));
    expect(fs.existsSync(stored)).toBe(false);
  });

  it('keeps the stored file when the handler succeeds', async () => {
    const stored = path.join(dir, 'f');
    fs.writeFileSync(stored, 'x');

    await expect(
      lastValueFrom(
        withStoredFileCleanup(
          { file: { path: stored } },
          {
            handle: () => of('ok'),
          },
        ).handle(),
      ),
    ).resolves.toBe('ok');
    expect(fs.existsSync(stored)).toBe(true);
  });
});
