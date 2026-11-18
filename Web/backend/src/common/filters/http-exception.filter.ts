// Uniform error response format — E001..E006 mapping
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const ERROR_CODES: Record<number, string> = {
  400: 'E001', // Bad request / validation
  401: 'E004', // Unauthorized
  403: 'E004', // Forbidden
  404: 'E003', // Not found
  409: 'E002', // Conflict
  429: 'E006', // Too many requests
  500: 'E005', // System error
};

// ValidationPipe reports one message per failed constraint in response.message
function validationMessages(exception: HttpException): string[] | undefined {
  const body = exception.getResponse();
  if (typeof body !== 'object' || body === null) return undefined;
  const message = (body as { message?: unknown }).message;
  return Array.isArray(message)
    ? message.filter((m): m is string => typeof m === 'string')
    : undefined;
}

// Structured data an application error carries for the client (e.g. attemptsRemaining)
function detailsOf(
  exception: HttpException,
): Record<string, unknown> | undefined {
  const body = exception.getResponse();
  if (typeof body !== 'object' || body === null) return undefined;
  const details = (body as { details?: unknown }).details;
  return typeof details === 'object' &&
    details !== null &&
    !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : undefined;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const errors = isHttp ? validationMessages(exception) : undefined;
    const details = isHttp ? detailsOf(exception) : undefined;

    // Application errors carry a code (e.g. "leave_request_not_pending"); unexpected
    // errors never reveal their details
    const message = !isHttp
      ? 'Internal server error'
      : errors
        ? 'validation_failed'
        : exception.message;

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        (exception as Error).stack,
      );
    }

    response.status(status).json({
      code: ERROR_CODES[status] ?? 'E005',
      message,
      ...(errors ? { errors } : {}),
      ...(details ? { details } : {}),
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
