// US-SS-08: UsersService — search users + units for SmartSelect + self-service profile
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { sortRolesByPriority } from '../common/constants/roles';
import { ROLE_CODES_AGG, unitScopeOf } from '../common/sql/user-access.sql';
import { AuthStateService } from '../auth/auth-state.service';
import {
  ContactPolicy,
  contactScopeSql,
  type ContactActor,
} from './contact-policy';

// GET /users/search bounds: a real query (no directory dumps) and a page of at most 50 rows
export const USER_SEARCH_MIN_LENGTH = 2;
export const USER_SEARCH_MAX_LENGTH = 100;
export const USER_SEARCH_MAX_LIMIT = 50;

export interface UserSearchItem {
  id: string;
  username: string;
  fullName: string;
  // Primary role (ROLE_PRIORITY), then every role the account holds
  role: string | null;
  roles: string[];
  status: string;
}

// LIKE pattern matching `text` literally: \, % and _ typed by a user are not wildcards
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface UnitSearchItem {
  id: string;
  code: string;
  name: string;
  type: string;
  parentCode: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly authState: AuthStateService,
    private readonly contacts: ContactPolicy,
  ) {}

  // GET /users/me — own profile with the same role and unit scope as the auth token
  async getProfile(userId: string): Promise<Record<string, unknown>> {
    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT u.id, u.username, u.full_name AS "fullName", u.email, u.phone, u.status,
              u.created_at AS "createdAt", u.updated_at AS "updatedAt",
              ${ROLE_CODES_AGG} AS "roleCodes",
              ${unitScopeOf('u.id')} AS "unitScope"
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [userId],
    );
    if (!rows.length) throw new NotFoundException('user_not_found');

    const { roleCodes, ...profile } = rows[0];
    const roles = sortRolesByPriority(
      Array.isArray(roleCodes) ? (roleCodes as string[]) : [],
    );
    return { ...profile, role: roles[0] ?? null, roles };
  }

  // PATCH /users/me — update own fullName, email, phone
  async updateProfile(
    userId: string,
    dto: { fullName?: string; email?: string; phone?: string },
  ): Promise<Record<string, unknown>> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (dto.fullName !== undefined) {
      params.push(dto.fullName);
      setClauses.push(`full_name = $${params.length}`);
    }
    if (dto.email !== undefined) {
      params.push(dto.email || null);
      setClauses.push(`email = $${params.length}`);
    }
    if (dto.phone !== undefined) {
      params.push(dto.phone || null);
      setClauses.push(`phone = $${params.length}`);
    }

    if (setClauses.length > 0) {
      params.push(userId);
      await this.dataSource.query(
        `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
        params,
      );
    }

    return this.getProfile(userId);
  }

  // US-SS-08 AC-1: Search users by name or username (unaccent), among the people the caller
  // may reach (ContactPolicy — the same rule that admits conversation participants). Active
  // accounts only, never the caller, one row per person.
  async searchUsers(
    actor: ContactActor,
    q: string,
    limit = 20,
  ): Promise<UserSearchItem[]> {
    const text = (q ?? '').trim();
    if (Array.from(text).length < USER_SEARCH_MIN_LENGTH) {
      throw new BadRequestException('search_query_too_short');
    }
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(1, Math.trunc(limit)), USER_SEARCH_MAX_LIMIT)
      : 20;
    const scope = await this.contacts.scopeOf(actor);
    const escaped = escapeLike(text);

    const rows = await this.dataSource.query<
      (Omit<UserSearchItem, 'role' | 'roles'> & { roleCodes: unknown })[]
    >(
      `SELECT u.id,
              u.username,
              u.full_name AS "fullName",
              u.status,
              ${ROLE_CODES_AGG} AS "roleCodes"
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.status = 'active'
         AND u.id <> $1
         AND (unaccent(LOWER(u.full_name)) LIKE unaccent(LOWER($2)) ESCAPE '\\'
              OR LOWER(u.username) LIKE LOWER($2) ESCAPE '\\')
         AND ${contactScopeSql('u.id', '$3', '$4')}
       GROUP BY u.id
       ORDER BY CASE
                  WHEN LOWER(u.username) = LOWER($5) THEN 0
                  WHEN unaccent(LOWER(u.full_name)) LIKE unaccent(LOWER($6)) ESCAPE '\\' THEN 1
                  ELSE 2
                END,
                u.full_name, u.id
       LIMIT $7`,
      [
        actor.sub,
        `%${escaped}%`,
        scope.units,
        scope.userIds,
        text,
        `${escaped}%`,
        safeLimit,
      ],
    );

    return rows.map(({ roleCodes, ...user }) => {
      const roles = sortRolesByPriority(
        Array.isArray(roleCodes) ? (roleCodes as string[]) : [],
      );
      return { ...user, role: roles[0] ?? null, roles };
    });
  }

  // US-SS-08 AC-2: Search units by name or code (unaccent)
  async searchUnits(q: string, limit = 20): Promise<UnitSearchItem[]> {
    const safeLimit = Math.min(Math.max(1, limit), 50);

    return this.dataSource.query<UnitSearchItem[]>(
      `SELECT
         u.id,
         u.code,
         u.name,
         u.type,
         p.code AS "parentCode"
       FROM units u
       LEFT JOIN units p ON p.id = u.parent_id
       WHERE ($1 = ''
           OR unaccent(LOWER(u.name)) ILIKE unaccent(LOWER('%'||$1||'%'))
           OR LOWER(u.code)           ILIKE LOWER('%'||$1||'%'))
       ORDER BY
         CASE
           WHEN LOWER(u.code) = LOWER($1) THEN 0
           WHEN LOWER(u.code) ILIKE LOWER($1||'%') THEN 1
           ELSE 2
         END,
         u.name
       LIMIT $2`,
      [q ?? '', safeLimit],
    );
  }

  // GET /police-profile — police-specific fields
  async getPoliceProfile(userId: string): Promise<{
    badgeNumber: string | null;
    rank: string | null;
    station: string | null;
    department: string | null;
    username: string;
    fullName: string;
  }> {
    const rows = await this.dataSource.query<
      {
        badge_number: string | null;
        rank: string | null;
        station: string | null;
        department: string | null;
        username: string;
        full_name: string;
      }[]
    >(
      `SELECT badge_number, rank, station, department, username, full_name
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    if (!rows.length) throw new NotFoundException('user_not_found');
    const r = rows[0];
    return {
      badgeNumber: r.badge_number,
      rank: r.rank,
      station: r.station,
      department: r.department,
      username: r.username,
      fullName: r.full_name,
    };
  }

  // POST /users/me/change-password
  // One transaction holding the account row: concurrent changes cannot interleave, and
  // the change commits together with the end of every session, issued access token and
  // open MFA challenge of the account (the caller signs in again with the new password)
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (mgr) => {
      // 1. Fetch the current password hash, locking the account row
      const rows = await mgr.query<{ password_hash: string }[]>(
        `SELECT password_hash FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      if (!rows.length) throw new NotFoundException('user_not_found');

      const currentHash = rows[0].password_hash;
      const passwordValid = await bcrypt.compare(currentPassword, currentHash);
      if (!passwordValid) throw new BadRequestException('invalid_credentials');

      // 2. Validate complexity: 8+ chars, uppercase, lowercase, digit, special char
      const complexityRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;
      if (!complexityRegex.test(newPassword)) {
        throw new BadRequestException('password_complexity');
      }

      // 3. Check last 5 password history entries
      const history = await mgr.query<{ password_hash: string }[]>(
        `SELECT password_hash FROM user_password_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [userId],
      );
      for (const entry of history) {
        const reused = await bcrypt.compare(newPassword, entry.password_hash);
        if (reused) throw new BadRequestException('password_reuse');
      }

      // 4. Hash new password with cost=12
      const newHash = await bcrypt.hash(newPassword, 12);

      // 5. Update users table
      await mgr.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newHash, userId],
      );

      // 6. Insert into password history
      await mgr.query(
        `INSERT INTO user_password_history (user_id, password_hash) VALUES ($1, $2)`,
        [userId, newHash],
      );

      // 7. Keep only last 5 — delete oldest if over limit
      const countRows = await mgr.query<{ count: string }[]>(
        `SELECT COUNT(*) AS count FROM user_password_history WHERE user_id = $1`,
        [userId],
      );
      const count = parseInt(countRows[0]?.count ?? '0', 10);
      if (count > 5) {
        await mgr.query(
          `DELETE FROM user_password_history
           WHERE id IN (
             SELECT id FROM user_password_history
             WHERE user_id = $1
             ORDER BY created_at ASC
             LIMIT $2
           )`,
          [userId, count - 5],
        );
      }

      // 8. Nothing issued under the old password keeps working
      await this.authState.invalidateUser(mgr, userId);
    });
  }
}
