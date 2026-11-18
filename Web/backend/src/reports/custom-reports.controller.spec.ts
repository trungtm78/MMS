import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import { CustomReportQueryDto } from './custom-report-query.dto';
import { CustomReportsController } from './custom-reports.controller';
import { CustomReportsService } from './custom-reports.service';

const reports = { generate: jest.fn(), export: jest.fn() };

describe('CustomReportsController', () => {
  let controller: CustomReportsController;
  const req = {
    user: {
      sub: 's-1',
      username: 's',
      role: 'office_staff',
      unitScope: 'KV-A',
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomReportsController],
      providers: [{ provide: CustomReportsService, useValue: reports }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(CustomReportsController);
    jest.clearAllMocks();
  });

  it('serves /reports/custom and its export to the report readers', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CustomReportsController)).toBe(
      'reports',
    );
    const pathOf = (method: string) =>
      Reflect.getMetadata(
        PATH_METADATA,
        Object.getOwnPropertyDescriptor(
          CustomReportsController.prototype,
          method,
        )?.value as object,
      ) as string;
    expect(pathOf('generate')).toBe('custom');
    expect(pathOf('export')).toBe('custom/export');
    expect(
      [
        ...(Reflect.getMetadata(
          ROLES_KEY,
          CustomReportsController,
        ) as string[]),
      ].sort(),
    ).toEqual(['office_staff', 'police_area', 'police_ward', 'system_admin']);
  });

  it('generates with the caller and the validated query', async () => {
    const q = Object.assign(new CustomReportQueryDto(), {
      dataset: 'kpi' as const,
    });
    reports.generate.mockResolvedValueOnce({ rows: [] });
    await controller.generate(req, q);
    expect(reports.generate).toHaveBeenCalledWith(req.user, q);
  });

  it('exports to the response', async () => {
    const q = Object.assign(new CustomReportQueryDto(), {
      dataset: 'payroll' as const,
    });
    const res = {} as Response;
    await controller.export(req, q, res);
    expect(reports.export).toHaveBeenCalledWith(req.user, q, res);
  });
});

describe('CustomReportQueryDto', () => {
  // The same options as the global ValidationPipe (src/app.setup.ts)
  const errorsOf = async (query: Record<string, unknown>) =>
    (
      await validate(plainToInstance(CustomReportQueryDto, query), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).map((e) => e.property);

  it('accepts a complete query, converting the row limit', async () => {
    const query = {
      dataset: 'tasks',
      from: '2026-09-01',
      to: '2026-09-30',
      groupBy: 'assignee',
      status: 'in_progress',
      unitCode: 'KV-A',
      limit: '100',
    };
    expect(await errorsOf(query)).toEqual([]);
    expect(plainToInstance(CustomReportQueryDto, query).limit).toBe(100);
  });

  it('reads blank optional values as absent', async () => {
    expect(
      await errorsOf({
        dataset: 'kpi',
        from: '',
        to: '',
        groupBy: '',
        status: '',
      }),
    ).toEqual([]);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['a missing dataset', {}, 'dataset'],
    ['an unknown dataset', { dataset: 'users' }, 'dataset'],
    ['an impossible date', { dataset: 'kpi', from: '2026-02-30' }, 'from'],
    ['a timestamp', { dataset: 'kpi', to: '2026-09-30T00:00:00Z' }, 'to'],
    ['an unknown breakdown', { dataset: 'kpi', groupBy: 'unit;' }, 'groupBy'],
    [
      'a status that is not a code',
      { dataset: 'kpi', status: "x' OR 1=1" },
      'status',
    ],
    ['a row limit of 0', { dataset: 'kpi', limit: '0' }, 'limit'],
    ['a row limit above 5000', { dataset: 'kpi', limit: '5001' }, 'limit'],
    [
      'a row limit that is not a number',
      { dataset: 'kpi', limit: 'all' },
      'limit',
    ],
    [
      'a long unit code',
      { dataset: 'kpi', unitCode: 'U'.repeat(51) },
      'unitCode',
    ],
    // the page currently sends ?type=; it must move to ?dataset=
    ['the old type parameter', { dataset: 'kpi', type: 'kpi' }, 'type'],
  ])('refuses %s', async (_label, query, property) => {
    expect(await errorsOf(query)).toContain(property);
  });
});
