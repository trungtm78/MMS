// Second authentication factor (TOTP, RFC 6238) with one-time recovery codes.
//
// Sign-in: a correct password for an enrolled account opens a verify challenge; an
// unenrolled holder of a role with roles.mfa_required opens a setup challenge instead and
// receives tokens only after enrolling. Tokens always come from AuthService.signInUser,
// which re-checks the account and records how the user authenticated (amr).
//
// Wrong codes are counted twice: on the challenge (closed after MAX_CHALLENGE_ATTEMPTS)
// and per account across challenges (locked for 15 minutes after USER_MFA_FAILURE_LIMIT),
// so opening fresh challenges does not give an attacker more guesses. The account count
// lives on the user row and is checked and written under its row lock, in a transaction
// that commits; only the HTTP error is raised afterwards.
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateURI } from 'otplib';
import { AuthService } from '../auth.service';
import type { RequestContext, SignedInSession } from '../auth.service';
import { AuthStateService } from '../auth-state.service';
import { queryRows } from '../../database/query-rows';
import { MfaChallengeService } from './mfa-challenge.service';
import { decryptSecret, encryptSecret } from './mfa-secret-crypto';
import { generateRecoveryCodes, normalizeRecoveryCode } from './recovery-codes';
import { verifyTotp } from './totp';

export type { RequestContext } from '../auth.service';

// AES-256-GCM key for TOTP secrets at rest (provided by the MFA module)
export const MFA_SECRET_KEY = Symbol('MFA_SECRET_KEY');

export const MFA_METHODS = ['totp', 'recovery_code'] as const;
export type MfaMethod = (typeof MFA_METHODS)[number];

export const USER_MFA_FAILURE_LIMIT = 10;
const USER_MFA_LOCK_MS = 15 * 60 * 1000;
const RECOVERY_CODE_BCRYPT_ROUNDS = 10;
const ISSUER = 'MMS';

// RFC 8176 authentication method references
const AMR: Readonly<Record<MfaMethod | 'password', string[]>> = {
  password: ['pwd'],
  totp: ['pwd', 'otp', 'mfa'],
  recovery_code: ['pwd', 'recovery_code', 'mfa'],
};

export type LoginResult =
  | ({ status: 'SUCCESS' } & SignedInSession)
  | {
      status: 'MFA_REQUIRED';
      mfaToken: string;
      expiresAt: string;
      methods: MfaMethod[];
      // Read by clients built before the status field existed
      mfa_required: true;
      requiresMfa: true;
      tempToken: string;
    }
  | {
      status: 'MFA_SETUP_REQUIRED';
      mfaToken: string;
      expiresAt: string;
      requiresMfaSetup: true;
      tempToken: string;
    };

export interface EnrollmentStart {
  mfaToken: string;
  secret: string;
  otpauthUri: string;
  qrUri: string;
  expiresAt: string;
}

interface MfaUserRow {
  id: string;
  username: string;
  mfa_enabled: boolean;
  mfa_setup_at: Date | string | null;
  totp_secret: string | null;
  totp_last_used_step: string | number | null;
  mfa_failed_count: string | number | null;
  mfa_locked_until: Date | string | null;
}

type Queryable = Pick<DataSource | EntityManager, 'query'>;
type CodeCheck = { ok: false } | { ok: true; recoveryCodesRemaining?: number };

const invalidToken = () => new UnauthorizedException('mfa_token_invalid');
const alreadyEnabled = () => new ConflictException('mfa_already_enabled');
const notEnabled = () => new ConflictException('mfa_not_enabled');
const userNotFound = () => new NotFoundException('user_not_found');
const lockedError = () =>
  new HttpException('mfa_locked', HttpStatus.TOO_MANY_REQUESTS);

// Recovery codes issued before the XXXXX-XXXXX format were 16 lowercase hex characters
const LEGACY_RECOVERY_CODE = /^[0-9a-f]{16}$/i;

