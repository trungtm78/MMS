import { Test, TestingModule } from '@nestjs/testing';
import { SeederService } from './seeder.service';
import { DataSource } from 'typeorm';

const mockQuery = jest.fn();
const mockDataSource = { query: mockQuery } as unknown as DataSource;

describe('SeederService', () => {
  let service: SeederService;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    mockQuery.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeederService,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<SeederService>(SeederService);
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  const statements = () => mockQuery.mock.calls.map(([sql]) => String(sql));

  describe('onApplicationBootstrap', () => {
    it('skips all seeding in production', async () => {
      process.env.NODE_ENV = 'production';
      await service.onApplicationBootstrap();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('logs error and does not throw when DB query fails', async () => {
      mockQuery.mockRejectedValue(new Error('DB down'));
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });

  // SQL migrations own the schema and the role catalogue (migration 023): the seeder
  // creating tables first gave development databases a different shape from production
  describe('schema ownership', () => {
    it('never issues DDL or inserts roles', async () => {
      mockQuery.mockResolvedValue([]);

      await service.onApplicationBootstrap();

      expect(
        statements().some((sql) => /\bCREATE\s+(TABLE|INDEX)\b/i.test(sql)),
      ).toBe(false);
      expect(
        statements().some((sql) => sql.includes('INSERT INTO roles')),
      ).toBe(false);
    });
  });

  describe('seedUsers', () => {
    it('skips insertion when both demo users already exist', async () => {
      mockQuery.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      await service.onApplicationBootstrap();

      expect(
        statements().filter((sql) => sql.includes('INSERT INTO users')),
      ).toHaveLength(0);
    });

    it('inserts admin and dqtv01 when neither exists', async () => {
      mockQuery.mockResolvedValue([]);

      await service.onApplicationBootstrap();

      const userInserts = mockQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO users'),
      );
      expect(userInserts).toHaveLength(2);
      const usernames = userInserts.map(
        ([, params]) => (params as unknown[])[0],
      );
      expect(usernames).toContain('admin');
      expect(usernames).toContain('dqtv01');
    });

    it('assigns system_admin role to admin and dqtv role to dqtv01', async () => {
      mockQuery.mockResolvedValue([]);

      await service.onApplicationBootstrap();

      const roleAssigns = statements().filter((sql) =>
        sql.includes('INSERT INTO user_roles'),
      );
      expect(roleAssigns).toHaveLength(2);
      expect(
        roleAssigns.some(
          (s) => s.includes("'admin'") && s.includes("'system_admin'"),
        ),
      ).toBe(true);
      expect(
        roleAssigns.some((s) => s.includes("'dqtv01'") && s.includes("'dqtv'")),
      ).toBe(true);
    });
  });
});
