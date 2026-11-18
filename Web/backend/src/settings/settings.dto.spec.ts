import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { KpiTargetsDto, NotificationPreferencesDto } from './settings.dto';

// The same options as the global ValidationPipe (src/app.setup.ts)
const OPTIONS = { whitelist: true, forbidNonWhitelisted: true };

async function errorsOf<T extends object>(
  cls: new () => T,
  body: unknown,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body) as object, OPTIONS);
  const flatten = (list: typeof errors, prefix = ''): string[] =>
    list.flatMap((e) => [
      ...(e.constraints ? [`${prefix}${e.property}`] : []),
      ...flatten(e.children ?? [], `${prefix}${e.property}.`),
    ]);
  return flatten(errors);
}

describe('KpiTargetsDto', () => {
  const valid = {
    minAttendanceDays: 22,
    minTasksCompleted: 10,
    maxOverdueTasks: 2,
    minTrainingHours: 40,
    evaluationPeriod: 'monthly',
  };

  it('accepts the page body', async () => {
    expect(await errorsOf(KpiTargetsDto, valid)).toEqual([]);
  });

  it('accepts the bounds of every range', async () => {
    expect(
      await errorsOf(KpiTargetsDto, {
        minAttendanceDays: 31,
        minTasksCompleted: 0,
        maxOverdueTasks: 20,
        minTrainingHours: 500,
        evaluationPeriod: 'yearly',
      }),
    ).toEqual([]);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['0 attendance days', { minAttendanceDays: 0 }, 'minAttendanceDays'],
    ['32 attendance days', { minAttendanceDays: 32 }, 'minAttendanceDays'],
    ['a numeric string', { minAttendanceDays: '22' }, 'minAttendanceDays'],
    ['a fraction', { minTasksCompleted: 2.5 }, 'minTasksCompleted'],
    ['101 tasks', { minTasksCompleted: 101 }, 'minTasksCompleted'],
    ['-1 overdue tasks', { maxOverdueTasks: -1 }, 'maxOverdueTasks'],
    ['501 training hours', { minTrainingHours: 501 }, 'minTrainingHours'],
    ['a weekly period', { evaluationPeriod: 'weekly' }, 'evaluationPeriod'],
    ['a missing field', { minTrainingHours: undefined }, 'minTrainingHours'],
    ['an unknown field', { bonus: 1 }, 'bonus'],
  ])('refuses %s', async (_label, change, property) => {
    expect(await errorsOf(KpiTargetsDto, { ...valid, ...change })).toContain(
      property,
    );
  });
});

describe('NotificationPreferencesDto', () => {
  const valid = {
    channels: { inApp: true, push: true, email: false },
    categories: {
      taskAssigned: true,
      taskOverdue: false,
      attendanceReminder: true,
      leaveApproval: true,
      systemAnnouncements: true,
      sosAlerts: true,
    },
  };

  it('accepts complete channels and categories', async () => {
    expect(await errorsOf(NotificationPreferencesDto, valid)).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ['missing channels', { categories: valid.categories }, 'channels'],
    ['missing categories', { channels: valid.channels }, 'categories'],
    [
      'a missing category',
      { ...valid, categories: { ...valid.categories, sosAlerts: undefined } },
      'categories.sosAlerts',
    ],
    [
      'a non-boolean channel',
      { ...valid, channels: { ...valid.channels, push: 'yes' } },
      'channels.push',
    ],
    [
      'an unknown category',
      { ...valid, categories: { ...valid.categories, marketing: true } },
      'categories.marketing',
    ],
    // The flat body the page sends today is refused rather than half-applied
    ['the flat page body', { ...valid.categories }, 'channels'],
  ])('refuses %s', async (_label, body, property) => {
    expect(await errorsOf(NotificationPreferencesDto, body)).toContain(
      property,
    );
  });
});
