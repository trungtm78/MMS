// Whether issued tokens still speak for their account. Every access token names its
// session (sid) and the account version it was issued under (ver); suspending, changing
// roles, resetting a password or changing MFA bumps the version and revokes sessions and
// open MFA challenges in the caller's transaction, so earlier tokens stop working at once.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import type { DataSource, EntityManager } from 'typeorm';
import { queryRows } from '../database/query-rows';

export interface AccessClaims {
  sub: string;
  sid?: string;
  ver?: number;
}

type Queryable = Pick<DataSource | EntityManager, 'query'>;

@Injectable()
export class AuthStateService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** True while the token's session is live and the account unchanged since issue. */
  async isAccessValid(claims: AccessClaims): Promise<boolean> {
    if (
      !isUUID(claims.sub) ||
      typeof claims.sid !== 'string' ||
      !isUUID(claims.sid) ||
      !Number.isSafeInteger(claims.ver)
    ) {
      return false;
    }
    const rows = await this.dataSource.query<{ ok: boolean }[]>(
      `SELECT true AS ok
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND u.status = 'active'
         AND u.auth_version = $3
         AND s.auth_version = $3`,
      [claims.sid, claims.sub, claims.ver],
    );
    return rows.length > 0;
  }

  /**
   * Ends every session, open MFA challenge and issued access token of the account.
   * Returns the new account version. Run it inside the transaction making the change.
   */
  async invalidateUser(runner: Queryable, userId: string): Promise<number> {
    const [row] = await queryRows<{ auth_version: string | number }>(
      runner,
      `UPDATE users SET auth_version = auth_version + 1
       WHERE id = $1
       RETURNING auth_version`,
      [userId],
    );
    await runner.query(
      `UPDATE sessions SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    await runner.query(
      `UPDATE auth_challenges SET consumed_at = now()
       WHERE user_id = $1 AND consumed_at IS NULL`,
      [userId],
    );
    return Number(row?.auth_version ?? 0);
  }
}
