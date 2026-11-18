// Sign-in sessions as devices: each live row of `sessions` is one signed-in client. Access
// tokens name their session (sid) and JwtAuthGuard checks it on every request
// (AuthStateService.isAccessValid), so revoking a session signs that device out at once.
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/auth.service';
import { holdsAnyRole } from '../common/access/unit-scope';
import { writeAuditLog, type AuditOrigin } from '../common/audit/audit-log';
import { queryRows } from '../database/query-rows';
import { describeUserAgent, type DeviceType } from './user-agent';

export type SessionActor = Pick<JwtPayload, 'sub' | 'role' | 'roles' | 'sid'>;

export interface DeviceSessionView {
  id: string;
  userId: string;
  userName: string;
  ip: string | null;
  userAgent: string | null;
  deviceType: DeviceType;
  deviceName: string;
  browser: string | null;
  os: string | null;
  /** RFC 8176 methods the session was signed in with */
  amr: string[];
  mfa: boolean;
  createdAt: Date;
  /**
   * A refresh replaces the session row (AuthService.refresh), so the live row was created
   * at the client's latest token refresh: the last time it was active, to within one
   * access token lifetime
   */
  lastActiveAt: Date;
  expiresAt: Date;
  /** The session of the token making this request */
  current: boolean;
}

export interface DeviceSessionPage {
  data: DeviceSessionView[];
  total: number;
  page: number;
  limit: number;
}

interface SessionRow {
  id: string;
  userId: string;
  userName: string;
  ip: string | null;
  userAgent: string | null;
  amr: string[] | null;
  createdAt: Date;
  expiresAt: Date;
}

// Reading another user's devices is an administration task
const SESSION_ADMIN_ROLES: ReadonlySet<string> = new Set(['system_admin']);

const LIVE = 's.revoked_at IS NULL AND s.expires_at > now()';

@Injectable()
export class DeviceSessionsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(
    actor: SessionActor,
    options: { userId?: string; page?: number; limit?: number } = {},
  ): Promise<DeviceSessionPage> {
    const userId = options.userId ?? actor.sub;
    if (userId !== actor.sub && !holdsAnyRole(actor, SESSION_ADMIN_ROLES)) {
      throw new ForbiddenException('insufficient_role');
    }
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(Math.max(1, options.limit ?? 20), 100);

    const [count] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*)::int AS total FROM sessions s WHERE s.user_id = $1 AND ${LIVE}`,
      [userId],
    );
    const rows = await this.dataSource.query<SessionRow[]>(
      `SELECT s.id, s.user_id AS "userId", u.full_name AS "userName", s.ip,
              s.user_agent AS "userAgent", s.amr,
              s.created_at AS "createdAt", s.expires_at AS "expiresAt"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id = $1 AND ${LIVE}
       ORDER BY (s.id = $2::uuid) IS TRUE DESC, s.created_at DESC, s.id DESC
       LIMIT $3 OFFSET $4`,
      [userId, actor.sid ?? null, limit, (page - 1) * limit],
    );

    return {
      data: rows.map((row) => {
        const amr = row.amr ?? [];
        return {
          id: row.id,
          userId: row.userId,
          userName: row.userName,
          ip: row.ip,
          userAgent: row.userAgent,
          ...describeUserAgent(row.userAgent),
          amr,
          mfa: amr.includes('mfa'),
          createdAt: row.createdAt,
          lastActiveAt: row.createdAt,
          expiresAt: row.expiresAt,
          current: row.id === actor.sid,
        };
      }),
      total: Number(count?.total ?? 0),
      page,
      limit,
    };
  }

  /** Signs one of the caller's own sessions out; 404 for any other session. */
  async revoke(
    actor: SessionActor,
    sessionId: string,
    origin?: AuditOrigin,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const revoked = await queryRows<{ id: string }>(
        manager,
        `UPDATE sessions SET revoked_at = now()
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
         RETURNING id`,
        [sessionId, actor.sub],
      );
      if (!revoked.length) throw new NotFoundException('session_not_found');
      await writeAuditLog(
        manager,
        {
          actorId: actor.sub,
          action: 'session.revoked',
          entityType: 'session',
          entityId: sessionId,
          details: { userId: actor.sub, current: sessionId === actor.sid },
        },
        origin,
      );
    });
  }

  /** Signs every other device of the caller out, keeping the session making the request. */
  async revokeOthers(
    actor: SessionActor,
    origin?: AuditOrigin,
  ): Promise<{ revoked: number }> {
    // Without the current session every session would count as "other"
    const keep = actor.sid;
    if (!keep) throw new UnauthorizedException('invalid_token');

    return this.dataSource.transaction(async (manager) => {
      const revoked = await queryRows<{ id: string }>(
        manager,
        `UPDATE sessions SET revoked_at = now()
         WHERE user_id = $1 AND id <> $2::uuid
           AND revoked_at IS NULL AND expires_at > now()
         RETURNING id`,
        [actor.sub, keep],
      );
      if (revoked.length) {
        const sessionIds = revoked.map((r) => r.id).sort();
        await writeAuditLog(
          manager,
          {
            actorId: actor.sub,
            action: 'session.others_revoked',
            entityType: 'user',
            entityId: actor.sub,
            details: {
              keptSessionId: keep,
              sessionIds,
              count: sessionIds.length,
            },
          },
          origin,
        );
      }
      return { revoked: revoked.length };
    });
  }
}
