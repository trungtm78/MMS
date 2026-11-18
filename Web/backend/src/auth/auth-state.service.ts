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

// Tokens checked per query by validAccess
const VALID_ACCESS_BATCH = 1_000;

// Claims a token must carry to be checked at all: a session id, a subject and a version
const isWellFormed = (claims: AccessClaims): claims is Required<AccessClaims> =>
  isUUID(claims.sub) &&
  typeof claims.sid === 'string' &&
  isUUID(claims.sid) &&
  Number.isSafeInteger(claims.ver);

@Injectable()
export class AuthStateService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** True while the token's session is live and the account unchanged since issue. */
  async isAccessValid(claims: AccessClaims): Promise<boolean> {
    if (!isWellFormed(claims)) return false;
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
   * isAccessValid for many tokens at once, answered in their order: one query per batch of
   * VALID_ACCESS_BATCH tokens. Malformed claims are invalid and never sent.
   */
  async validAccess(claims: readonly AccessClaims[]): Promise<boolean[]> {
    const valid = claims.map(() => false);
    const wellFormed = claims
      .map((claim, index) => ({ claim, index }))
      .filter(({ claim }) => isWellFormed(claim));
    for (let at = 0; at < wellFormed.length; at += VALID_ACCESS_BATCH) {
      const batch = wellFormed.slice(at, at + VALID_ACCESS_BATCH);
      const rows = await this.dataSource.query<{ i: string | number }[]>(
        `SELECT c.i
         FROM unnest($1::uuid[], $2::uuid[], $3::bigint[]) WITH ORDINALITY AS c(sid, sub, ver, i)
         JOIN sessions s ON s.id = c.sid AND s.user_id = c.sub
         JOIN users u ON u.id = s.user_id
         WHERE s.revoked_at IS NULL
           AND s.expires_at > now()
           AND u.status = 'active'
           AND u.auth_version = c.ver
           AND s.auth_version = c.ver`,
        [
          batch.map(({ claim }) => claim.sid),
          batch.map(({ claim }) => claim.sub),
          batch.map(({ claim }) => claim.ver),
        ],
      );
      // WITH ORDINALITY counts from 1
      for (const row of rows) valid[batch[Number(row.i) - 1].index] = true;
    }
    return valid;
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
