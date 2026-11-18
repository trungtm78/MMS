// Every error reaches clients in one shape; codes let the web and mobile apps map messages
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/v1/mms_core/leave' }),
    }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(exception, host);

  const [code] = status.mock.calls[0] as unknown as [number];
  const [body] = json.mock.calls[0] as unknown as [Record<string, unknown>];
  return { code, body };
}

describe('HttpExceptionFilter', () => {
  it('passes the error code thrown by the application as the message', () => {
    const { code, body } = run(
      new ForbiddenException('cannot_review_own_request'),
    );

    expect(code).toBe(403);
    expect(body).toMatchObject({
      code: 'E004',
      message: 'cannot_review_own_request',
      statusCode: 403,
      path: '/api/v1/mms_core/leave',
    });
  });

  // ValidationPipe throws one message per failed constraint; clients need them to show
  // which field is wrong
  it('keeps every validation message', () => {
    const { code, body } = run(
      new BadRequestException([
        'fromDate must be YYYY-MM-DD',
        'reason should not be empty',
      ]),
    );

    expect(code).toBe(400);
    expect(body).toMatchObject({
      code: 'E001',
      message: 'validation_failed',
      errors: ['fromDate must be YYYY-MM-DD', 'reason should not be empty'],
    });
  });

  // e.g. how many codes an MFA challenge still accepts
  it('passes structured details thrown with an application error', () => {
    const { code, body } = run(
      new HttpException(
        { message: 'invalid_code', details: { attemptsRemaining: 3 } },
        HttpStatus.UNAUTHORIZED,
      ),
    );

    expect(code).toBe(401);
    expect(body).toMatchObject({
      code: 'E004',
      message: 'invalid_code',
      details: { attemptsRemaining: 3 },
    });
  });

  it('adds no details key when none were thrown', () => {
    const { body } = run(new ForbiddenException('cannot_review_own_request'));

    expect(body).not.toHaveProperty('details');
  });

  it('gives rate limiting its own code', () => {
    const { body } = run(
      new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
    );

    expect(body).toMatchObject({ code: 'E006', statusCode: 429 });
  });

  it('never reveals the details of an unexpected error', () => {
    const { code, body } = run(new Error('relation "users" does not exist'));

    expect(code).toBe(500);
    expect(body).toMatchObject({
      code: 'E005',
      message: 'Internal server error',
    });
    expect(JSON.stringify(body)).not.toContain('relation');
  });
});
