// US-SS-08: UsersService — search users + units for SmartSelect
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface UserSearchItem {
  id: string;
  username: string;
  fullName: string;
  role: string | null;
  status: string;
}

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
  ) {}

  // US-SS-08 AC-1: Search users by name or username (unaccent)
  async searchUsers(q: string, limit = 20): Promise<UserSearchItem[]> {
    const safeLimit = Math.min(Math.max(1, limit), 50);

    return this.dataSource.query<UserSearchItem[]>(
      `SELECT
         u.id,
         u.username,
         u.full_name  AS "fullName",
         r.code       AS role,
         u.status
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.status = 'active'
         AND ($1 = ''
           OR unaccent(LOWER(u.full_name)) ILIKE unaccent(LOWER('%'||$1||'%'))
           OR LOWER(u.username)            ILIKE LOWER('%'||$1||'%'))
       ORDER BY u.full_name
       LIMIT $2`,
      [q ?? '', safeLimit],
    );
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
}