@Injectable()
export class MfaService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly challenges: MfaChallengeService,
    private readonly authService: AuthService,
    @Inject(MFA_SECRET_KEY) private readonly secretKey: Buffer,
    private readonly authState: AuthStateService,
  ) {}

  // ─── Sign-in ──────────────────────────────────────────────────────────────

  async beginLogin(
    account: { id: string; username: string; mfaEnabled: boolean },
    ctx?: RequestContext,
  ): Promise<LoginResult> {
    if (account.mfaEnabled) {
      // Early answer only: every code check re-reads the lock under the user row lock
      this.assertUnlocked(await this.loadUser(this.dataSource, account.id));
      const { token, expiresAt } = await this.challenges.issue(
        account.id,
        'verify',
      );
      return {
        status: 'MFA_REQUIRED',
        mfaToken: token,
        expiresAt: expiresAt.toISOString(),
        methods: [...MFA_METHODS],
        mfa_required: true,
        requiresMfa: true,
        tempToken: token,
      };
    }

    if (await this.roleRequiresMfa(this.dataSource, account.id)) {
      const { token, expiresAt } = await this.challenges.issue(
        account.id,
        'setup',
      );
      return {
        status: 'MFA_SETUP_REQUIRED',
        mfaToken: token,
        expiresAt: expiresAt.toISOString(),
        requiresMfaSetup: true,
        tempToken: token,
      };
    }

    const session = await this.authService.signInUser(
      account.id,
      AMR.password,
      ctx,
    );
    return { status: 'SUCCESS', ...session };
  }

  async verify(
    input: { mfaToken: string; method: MfaMethod; code: string },
    ctx?: RequestContext,
  ): Promise<
    { status: 'SUCCESS'; recoveryCodesRemaining?: number } & SignedInSession
  > {
    this.challenges.enterTenantOf(input.mfaToken);
    const outcome = await this.dataSource.transaction(async (mgr) => {
      const challenge = await this.challenges.load(
        mgr,
        input.mfaToken,
        'verify',
      );
      const user = await this.loadUser(mgr, challenge.userId, { lock: true });
      if (!user?.mfa_enabled || !user.totp_secret) {
        // MFA was reset or disabled after the challenge was opened
        await this.challenges.consume(mgr, challenge.id);
        return { kind: 'stale' as const };
      }
      // Checked under the row lock, so concurrent attempts on other challenges queue here
      if (this.isLocked(user)) return { kind: 'locked' as const };

      const checked =
        input.method === 'recovery_code'
          ? await this.useRecoveryCode(mgr, user.id, input.code)
          : await this.useTotp(mgr, user, input.code);
      if (!checked.ok) {
        const attemptsRemaining = await this.challenges.recordFailure(
          mgr,
          challenge.id,
        );
        const locked = await this.recordUserFailure(
          mgr,
          user,
          { method: input.method },
          ctx,
        );
        return { kind: 'failed' as const, locked, attemptsRemaining };
      }

      await this.challenges.consume(mgr, challenge.id);
      await this.resetFailures(mgr, user);
      await this.audit(
        mgr,
        user.id,
        'mfa.verify_succeeded',
        user.id,
        { method: input.method },
        ctx,
      );
      return {
        kind: 'ok' as const,
        userId: user.id,
        recoveryCodesRemaining: checked.recoveryCodesRemaining,
      };
    });

    if (outcome.kind === 'stale') throw invalidToken();
    if (outcome.kind === 'locked') throw lockedError();
    if (outcome.kind === 'failed') {
      throw this.codeRejection(outcome.locked, outcome.attemptsRemaining);
    }

    const session = await this.authService.signInUser(
      outcome.userId,
      AMR[input.method],
      ctx,
    );
    return {
      status: 'SUCCESS',
      ...session,
      ...(outcome.recoveryCodesRemaining !== undefined
        ? { recoveryCodesRemaining: outcome.recoveryCodesRemaining }
        : {}),
    };
  }

  // ─── Enrolment ────────────────────────────────────────────────────────────

  // During sign-in: the setup challenge from the login response
  async startEnrollment(mfaToken: string): Promise<EnrollmentStart> {
    this.challenges.enterTenantOf(mfaToken);
    return this.dataSource.transaction(async (mgr) => {
      const challenge = await this.challenges.load(mgr, mfaToken, 'setup');
      const user = await this.loadUser(mgr, challenge.userId);
      if (!user) throw invalidToken();
      if (user.mfa_enabled) throw alreadyEnabled();

      const secret = generateSecret();
      await this.challenges.setPendingSecret(
        mgr,
        challenge.id,
        encryptSecret(secret, this.secretKey),
      );
      return {
        mfaToken,
        ...this.enrollmentPayload(user.username, secret),
        expiresAt: challenge.expiresAt.toISOString(),
      };
    });
  }

  // From a signed-in session. An enrolled account cannot be re-enrolled with just an
  // access token; the factor has to be disabled (with a code) or reset by an administrator.
  async setup(userId: string): Promise<EnrollmentStart> {
    const user = await this.loadUser(this.dataSource, userId);
    if (!user) throw userNotFound();
    if (user.mfa_enabled) throw alreadyEnabled();

    const secret = generateSecret();
    const { token, expiresAt } = await this.challenges.issue(userId, 'setup', {
      pendingSecret: encryptSecret(secret, this.secretKey),
    });
    return {
      mfaToken: token,
      ...this.enrollmentPayload(user.username, secret),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Enables MFA once the first code from the new authenticator is right. Every earlier
   * session of the account was opened without MFA and ends in the same transaction; the
   * caller then receives a fresh MFA session: during sign-in (no `actor.userId`) with
   * status SUCCESS, from a signed-in session as replacement tokens. Recovery codes are
   * shown this once and stored only as bcrypt hashes.
   */
  async confirmEnrollment(
    input: { mfaToken: string; code: string },
    actor: { userId?: string },
    ctx?: RequestContext,
  ): Promise<
    | ({ status: 'SUCCESS'; recoveryCodes: string[] } & SignedInSession)
    | ({ recoveryCodes: string[] } & SignedInSession)
  > {
    this.challenges.enterTenantOf(input.mfaToken);
    const outcome = await this.dataSource.transaction(async (mgr) => {
      const challenge = await this.challenges.load(
        mgr,
        input.mfaToken,
        'setup',
      );
      if (actor.userId !== undefined && actor.userId !== challenge.userId) {
        throw invalidToken();
      }
      if (!challenge.pendingSecret) {
        throw new ConflictException('mfa_setup_not_started');
      }
      const user = await this.loadUser(mgr, challenge.userId, { lock: true });
      if (!user) throw invalidToken();
      if (user.mfa_enabled) throw alreadyEnabled();
      if (this.isLocked(user)) return { kind: 'locked' as const };

      const { secret } = decryptSecret(challenge.pendingSecret, this.secretKey);
      const result = verifyTotp(secret, input.code, { lastUsedStep: null });
      if (!result.valid) {
        const attemptsRemaining = await this.challenges.recordFailure(
          mgr,
          challenge.id,
        );
        const locked = await this.recordUserFailure(
          mgr,
          user,
          { purpose: 'enrollment' },
          ctx,
        );
        return { kind: 'failed' as const, locked, attemptsRemaining };
      }

      await mgr.query(
        `UPDATE users SET totp_secret = $2, mfa_enabled = true, mfa_setup_at = now(), totp_last_used_step = $3
         WHERE id = $1`,
        [user.id, challenge.pendingSecret, result.step],
      );
      const recoveryCodes = await this.replaceRecoveryCodes(mgr, user.id);
      await this.challenges.consume(mgr, challenge.id);
      await this.resetFailures(mgr, user);
      // Sessions, tokens and challenges opened before the account had MFA end here
      await this.authState.invalidateUser(mgr, user.id);
      await this.audit(mgr, user.id, 'mfa.enrolled', user.id, {}, ctx);
      return { kind: 'ok' as const, userId: user.id, recoveryCodes };
    });

    if (outcome.kind === 'locked') throw lockedError();
    if (outcome.kind === 'failed') {
      throw this.codeRejection(outcome.locked, outcome.attemptsRemaining);
    }

    const session = await this.authService.signInUser(
      outcome.userId,
      AMR.totp,
      ctx,
    );
    if (actor.userId !== undefined) {
      return { recoveryCodes: outcome.recoveryCodes, ...session };
    }
    return {
      status: 'SUCCESS',
      ...session,
      recoveryCodes: outcome.recoveryCodes,
    };
  }

  // ─── Management ───────────────────────────────────────────────────────────

  async status(userId: string): Promise<{
    enabled: boolean;
    enrolledAt: string | null;
    required: boolean;
    recoveryCodesRemaining: number;
  }> {
    const user = await this.loadUser(this.dataSource, userId);
    if (!user) throw userNotFound();
    const required = await this.roleRequiresMfa(this.dataSource, userId);
    const remaining = user.mfa_enabled
      ? await this.remainingRecoveryCodes(this.dataSource, userId)
      : 0;
    return {
      enabled: user.mfa_enabled,
      enrolledAt: user.mfa_setup_at
        ? new Date(user.mfa_setup_at).toISOString()
        : null,
      required,
      recoveryCodesRemaining: remaining,
    };
  }

  async regenerateRecoveryCodes(
    userId: string,
    code: string,
    ctx?: RequestContext,
  ): Promise<{ recoveryCodes: string[] }> {
    const outcome = await this.dataSource.transaction(async (mgr) => {
      const user = await this.loadUser(mgr, userId, { lock: true });
      if (!user) throw userNotFound();
      if (!user.mfa_enabled || !user.totp_secret) throw notEnabled();
      if (this.isLocked(user)) return { kind: 'locked' as const };

      if (!(await this.useTotp(mgr, user, code)).ok) {
        const locked = await this.recordUserFailure(
          mgr,
          user,
          { purpose: 'recovery_codes_regenerate' },
          ctx,
        );
        return { kind: 'failed' as const, locked };
      }
      const codes = await this.replaceRecoveryCodes(mgr, userId);
      await this.resetFailures(mgr, user);
      await this.audit(
        mgr,
        userId,
        'mfa.recovery_codes_regenerated',
        userId,
        {},
        ctx,
      );
      return { kind: 'ok' as const, codes };
    });

    if (outcome.kind === 'locked') throw lockedError();
    if (outcome.kind === 'failed') throw this.codeRejection(outcome.locked);
    return { recoveryCodes: outcome.codes };
  }

  /**
   * Removes the factor once the caller proved it with a code. As with enrolment, every
   * session, issued access token and open challenge of the account ends in the same
   * transaction (whoever holds a token taken while MFA protected the account loses it),
   * and the caller continues in a new session answered here, authenticated by the code
   * just checked.
   */
  async disable(
    userId: string,
    input: { method: MfaMethod; code: string },
    ctx?: RequestContext,
  ): Promise<SignedInSession> {
    if (await this.roleRequiresMfa(this.dataSource, userId)) {
      throw new ForbiddenException('mfa_required_by_role');
    }

    const outcome = await this.dataSource.transaction(async (mgr) => {
      const user = await this.loadUser(mgr, userId, { lock: true });
      if (!user) throw userNotFound();
      if (!user.mfa_enabled || !user.totp_secret) throw notEnabled();
      if (this.isLocked(user)) return 'locked' as const;

      const checked =
        input.method === 'recovery_code'
          ? await this.useRecoveryCode(mgr, userId, input.code)
          : await this.useTotp(mgr, user, input.code);
      if (!checked.ok) {
        const locked = await this.recordUserFailure(
          mgr,
          user,
          { purpose: 'disable', method: input.method },
          ctx,
        );
        return locked ? ('locked_now' as const) : ('failed' as const);
      }

      await this.clearFactor(mgr, userId);
      await this.resetFailures(mgr, user);
      await this.authState.invalidateUser(mgr, userId);
      await this.audit(
        mgr,
        userId,
        'mfa.disabled',
        userId,
        { method: input.method },
        ctx,
      );
      return 'ok' as const;
    });

    if (outcome === 'locked') throw lockedError();
    if (outcome !== 'ok') throw this.codeRejection(outcome === 'locked_now');
    return this.authService.signInUser(userId, AMR[input.method], ctx);
  }

  // For a user who lost their authenticator and recovery codes. Every session, issued
  // access token and open challenge ends in the same transaction, so whoever holds a
  // stolen token cannot enrol a device of their own afterwards.
  async adminReset(
    actorId: string,
    userId: string,
    ctx?: RequestContext,
  ): Promise<void> {
    if (actorId === userId) {
      throw new ForbiddenException('cannot_reset_own_mfa');
    }
    await this.dataSource.transaction(async (mgr) => {
      const user = await this.loadUser(mgr, userId, { lock: true });
      if (!user) throw userNotFound();
      await this.clearFactor(mgr, userId);
      await this.resetFailures(mgr, user);
      await this.authState.invalidateUser(mgr, userId);
      await this.audit(
        mgr,
        actorId,
        'mfa.reset',
        userId,
        { hadMfa: user.mfa_enabled },
        ctx,
      );
    });
  }

  // ─── Codes ────────────────────────────────────────────────────────────────

  // Accepts a code at most once: its time step must be later than the last one used
  private async useTotp(
    mgr: Queryable,
    user: MfaUserRow,
    code: string,
  ): Promise<CodeCheck> {
    const { secret, legacy } = decryptSecret(user.totp_secret!, this.secretKey);
    const result = verifyTotp(secret, code, {
      lastUsedStep:
        user.totp_last_used_step === null
          ? null
          : Number(user.totp_last_used_step),
    });
    if (!result.valid) return { ok: false };

    await mgr.query(
      `UPDATE users SET totp_last_used_step = $2, totp_secret = COALESCE($3, totp_secret)
       WHERE id = $1`,
      [
        user.id,
        result.step,
        legacy ? encryptSecret(secret, this.secretKey) : null,
      ],
    );
    return { ok: true };
  }

  private async useRecoveryCode(
    mgr: Queryable,
    userId: string,
    input: string,
  ): Promise<CodeCheck> {
    const trimmed = input.trim();
    const candidate =
      normalizeRecoveryCode(trimmed) ??
      (LEGACY_RECOVERY_CODE.test(trimmed) ? trimmed.toLowerCase() : null);
    if (!candidate) return { ok: false };

    const rows = await mgr.query<{ id: string; code_hash: string }[]>(
      `SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    for (const row of rows) {
      if (!(await bcrypt.compare(candidate, row.code_hash))) continue;
      // A concurrent request may have used the same code first
      const used = await queryRows<{ id: string }>(
        mgr,
        `UPDATE mfa_recovery_codes SET used_at = now()
         WHERE id = $1 AND used_at IS NULL
         RETURNING id`,
        [row.id],
      );
      if (!used.length) return { ok: false };
      return {
        ok: true,
        recoveryCodesRemaining: await this.remainingRecoveryCodes(mgr, userId),
      };
    }
    return { ok: false };
  }

  private async replaceRecoveryCodes(
    mgr: Queryable,
    userId: string,
  ): Promise<string[]> {
    const codes = generateRecoveryCodes();
    const hashes = await Promise.all(
      codes.map((code) => bcrypt.hash(code, RECOVERY_CODE_BCRYPT_ROUNDS)),
    );
    await mgr.query(`DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [
      userId,
    ]);
    await mgr.query(
      `INSERT INTO mfa_recovery_codes (user_id, code_hash)
       SELECT $1, unnest($2::text[])`,
      [userId, hashes],
    );
    return codes;
  }

  private async remainingRecoveryCodes(
    runner: Queryable,
    userId: string,
  ): Promise<number> {
    const [row] = await runner.query<{ remaining: number | string }[]>(
      `SELECT count(*)::int AS remaining FROM mfa_recovery_codes
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    return Number(row?.remaining ?? 0);
  }

  private async clearFactor(mgr: Queryable, userId: string): Promise<void> {
    await mgr.query(
      `UPDATE users SET totp_secret = NULL, mfa_enabled = false, mfa_setup_at = NULL, totp_last_used_step = NULL
       WHERE id = $1`,
      [userId],
    );
    await mgr.query(`DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [
      userId,
    ]);
    await this.challenges.revokeOpen(mgr, userId);
  }

  // ─── Failures and locking ─────────────────────────────────────────────────

  // The account failure count lives on the user row and is read and written only while
  // that row is locked, so attempts on several challenges at once queue behind each other
  // and none is lost (a cache counter checked before the lock let them all through)

  private isLocked(user: MfaUserRow): boolean {
    return (
      !!user.mfa_locked_until &&
      new Date(user.mfa_locked_until).getTime() > Date.now()
    );
  }

  private assertUnlocked(user: MfaUserRow | null): void {
    if (user && this.isLocked(user)) throw lockedError();
  }

  /**
   * Counts a rejected code on the locked user row and audits it. Returns true when this
   * failure reached the limit and locked the account. A lock that has run out starts a
   * fresh count.
   */
  private async recordUserFailure(
    mgr: Queryable,
    user: MfaUserRow,
    details: Record<string, unknown>,
    ctx: RequestContext | undefined,
  ): Promise<boolean> {
    const lockExpired =
      !!user.mfa_locked_until &&
      new Date(user.mfa_locked_until).getTime() <= Date.now();
    const count = (lockExpired ? 0 : Number(user.mfa_failed_count ?? 0)) + 1;
    const locked = count >= USER_MFA_FAILURE_LIMIT;
    await mgr.query(
      `UPDATE users SET mfa_failed_count = $2, mfa_locked_until = $3 WHERE id = $1`,
      [user.id, count, locked ? new Date(Date.now() + USER_MFA_LOCK_MS) : null],
    );
    await this.audit(mgr, user.id, 'mfa.verify_failed', user.id, details, ctx);
    if (locked) {
      await this.audit(
        mgr,
        user.id,
        'mfa.locked',
        user.id,
        { failures: count },
        ctx,
      );
    }
    return locked;
  }

  private async resetFailures(mgr: Queryable, user: MfaUserRow): Promise<void> {
    if (!Number(user.mfa_failed_count ?? 0) && !user.mfa_locked_until) return;
    await mgr.query(
      `UPDATE users SET mfa_failed_count = 0, mfa_locked_until = NULL WHERE id = $1`,
      [user.id],
    );
  }

  /**
   * The answer to a rejected code: locked when this failure reached the account limit,
   * attempts exceeded when the challenge has none left, otherwise invalid_code (with the
   * attempts left on a challenge).
   */
  private codeRejection(
    locked: boolean,
    attemptsRemaining?: number,
  ): HttpException {
    if (locked) return lockedError();
    if (attemptsRemaining === undefined) {
      return new UnauthorizedException('invalid_code');
    }
    if (attemptsRemaining <= 0) {
      return new HttpException(
        'mfa_attempts_exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return new UnauthorizedException({
      message: 'invalid_code',
      details: { attemptsRemaining },
    });
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  private async loadUser(
    runner: Queryable,
    userId: string,
    options: { lock?: boolean } = {},
  ): Promise<MfaUserRow | null> {
    const rows = await runner.query<MfaUserRow[]>(
      `SELECT id, username, mfa_enabled, mfa_setup_at, totp_secret, totp_last_used_step,
              mfa_failed_count, mfa_locked_until
       FROM users
       WHERE id = $1${options.lock ? '\n       FOR UPDATE' : ''}`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private async roleRequiresMfa(
    runner: Queryable,
    userId: string,
  ): Promise<boolean> {
    const [row] = await runner.query<{ required: boolean }[]>(
      `SELECT COALESCE(bool_or(r.mfa_required), false) AS required
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [userId],
    );
    return row?.required === true;
  }

  private async audit(
    runner: Queryable,
    actorId: string | null,
    action: string,
    userId: string,
    details: Record<string, unknown>,
    ctx: RequestContext | undefined,
  ): Promise<void> {
    await runner.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_json, ip, user_agent)
       VALUES ($1, $2, 'users', $3, $4::jsonb, $5, $6)`,
      [
        actorId,
        action,
        userId,
        JSON.stringify(details),
        ctx?.ip ?? null,
        ctx?.userAgent ?? null,
      ],
    );
  }

  private enrollmentPayload(username: string, secret: string) {
    const otpauthUri = generateURI({ issuer: ISSUER, label: username, secret });
    return { secret, otpauthUri, qrUri: otpauthUri };
  }
}
