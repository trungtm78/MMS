import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // PostgreSQL unique constraint violation
  if (err.message.includes('duplicate key value violates unique constraint')) {
    return res.status(409).json({
      code: 'E008',
      message: 'Dữ liệu đã tồn tại',
      details: {},
    });
  }

  // PostgreSQL foreign key violation
  if (err.message.includes('violates foreign key constraint')) {
    return res.status(400).json({
      code: 'E009',
      message: 'Dữ liệu tham chiếu không tồn tại',
      details: {},
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const code = err.code || 'E005';
  const message = err.message || 'Lỗi máy chủ nội bộ';

  return res.status(statusCode).json({
    code,
    message,
    details: err.details || {},
  });
}

export function notFoundHandler(req: Request, res: Response) {
  return res.status(404).json({
    code: 'E010',
    message: 'Không tìm thấy tài nguyên',
    details: {
      path: req.path,
      method: req.method,
    },
  });
}

// Async handler wrapper
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Success response helper
export function success<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export function paginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return res.json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}
