// US-W001: Auth service — login, token issuance, refresh, logout
// Aligned with actual MMS DB schema: users + user_roles + sessions + system_settings
// BR-AUTH-01: access 15m, refresh 7d
// BR-AUTH-02: lockout tracked via Redis cache (login_attempts:<username>)
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  generateSecret as totpGenerateSecret,
  generateURI as totpGenerateURI,
  verifySync as totpVerifySync,
} from 'otplib';
import { User } from '../database/entities/user.entity';
import { Session } from '../database/entities/refresh-token.entity';

export interface JwtPayload {
  sub: string; // user UUID
  username: string;
  role: string;
  unitScope: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Pre-computed bcrypt hash used for constant-time comparison when username is not found,
// preventing timing-based username enumeration attacks.
const DUMMY_HASH = '$2b$12$LqX0i9LzBqKjGLh7f8TiO.xJmqXhH7wNq1OXhqjK2HhCL4OY2abc';

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
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // Resolve role for user via user_roles → roles join
  private async getUserRole(userId: string): Promise<string | null> {
    const result = await this.dataSource.query<{ code: string }[]>(
      `SELECT r.code FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 LIMIT 1`,
      [userId],
    );
    return result[0]?.code ?? null;
  }

  // Resolve unit scope for user via user_unit_scopes → units join
  private async getUserUnitScope(userId: string): Promise<string | null> {
    const result = await this.dataSource.query<{ code: string }[]>(
      `SELECT u.code FROM user_unit_scopes uus
       JOIN units u ON u.id = uus.unit_id
       WHERE uus.user_id = $1 LIMIT 1`,
      [userId],
    );
    return result[0]?.code ?? null;
  }

  // US-W001 AC-1: Validate credentials + lockout check
  async validateUser(
    username: string,
    password: string,
  ): Promise<User & { role: string; unitScope: string | null; mfaEnabled: boolean }> {
    // Check lockout via Redis
    const lockInfo = await this.cache.get<{ count: number; lockUntil: number }>(`login_attempts:${username}`);
    if (lockInfo && lockInfo.lockUntil > Date.now()) {
      throw new ForbiddenException('account_locked');
    }

    // Use raw query to reliably get password_hash (addSelect on select:false can be unreliable)
    const rawResults = await this.dataSource.query<Record<string, string>[]>(
      `SELECT id, username, full_name, email, phone, avatar_url, status, last_login_at, created_at, updated_at, password_hash, mfa_enabled
       FROM users WHERE username = $1 LIMIT 1`,
      [username],
    );
    if (!rawResults.length) {
      // Constant-time comparison prevents timing-based username enumeration
      await bcrypt.compare(password, DUMMY_HASH);
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
      mfaEnabled: raw['mfa_enabled'] === 'true' || raw['mfa_enabled'] === true as unknown as string,
    };
    // US-W001 NP-08: Disabled account
    if (user.status !== 'active') {
      throw new ForbiddenException('account_disabled');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      await this.incrementFailedAttempts(username);
      throw new UnauthorizedException('invalid_credentials');
    }

    // Reset on success
    await this.cache.del(`login_attempts:${username}`);

    // Resolve role + unitScope from DB
    const role = await this.getUserRole(user.id);
    const unitScope = await this.getUserUnitScope(user.id);

    return {
      ...user,
      role: (role ??
        'dqtv') as import('../database/entities/user.entity').UserRole,
      unitScope,
      mfaEnabled: user.mfaEnabled,
    };
  }

  // BR-AUTH-02: 5 failed attempts → lock 30 minutes
  private async incrementFailedAttempts(username: string): Promise<void> {
    const key = `login_attempts:${username}`;
    const current = await this.cache.get<{ count: number; lockUntil: number }>(key) ?? { count: 0, lockUntil: 0 };
    const newCount = current.count + 1;
    const lockUntil = newCount >= 5 ? Date.now() + 30 * 60 * 1000 : 0;
    // TTL: 30 minutes in ms (cache-manager v6 uses ms)
    await this.cache.set(key, { count: newCount, lockUntil }, 30 * 60 * 1000);
  }

