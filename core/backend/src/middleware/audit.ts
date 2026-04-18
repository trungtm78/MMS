import { Request, Response, NextFunction } from 'express';
import { query } from '../db/pool';
import { AuthRequest } from './auth';

interface AuditConfig {
  action: string;
  entityType: string;
  getEntityId?: (req: Request) => string | undefined;
  getBeforeState?: (req: Request) => Promise<unknown>;
  getAfterState?: (req: Request, res: Response) => unknown;
}

export function auditLog(config: AuditConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    let beforeState: unknown = null;

    // Capture before state if needed
    if (config.getBeforeState) {
      try {
        beforeState = await config.getBeforeState(req);
      } catch (error) {
        console.error('Failed to capture before state:', error);
      }
    }

    // Store original json function
    const originalJson = res.json.bind(res);

    // Override json function to capture after state
    res.json = function (body: unknown): Response {
      // Log audit after response
      setImmediate(async () => {
        try {
          const entityId = config.getEntityId ? config.getEntityId(req) : undefined;
          const afterState = config.getAfterState ? config.getAfterState(req, res) : body;

          await query(
            `INSERT INTO audit_logs (
              actor_id, action, entity_type, entity_id, 
              before_json, after_json, ip, user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              authReq.user?.id || null,
              config.action,
              config.entityType,
              entityId || null,
              JSON.stringify(beforeState),
              JSON.stringify(afterState),
              req.ip || req.connection.remoteAddress,
              req.headers['user-agent'],
            ]
          );
        } catch (error) {
          console.error('Failed to write audit log:', error);
        }
      });

      return originalJson(body);
    };

    next();
  };
}

// Audit actions
export const AuditActions = {
  // Auth
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  REFRESH_TOKEN: 'auth.refresh_token',
  
  // Users
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  
  // Tasks
  TASK_CREATE: 'task.create',
  TASK_UPDATE: 'task.update',
  TASK_DELETE: 'task.delete',
  TASK_ASSIGN: 'task.assign',
  TASK_ACCEPT: 'task.accept',
  TASK_PROGRESS: 'task.progress',
  TASK_COMPLETE: 'task.complete',
  
  // Attendance
  ATTENDANCE_CHECKIN: 'attendance.checkin',
  ATTENDANCE_CHECKOUT: 'attendance.checkout',
  
  // Leave
  LEAVE_CREATE: 'leave.create',
  LEAVE_APPROVE: 'leave.approve',
  LEAVE_REJECT: 'leave.reject',
  
  // Incidents
  INCIDENT_CREATE: 'incident.create',
  INCIDENT_SOS: 'incident.sos',
  INCIDENT_RESOLVE: 'incident.resolve',
  
  // KPI
  KPI_UPDATE: 'kpi.update',
  KPI_CLOSE_PERIOD: 'kpi.close_period',
} as const;
