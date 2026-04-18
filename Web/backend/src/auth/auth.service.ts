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
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
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
  ): Promise<User & { role: string; unitScope: string | null }> {
    // Check lockout via Redis
    const lockInfo = await this.cache.get<{ count: number; lockUntil: number }>(`login_attempts:${username}`);
    if (lockInfo && lockInfo.lockUntil > Date.now()) {
      throw new ForbiddenException('account_locked');
    }

    // Use raw query to reliably get password_hash (addSelect on select:false can be unreliable)
    const rawResults = await this.dataSource.query<Record<string, string>[]>(
      `SELECT id, username, full_name, email, phone, avatar_url, status, last_login_at, created_at, updated_at, password_hash
       FROM users WHERE username = $1 LIMIT 1`,
      [username],
    );
    if (!rawResults.length) {
      throw new UnauthorizedException('invalid_credentials');
    }
    const raw = rawResults[0];
    const user: User = {
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

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('jwt.secret'),
      expiresIn: this.config.get('jwt.accessExpiresIn'),
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

    // Find valid session
    const sessions = await this.sessionRepo.find({
      where: { userId: payload.sub, revokedAt: undefined as unknown as Date },
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
}