  // Issue access + refresh tokens
  async issueTokens(
    user: User & { role: string; unitScope: string | null },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      unitScope: user.unitScope,
    };

    // Read session_timeout_minutes from system_settings (NĐ 85/2016), fall back to config
    let timeoutMinutes: number = parseInt(this.config.get<string>('jwt.accessExpiresIn') ?? '15', 10);
    try {
      const rows = await this.dataSource.query<{ value: string }[]>(
        `SELECT value FROM system_settings WHERE key = 'session_timeout_minutes' LIMIT 1`,
      );
      if (rows.length && rows[0].value) timeoutMinutes = parseInt(rows[0].value, 10);
    } catch { /* fallback to config value */ }

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('jwt.secret'),
      expiresIn: `${timeoutMinutes}m`,
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      {
        secret: this.config.get('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpiresIn'),
      },
    );

    // Persist hashed refresh token in sessions table
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.sessionRepo.save({
      userId: user.id,
      refreshTokenHash: tokenHash,
      expiresAt,
      ip: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  // US-W001 AC-3: Silent refresh
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('invalid_refresh_token');
    }

    if (payload.type !== 'refresh')
      throw new UnauthorizedException('invalid_refresh_token');

    // Find valid session — ORDER BY created_at DESC so newest (most likely match) is checked first
    const sessions = await this.sessionRepo.find({
      where: { userId: payload.sub, revokedAt: undefined as unknown as Date },
      order: { createdAt: 'DESC' },
    });
    const validSession = await this.findValidSession(sessions, refreshToken);
    if (!validSession) throw new UnauthorizedException('refresh_token_revoked');

    // Revoke old session
    await this.sessionRepo.update(validSession.id, { revokedAt: new Date() });

    // Re-fetch user with role
    const user = await this.userRepo.findOneOrFail({
      where: { id: payload.sub },
    });
    const role = await this.getUserRole(user.id);
    const unitScope = await this.getUserUnitScope(user.id);
    return this.issueTokens({
      ...user,
      role: (role ??
        'dqtv') as import('../database/entities/user.entity').UserRole,
      unitScope,
    });
  }

  private async findValidSession(
    sessions: Session[],
    token: string,
  ): Promise<Session | null> {
    for (const session of sessions) {
      if (session.revokedAt) continue;
      if (session.expiresAt < new Date()) continue;
      const match = await bcrypt.compare(token, session.refreshTokenHash);
      if (match) return session;
    }
    return null;
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

  // Get user by id (for /auth/me) — with role + unitScope
  async getUserById(id: string): Promise<Record<string, unknown>> {
    const user = await this.userRepo.findOneOrFail({ where: { id } });
    const role = await this.getUserRole(id);
    const unitScope = await this.getUserUnitScope(id);
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      role: role ?? 'dqtv',
      unitScope,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // MFA: Generate a short-lived temp token for MFA challenge step
  async issueMfaTempToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await this.dataSource.query(
      `INSERT INTO mfa_temp_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );
    return rawToken;
  }

  // MFA: Verify temp token + TOTP OTP, then issue full token pair
  async verifyMfaAndIssueTokens(
    tempToken: string,
    otp: string,
  ): Promise<TokenPair & { user: Record<string, unknown> }> {
    // Find unexpired, unused temp token rows for candidate matching
    const rows = await this.dataSource.query<
      { id: string; user_id: string; token_hash: string; used_at: string | null }[]
    >(
      `SELECT id, user_id, token_hash, used_at FROM mfa_temp_tokens
       WHERE expires_at > NOW() AND used_at IS NULL
       ORDER BY expires_at DESC LIMIT 20`,
    );

    let matchedRow: { id: string; user_id: string; token_hash: string } | null = null;
    for (const row of rows) {
      const match = await bcrypt.compare(tempToken, row.token_hash);
      if (match) {
        matchedRow = row;
        break;
      }
    }
    if (!matchedRow) throw new UnauthorizedException('invalid_otp');

    // Verify TOTP against stored secret
    const secretRows = await this.dataSource.query<{ totp_secret: string }[]>(
      `SELECT totp_secret FROM users WHERE id = $1`,
      [matchedRow.user_id],
    );
    const totpSecret = secretRows[0]?.totp_secret;
    if (!totpSecret) throw new UnauthorizedException('invalid_otp');

    const verifyResult1 = totpVerifySync({ token: otp, secret: totpSecret });
    const isValid1 = typeof verifyResult1 === 'boolean' ? verifyResult1 : (verifyResult1 as { valid: boolean })?.valid === true;
    if (!isValid1) throw new UnauthorizedException('invalid_otp');

    // Mark temp token as used
    await this.dataSource.query(
      `UPDATE mfa_temp_tokens SET used_at = NOW() WHERE id = $1`,
      [matchedRow.id],
    );

    // Fetch user and issue tokens
    const user = await this.userRepo.findOneOrFail({ where: { id: matchedRow.user_id } });
    const role = await this.getUserRole(user.id);
    const unitScope = await this.getUserUnitScope(user.id);
    const tokens = await this.issueTokens({
      ...user,
      role: (role ?? 'dqtv') as import('../database/entities/user.entity').UserRole,
      unitScope,
    });

    const userData = await this.getUserById(user.id);
    return { ...tokens, user: userData };
  }

  // MFA: Generate TOTP secret + recovery codes (setup step 1)
  async setupMfa(
    userId: string,
  ): Promise<{ secret: string; qrUri: string; recoveryCodes: string[] }> {
    const secret = totpGenerateSecret();

    // Fetch username for the otpauth URI label
    const rows = await this.dataSource.query<{ username: string }[]>(
      `SELECT username FROM users WHERE id = $1`,
      [userId],
    );
    const username = rows[0]?.username ?? userId;
    const qrUri = totpGenerateURI({ issuer: 'MMS', label: username, secret });

    // Generate 10 plaintext recovery codes, store hashed
    const recoveryCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      recoveryCodes.push(crypto.randomBytes(8).toString('hex'));
    }
    const hashedCodes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

    // Store secret (not yet enabled) + recovery codes
    await this.dataSource.query(
      `UPDATE users SET totp_secret = $1 WHERE id = $2`,
      [secret, userId],
    );
    // Clear old recovery codes and insert new ones
    await this.dataSource.query(
      `DELETE FROM mfa_recovery_codes WHERE user_id = $1`,
      [userId],
    );
    for (const hash of hashedCodes) {
      await this.dataSource.query(
        `INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)`,
        [userId, hash],
      );
    }

    return { secret, qrUri, recoveryCodes };
  }

  // MFA: Confirm TOTP setup by verifying OTP, then enable MFA
  async confirmMfaSetup(userId: string, otp: string): Promise<void> {
    const rows = await this.dataSource.query<{ totp_secret: string }[]>(
      `SELECT totp_secret FROM users WHERE id = $1`,
      [userId],
    );
    const totpSecret = rows[0]?.totp_secret;
    if (!totpSecret) throw new UnauthorizedException('mfa_not_configured');

    const verifyResult2 = totpVerifySync({ token: otp, secret: totpSecret });
    const isValid2 = typeof verifyResult2 === 'boolean' ? verifyResult2 : (verifyResult2 as { valid: boolean })?.valid === true;
    if (!isValid2) throw new UnauthorizedException('invalid_otp');

    await this.dataSource.query(
      `UPDATE users SET mfa_enabled = TRUE, mfa_setup_at = NOW() WHERE id = $1`,
      [userId],
    );
  }
}
