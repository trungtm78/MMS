import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { WorkReportsController } from './work-reports.controller';
import { WorkReportsService } from './work-reports.service';
import { CreateWorkReportBodyDto } from './work-reports.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../auth/auth.service';

const mockService = { findOne: jest.fn() };
const req = {
  user: { sub: 'dqtv-1', role: 'dqtv', unitScope: 'KV1' } as JwtPayload,
};

// Same options as the global pipe (app.setup.ts)
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const uuid = (n: number) =>
  `0b6f3c1e-3a53-4f4f-9d1a-${String(n).padStart(12, '0')}`;

describe('WorkReportsController — attachments and detail', () => {
  let controller: WorkReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkReportsController],
      providers: [{ provide: WorkReportsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(WorkReportsController);
    jest.clearAllMocks();
  });

  describe('GET /work-reports/:id', () => {
    it('reads one report as the caller', async () => {
      mockService.findOne.mockResolvedValueOnce({
        id: uuid(1),
        attachments: [],
      });

      await expect(controller.findOne(req, uuid(1))).resolves.toEqual({
        id: uuid(1),
        attachments: [],
      });
      expect(mockService.findOne).toHaveBeenCalledWith(uuid(1), req.user);
    });

    it('is a GET on :id', () => {
      const handler = Object.getOwnPropertyDescriptor(
        WorkReportsController.prototype,
        'findOne',
      )?.value as object;
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
    });
  });

  // POST /work-reports attachmentIds: ids from POST /files/upload, at most 10, each once
  describe('attachmentIds', () => {
    const body = (attachmentIds: unknown) => ({
      reportType: 'incident',
      title: 'Sự vụ',
      content: 'Chi tiết',
      attachmentIds,
    });
    const check = (value: unknown) =>
      pipe.transform(value, {
        type: 'body',
        metatype: CreateWorkReportBodyDto,
      });

    it('accepts up to 10 distinct file ids, and none', async () => {
      const ids = Array.from({ length: 10 }, (_, i) => uuid(i));
      await expect(check(body(ids))).resolves.toMatchObject({
        attachmentIds: ids,
      });
      await expect(check(body([]))).resolves.toMatchObject({
        attachmentIds: [],
      });
      await expect(
        check({ reportType: 'daily', title: 'T', content: 'C' }),
      ).resolves.toBeDefined();
    });

    it.each([
      ['more than 10 files', Array.from({ length: 11 }, (_, i) => uuid(i))],
      ['the same file twice', [uuid(1), uuid(1)]],
      [
        'an id that is not a UUID (an old upload filename)',
        ['1712345678-123.jpg'],
      ],
      ['something other than a list', uuid(1)],
    ])('refuses %s', async (_label, value) => {
      await expect(check(body(value))).rejects.toThrow(BadRequestException);
    });
  });
});
