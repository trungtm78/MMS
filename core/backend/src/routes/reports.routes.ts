import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, requireRoles, requirePermissions } from '../middleware/auth';
import { success, created, badRequest } from '../utils/response';
import { createReport, getMyReports, getTeamReport } from '../services/report.service';

const router = Router();

/**
 * POST /reports
 * DQTV gửi báo cáo công việc.
 * Body: { reportType, content, location?, images? }
 */
router.post(
  '/',
  authMiddleware,
  requireRoles('militia'),
  async (req: AuthRequest, res: Response) => {
    // Accept both camelCase (reportType) and snake_case (report_type)
    const reportType = req.body.reportType ?? req.body.report_type;
    const { content, location, images } = req.body;

    if (!reportType || !['daily', 'incident', 'monthly'].includes(reportType)) {
      return badRequest(res, 'report_type phải là daily, incident hoặc monthly');
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return badRequest(res, 'Nội dung báo cáo không được để trống');
    }

    // Validate images
    if (images != null) {
      if (!Array.isArray(images)) {
        return badRequest(res, 'images phải là mảng');
      }
      if (images.length > 5) {
        return badRequest(res, 'Tối đa 5 ảnh đính kèm');
      }
    }

    try {
      const report = await createReport(req.user!.id, {
        reportType,
        content: content.trim(),
        location: location?.trim() || undefined,
        images: images || [],
      });
      return created(res, report);
    } catch (err) {
      console.error('[Reports] create error:', err);
      return res.status(500).json({ success: false, error: { code: 'E005', message: 'Lỗi tạo báo cáo' } });
    }
  }
);

/**
 * GET /reports/my
 * DQTV xem báo cáo của mình.
 * Query: reportType, page, limit
 */
router.get(
  '/my',
  authMiddleware,
  requireRoles('militia'),
  async (req: AuthRequest, res: Response) => {
    const { reportType, page = '1', limit = '20' } = req.query as Record<string, string>;

    try {
      const result = await getMyReports(req.user!.id, {
        reportType,
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
      });
      return res.json({
        success: true,
        data: result.data,
        meta: {
          total: result.total,
          page: parseInt(page),
          limit: Math.min(parseInt(limit), 100),
        },
      });
    } catch (err) {
      console.error('[Reports] my error:', err);
      return res.status(500).json({ success: false, error: { code: 'E005', message: 'Lỗi lấy báo cáo' } });
    }
  }
);

/**
 * GET /reports/team
 * CA xem báo cáo tổng hợp đội.
 * Query: year, month, unitId
 */
router.get(
  '/team',
  authMiddleware,
  requirePermissions('reports:team'),
  async (req: AuthRequest, res: Response) => {
    const now = new Date();
    const {
      year = String(now.getFullYear()),
      month = String(now.getMonth() + 1),
      unitId,
    } = req.query as Record<string, string>;

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || yearNum < 2020 || yearNum > 2100) {
      return badRequest(res, 'year không hợp lệ');
    }
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return badRequest(res, 'month phải từ 1 đến 12');
    }

    try {
      const data = await getTeamReport({ year: yearNum, month: monthNum, unitId });
      return success(res, data);
    } catch (err) {
      console.error('[Reports] team error:', err);
      return res.status(500).json({ success: false, error: { code: 'E005', message: 'Lỗi lấy báo cáo đội' } });
    }
  }
);

export default router;
