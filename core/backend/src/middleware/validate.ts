import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError, z } from 'zod';

export function validate(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          code: 'E007',
          message: 'Dữ liệu không hợp lệ',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

// Common validation schemas
export const commonSchemas = {
  uuid: z.string().uuid(),
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
  dateRange: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

// Auth schemas
export const authSchemas = {
  login: z.object({
    body: z.object({
      username: z.string().min(1, 'Tên đăng nhập không được để trống'),
      password: z.string().min(1, 'Mật khẩu không được để trống'),
      device: z.object({
        name: z.string().optional(),
        fingerprint: z.string().optional(),
        platform: z.enum(['android', 'ios', 'web']).optional(),
      }).optional(),
    }),
  }),
  refresh: z.object({
    body: z.object({
      refreshToken: z.string().min(1, 'Refresh token không được để trống'),
    }),
  }),
  verifyMfa: z.object({
    body: z.object({
      tempToken: z.string().min(1, 'Temp token không được để trống'),
      code: z.string().length(6, 'Mã OTP phải có đúng 6 chữ số').regex(/^\d{6}$/, 'Mã OTP chỉ chứa chữ số'),
    }),
  }),
  verifyRecovery: z.object({
    body: z.object({
      tempToken: z.string().min(1, 'Temp token không được để trống'),
      recoveryCode: z.string().min(1, 'Mã khôi phục không được để trống'),
    }),
  }),
};

// Task schemas
export const taskSchemas = {
  create: z.object({
    body: z.preprocess((raw: unknown) => {
      // Normalize snake_case → camelCase for Flutter/test compatibility
      if (typeof raw === 'object' && raw !== null) {
        const b = raw as Record<string, unknown>;
        if (b.task_type !== undefined && b.type === undefined) b.type = b.task_type;
        if (b.assignee_ids !== undefined && b.assigneeIds === undefined) b.assigneeIds = b.assignee_ids;
        // Map 'normal' priority to 'medium'
        if (b.priority === 'normal') b.priority = 'medium';
      }
      return raw;
    }, z.object({
      title: z.string().min(1, 'Tiêu đề không được để trống').max(255),
      description: z.string().optional(),
      type: z.enum(['patrol', 'guard', 'inspection', 'support', 'training', 'admin', 'other']),
      priority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium'),
      deadline: z.coerce.date().optional(),
      assigneeIds: z.array(z.string().uuid()).min(1, 'Cần ít nhất 1 người được phân công'),
      location: z.object({
        name: z.string().optional(),
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
      }).optional(),
    })),
  }),
  updateProgress: z.object({
    params: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({
      progress: z.number().int().min(0).max(100),
      note: z.string().optional(),
      location: z.object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
      }).optional(),
    }),
  }),
};

// Attendance schemas
export const attendanceSchemas = {
  checkIn: z.object({
    body: z.object({
      taskId: z.string().uuid().optional(),
      location: z.object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        accuracy: z.coerce.number().optional(),
      }),
      source: z.enum(['mobile', 'web', 'manual']).default('mobile'),
    }),
  }),
  checkOut: z.object({
    body: z.object({
      location: z.object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        accuracy: z.coerce.number().optional(),
      }).optional(),
    }),
  }),
};

// Leave request schemas
export const leaveSchemas = {
  create: z.object({
    body: z.object({
      leaveTypeId: z.string().uuid(),
      fromDate: z.coerce.date(),
      toDate: z.coerce.date(),
      isHalfDay: z.boolean().default(false),
      halfDayPeriod: z.enum(['morning', 'afternoon']).optional(),
      reason: z.string().min(20, 'Lý do phải có ít nhất 20 ký tự').max(500),
      replacementId: z.string().uuid().optional(),
    }),
  }),
  approve: z.object({
    params: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({
      action: z.enum(['approved', 'rejected']),
      reason: z.string().optional(),
    }),
  }),
};

// Incident schemas
export const incidentSchemas = {
  sos: z.object({
    body: z.object({
      severity: z.enum(['low', 'medium', 'high', 'urgent']),
      message: z.string().min(1, 'Mô tả không được để trống'),
      location: z.object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        name: z.string().optional(),
      }).optional(),
    }),
  }),
  report: z.object({
    body: z.object({
      incidentType: z.enum(['sos', 'security', 'fire', 'medical', 'accident', 'utility', 'other']),
      severity: z.enum(['low', 'medium', 'high', 'urgent']),
      title: z.string().min(1, 'Tiêu đề không được để trống'),
      message: z.string().min(20, 'Mô tả phải có ít nhất 20 ký tự'),
      location: z.object({
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
        name: z.string().optional(),
      }).optional(),
    }),
  }),
};

// User schemas
export const userSchemas = {
  updateProfile: z.object({
    body: z.object({
      fullName: z.string().min(1).max(255).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(20).optional(),
    }),
  }),
  changePassword: z.object({
    body: z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
    }),
  }),
};
