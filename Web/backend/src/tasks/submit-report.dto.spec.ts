import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SubmitReportDto } from './tasks.controller';

// Same options as the global pipe (app.setup.ts)
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const check = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: SubmitReportDto });

const uuid = (n: number) =>
  `7c1d2e3f-4a5b-4c6d-8e9f-${String(n).padStart(12, '0')}`;

// POST /tasks/:id/report photoIds: ids from POST /files/upload, at most 10, each once
describe('SubmitReportDto.photoIds', () => {
  const body = (photoIds: unknown) => ({
    description: 'Đã hoàn thành tuần tra.',
    photoIds,
  });

  it('accepts up to 10 distinct file ids', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => uuid(i));
    await expect(check(body(ids))).resolves.toMatchObject({ photoIds: ids });
  });

  it.each([
    ['more than 10 photos', Array.from({ length: 11 }, (_, i) => uuid(i))],
    ['the same photo twice', [uuid(1), uuid(1)]],
    ['a stored filename instead of a file id', ['1712345678-123.jpg']],
  ])('refuses %s', async (_label, value) => {
    await expect(check(body(value))).rejects.toThrow(BadRequestException);
  });
});
