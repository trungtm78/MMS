import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, requirePermissions } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { taskSchemas } from '../middleware/validate';
import { success, paginated, notFound } from '../utils/response';
import { getTasks, getTaskById, acceptTask, updateTaskProgress, createTask, TaskStatus, TaskType, TaskPriority } from '../services/task.service';

const router = Router();

router.get(
  '/',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, status, type, priority, from, to } = req.query;

      const result = await getTasks({
        assigneeId: req.user!.roles.includes('militia') ? req.user!.id : undefined,
        status: typeof status === 'string' ? status as TaskStatus : undefined,
        type: typeof type === 'string' ? type as TaskType : undefined,
        priority: typeof priority === 'string' ? priority as TaskPriority : undefined,
        fromDate: typeof from === 'string' ? new Date(from) : undefined,
        toDate: typeof to === 'string' ? new Date(to) : undefined,
        page: typeof page === 'string' ? parseInt(page) : 1,
        limit: typeof limit === 'string' ? parseInt(limit) : 20,
      });

      return paginated(res, result.tasks, result.total, 
        typeof page === 'string' ? parseInt(page) : 1,
        typeof limit === 'string' ? parseInt(limit) : 20
      );
    } catch (err) {
      console.error('GET /tasks error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const task = await getTaskById(String(req.params.id));

      if (!task) {
        return notFound(res, 'Không tìm thấy nhiệm vụ');
      }

      return success(res, task);
    } catch (err) {
      console.error('GET /tasks/:id error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.post(
  '/',
  authMiddleware,
  requirePermissions('tasks:create'),
  validate(taskSchemas.create),
  async (req: AuthRequest, res: Response) => {
    try {
      // Normalize snake_case → camelCase
      const body = { ...req.body };
      if (body.task_type !== undefined && body.type === undefined) body.type = body.task_type;
      if (body.assignee_ids !== undefined && body.assigneeIds === undefined) body.assigneeIds = body.assignee_ids;
      if (body.priority === 'normal') body.priority = 'medium';
      const task = await createTask(body, req.user!.id);
      return success(res, task, 201);
    } catch (err) {
      console.error('POST /tasks error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/accept',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const task = await acceptTask(String(req.params.id), req.user!.id);

      if (!task) {
        return notFound(res, 'Không tìm thấy nhiệm vụ hoặc bạn không được phân công');
      }

      return success(res, task);
    } catch (err) {
      console.error('POST /tasks/:id/accept error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/progress',
  authMiddleware,
  validate(taskSchemas.updateProgress),
  async (req: AuthRequest, res: Response) => {
    try {
      const { progress, note, location } = req.body;

      const task = await updateTaskProgress(String(req.params.id), req.user!.id, {
        progress,
        note,
        location,
      });

      if (!task) {
        return notFound(res, 'Không tìm thấy nhiệm vụ hoặc bạn không được phân công');
      }

      return success(res, task);
    } catch (err) {
      console.error('POST /tasks/:id/progress error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

// POST /:id/report — submit a completion report / note
router.post(
  '/:id/report',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      const { badRequest } = await import('../utils/response');
      return badRequest(res, 'Nội dung báo cáo không được để trống');
    }

    // Reuse updateTaskProgress at 100% with the report content as note
    const task = await updateTaskProgress(String(req.params.id), req.user!.id, {
      progress: 100,
      note: content.trim(),
    });

    if (!task) {
      return notFound(res, 'Không tìm thấy nhiệm vụ hoặc bạn không được phân công');
    }

    return success(res, task);
  }
);

export default router;
