// Uniform error response format — E001..E005 mapping
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
  429: 'E004', // Too many requests
  500: 'E005', // System error
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        (exception as Error).stack,
      );
    }

    response.status(status).json({
      code: ERROR_CODES[status] ?? 'E005',
      message,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
