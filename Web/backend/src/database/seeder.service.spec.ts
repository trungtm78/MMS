import { Test, TestingModule } from '@nestjs/testing';
import { SeederService } from './seeder.service';
import { DataSource } from 'typeorm';

const mockQuery = jest.fn();
const mockDataSource = { query: mockQuery } as unknown as DataSource;

describe('SeederService', () => {
  let service: SeederService;

  beforeEach(async () => {
    mockQuery.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeederService,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<SeederService>(SeederService);
  });

  describe('onApplicationBootstrap', () => {
    it('skips all seeding in production', async () => {
      const orig = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      await service.onApplicationBootstrap();
      expect(mockQuery).not.toHaveBeenCalled();
      process.env.NODE_ENV = orig;
    });

    it('runs seeding in development without throwing', async () => {
      process.env.NODE_ENV = 'development';
      // Both demo users already exist → seedUsers returns early
      mockQuery.mockResolvedValue([{ id: 'uuid-1' }, { id: 'uuid-2' }]);
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
      // createSupportTables + 10 role inserts + 1 user existence check = 12 calls
      expect(mockQuery).toHaveBeenCalled();
    });

    it('logs error and does not throw when DB query fails', async () => {
      process.env.NODE_ENV = 'development';
      mockQuery.mockRejectedValue(new Error('DB down'));
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });

  describe('createSupportTables', () => {
    it('runs a single DDL query with all IF NOT EXISTS tables', async () => {
      mockQuery.mockResolvedValue([]);
      // Access via bootstrap path (dev mode, skip seedUsers by faking 2 users)
      process.env.NODE_ENV = 'development';
      mockQuery
        .mockResolvedValueOnce([]) // createSupportTables
        .mockResolvedValueOnce([]) // seedRoles x10 — first role
        .mockResolvedValue([{ id: 'a' }, { id: 'b' }]); // seedUsers existence check
      await service.onApplicationBootstrap();
      const ddlCall = mockQuery.mock.calls[0][0] as string;
      expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS roles');
      expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS user_roles');
      expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS units');
      expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS system_settings');
      expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS mfa_temp_tokens');
      expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS mfa_recovery_codes');
    });
  });

  describe('seedRoles', () => {
    it('inserts all 10 roles with ON CONFLICT DO NOTHING', async () => {
      process.env.NODE_ENV = 'development';
      mockQuery
        .mockResolvedValueOnce([]) // createSupportTables
        .mockResolvedValue([{ id: 'a' }, { id: 'b' }]); // covers roles + seedUsers check
      await service.onApplicationBootstrap();
      const roleCalls = mockQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO roles'),
      );
      expect(roleCalls).toHaveLength(10);
      const codes = roleCalls.map(([, params]) => params[0]);
      expect(codes).toContain('system_admin');
      expect(codes).toContain('dqtv');
      expect(codes).toContain('police_ward');
    });
  });

  describe('seedUsers', () => {
    it('skips insertion when both demo users already exist', async () => {
      process.env.NODE_ENV = 'development';
      mockQuery
        .mockResolvedValueOnce([]) // createSupportTables
        .mockResolvedValue([{ id: 'a' }, { id: 'b' }]); // all subsequent calls
      await service.onApplicationBootstrap();
      const userInserts = mockQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO users'),
      );
      expect(userInserts).toHaveLength(0);
    });

    it('inserts admin and dqtv01 when neither exists', async () => {
      process.env.NODE_ENV = 'development';
      mockQuery
        .mockResolvedValueOnce([]) // createSupportTables
        .mockResolvedValue([]); // roles + empty user check → triggers inserts
      await service.onApplicationBootstrap();
      const userInserts = mockQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO users'),
      );
      expect(userInserts).toHaveLength(2);
      const usernames = userInserts.map(([, params]) => params[0]);
      expect(usernames).toContain('admin');
      expect(usernames).toContain('dqtv01');
    });

    it('assigns system_admin role to admin and dqtv role to dqtv01', async () => {
      process.env.NODE_ENV = 'development';
      mockQuery
        .mockResolvedValueOnce([]) // createSupportTables
        .mockResolvedValue([]); // everything else → inserts triggered
      await service.onApplicationBootstrap();
      const roleAssigns = mockQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO user_roles'),
      );
      expect(roleAssigns).toHaveLength(2);
      const sqls = roleAssigns.map(([sql]) => sql as string);
      expect(sqls.some((s) => s.includes("'admin'") && s.includes("'system_admin'"))).toBe(true);
      expect(sqls.some((s) => s.includes("'dqtv01'") && s.includes("'dqtv'"))).toBe(true);
    });
  });
});
