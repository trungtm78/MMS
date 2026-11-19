// Login and enrolment challenges (auth_challenges). The client holds "<id>.<secret>"
// ("<tenant>.<id>.<secret>" under enforced tenancy); the database holds only an HMAC of the
// secret, so a leaked table cannot be replayed.
// Callers load a challenge inside their transaction (row lock), count wrong codes and
// consume it exactly once.
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { queryRows } from '../../database/query-rows';
import {
  TenantContext,
  TenantScopeError,
} from '../../database/tenancy/tenant-context';
import { isTenancyEnforced } from '../../database/tenancy/tenancy-mode';

export type ChallengePurpose = 'verify' | 'setup';

// Five minutes to type a code; ten to install an authenticator and scan the QR code
export const CHALLENGE_TTL_SECONDS: Readonly<Record<ChallengePurpose, number>> =
  Object.freeze({ verify: 300, setup: 600 });

export const MAX_CHALLENGE_ATTEMPTS = 5;

// HMAC key for challenge secrets (provided by the MFA module)
export const MFA_CHALLENGE_KEY = Symbol('MFA_CHALLENGE_KEY');

export interface LoadedChallenge {
  id: string;
  userId: string;
  pendingSecret: string | null;
  attempts: number;
  expiresAt: Date;
}

interface ChallengeRow {
  id: string;
  user_id: string;
  purpose: string;
  secret_hash: string;
  pending_totp_secret: string | null;
  attempts: number | string;
  expires_at: Date;
  consumed_at: Date | null;
}

type Queryable = Pick<DataSource | EntityManager, 'query'>;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// "<tenant>.<id>.<secret>" under enforced mode (the verify call has no scope yet, and the
// challenge row is behind RLS), "<id>.<secret>" in legacy mode
const TOKEN_PATTERN = new RegExp(
  `^(?:(${UUID})\\.)?(${UUID})\\.([A-Za-z0-9_-]{43})$`,
  'i',
);

/** The tenant a challenge token names, or null when it names none. */
export function challengeTenantOf(token: string): string | null {
  return TOKEN_PATTERN.exec(token ?? '')?.[1]?.toLowerCase() ?? null;
}

const invalidToken = () => new UnauthorizedException('mfa_token_invalid');

@Injectable()
export class MfaChallengeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(MFA_CHALLENGE_KEY) private readonly key: Buffer,
  ) {}

  private hash(secret: string): string {
    return createHmac('sha256', this.key).update(secret).digest('hex');
  }

  async issue(
    userId: string,
    purpose: ChallengePurpose,
    options: { pendingSecret?: string; runner?: Queryable } = {},
  ): Promise<{ token: string; expiresAt: Date }> {
    // Before the insert: a sign-in without a scope must not leave an orphan challenge
    const tenant = isTenancyEnforced() ? TenantContext.requireTenantId() : null;
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + CHALLENGE_TTL_SECONDS[purpose] * 1000,
    );
    const [row] = await queryRows<{ id: string }>(
      options.runner ?? this.dataSource,
      `INSERT INTO auth_challenges (user_id, purpose, secret_hash, pending_totp_secret, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        userId,
        purpose,
        this.hash(secret),
        options.pendingSecret ?? null,
        expiresAt,
      ],
    );
    return {
      token: tenant ? `${tenant}.${row.id}.${secret}` : `${row.id}.${secret}`,
      expiresAt,
    };
  }

  /**
   * Enters the tenant a sign-in challenge was issued in, before anything reads it (enforced
   * mode). A token without a tenant, or naming another tenant than the one the request
   * already runs under, gets the answer of any invalid token.
   */
  enterTenantOf(token: string): void {
    if (!isTenancyEnforced()) return;
    const tenantId = challengeTenantOf(token);
    if (tenantId === null) throw invalidToken();
    try {
      TenantContext.adopt({ tenantId });
    } catch (error) {
      if (error instanceof TenantScopeError) throw invalidToken();
      throw error;
    }
  }

  // Locks the challenge row for the caller's transaction. Every way a token can be wrong
  // gets the same answer; only a challenge closed by wrong codes is reported as such.
  async load(
    mgr: Queryable,
    token: string,
    purpose: ChallengePurpose,
  ): Promise<LoadedChallenge> {
    const match = TOKEN_PATTERN.exec(token ?? '');
    if (!match) throw invalidToken();
    // The tenant group is ignored here: enterTenantOf entered the scope before this call
    const [, , id, secret] = match;

    const rows = await mgr.query<ChallengeRow[]>(
      `SELECT id, user_id, purpose, secret_hash, pending_totp_secret, attempts,
              expires_at, consumed_at
       FROM auth_challenges
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );
    const row = rows[0];
    if (
      !row ||
      !this.secretMatches(secret, row.secret_hash) ||
      row.purpose !== purpose ||
      row.consumed_at !== null ||
      new Date(row.expires_at).getTime() <= Date.now()
    ) {
      throw invalidToken();
    }

    const attempts = Number(row.attempts);
    if (attempts >= MAX_CHALLENGE_ATTEMPTS) {
      throw new HttpException(
        'mfa_attempts_exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return {
      id: row.id,
      userId: row.user_id,
      pendingSecret: row.pending_totp_secret,
      attempts,
      expiresAt: new Date(row.expires_at),
    };
  }

  private secretMatches(secret: string, storedHash: string): boolean {
    const expected = Buffer.from(this.hash(secret), 'hex');
    const stored = Buffer.from(storedHash ?? '', 'hex');
    return (
      stored.length === expected.length && timingSafeEqual(stored, expected)
    );
  }

  // Returns how many codes may still be tried on this challenge
  async recordFailure(mgr: Queryable, id: string): Promise<number> {
    const [row] = await queryRows<{ attempts: number | string }>(
      mgr,
      `UPDATE auth_challenges SET attempts = attempts + 1
       WHERE id = $1
       RETURNING attempts`,
      [id],
    );
    return row ? Math.max(MAX_CHALLENGE_ATTEMPTS - Number(row.attempts), 0) : 0;
  }

  // Scanning a new QR code replaces the secret an unconfirmed enrolment was holding
  async setPendingSecret(
    mgr: Queryable,
    id: string,
    encryptedSecret: string,
  ): Promise<void> {
    await queryRows(
      mgr,
      `UPDATE auth_challenges SET pending_totp_secret = $2
       WHERE id = $1 AND purpose = 'setup' AND consumed_at IS NULL
       RETURNING id`,
      [id, encryptedSecret],
    );
  }

  // Enabling, disabling or resetting MFA closes every challenge opened under the old state
  async revokeOpen(mgr: Queryable, userId: string): Promise<void> {
    await mgr.query(
      `UPDATE auth_challenges SET consumed_at = now()
       WHERE user_id = $1 AND consumed_at IS NULL`,
      [userId],
    );
  }

  async consume(mgr: Queryable, id: string): Promise<void> {
    const consumed = await queryRows<{ id: string }>(
      mgr,
      `UPDATE auth_challenges SET consumed_at = now()
       WHERE id = $1 AND consumed_at IS NULL
       RETURNING id`,
      [id],
    );
    if (!consumed.length) throw invalidToken();
  }
}
