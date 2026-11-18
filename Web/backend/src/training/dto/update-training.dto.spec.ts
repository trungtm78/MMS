// PATCH /training/:id validates every field it accepts, the way POST does, but none is
// required (Codex round 2: Partial<CreateTrainingDto> carried no validation at runtime)
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTrainingDto } from './update-training.dto';

async function errorsOf(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateTrainingDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property);
}

describe('UpdateTrainingDto', () => {
  it.each([
    ['an empty body', {}],
    ['a single field', { notes: 'Bổ sung ghi chú' }],
    [
      'every field',
      {
        militiaId: '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d',
        trainingType: 'fire',
        fromDate: '2026-02-02',
        toDate: '2026-02-03',
        totalDays: 1.5,
        location: 'Sân tập',
        instructor: 'Trần Văn D',
        result: 'fail',
        certificateNo: 'CERT-9',
        notes: 'x',
      },
    ],
  ])('accepts %s', async (_label, body) => {
    await expect(errorsOf(body)).resolves.toEqual([]);
  });

  it.each([
    ['militiaId', 'not-a-uuid'],
    ['trainingType', 'sports'],
    ['fromDate', '2026-13-40'],
    ['toDate', 'yesterday'],
    ['totalDays', 0],
    ['totalDays', '5'],
    ['result', 'excellent'],
    ['notes', 42],
    // NOT NULL columns cannot be cleared
    ['militiaId', null],
    ['trainingType', null],
    ['fromDate', null],
    ['toDate', null],
    ['totalDays', null],
  ])('rejects an invalid %s (%p)', async (property, value) => {
    await expect(errorsOf({ [property]: value })).resolves.toEqual([property]);
  });

  it('rejects properties a client may not set', async () => {
    await expect(errorsOf({ createdBy: 'someone' })).resolves.toEqual([
      'createdBy',
    ]);
  });
});
