import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../database/entities/user.entity';
import { JwtPayload } from '../auth/auth.service';

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
  role: string | null;
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

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private readonly OFFICE_STAFF_ASSIGNABLE_ROLES = new Set([
    'ca_officer', 'office_staff', 'dqtv_member', 'dqtv',
  ]);

  private assertUnitScope(requester: JwtPayload, targetUnitCode?: string | null): void {
    if (requester.role === 'system_admin') return;
    if (!requester.unitScope) throw new ForbiddenException('no_unit_scope');
    if (targetUnitCode && targetUnitCode !== requester.unitScope) {
      throw new ForbiddenException('unit_scope_violation');
    }
  }

  private assertAssignableRole(requester: JwtPayload, role: string): void {
    if (requester.role === 'system_admin') return;
    if (!this.OFFICE_STAFF_ASSIGNABLE_ROLES.has(role)) {
      throw new ForbiddenException('role_not_assignable');
    }
  }

  async listUsers(
    requester: JwtPayload,
    page = 1,
    limit = 20,
    unitCode?: string,
    roleCode?: string,
  ): Promise<PaginatedResult<UserListItem>> {
    const offset = (page - 1) * limit;
    const scopeUnit = requester.role === 'system_admin' ? unitCode : requester.unitScope;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (scopeUnit) {
      params.push(scopeUnit);
      conditions.push(`un.code = $${params.length}`);
    }
    if (roleCode) {
      params.push(roleCode);
      conditions.push(`r.code = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(DISTINCT u.id) as count FROM users u
       LEFT JOIN user_unit_scopes uus ON uus.user_id = u.id
       LEFT JOIN units un ON un.id = uus.unit_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.count ?? '0', 10);

    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;
    const rows = await this.dataSource.query<Record<string, string>[]>(
      `SELECT DISTINCT ON (u.id) u.id, u.username, u.full_name, u.email, u.phone, u.status, u.created_at,
              r.code as role_code, un.code as unit_code
       FROM users u
       LEFT JOIN user_unit_scopes uus ON uus.user_id = u.id
       LEFT JOIN units un ON un.id = uus.unit_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       ${whereClause}
       ORDER BY u.id, u.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, limit, offset],
    );

    return {
      data: rows.map((r) => ({
        id: r['id'],
        username: r['username'],
        fullName: r['full_name'],
        email: r['email'] ?? null,
        phone: r['phone'] ?? null,
        status: r['status'],
        role: r['role_code'] ?? null,
        unitScope: r['unit_code'] ?? null,
        createdAt: new Date(r['created_at']),
      })),
      total,
      page,
      limit,
    };
  }

  async getUserById(requester: JwtPayload, id: string): Promise<UserListItem> {
    const rows = await this.dataSource.query<Record<string, string>[]>(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.status, u.created_at,
              r.code as role_code, un.code as unit_code
       FROM users u
       LEFT JOIN user_unit_scopes uus ON uus.user_id = u.id
       LEFT JOIN units un ON un.id = uus.unit_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('user_not_found');

    const r = rows[0];
    this.assertUnitScope(requester, r['unit_code']);

    return {
      id: r['id'],
      username: r['username'],
      fullName: r['full_name'],
      email: r['email'] ?? null,
      phone: r['phone'] ?? null,
      status: r['status'],
      role: r['role_code'] ?? null,
      unitScope: r['unit_code'] ?? null,
      createdAt: new Date(r['created_at']),
    };
  }

  async createUser(
    requester: JwtPayload,
    dto: CreateUserDto,
  ): Promise<UserListItem & { temporaryPassword: string }> {
    this.assertUnitScope(requester, dto.unitCode);
    if (dto.role) this.assertAssignableRole(requester, dto.role);

    const password = this.generateSecurePassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO users (username, full_name, email, phone, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id`,
      [dto.username, dto.fullName, dto.email ?? null, dto.phone ?? null, passwordHash],
    );
    const userId = result[0].id;

    // Assign role
    if (dto.role) {
      await this.dataSource.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE code = $2
         ON CONFLICT DO NOTHING`,
        [userId, dto.role],
      );
    }

    // Assign unit scope via unit_id FK (not unit_code column)
    if (dto.unitCode) {
      await this.dataSource.query(
        `INSERT INTO user_unit_scopes (user_id, unit_id)
         SELECT $1, id FROM units WHERE code = $2
         ON CONFLICT DO NOTHING`,
        [userId, dto.unitCode],
      );
    }

    const user = await this.getUserById(requester, userId);
    return { ...user, temporaryPassword: password };
  }

  async updateStatus(
    requester: JwtPayload,
    id: string,
    status: 'active' | 'inactive' | 'suspended',
  ): Promise<void> {
    const allowed = ['active', 'inactive', 'suspended'];
    if (!allowed.includes(status)) throw new BadRequestException('invalid_status');

    const user = await this.getUserById(requester, id);
    this.assertUnitScope(requester, user.unitScope);

    await this.userRepo.update(id, { status: status as never });
  }

  async updateRole(requester: JwtPayload, id: string, role: string): Promise<void> {
    this.assertAssignableRole(requester, role);
    const user = await this.getUserById(requester, id);
    this.assertUnitScope(requester, user.unitScope);

    await this.dataSource.query(`DELETE FROM user_roles WHERE user_id = $1`, [id]);
    await this.dataSource.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE code = $2`,
      [id, role],
    );
  }

  async resetPassword(requester: JwtPayload, id: string): Promise<{ temporaryPassword: string }> {
    const user = await this.getUserById(requester, id);
    this.assertUnitScope(requester, user.unitScope);

    const password = this.generateSecurePassword();
    const passwordHash = await bcrypt.hash(password, 12);
    await this.userRepo.update(id, { passwordHash } as never);

    return { temporaryPassword: password };
  }

  private generateSecurePassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from(crypto.randomBytes(12))
      .map((b) => chars[b % chars.length])
      .join('');
  }
}
