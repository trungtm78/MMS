import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { WorkReportsController } from './work-reports.controller';
import { WorkReportsService } from './work-reports.service';
import {
  CreateWorkReportBodyDto,
  ReviewWorkReportBodyDto,
  WorkReportQueryDto,
} from './work-reports.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import { REVIEWER_ROLES } from '../common/constants/roles';
import type { JwtPayload } from '../auth/auth.service';

const mockWorkReportsService = {
  list: jest.fn(),
  create: jest.fn(),
  review: jest.fn(),
};

const AUTHOR_ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';
const dqtvReq = {
  user: {
    sub: 'dqtv-1',
    role: 'dqtv_member',
    unitScope: 'UNIT_001',
  } as JwtPayload,
};
const caReq = {
  user: {
    sub: 'ca-1',
    role: 'ca_officer',
    unitScope: 'UNIT_001',
  } as JwtPayload,
};

// Same options as the global pipe in main.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const validate = (
  metatype: new () => object,
  value: unknown,
  type: 'body' | 'query' = 'body',
) => pipe.transform(value, { type, metatype }) as Promise<unknown>;

describe('WorkReportsController', () => {
  let controller: WorkReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkReportsController],
      providers: [
        { provide: WorkReportsService, useValue: mockWorkReportsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkReportsController>(WorkReportsController);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('passes the caller as the actor so the service can scope the results', () => {
      const paginated = {
        data: [{ id: 'wr-1' }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockWorkReportsService.list.mockReturnValueOnce(paginated);

      const result = controller.list(dqtvReq, { page: 1, limit: 20 });

      expect(result).toEqual(paginated);
      expect(mockWorkReportsService.list).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        actor: dqtvReq.user,
      });
    });

    it('passes type and author filters', () => {
      mockWorkReportsService.list.mockReturnValueOnce({ data: [], total: 0 });

      controller.list(caReq, {
        type: 'daily',
        userId: AUTHOR_ID,
        page: 2,
        limit: 50,
      });

      expect(mockWorkReportsService.list).toHaveBeenCalledWith({
        type: 'daily',
        userId: AUTHOR_ID,
        page: 2,
        limit: 50,
        actor: caReq.user,
      });
    });
  });

  describe('create', () => {
    it('creates work report and returns it', () => {
      const dto = {
        reportType: 'daily' as const,
        title: 'Daily Report',
        content: 'Done tasks...',
      };
      const created = { id: 'wr-new', ...dto };
      mockWorkReportsService.create.mockReturnValueOnce(created);

      const result = controller.create(dqtvReq, dto);

      expect(result).toEqual(created);
      expect(mockWorkReportsService.create).toHaveBeenCalledWith('dqtv-1', dto);
    });
  });

  describe('review', () => {
    it('passes the report id, decision and reviewer to the service', () => {
      mockWorkReportsService.review.mockReturnValueOnce({
        id: 'wr-1',
        reviewStatus: 'rejected',
      });

      controller.review(caReq, 'wr-1', {
        reviewStatus: 'rejected',
        reviewNote: 'Incomplete',
      });

      expect(mockWorkReportsService.review).toHaveBeenCalledWith(
        'wr-1',
        { reviewStatus: 'rejected', reviewNote: 'Incomplete' },
        caReq.user,
      );
    });

    it('allows exactly the reviewer roles the service accepts', () => {
      const handler = Object.getOwnPropertyDescriptor(
        WorkReportsController.prototype,
        'review',
      )?.value as object;
      const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];

      expect([...roles].sort()).toEqual([...REVIEWER_ROLES].sort());
    });
  });

  describe('request validation', () => {
    it('accepts and converts list filters', async () => {
      await expect(
        validate(
          WorkReportQueryDto,
          { type: 'daily', userId: AUTHOR_ID, page: '2', limit: '50' },
          'query',
        ),
      ).resolves.toEqual({
        type: 'daily',
        userId: AUTHOR_ID,
        page: 2,
        limit: 50,
      });
    });

    it.each([
      ['an unknown type', { type: 'weekly' }],
      ['a malformed author id', { userId: 'abc' }],
      ['a page below 1', { page: '0' }],
      ['a limit above 100', { limit: '500' }],
    ])('rejects list filters with %s', async (_label, query) => {
      await expect(
        validate(WorkReportQueryDto, query, 'query'),
      ).rejects.toThrow(BadRequestException);
    });

    const report = {
      reportType: 'daily',
      title: 'Báo cáo',
      content: 'Nội dung',
    };

    it.each([
      ['an unknown report type', { reportType: 'work' }],
      ['a blank title', { title: '   ' }],
      ['content longer than 10000 characters', { content: 'x'.repeat(10_001) }],
    ])('rejects a report with %s', async (_label, patch) => {
      await expect(
        validate(CreateWorkReportBodyDto, { ...report, ...patch }),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['a pending decision', { reviewStatus: 'pending' }],
      [
        'a note longer than 1000 characters',
        { reviewStatus: 'approved', reviewNote: 'x'.repeat(1001) },
      ],
    ])('rejects a review with %s', async (_label, body) => {
      await expect(validate(ReviewWorkReportBodyDto, body)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
