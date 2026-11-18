// US-W001: Auth service — login, token issuance, refresh, logout
// Aligned with actual MMS DB schema: users + user_roles + sessions + system_settings
// BR-AUTH-01: access 15m, refresh 7d
// BR-AUTH-02: lockout counted in Postgres by LoginAttemptsService
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { isUUID } from 'class-validator';
import { AuthStateService } from './auth-state.service';
import { LoginAttempt, LoginAttemptsService } from './login-attempts.service';
import { queryRows } from '../database/query-rows';
import { User, type UserRole } from '../database/entities/user.entity';
import { Session } from '../database/entities/refresh-token.entity';
import { sortRolesByPriority } from '../common/constants/roles';
import { TenantContext } from '../database/tenancy/tenant-context';
import { isTenancyEnforced } from '../database/tenancy/tenancy-mode';

export interface JwtPayload {
  sub: string; // user UUID
  username: string;
  role: string; // primary role (highest priority)
  roles?: string[]; // every assigned role, primary first; absent on tokens issued before this claim
  unitScope: string | null;
  // Access tokens only; JwtAuthGuard refuses any other token type
  typ?: 'access';
  // RFC 8176 methods used to sign in, e.g. ['pwd'] or ['pwd', 'otp', 'mfa']
  amr?: string[];
  // The session the token belongs to, and the account version it was issued under;
  // AuthStateService refuses the token once either no longer matches
  sid?: string;
  ver?: number;
  // The tenant the session belongs to (TENANCY_MODE=enforced); JwtAuthGuard adopts it
  tid?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface SignedInSession {
  user: Record<string, unknown>;
  tokens: TokenPair;
}

type Queryable = Pick<DataSource | EntityManager, 'query'>;

type ValidatedUser = User & {
  role: string;
  roles: string[];
  unitScope: string | null;
  mfaEnabled: boolean;
};

// Refresh tokens are long random JWTs: a plain SHA-256 binds all of the token (bcrypt
// would read only its first 72 bytes, which every refresh token of a user shares)
const refreshTokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const REFRESH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// A session and its account, as refresh sees them under the session row lock
interface RefreshState {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  replaced_by: string | null;
  amr: string[] | null;
  session_version: string | number;
  status: string;
  user_version: string | number;
  mfa_enabled: boolean;
  mfa_required: boolean;
}

// Pre-computed bcrypt hash used for constant-time comparison when username is not found,
// preventing timing-based username enumeration attacks.
const DUMMY_HASH =
  '$2b$12$LqX0i9LzBqKjGLh7f8TiO.xJmqXhH7wNq1OXhqjK2HhCL4OY2abc';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly loginAttempts: LoginAttemptsService,
    private readonly authState: AuthStateService,
  ) {}

  // Every role assigned to the user, highest priority first (empty when none). Inside a
  // transaction pass its manager, so the read uses the connection the transaction holds.
  private async getUserRoles(
    userId: string,
    runner: Queryable = this.dataSource,
  ): Promise<string[]> {
    const result = await queryRows<{ code: string }>(
      runner,
      `SELECT r.code FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [userId],
    );
    return sortRolesByPriority(result.map((r) => r.code));
  }

  // Tokens are only ever issued to accounts with an assigned role
  private async requireUserRoles(
    userId: string,
  ): Promise<{ role: UserRole; roles: string[] }> {
    const roles = await this.getUserRoles(userId);
    if (!roles.length) throw new ForbiddenException('no_role_assigned');
    return { role: roles[0] as UserRole, roles };
  }

  // A disabled account loses every session the moment it tries to use one
  private async assertAccountActive(
    user: Pick<User, 'id' | 'status'>,
  ): Promise<void> {
    if (user.status === 'active') return;
    await this.logout(user.id);
    throw new ForbiddenException('account_disabled');
  }

  // Unit scope from user_unit_scopes: 'all' means the whole ward (null). When several
  // rows exist the broadest scope wins, then the unit code, so the claim is stable.
  private async getUserUnitScope(
    userId: string,
    runner: Queryable = this.dataSource,
  ): Promise<string | null> {
    const result = await queryRows<{ code: string; scope_type?: string }>(
      runner,
      `SELECT u.code, uus.scope_type
       FROM user_unit_scopes uus
       JOIN units u ON u.id = uus.unit_id
       WHERE uus.user_id = $1
       ORDER BY CASE uus.scope_type
                  WHEN 'all' THEN 0 WHEN 'subordinate' THEN 1 WHEN 'unit' THEN 2 ELSE 3
                END, u.code
       LIMIT 1`,
      [userId],
    );
    const row = result[0];
    if (!row || row.scope_type === 'all') return null;
    return row.code;
  }

  // The code the user typed: none in legacy mode, a 400 when enforced mode gets none. This
  // is input validation, answered before any lockout slot is taken.
  private requireTenantCode(tenantCode: string | undefined): string | null {
    if (!isTenancyEnforced()) return null;
    const code = (tenantCode ?? '').trim();
    if (!code) throw new BadRequestException('tenant_code_required');
    return code;
  }

  /**
   * The tenant a sign-in is for. Legacy mode has none. Enforced mode resolves the code the
   * user typed inside the sign-in attempt: an unknown or inactive tenant looks exactly like
   * a wrong password (same answer, same bcrypt work, same failure counted against the
   * name), so codes cannot be probed, not even through the lockout. The tenant is adopted
   * into the request scope, so every later query of the sign-in runs under it.
   */
  async resolveLoginTenant(
    tenantCode: string | undefined,
    password: string,
    attempt: LoginAttempt,
  ): Promise<string | null> {
    const code = this.requireTenantCode(tenantCode);
    if (code === null) return null;
    const [tenant] = await this.dataSource.query<
      { id: string; status: string }[]
    >('SELECT id, status FROM auth_tenant_by_code($1)', [code]);
    if (!tenant || tenant.status !== 'active') {
      await bcrypt.compare(password, DUMMY_HASH);
      await attempt.failed();
      throw new UnauthorizedException('invalid_credentials');
    }
    TenantContext.adopt({ tenantId: tenant.id });
    return tenant.id;
  }

  // US-W001 AC-1: Validate credentials. BR-AUTH-02: the attempt takes a lockout slot first
  // (403 account_locked when none is left) and counts only when the name is unknown or the
  // password wrong. Under TENANCY_MODE=enforced the tenant is resolved inside the attempt,
  // so an unknown tenant spends the slot like a wrong password.
  async validateUser(
    username: string,
    password: string,
    tenantCode?: string,
  ): Promise<ValidatedUser> {
    this.requireTenantCode(tenantCode);
    const attempt = await this.loginAttempts.begin(username);
    try {
      await this.resolveLoginTenant(tenantCode, password, attempt);
      return await this.checkCredentials(username, password, attempt);
    } finally {
      // A no-op once settled; frees the slot when an unexpected error ended the attempt
      await attempt.release();
    }
  }

  private async checkCredentials(
    username: string,
    password: string,
    attempt: LoginAttempt,
  ): Promise<ValidatedUser> {
    // Use raw query to reliably get password_hash (addSelect on select:false can be unreliable)
    const rawResults = await this.dataSource.query<Record<string, string>[]>(
      `SELECT id, username, full_name, email, phone, avatar_url, status, last_login_at, created_at, updated_at, password_hash, mfa_enabled
       FROM users WHERE username = $1 LIMIT 1`,
      [username],
    );
    if (!rawResults.length) {
      // Constant-time comparison prevents timing-based username enumeration
      await bcrypt.compare(password, DUMMY_HASH);
      await attempt.failed();
      throw new UnauthorizedException('invalid_credentials');
    }
    const raw = rawResults[0];
    const user: User & { mfaEnabled: boolean } = {
      id: raw['id'],
      username: raw['username'],
      passwordHash: raw['password_hash'],
      fullName: raw['full_name'],
      email: raw['email'] ?? null,
      phone: raw['phone'] ?? null,
      avatarUrl: raw['avatar_url'] ?? null,
      status: raw[
        'status'
      ] as import('../database/entities/user.entity').UserStatus,
      lastLoginAt: raw['last_login_at'] ? new Date(raw['last_login_at']) : null,
      createdAt: new Date(raw['created_at']),
      updatedAt: new Date(raw['updated_at']),
      mfaEnabled:
        raw['mfa_enabled'] === 'true' ||
        raw['mfa_enabled'] === (true as unknown as string),
    };
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      await attempt.failed();
      throw new UnauthorizedException('invalid_credentials');
    }
    // A right password is not a failure. Earlier failures are cleared by signInUser, once
    // every required factor passed.
    await attempt.passed();

    // US-W001 NP-08: Disabled account — told only to someone who knows the password, so a
    // disabled username cannot be told apart from a wrong password
    if (user.status !== 'active') {
      throw new ForbiddenException('account_disabled');
    }

    // Resolve roles + unitScope from DB
    const { role, roles } = await this.requireUserRoles(user.id);
    const unitScope = await this.getUserUnitScope(user.id);

    return {
      ...user,
      role,
      roles,
      unitScope,
      mfaEnabled: user.mfaEnabled,
    };
  }

  /**
   * Completes a sign-in once every required factor has passed: re-checks the account,
   * issues tokens recording how the user authenticated, records the login and clears
   * the failed-login count.
   */
  async signInUser(
    userId: string,
    amr: string[],
    ctx?: RequestContext,
  ): Promise<SignedInSession> {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    await this.assertAccountActive(user);
    const { role, roles } = await this.requireUserRoles(user.id);
    const unitScope = await this.getUserUnitScope(user.id);

    const tokens = await this.issueTokens(
      { ...user, role, roles, unitScope },
      ctx?.ip ?? undefined,
      ctx?.userAgent ?? undefined,
      amr,
    );
    await this.dataSource.query(
      `UPDATE users SET last_login_at = now() WHERE id = $1`,
      [user.id],
    );
    await this.loginAttempts.clear(user.username);

    return { user: await this.getUserById(user.id), tokens };
  }

  // Issue access + refresh tokens for a new session
  async issueTokens(
    user: User & { role: string; roles?: string[]; unitScope: string | null },
    ipAddress?: string,
    userAgent?: string,
    amr: string[] = ['pwd'],
    runner: Queryable = this.dataSource,
  ): Promise<TokenPair> {
    const { tokens } = await this.openSession(
      user,
      amr,
      { ip: ipAddress, userAgent },
      runner,
    );
    return tokens;
  }

  /**
   * Stores a session bound to the account's current version and the methods the user
   * authenticated with, then signs tokens naming it. The version is read by the INSERT
   * itself, so a change committed concurrently cannot slip between reading and storing.
   */
  private async openSession(
    user: User & { role: string; roles?: string[]; unitScope: string | null },
    amr: string[],
    ctx: RequestContext,
    runner: Queryable,
    // Read beforehand by a caller holding a transaction, which must not reach for a
    // second pooled connection
    accessMinutes?: number,
  ): Promise<{ tokens: TokenPair; sessionId: string }> {
    const sessionId = randomUUID();
    // Both tokens name the tenant the session belongs to
    const tenantClaim: { tid?: string } = isTenancyEnforced()
      ? { tid: TenantContext.requireTenantId() }
      : {};
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh', sid: sessionId, ...tenantClaim },
      {
        secret: this.config.get('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpiresIn'),
      },
    );

    const [session] = await queryRows<{ auth_version: string | number }>(
      runner,
      `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, ip, user_agent, amr, auth_version)
       SELECT $1, u.id, $3, $4, $5, $6, $7::text[], u.auth_version
       FROM users u
       WHERE u.id = $2
       RETURNING auth_version`,
      [
        sessionId,
        user.id,
        refreshTokenHash(refreshToken),
        new Date(Date.now() + REFRESH_LIFETIME_MS),
        ctx.ip ?? null,
        ctx.userAgent ?? null,
        amr,
      ],
    );
    if (!session) throw new UnauthorizedException('account_not_found');

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      roles: user.roles ?? [user.role],
      unitScope: user.unitScope,
      typ: 'access',
      amr,
      sid: sessionId,
      ver: Number(session.auth_version),
      ...tenantClaim,
    };
    const minutes = accessMinutes ?? (await this.accessTokenMinutes());
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('jwt.secret'),
      expiresIn: `${minutes}m`,
    });

    return {
      tokens: { accessToken, refreshToken, expiresIn: minutes * 60 },
      sessionId,
    };
  }

  // session_timeout_minutes from system_settings (NĐ 85/2016), falling back to config
  private async accessTokenMinutes(): Promise<number> {
    let minutes = parseInt(
      this.config.get<string>('jwt.accessExpiresIn') ?? '15',
      10,
    );
    try {
      const rows = await this.dataSource.query<{ value: string }[]>(
        `SELECT value FROM system_settings WHERE key = 'session_timeout_minutes' LIMIT 1`,
      );
      const configured = parseInt(rows[0]?.value ?? '', 10);
      if (configured > 0) minutes = configured;
    } catch {
      /* fallback to config value */
    }
    return minutes;
  }

  /**
   * US-W001 AC-3: Silent refresh. The session is locked and rotated in one transaction:
   * - a rotated token presented again means someone kept a copy: every session ends
   * - a revoked, expired or outdated session (account changed since) is refused
   * - a disabled account loses every session
   * - a session weaker than the account now requires (MFA enabled or required by a
   *   role since it was opened) ends, and the user signs in again with MFA
   * - a session whose account has no role left ends: role changes are atomic and already
   *   end every session of the account, so there is nothing to continue
   * The new session keeps the methods the user originally authenticated with.
   */
  async refreshTokens(
    refreshToken: string,
    ctx: RequestContext = {},
  ): Promise<TokenPair> {
    let payload: { sub?: string; type?: string; sid?: string; tid?: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('invalid_refresh_token');
    }
    const sid = payload.sid;
    if (payload.type !== 'refresh' || typeof sid !== 'string' || !isUUID(sid)) {
      throw new UnauthorizedException('invalid_refresh_token');
    }
    // The session lookup below is a tenant query: run it under the tenant of the token
    if (isTenancyEnforced()) {
      const { tid } = payload;
      if (typeof tid !== 'string' || !isUUID(tid)) {
        throw new UnauthorizedException('invalid_refresh_token');
      }
      TenantContext.adopt({ tenantId: tid });
    }

    // Read before the session lock is taken (see below)
    const accessMinutes = await this.accessTokenMinutes();
    const outcome = await this.dataSource.transaction(async (mgr) => {
      const [state] = await mgr.query<RefreshState[]>(
        `SELECT s.id, s.user_id, s.refresh_token_hash, s.expires_at, s.revoked_at,
                s.replaced_by, s.amr, s.auth_version AS session_version,
                u.status, u.auth_version AS user_version, u.mfa_enabled,
                COALESCE((SELECT bool_or(r.mfa_required)
                          FROM user_roles ur
                          JOIN roles r ON r.id = ur.role_id
                          WHERE ur.user_id = u.id), false) AS mfa_required
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1
         FOR UPDATE OF s`,
        [sid],
      );
      if (
        !state ||
        state.user_id !== payload.sub ||
        !this.refreshHashMatches(refreshToken, state.refresh_token_hash)
      ) {
        return { kind: 'invalid' as const };
      }
      if (state.replaced_by) {
        await this.authState.invalidateUser(mgr, state.user_id);
        return { kind: 'reused' as const };
      }
      if (
        state.revoked_at ||
        new Date(state.expires_at).getTime() <= Date.now() ||
        String(state.session_version) !== String(state.user_version)
      ) {
        return { kind: 'revoked' as const };
      }
      if (state.status !== 'active') {
        await this.authState.invalidateUser(mgr, state.user_id);
        return { kind: 'disabled' as const };
      }
      const amr = state.amr?.length ? state.amr : ['pwd'];
      if ((state.mfa_enabled || state.mfa_required) && !amr.includes('mfa')) {
        await this.endSession(mgr, state.id);
        return { kind: 'mfa' as const };
      }

      // Every read below uses mgr: the transaction already holds a pooled connection and the
      // session lock, so asking the pool for another one could wait forever under a burst
      // of refreshes, and would read outside the snapshot the checks above were made on
      const roles = await this.getUserRoles(state.user_id, mgr);
      if (!roles.length) {
        await this.endSession(mgr, state.id);
        return { kind: 'no_role' as const };
      }
      const user = await mgr.findOneOrFail(User, {
        where: { id: state.user_id },
      });
      const unitScope = await this.getUserUnitScope(state.user_id, mgr);
      const { tokens, sessionId } = await this.openSession(
        { ...user, role: roles[0] as UserRole, roles, unitScope },
        amr,
        ctx,
        mgr,
        accessMinutes,
      );
      await mgr.query(
        `UPDATE sessions SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
        [state.id, sessionId],
      );
      return { kind: 'ok' as const, tokens };
    });

    switch (outcome.kind) {
      case 'ok':
        return outcome.tokens;
      case 'reused':
        throw new UnauthorizedException('refresh_token_reused');
      case 'revoked':
        throw new UnauthorizedException('refresh_token_revoked');
      case 'disabled':
        throw new ForbiddenException('account_disabled');
      case 'mfa':
        throw new UnauthorizedException('mfa_reauthentication_required');
      case 'no_role':
        throw new ForbiddenException('no_role_assigned');
      default:
        throw new UnauthorizedException('invalid_refresh_token');
    }
  }

  // Ends one session, leaving the account's other sessions open
  private async endSession(
    runner: Queryable,
    sessionId: string,
  ): Promise<void> {
    await runner.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [
      sessionId,
    ]);
  }

  private refreshHashMatches(token: string, storedHash: string): boolean {
    const expected = Buffer.from(refreshTokenHash(token), 'hex');
    const stored = Buffer.from(storedHash ?? '', 'hex');
    return (
      stored.length === expected.length && timingSafeEqual(stored, expected)
    );
  }

  // US-W001 AC-5: Logout — revoke all sessions for user
  async logout(userId: string): Promise<void> {
    await this.sessionRepo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
  }

  // Get user by id (for /auth/me) — with role (null when none assigned) + unitScope
  async getUserById(id: string): Promise<Record<string, unknown>> {
    const user = await this.userRepo.findOneOrFail({ where: { id } });
    const roles = await this.getUserRoles(id);
    const unitScope = await this.getUserUnitScope(id);
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      role: roles[0] ?? null,
      roles,
      unitScope,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
