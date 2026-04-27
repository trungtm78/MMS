// Audit interceptor — writes a row to audit_logs for every mutating request
// and for sensitive GET reads, per MMS audit requirements.
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthRequest extends Request {
  user?: JwtPayload;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** HTTP methods that are always audited. */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Sensitive GET patterns that must also be audited.
 * Each entry is tested against `${method} ${pathname}`.
 */
const SENSITIVE_GET_PATTERNS: RegExp[] = [
  /^GET \/militia\/[^/]+/, // GET /militia/:id  (not bare /militia list)
  /^GET \/gps\/history/,
  /^GET \/payroll/,
];

/**
 * Paths that must be skipped even when the method would otherwise qualify.
 * Tested against the full `${method} ${pathname}`.
 */
const SKIP_PATTERNS: RegExp[] = [
  /^(GET|POST|PUT|PATCH|DELETE) \/auth\//,
  /^(GET|POST|PUT|PATCH|DELETE) \/health\//,
  /^POST \/auth\/refresh/,
  /^POST \/auth\/login/,
];

/**
 * Maps the first URL path segment to the physical PostgreSQL table name.
 */
const ENTITY_TABLE_MAP: Record<string, string> = {
  militia: 'militia_profiles',
  tasks: 'tasks',
  leave: 'leave_requests',
  assignments: 'ca_dqtv_assignments',
  users: 'users',
  training: 'training_records',
  gps: 'gps_points',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract a UUID-looking path param from a URL segment. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PathInfo {
  entityType: string; // e.g. "militia"
  entityId: string | null; // UUID string or null
  table: string | null; // resolved table or null
}

/**
 * Parses a URL pathname into entity type, entity ID, and table name.
 * Examples:
 *   /militia/abc-uuid  → { entityType:'militia', entityId:'abc-uuid', table:'militia_profiles' }
 *   /admin/users/123   → { entityType:'users',   entityId:'123', table:'users' }
 *   /tasks             → { entityType:'tasks',   entityId: null,  table:'tasks' }
 */
function parsePath(pathname: string): PathInfo {
  // Strip leading slash and split
  const parts = pathname.replace(/^\//, '').split('/');

  // Handle /admin/users/... — treat "users" as entity type
  let entityType = parts[0] ?? 'unknown';
  let idCandidate: string | null = parts[1] ?? null;

  if (entityType === 'admin' && parts[1]) {
    entityType = parts[1];
    idCandidate = parts[2] ?? null;
  }

  const entityId =
    idCandidate && UUID_RE.test(idCandidate) ? idCandidate : null;

  const table = ENTITY_TABLE_MAP[entityType] ?? null;

  return { entityType, entityId, table };
}

/** Returns true if this request should be audited. */
function shouldAudit(method: string, pathname: string): boolean {
  const key = `${method} ${pathname}`;

  // Always skip the explicit skip list first
  if (SKIP_PATTERNS.some((re) => re.test(key))) {
    return false;
  }

  // Mutating methods are audited
  if (MUTATING_METHODS.has(method)) {
    return true;
  }

  // Sensitive GET reads
  if (method === 'GET' && SENSITIVE_GET_PATTERNS.some((re) => re.test(key))) {
    return true;
  }

  return false;
}

/** Derive the audit action string. */
function buildAction(method: string, entityType: string): string {
  if (method === 'GET') {
    return `READ:${entityType}`;
  }
  return `${method}:${entityType}`;
}

// ─── Interceptor ──────────────────────────────────────────────────────────────

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const method = req.method.toUpperCase();
    const pathname = (req.path ?? req.url).split('?')[0];

    // Skip unauthenticated requests and non-auditable paths early
    if (!req.user || !shouldAudit(method, pathname)) {
      return next.handle();
    }

    const { entityType, entityId, table } = parsePath(pathname);
    const action = buildAction(method, entityType);
    const actor = req.user;

    // Capture request metadata synchronously before the handler runs
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? null;

    // Fetch before-state for PATCH / PUT / DELETE when we have an ID + table
    const beforeStatePromise: Promise<unknown> =
      (method === 'PATCH' || method === 'PUT' || method === 'DELETE') &&
      entityId &&
      table
        ? this.fetchBeforeState(table, entityId)
        : Promise.resolve(null);

    return next.handle().pipe(
      tap({
        next: (responseBody: unknown) => {
          // Fire-and-forget; errors must not surface to the caller
          void beforeStatePromise
            .then((beforeJson) => {
              // Capture after-state for creates / updates; skip deletes
              const afterJson =
                method !== 'DELETE' ? (responseBody ?? null) : null;

              return this.insertAuditLog({
                actorId: actor.sub,
                action,
                entityType,
                entityId,
                beforeJson,
                afterJson,
                ip,
                userAgent,
                requestId,
              });
            })
            .catch((err: unknown) => {
              this.logger.warn(
                `Audit log insert failed: ${(err as Error).message}`,
              );
            });
        },
        error: () => {
          // On handler error we still want an audit record (no after-state)
          void beforeStatePromise
            .then((beforeJson) =>
              this.insertAuditLog({
                actorId: actor.sub,
                action,
                entityType,
                entityId,
                beforeJson,
                afterJson: null,
                ip,
                userAgent,
                requestId,
              }),
            )
            .catch((err: unknown) => {
              this.logger.warn(
                `Audit log insert failed (on error path): ${(err as Error).message}`,
              );
            });
        },
      }),
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async fetchBeforeState(
    table: string,
    entityId: string,
  ): Promise<unknown> {
    try {
      // table name is controlled by our internal map — no user input reaches here
      const rows = await this.dataSource.query<Array<{ data: unknown }>>(
        `SELECT row_to_json(t.*) AS data FROM ${table} t WHERE id = $1::uuid LIMIT 1`,
        [entityId],
      );
      return rows[0]?.data ?? null;
    } catch (err) {
      this.logger.warn(
        `fetchBeforeState failed for ${table}/${entityId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async insertAuditLog(params: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string | null;
    beforeJson: unknown;
    afterJson: unknown;
    ip: string | null;
    userAgent: string | null;
    requestId: string | null;
  }): Promise<void> {
    const {
      actorId,
      action,
      entityType,
      entityId,
      beforeJson,
      afterJson,
      ip,
      userAgent,
      requestId,
    } = params;

    await this.dataSource.query(
      `INSERT INTO audit_logs
         (id, actor_id, action, entity_type, entity_id,
          before_json, after_json, ip, user_agent, request_id, created_at)
       VALUES
         (gen_random_uuid(), $1::uuid, $2, $3,
          $4::uuid,
          $5::jsonb, $6::jsonb,
          $7, $8, $9, NOW())`,
      [
        actorId,
        action,
        entityType,
        entityId ?? null,
        beforeJson !== null ? JSON.stringify(beforeJson) : null,
        afterJson !== null ? JSON.stringify(afterJson) : null,
        ip,
        userAgent,
        requestId,
      ],
    );
  }
}
