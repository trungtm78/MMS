import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function success<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export function created<T>(res: Response, data: T): Response {
  return success(res, data, 201);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function paginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
): Response {
  return res.json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
}

export function badRequest(res: Response, message: string, details?: unknown): Response {
  return res.status(400).json({
    success: false,
    error: {
      code: 'E007',
      message,
      details,
    },
  });
}

export function unauthorized(res: Response, message = 'Unauthorized'): Response {
  return res.status(401).json({
    success: false,
    error: {
      code: 'E001',
      message,
    },
  });
}

export function forbidden(res: Response, message = 'Forbidden'): Response {
  return res.status(403).json({
    success: false,
    error: {
      code: 'E006',
      message,
    },
  });
}

export function notFound(res: Response, message = 'Not found'): Response {
  return res.status(404).json({
    success: false,
    error: {
      code: 'E010',
      message,
    },
  });
}

export function conflict(res: Response, message: string, details?: unknown): Response {
  return res.status(409).json({
    success: false,
    error: {
      code: 'E008',
      message,
      details,
    },
  });
}

export function internalError(res: Response, message = 'Internal server error'): Response {
  return res.status(500).json({
    success: false,
    error: {
      code: 'E005',
      message,
    },
  });
}
