import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateTrainingPlanDto,
  CreateTrainingSessionDto,
  SessionAttendanceDto,
  TrainingPlanQueryDto,
  TrainingSessionQueryDto,
  UpdateTrainingPlanStatusDto,
} from './training-plan.dto';

// Same options as the global pipe in app.setup.ts
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

const PLAN = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';
const M1 = '1b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';
const M2 = '2b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';

describe('training plan and session DTOs', () => {
  describe('CreateTrainingPlanDto', () => {
    const valid = { year: 2026, type: 'military', requiredDays: 15 };

    it('accepts the body the web form sends', async () => {
      await expect(validate(CreateTrainingPlanDto, valid)).resolves.toEqual(
        valid,
      );
    });

    it('accepts an optional title, half days and a unit', async () => {
      await expect(
        validate(CreateTrainingPlanDto, {
          ...valid,
          requiredDays: 7.5,
          title: '  Chiến đấu cơ bản ',
          unitCode: 'KV1',
        }),
      ).resolves.toMatchObject({
        requiredDays: 7.5,
        title: 'Chiến đấu cơ bản',
        unitCode: 'KV1',
      });
    });

    it.each([
      [
        'a free-text type instead of a training type code',
        { type: 'Chiến đấu cơ bản' },
      ],
      ['a year before 2000', { year: 1999 }],
      ['a year as text', { year: '2026' }],
      ['a fractional year', { year: 2026.5 }],
      ['no required days', { requiredDays: 0 }],
      ['more than a year of days', { requiredDays: 366 }],
      ['hundredths of a day', { requiredDays: 7.25 }],
      ['an unknown property', { status: 'active' }],
    ])('refuses %s', async (_label, change) => {
      await expect(
        validate(CreateTrainingPlanDto, { ...valid, ...change }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('TrainingPlanQueryDto', () => {
    it('reads a four-digit year as a number and blank filters as absent', async () => {
      await expect(
        validate(
          TrainingPlanQueryDto,
          { year: '2026', status: '', unitCode: '' },
          'query',
        ),
      ).resolves.toEqual({ year: 2026 });
    });

    it('refuses a malformed year or an unknown status', async () => {
      await expect(
        validate(TrainingPlanQueryDto, { year: '2026junk' }, 'query'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        validate(TrainingPlanQueryDto, { status: 'closed' }, 'query'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('UpdateTrainingPlanStatusDto', () => {
    it('moves a plan forward only', async () => {
      await expect(
        validate(UpdateTrainingPlanStatusDto, { status: 'active' }),
      ).resolves.toEqual({ status: 'active' });
      await expect(
        validate(UpdateTrainingPlanStatusDto, { status: 'completed' }),
      ).resolves.toEqual({ status: 'completed' });
      await expect(
        validate(UpdateTrainingPlanStatusDto, { status: 'draft' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('CreateTrainingSessionDto', () => {
    const valid = {
      planId: PLAN,
      name: 'Đợt 1 năm 2026',
      startDate: '2026-06-01',
      endDate: '2026-06-15',
      location: 'Thao trường',
      daysCount: 15,
    };

    it('accepts a session and trims its text', async () => {
      await expect(
        validate(CreateTrainingSessionDto, {
          ...valid,
          name: ' Đợt 1 năm 2026 ',
        }),
      ).resolves.toEqual(valid);
    });

    it.each([
      ['no plan', { planId: undefined }],
      ['a blank name', { name: '  ' }],
      ['a blank location', { location: '' }],
      ['an impossible start date', { startDate: '2026-06-31' }],
      ['no days', { daysCount: 0 }],
    ])('refuses %s', async (_label, change) => {
      await expect(
        validate(CreateTrainingSessionDto, { ...valid, ...change }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('TrainingSessionQueryDto', () => {
    it('filters by plan and year', async () => {
      await expect(
        validate(
          TrainingSessionQueryDto,
          { planId: PLAN, year: '2026' },
          'query',
        ),
      ).resolves.toEqual({ planId: PLAN, year: 2026 });
      await expect(
        validate(TrainingSessionQueryDto, { planId: 'tp1' }, 'query'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('SessionAttendanceDto', () => {
    it('accepts the attendance list the web form sends', async () => {
      const body = {
        attendance: [
          { memberId: M1, attended: true },
          { memberId: M2, attended: false },
        ],
      };

      await expect(validate(SessionAttendanceDto, body)).resolves.toEqual(body);
    });

    it.each([
      ['no attendance list', {}],
      ['an empty list', { attendance: [] }],
      [
        'the same member twice',
        {
          attendance: [
            { memberId: M1, attended: true },
            { memberId: M1, attended: false },
          ],
        },
      ],
      [
        'a malformed member id',
        { attendance: [{ memberId: 'm1', attended: true }] },
      ],
      [
        'attendance as text',
        { attendance: [{ memberId: M1, attended: 'yes' }] },
      ],
      [
        'an unknown property on an entry',
        { attendance: [{ memberId: M1, attended: true, note: 'x' }] },
      ],
      [
        'more than 1000 entries',
        {
          attendance: Array.from({ length: 1001 }, (_, i) => ({
            memberId: `${String(i).padStart(8, '0')}-3a53-4f4f-9d1a-6c1c2f7f1a01`,
            attended: true,
          })),
        },
      ],
    ])('refuses %s', async (_label, body) => {
      await expect(validate(SessionAttendanceDto, body)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
