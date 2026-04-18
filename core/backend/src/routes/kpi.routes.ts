import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, requireRoles } from '../middleware/auth';
import { success, paginated } from '../utils/response';
import { getCurrentKPI, getKPIHistory, getKPIRanking } from '../services/kpi.service';

const router = Router();

router.get(
  '/current',
  authMiddleware,
  requireRoles('militia'),
  async (req: AuthRequest, res: Response) => {
    const score = await getCurrentKPI(req.user!.id);
    return success(res, score);
  }
);

router.get(
  '/history',
  authMiddleware,
  requireRoles('militia'),
  async (req: AuthRequest, res: Response) => {
    const { page, limit } = req.query;

    const result = await getKPIHistory(req.user!.id, {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 12,
    });

    return paginated(res, result.scores, result.total,
      page ? parseInt(page as string) : 1,
      limit ? parseInt(limit as string) : 12
    );
  }
);

router.get(
  '/ranking',
  authMiddleware,
  requireRoles('militia'),
  async (req: AuthRequest, res: Response) => {
    const { year, month } = req.query;

    const ranking = await getKPIRanking(
      req.user!.id,
      year ? parseInt(year as string) : undefined,
      month ? parseInt(month as string) : undefined
    );

    return success(res, ranking);
  }
);

export default router;
