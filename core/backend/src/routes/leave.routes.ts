import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, requirePermissions } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { leaveSchemas } from '../middleware/validate';
import { success, paginated, notFound, badRequest } from '../utils/response';
import { 
  getLeaveTypes, 
  createLeaveRequest, 
  getLeaveRequestById,
  getMyLeaveRequests,
  approveLeaveRequest,
  getLeaveBalance,
  LeaveStatus
} from '../services/leave.service';

const router = Router();

router.get(
  '/types',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const types = await getLeaveTypes();
      return success(res, types);
    } catch (err) {
      console.error('GET /leave-requests/types error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.get(
  '/balance',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { year } = req.query;
      const balance = await getLeaveBalance(
        req.user!.id,
        year ? parseInt(year as string) : undefined
      );
      return success(res, balance);
    } catch (err) {
      console.error('GET /leave-requests/balance error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.get(
  '/',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, status } = req.query;

      const result = await getMyLeaveRequests(req.user!.id, {
        status: typeof status === 'string' ? status as LeaveStatus : undefined,
        page: typeof page === 'string' ? parseInt(page) : 1,
        limit: typeof limit === 'string' ? parseInt(limit) : 20,
      });

      return paginated(res, result.requests, result.total,
        typeof page === 'string' ? parseInt(page) : 1,
        typeof limit === 'string' ? parseInt(limit) : 20
      );
    } catch (err) {
      console.error('GET /leave-requests error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.post(
  '/',
  authMiddleware,
  validate(leaveSchemas.create),
  async (req: AuthRequest, res: Response) => {
    try {
      const request = await createLeaveRequest(req.user!.id, req.body);
      return success(res, request, 201);
    } catch (err) {
      console.error('POST /leave-requests error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const request = await getLeaveRequestById(String(req.params.id));

      if (!request) {
        return notFound(res, 'Không tìm thấy đơn xin nghỉ');
      }

      return success(res, request);
    } catch (err) {
      console.error('GET /leave-requests/:id error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/decision',
  authMiddleware,
  requirePermissions('leave:approve'),
  validate(leaveSchemas.approve),
  async (req: AuthRequest, res: Response) => {
    try {
      const { action, reason } = req.body;

      const request = await approveLeaveRequest(
        String(req.params.id),
        req.user!.id,
        action,
        reason
      );

      if (!request) {
        return badRequest(res, 'Không thể xử lý đơn này');
      }

      return success(res, request);
    } catch (err) {
      console.error('POST /leave-requests/:id/decision error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

export default router;
