import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, requireRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { attendanceSchemas } from '../middleware/validate';
import { success, paginated, badRequest } from '../utils/response';
import { 
  checkIn, 
  checkOut, 
  getTodayAttendance, 
  getAttendanceHistory,
  getAttendanceStats 
} from '../services/attendance.service';

const router = Router();

router.post(
  '/check-in',
  authMiddleware,
  requireRoles('militia'),
  validate(attendanceSchemas.checkIn),
  async (req: AuthRequest, res: Response) => {
    try {
      const { taskId, location, source } = req.body;

      const record = await checkIn(req.user!.id, {
        taskId,
        location,
        source,
      });

      return success(res, record);
    } catch (error) {
      if (error instanceof Error) {
        return badRequest(res, error.message);
      }
      throw error;
    }
  }
);

router.post(
  '/check-out',
  authMiddleware,
  requireRoles('militia'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { location } = req.body;

      const record = await checkOut(req.user!.id, { location });

      if (!record) {
        return badRequest(res, 'Không tìm thấy bản ghi điểm danh');
      }

      return success(res, record);
    } catch (error) {
      if (error instanceof Error) {
        return badRequest(res, error.message);
      }
      throw error;
    }
  }
);

router.get(
  '/today',
  authMiddleware,
  requireRoles('militia'),
  async (req: AuthRequest, res: Response) => {
    try {
      const record = await getTodayAttendance(req.user!.id);
      return success(res, record);
    } catch (err) {
      console.error('GET /attendance/today error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.get(
  '/history',
  authMiddleware,
  requireRoles('militia'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, from, to } = req.query;

      const result = await getAttendanceHistory(req.user!.id, {
        from: from ? new Date(from as string) : undefined,
        to: to ? new Date(to as string) : undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 30,
      });

      return paginated(res, result.records, result.total,
        page ? parseInt(page as string) : 1,
        limit ? parseInt(limit as string) : 30
      );
    } catch (err) {
      console.error('GET /attendance/history error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.get(
  '/stats',
  authMiddleware,
  requireRoles('militia'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { year, month } = req.query;

      const stats = await getAttendanceStats(
        req.user!.id,
        year ? parseInt(year as string) : undefined,
        month ? parseInt(month as string) : undefined
      );

      return success(res, stats);
    } catch (err) {
      console.error('GET /attendance/stats error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

export default router;
