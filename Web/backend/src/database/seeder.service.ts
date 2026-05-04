import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'production') return;
    try {
      await this.createSupportTables();
      await this.seedRoles();
      await this.seedUsers();
      this.logger.log('Database seeding complete');
    } catch (err) {
      this.logger.error('Seeder failed', err);
    }
  }

  private async createSupportTables() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50)  UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        role_id UUID NOT NULL,
        UNIQUE (user_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS units (
        id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50)  UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_unit_scopes (
        id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        unit_id UUID NOT NULL,
        UNIQUE (user_id, unit_id)
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key   VARCHAR(100) UNIQUE NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mfa_temp_tokens (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at    TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
        id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id   UUID NOT NULL,
        code_hash TEXT NOT NULL,
        used_at   TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS gps_points (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        militia_id  UUID NOT NULL,
        lat         DOUBLE PRECISION NOT NULL,
        lng         DOUBLE PRECISION NOT NULL,
        accuracy    DOUBLE PRECISION,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS gps_latest (
        militia_id   UUID PRIMARY KEY,
        lat          DOUBLE PRECISION NOT NULL,
        lng          DOUBLE PRECISION NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status       VARCHAR(20) NOT NULL DEFAULT 'online'
      );

      CREATE INDEX IF NOT EXISTS idx_gps_points_militia  ON gps_points(militia_id);
      CREATE INDEX IF NOT EXISTS idx_gps_points_captured ON gps_points(captured_at);
      CREATE INDEX IF NOT EXISTS idx_gps_latest_status   ON gps_latest(status);
      CREATE INDEX IF NOT EXISTS idx_gps_latest_seen     ON gps_latest(last_seen_at);
    `);
  }

  private async seedRoles() {
    const roles = [
      { code: 'system_admin',  name: 'Quản trị hệ thống' },
      { code: 'ubnd_leader',   name: 'Lãnh đạo UBND' },
      { code: 'police_ward',   name: 'Công an phường' },
      { code: 'police_area',   name: 'Công an khu vực' },
      { code: 'office_staff',  name: 'Nhân viên văn phòng' },
      { code: 'dqtv',          name: 'Dân quân tự vệ' },
      { code: 'ca_officer',    name: 'Cán bộ công an' },
      { code: 'ca_ward',       name: 'Công an phường (CA)' },
      { code: 'ca_area',       name: 'Công an khu vực (CA)' },
      { code: 'dqtv_member',   name: 'Thành viên DQTV' },
    ];
    for (const r of roles) {
      await this.dataSource.query(
        `INSERT INTO roles (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING`,
        [r.code, r.name],
      );
    }
  }

  private async seedUsers() {
    const existing = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM users WHERE username IN ('admin', 'dqtv01')`,
    );
    if (existing.length >= 2) return;

    const adminHash = await bcrypt.hash('Admin@123', 10);
    const dqtvHash  = await bcrypt.hash('Dqtv@123', 10);

    await this.dataSource.query(
      `INSERT INTO users (username, password_hash, full_name, status)
       VALUES ($1, $2, $3, 'active') ON CONFLICT (username) DO NOTHING`,
      ['admin', adminHash, 'Quản trị viên hệ thống'],
    );
    await this.dataSource.query(
      `INSERT INTO users (username, password_hash, full_name, status)
       VALUES ($1, $2, $3, 'active') ON CONFLICT (username) DO NOTHING`,
      ['dqtv01', dqtvHash, 'Nguyễn Văn A'],
    );

    await this.dataSource.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id FROM users u, roles r
      WHERE u.username = 'admin' AND r.code = 'system_admin'
      ON CONFLICT DO NOTHING
    `);
    await this.dataSource.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id FROM users u, roles r
      WHERE u.username = 'dqtv01' AND r.code = 'dqtv'
      ON CONFLICT DO NOTHING
    `);

    this.logger.log('Seeded demo users: admin / Admin@123  |  dqtv01 / Dqtv@123');
  }
}
