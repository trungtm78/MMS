import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, requirePermissions } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { userSchemas } from '../middleware/validate';
import { success, badRequest, notFound } from '../utils/response';
import { queryOne, queryMany } from '../db/pool';
import { getUserById, updateUserProfile, changePassword, getMilitiaProfile } from '../services/user.service';

const router = Router();

router.get(
  '/me',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await getUserById(req.user!.id);
      return success(res, user);
    } catch (err) {
      console.error('GET /users/me error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.patch(
  '/me',
  authMiddleware,
  validate(userSchemas.updateProfile),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await updateUserProfile(req.user!.id, req.body);
      return success(res, result);
    } catch (err) {
      console.error('PATCH /users/me error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.post(
  '/me/change-password',
  authMiddleware,
  validate(userSchemas.changePassword),
  async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const result = await changePassword(req.user!.id, currentPassword, newPassword);

    if (!result.success) {
      return badRequest(res, result.error || 'Đổi mật khẩu thất bại');
    }

    return success(res, { message: 'Đổi mật khẩu thành công' });
  }
);

router.get(
  '/me/militia-profile',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const profile = await getMilitiaProfile(req.user!.id);
      return success(res, profile);
    } catch (err) {
      console.error('GET /users/me/militia-profile error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

/**
 * GET /users/me/police-profile
 * CA xem profile của mình.
 */
router.get(
  '/me/police-profile',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
    const profile = await queryOne<{
      id: string;
      user_id: string;
      badge_no: string;
      full_name: string;
      cccd: string;
      dob: Date;
      gender: string;
      phone: string | null;
      unit_id: string;
      unit_name: string;
      position: string | null;
      rank: string;
      appointment_date: Date;
      status: string;
    }>(
      `SELECT pp.*, u.name as unit_name
       FROM police_profiles pp
       JOIN units u ON pp.unit_id = u.id
       WHERE pp.user_id = $1`,
      [req.user!.id]
    );

    if (!profile) {
      return notFound(res, 'Không tìm thấy hồ sơ công an');
    }

    return success(res, {
      id: profile.id,
      userId: profile.user_id,
      badgeNo: profile.badge_no,
      fullName: profile.full_name,
      cccd: profile.cccd,
      dob: profile.dob,
      gender: profile.gender,
      phone: profile.phone,
      unitId: profile.unit_id,
      unitName: profile.unit_name,
      position: profile.position,
      rank: profile.rank,
      appointmentDate: profile.appointment_date,
      status: profile.status,
    });
    } catch (err) {
      console.error('GET /users/me/police-profile error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

/**
 * GET /users?role=militia&search=q&status=status&page=1&limit=20
 * CA xem danh sách DQTV.
 */
router.get(
  '/',
  authMiddleware,
  requirePermissions('militia:view'),
  async (req: AuthRequest, res: Response) => {
    try {
    const { role, unitId, search, status, page = '1', limit = '20' } = req.query as Record<string, string>;

    const conditions: string[] = [`u.status != 'deleted'`];
    const values: unknown[] = [];
    let idx = 1;

    if (role === 'militia') {
      conditions.push(`EXISTS (
        SELECT 1 FROM user_roles ur2
        JOIN roles r2 ON r2.id = ur2.role_id
        WHERE ur2.user_id = u.id AND r2.code = 'militia'
      )`);
    }

    if (unitId) {
      conditions.push(`mp.unit_id = $${idx++}`);
      values.push(unitId);
    }

    if (search) {
      conditions.push(`(mp.full_name ILIKE $${idx} OR mp.militia_code ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    if (status) {
      conditions.push(`u.status = $${idx++}`);
      values.push(status);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const offset = (pageNum - 1) * limitNum;

    const countRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM users u
       LEFT JOIN militia_profiles mp ON mp.user_id = u.id
       ${where}`,
      values
    );
    const total = parseInt(countRow?.count ?? '0');

    const rows = await queryMany<{
      id: string;
      full_name: string;
      militia_code: string | null;
      phone: string | null;
      status: string;
      unit_name: string | null;
      position: string | null;
      total_score: number | null;
      last_seen_at: Date | null;
    }>(
      `SELECT
         u.id,
         COALESCE(mp.full_name, u.full_name) as full_name,
         mp.militia_code,
         COALESCE(mp.phone, u.phone) as phone,
         u.status,
         un.name as unit_name,
         mp.position,
         ks.total_score,
         gl.last_seen_at
       FROM users u
       LEFT JOIN militia_profiles mp ON mp.user_id = u.id
       LEFT JOIN units un ON mp.unit_id = un.id
        LEFT JOIN kpi_scores ks ON ks.militia_id = mp.id
        LEFT JOIN gps_latest gl ON gl.militia_id = mp.id
       ${where}
       ORDER BY mp.militia_code NULLS LAST
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limitNum, offset]
    );

    const data = rows.map(r => {
      const isOnline = r.last_seen_at != null &&
        (new Date().getTime() - new Date(r.last_seen_at).getTime()) < 2 * 60 * 1000;
      return {
        id: r.id,
        fullName: r.full_name,
        militiaCode: r.militia_code,
        phone: r.phone,
        status: r.status,
        unitName: r.unit_name,
        position: r.position,
        kpiScore: r.total_score != null ? Number(r.total_score) : null,
        gpsStatus: isOnline ? 'online' : 'offline',
        lastSeenAt: r.last_seen_at,
      };
    });

    return res.json({
      success: true,
      data,
      meta: { total, page: pageNum, limit: limitNum },
    });
    } catch (err) {
      console.error('GET /users error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

/**
 * GET /users/:id/militia-profile
 * CA xem profile chi tiết 1 DQTV.
 */
router.get(
  '/:id/militia-profile',
  authMiddleware,
  requirePermissions('militia:view'),
  async (req: AuthRequest, res: Response) => {
    try {
      // :id là user_id, không phải militia_profile id
      const profile = await getMilitiaProfile(req.params.id as string);

      if (!profile) {
        return notFound(res, 'Không tìm thấy hồ sơ DQTV');
      }

      return success(res, profile);
    } catch (err) {
      console.error('GET /users/:id/militia-profile error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

export default router;
