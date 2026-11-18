import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ExemptionController } from './exemption.controller';
import { ExemptionService } from './exemption.service';
import {
  CreateExemptionDto,
  ExemptionQueryDto,
  ReviewExemptionDto,
} from './exemption.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../auth/auth.service';

const mockExemptionService = {
  findAll: jest.fn(),
  create: jest.fn(),
  review: jest.fn(),
};

const user = {
  sub: 'u-1',
  role: 'office_staff',
  unitScope: 'KV1',
} as JwtPayload;
const req = { user };

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

const validBody = {
  militiaId: '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01',
  type: 'deferral',
  reason: 'Học đại học',
  legalBasis: 'Điều 12 Luật DQTV 2019',
  effectiveDate: '2026-09-01',
  expiryDate: '2027-06-30',
};

describe('ExemptionController', () => {
  let controller: ExemptionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExemptionController],
      providers: [
        { provide: ExemptionService, useValue: mockExemptionService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ExemptionController);
    jest.resetAllMocks();
  });

  describe('access control', () => {
    it('requires authentication and role checks on every route', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        ExemptionController,
      ) as unknown[];
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('limits reading to militia managers', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ExemptionController,
      ) as string[];
      expect([...roles].sort()).toEqual(
        [
          'ca_area',
          'ca_ward',
          'office_staff',
          'police_area',
          'police_ward',
          'system_admin',
          'ubnd_leader',
        ].sort(),
      );
      expect(roles).not.toContain('dqtv');
    });

    it.each(['create', 'review'] as const)(
      'limits %s to decision makers',
      (handler) => {
        const roles = Reflect.getMetadata(
          ROLES_KEY,
          ExemptionController.prototype[handler],
        ) as string[];
        expect([...roles].sort()).toEqual(
          ['ca_ward', 'office_staff', 'police_ward', 'system_admin'].sort(),
        );
      },
    );
  });

  describe('routes', () => {
    it('findAll passes the caller and filters to the service', async () => {
      mockExemptionService.findAll.mockResolvedValueOnce([]);
      const query = { status: 'active' as const };

      await expect(controller.findAll(req, query)).resolves.toEqual([]);
      expect(mockExemptionService.findAll).toHaveBeenCalledWith(user, query);
    });

    it('create passes the caller and body to the service', async () => {
      const created = { id: 'ex-1' };
      mockExemptionService.create.mockResolvedValueOnce(created);
      const dto = validBody as CreateExemptionDto;

      await expect(controller.create(req, dto)).resolves.toBe(created);
      expect(mockExemptionService.create).toHaveBeenCalledWith(user, dto);
    });

    it('review passes the caller, id and target status to the service', async () => {
      mockExemptionService.review.mockResolvedValueOnce({ id: 'ex-1' });

      await controller.review(req, 'ex-1', { status: 'revoked' });
      expect(mockExemptionService.review).toHaveBeenCalledWith(
        user,
        'ex-1',
        'revoked',
      );
    });
  });

  describe('CreateExemptionDto', () => {
    it('accepts a complete decision', async () => {
      await expect(
        validate(CreateExemptionDto, validBody),
      ).resolves.toBeInstanceOf(CreateExemptionDto);
    });

    it.each([
      ['a status (server-owned)', { status: 'revoked' }],
      ['a militia name (derived)', { militiaName: 'Nguyễn Văn A' }],
      ['an unknown type', { type: 'waiver' }],
      ['a non-UUID militia id', { militiaId: 'mp-1' }],
      [
        'a timestamp instead of a date',
        { effectiveDate: '2026-09-01T00:00:00Z' },
      ],
      ['an impossible date', { expiryDate: '2027-02-30' }],
      ['a blank reason', { reason: '   ' }],
      ['an over-long legal basis', { legalBasis: 'x'.repeat(501) }],
      ['non-string documents', { documents: [42] }],
    ])('rejects %s', async (_label, patch) => {
      await expect(
        validate(CreateExemptionDto, { ...validBody, ...patch }),
      ).rejects.toThrow(BadRequestException);
    });

    it.each(['militiaId', 'type', 'reason', 'legalBasis', 'effectiveDate'])(
      'requires %s',
      async (field) => {
        const body: Record<string, unknown> = { ...validBody };
        delete body[field];
        await expect(validate(CreateExemptionDto, body)).rejects.toThrow(
          BadRequestException,
        );
      },
    );
  });

  describe('ReviewExemptionDto', () => {
    it.each(['expired', 'revoked'])('accepts %s', async (status) => {
      await expect(validate(ReviewExemptionDto, { status })).resolves.toEqual({
        status,
      });
    });

    it.each(['active', 'approved', undefined])('rejects %s', async (status) => {
      await expect(validate(ReviewExemptionDto, { status })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('ExemptionQueryDto', () => {
    it('accepts status, militia and unit filters', async () => {
      await expect(
        validate(
          ExemptionQueryDto,
          {
            status: 'expired',
            militiaId: validBody.militiaId,
            unitCode: 'KV1',
          },
          'query',
        ),
      ).resolves.toBeInstanceOf(ExemptionQueryDto);
    });

    it.each([{ status: 'pending' }, { militiaId: 'abc' }])(
      'rejects invalid filter %o',
      async (query) => {
        await expect(
          validate(ExemptionQueryDto, query, 'query'),
        ).rejects.toThrow(BadRequestException);
      },
    );
  });
});
