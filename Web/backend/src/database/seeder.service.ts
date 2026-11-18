import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

// Development demo accounts only. The schema and the role catalogue belong to the SQL
// migrations (023 seeds the roles), so development and production databases share one shape.
@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'production') return;
    try {
      await this.seedUsers();
      this.logger.log('Database seeding complete');
    } catch (err) {
      this.logger.error('Seeder failed', err);
    }
  }

  private async seedUsers() {
    const existing = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM users WHERE username IN ('admin', 'dqtv01')`,
    );
    if (existing.length >= 2) return;

    const adminHash = await bcrypt.hash('Admin@123', 10);
    const dqtvHash = await bcrypt.hash('Dqtv@123', 10);

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

    this.logger.log(
      'Seeded demo users: admin / Admin@123  |  dqtv01 / Dqtv@123',
    );
  }
}
