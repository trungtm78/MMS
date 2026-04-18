import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, requirePermissions } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { incidentSchemas } from '../middleware/validate';
import { success, paginated, notFound } from '../utils/response';
import { 
  createSOS, 
  createIncidentReport, 
  getIncidentById,
  getIncidents,
  resolveIncident,
  IncidentStatus,
  IncidentSeverity,
  IncidentType
} from '../services/incident.service';

const router = Router();

router.post(
  '/sos',
  authMiddleware,
  validate(incidentSchemas.sos),
  async (req: AuthRequest, res: Response) => {
    const incident = await createSOS(req.user!.id, req.body);
    return success(res, incident, 201);
  }
);

router.post(
  '/report',
  authMiddleware,
  validate(incidentSchemas.report),
  async (req: AuthRequest, res: Response) => {
    const incident = await createIncidentReport(req.user!.id, req.body);
    return success(res, incident, 201);
  }
);

router.get(
  '/',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { page, limit, status, severity, type } = req.query;

    const result = await getIncidents({
      reporterId: req.user!.roles.includes('militia') ? req.user!.id : undefined,
      status: typeof status === 'string' ? status as IncidentStatus : undefined,
      severity: typeof severity === 'string' ? severity as IncidentSeverity : undefined,
      type: typeof type === 'string' ? type as IncidentType : undefined,
      page: typeof page === 'string' ? parseInt(page) : 1,
      limit: typeof limit === 'string' ? parseInt(limit) : 20,
    });

    return paginated(res, result.incidents, result.total,
      page ? parseInt(page as string) : 1,
      limit ? parseInt(limit as string) : 20
    );
  }
);

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const incident = await getIncidentById(String(req.params.id));

    if (!incident) {
      return notFound(res, 'Không tìm thấy báo cáo');
    }

    return success(res, incident);
  }
);

router.post(
  '/:id/resolve',
  authMiddleware,
  requirePermissions('incidents:resolve'),
  async (req: AuthRequest, res: Response) => {
    const { resolutionNote } = req.body;

    if (!resolutionNote) {
      return notFound(res, 'Vui lòng nhập ghi chú xử lý');
    }

    const incident = await resolveIncident(
      String(req.params.id),
      req.user!.id,
      resolutionNote
    );

    if (!incident) {
      return notFound(res, 'Không tìm thấy báo cáo');
    }

    return success(res, incident);
  }
);

export default router;
