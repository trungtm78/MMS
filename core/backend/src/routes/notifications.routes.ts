import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { success, paginated, badRequest } from '../utils/response';
import { queryOne } from '../db/pool';
import { 
  getNotifications, 
  markAsRead, 
  markAllAsRead,
  NotificationType
} from '../services/notification.service';

const router = Router();

router.get(
  '/',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, unreadOnly, type } = req.query;

      const result = await getNotifications(req.user!.id, {
        unreadOnly: unreadOnly === 'true',
        type: typeof type === 'string' ? type as NotificationType : undefined,
        page: typeof page === 'string' ? parseInt(page) : 1,
        limit: typeof limit === 'string' ? parseInt(limit) : 20,
      });

      return paginated(res, result.notifications, result.total,
        typeof page === 'string' ? parseInt(page) : 1,
        typeof limit === 'string' ? parseInt(limit) : 20
      );
    } catch (err) {
      console.error('GET /notifications error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/read',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const read = await markAsRead(req.user!.id, String(req.params.id));
      return success(res, { read });
    } catch (err) {
      console.error('POST /notifications/:id/read error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.post(
  '/read-all',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const count = await markAllAsRead(req.user!.id);
      return success(res, { count });
    } catch (err) {
      console.error('POST /notifications/read-all error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

// POST /notifications/fcm-token — register/update FCM device token
router.post(
  '/fcm-token',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { token, platform } = req.body;
    if (!token || typeof token !== 'string') {
      return badRequest(res, 'Token FCM không hợp lệ');
    }

    try {
      // Upsert: update token for this device fingerprint if exists, else insert
      await queryOne(
        `INSERT INTO devices (user_id, device_name, fingerprint, platform, push_token, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (fingerprint) DO UPDATE
         SET push_token = $5, last_seen_at = NOW()
         WHERE devices.user_id = $1`,
        [
          req.user!.id,
          `${platform ?? 'mobile'} device`,
          `fcm:${req.user!.id}:${platform ?? 'mobile'}`, // stable fingerprint per user+platform
          platform ?? 'mobile',
          token,
        ]
      );
      return success(res, { registered: true });
    } catch (error) {
      console.error('Register FCM token error:', error);
      // Non-critical — don't fail the app
      return success(res, { registered: false });
    }
  }
);

export default router;
