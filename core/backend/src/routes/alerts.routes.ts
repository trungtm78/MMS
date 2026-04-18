import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, requirePermissions } from '../middleware/auth';
import { success, notFound } from '../utils/response';
import { getAlerts, resolveAlert } from '../services/alert.service';

const router = Router();

/**
 * GET /alerts
 * CA xem danh sách cảnh báo.
 * Query: status (active/acknowledged/resolved/all), category, severity, page, limit
 */
router.get(
  '/',
  authMiddleware,
  requirePermissions('alerts:manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        status,
        category,
        severity,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string>;

      const result = await getAlerts({
        status: status || 'active',
        category,
        severity,
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
      });

      return res.json({
        success: true,
        data: result.data,
        meta: {
          total: result.total,
          unreadCount: result.unreadCount,
          page: parseInt(page),
          limit: Math.min(parseInt(limit), 100),
        },
      });
    } catch (err) {
      console.error('[Alerts] list error:', err);
      return res.status(500).json({ success: false, error: { code: 'E005', message: 'Lỗi lấy danh sách cảnh báo' } });
    }
  }
);

/**
 * POST /alerts/:id/resolve
 * CA xử lý cảnh báo.
 * Body: { note?: string }
 */
router.post(
  '/:id/resolve',
  authMiddleware,
  requirePermissions('alerts:manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { note } = req.body;

      const alert = await resolveAlert(id as string, req.user!.id, note);

      if (!alert) {
        return notFound(res, 'Không tìm thấy cảnh báo');
      }

      return success(res, alert);
    } catch (err) {
      console.error('[Alerts] resolve error:', err);
      return res.status(500).json({ success: false, error: { code: 'E005', message: 'Lỗi xử lý cảnh báo' } });
    }
  }
);

export default router;
