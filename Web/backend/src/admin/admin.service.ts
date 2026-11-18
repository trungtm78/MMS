import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JwtPayload } from '../auth/auth.service';
import { AuthStateService } from '../auth/auth-state.service';
import { sortRolesByPriority } from '../common/constants/roles';
import {
  ROLE_CODES_AGG,
  unitScopeCodesOf,
  unitScopeOf,
} from '../common/sql/user-access.sql';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface UserListItem {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  role: string | null; // primary role, as in the auth token
  roles: string[];
  unitScope: string | null;
  createdAt: Date;
}

export interface CreateUserDto {
  username: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: string;
  unitCode?: string;
}

type UserRow = Record<string, unknown>;

// One row per user: every role code, and the scope unit resolved exactly like the
// auth token's unitScope claim ('all' is ward-wide, broadest scope wins)
const USER_SELECT = `
  SELECT u.id, u.username, u.full_name, u.email, u.phone, u.status, u.created_at,
         ${ROLE_CODES_AGG} AS role_codes,
         ${unitScopeOf('u.id')} AS unit_code,
         ${unitScopeCodesOf('u.id')} AS scope_codes
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON r.id = ur.role_id`;

@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly authState: AuthStateService,
  ) {}

  private readonly OFFICE_STAFF_ASSIGNABLE_ROLES = new Set([
    'ca_officer',
    'office_staff',
    'dqtv_member',
    'dqtv',
  ]);

  // Unit staff need a unit, and may only name their own unit for a new account
  private assertUnitScope(
    requester: JwtPayload,
    targetUnitCode?: string | null,
  ): void {
    if (requester.role === 'system_admin') return;
    if (!requester.unitScope) throw new ForbiddenException('no_unit_scope');
    if (targetUnitCode && targetUnitCode !== requester.unitScope) {
      throw new ForbiddenException('unit_scope_violation');
    }
  }

  // Unit staff see and manage only accounts scoped to their unit and to nothing else: an
  // account without a scope, with a ward-wide scope, or also in another unit is outside
  private isInScope(requester: JwtPayload, row: UserRow): boolean {
    if (requester.role === 'system_admin') return true;
    const codes = Array.isArray(row['scope_codes'])
      ? (row['scope_codes'] as string[])
      : [];
    return (
      !!requester.unitScope &&
      codes.length > 0 &&
      codes.every((code) => code === requester.unitScope)
    );
  }

  private assertAssignableRole(requester: JwtPayload, role: string): void {
    if (requester.role === 'system_admin') return;
    if (!this.OFFICE_STAFF_ASSIGNABLE_ROLES.has(role)) {
      throw new ForbiddenException('role_not_assignable');
    }
  }

  // Office staff may only manage accounts whose every role they could assign themselves;
  // otherwise a status change or password reset would take over a privileged account
  private assertManageable(requester: JwtPayload, user: UserListItem): void {
    if (requester.role === 'system_admin') return;
    if (
      user.roles.some((role) => !this.OFFICE_STAFF_ASSIGNABLE_ROLES.has(role))
    ) {
      throw new ForbiddenException('role_not_assignable');
    }
  }

  private assertNotSelf(requester: JwtPayload, id: string): void {
    if (id === requester.sub)
      throw new ForbiddenException('cannot_change_own_account');
  }

  private toItem(r: UserRow): UserListItem {
    const roles = sortRolesByPriority(
      Array.isArray(r['role_codes']) ? (r['role_codes'] as string[]) : [],
    );
    return {
      id: r['id'] as string,
      username: r['username'] as string,
      fullName: r['full_name'] as string,
      email: (r['email'] as string | null) ?? null,
      phone: (r['phone'] as string | null) ?? null,
      status: r['status'] as string,
      role: roles[0] ?? null,
      roles,
      unitScope: (r['unit_code'] as string | null) ?? null,
      createdAt: new Date(r['created_at'] as string),
    };
  }

  async listUsers(
    requester: JwtPayload,
    page = 1,
    limit = 20,
    unitCode?: string,
    roleCode?: string,
  ): Promise<PaginatedResult<UserListItem>> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const offset = (safePage - 1) * safeLimit;

    let scopeUnit: string | undefined;
    if (requester.role === 'system_admin') {
      scopeUnit = unitCode;
    } else {
      if (!requester.unitScope) throw new ForbiddenException('no_unit_scope');
      scopeUnit = requester.unitScope;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (scopeUnit) {
      params.push(scopeUnit);
      conditions.push(
        `EXISTS (SELECT 1 FROM user_unit_scopes fs JOIN units fu ON fu.id = fs.unit_id
                 WHERE fs.user_id = u.id AND fu.code = $${params.length})`,
      );
      // For unit staff the list holds exactly the accounts getUserById lets them open
      if (requester.role !== 'system_admin') {
        conditions.push(
          `NOT EXISTS (SELECT 1 FROM user_unit_scopes os JOIN units ou ON ou.id = os.unit_id
                       WHERE os.user_id = u.id
                         AND (os.scope_type = 'all' OR ou.code <> $${params.length}))`,
        );
      }
    }
    if (roleCode) {
      params.push(roleCode);
      conditions.push(
        `EXISTS (SELECT 1 FROM user_roles fr JOIN roles frc ON frc.id = fr.role_id
                 WHERE fr.user_id = u.id AND frc.code = $${params.length})`,
      );
    }
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM users u ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.count ?? '0', 10);

    const rows = await this.dataSource.query<UserRow[]>(
      `${USER_SELECT}
       ${whereClause}
       GROUP BY u.id
       ORDER BY u.created_at DESC, u.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, safeLimit, offset],
    );

    return {
      data: rows.map((r) => this.toItem(r)),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async getUserById(requester: JwtPayload, id: string): Promise<UserListItem> {
    return this.loadInScope(this.dataSource, requester, id);
  }

  // Accounts outside the caller's scope are answered exactly like missing ones
  private async loadInScope(
    runner: Pick<DataSource | EntityManager, 'query'>,
    requester: JwtPayload,
    id: string,
  ): Promise<UserListItem> {
    this.assertUnitScope(requester);
    const rows = await runner.query<UserRow[]>(
      `${USER_SELECT} WHERE u.id = $1 GROUP BY u.id`,
      [id],
    );
    if (!rows.length || !this.isInScope(requester, rows[0])) {
      throw new NotFoundException('user_not_found');
    }
    return this.toItem(rows[0]);
  }

  /**
   * Runs a change to one account in a transaction that first locks the account row and
   * re-checks, on that locked row, that the caller may see and manage it.
   */
  private async changeManageable<T>(
    requester: JwtPayload,
    id: string,
    work: (mgr: EntityManager, user: UserListItem) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (mgr) => {
      const locked = await mgr.query<{ id: string }[]>(
        `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!locked.length) throw new NotFoundException('user_not_found');
      const user = await this.loadInScope(mgr, requester, id);
      this.assertManageable(requester, user);
      return work(mgr, user);
    });
  }

  async createUser(
    requester: JwtPayload,
    dto: CreateUserDto,
  ): Promise<UserListItem & { temporaryPassword: string }> {
    // Unit-scoped staff always create accounts inside their own unit
    const unitCode =
      requester.role === 'system_admin'
        ? dto.unitCode
        : (dto.unitCode ?? requester.unitScope ?? undefined);
    this.assertUnitScope(requester, unitCode);
    this.assertAssignableRole(requester, dto.role);

    const password = this.generateSecurePassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const userId = await this.dataSource.transaction(async (mgr) => {
      const roleId = await this.requireRoleId(mgr, dto.role);
      const unitId = unitCode ? await this.requireUnitId(mgr, unitCode) : null;

      let inserted: { id: string }[];
      try {
        inserted = await mgr.query<{ id: string }[]>(
          `INSERT INTO users (username, full_name, email, phone, password_hash, status)
           VALUES ($1, $2, $3, $4, $5, 'active')
           RETURNING id`,
          [
            dto.username,
            dto.fullName,
            dto.email ?? null,
            dto.phone ?? null,
            passwordHash,
          ],
        );
      } catch (err) {
        const pgError = err as { code?: string; constraint?: string };
        if (pgError.code === '23505') {
          throw new ConflictException(
            pgError.constraint?.includes('email')
              ? 'email_taken'
              : 'username_taken',
          );
        }
        throw err;
      }
      const id = inserted[0].id;

      await mgr.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
        [id, roleId],
      );
      if (unitId) {
        await mgr.query(
          `INSERT INTO user_unit_scopes (user_id, unit_id, scope_type) VALUES ($1, $2, 'unit')`,
          [id, unitId],
        );
      }
      return id;
    });

    const user = await this.getUserById(requester, userId);
    return { ...user, temporaryPassword: password };
  }

  async updateStatus(
    requester: JwtPayload,
    id: string,
    status: 'active' | 'inactive' | 'suspended',
  ): Promise<void> {
    const allowed = ['active', 'inactive', 'suspended'];
    if (!allowed.includes(status))
      throw new BadRequestException('invalid_status');
    this.assertNotSelf(requester, id);

    await this.changeManageable(requester, id, async (mgr) => {
      await mgr.query(
        `UPDATE users SET status = $2, updated_at = now() WHERE id = $1`,
        [id, status],
      );
      // Suspending ends every session, issued access token and open MFA challenge
      if (status !== 'active') await this.authState.invalidateUser(mgr, id);
    });
  }

  async updateRole(
    requester: JwtPayload,
    id: string,
    role: string,
  ): Promise<void> {
    this.assertNotSelf(requester, id);
    this.assertAssignableRole(requester, role);

    // Replace atomically, then end existing sessions so no token keeps the old role
    await this.changeManageable(requester, id, async (mgr) => {
      const roleId = await this.requireRoleId(mgr, role);
      await mgr.query(`DELETE FROM user_roles WHERE user_id = $1`, [id]);
      await mgr.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
        [id, roleId],
      );
      await this.authState.invalidateUser(mgr, id);
    });
  }

  async resetPassword(
    requester: JwtPayload,
    id: string,
  ): Promise<{ temporaryPassword: string }> {
    const password = this.generateSecurePassword();
    await this.changeManageable(requester, id, async (mgr) => {
      const passwordHash = await bcrypt.hash(password, 12);
      await mgr.query(
        `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
        [id, passwordHash],
      );
      await this.authState.invalidateUser(mgr, id);
    });

    return { temporaryPassword: password };
  }

  private async requireRoleId(
    mgr: EntityManager,
    code: string,
  ): Promise<string> {
    const rows = await mgr.query<{ id: string }[]>(
      `SELECT id FROM roles WHERE code = $1`,
      [code],
    );
    if (!rows.length) throw new BadRequestException('unknown_role');
    return rows[0].id;
  }

  private async requireUnitId(
    mgr: EntityManager,
    code: string,
  ): Promise<string> {
    const rows = await mgr.query<{ id: string }[]>(
      `SELECT id FROM units WHERE code = $1`,
      [code],
    );
    if (!rows.length) throw new BadRequestException('unknown_unit');
    return rows[0].id;
  }

  private generateSecurePassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from(crypto.randomBytes(12))
      .map((b) => chars[b % chars.length])
      .join('');
  }
}
