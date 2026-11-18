// The migrator must reach the same database the application uses, with or without
// DATABASE_URL, and take its operational settings from the environment.
import * as path from 'path';
import { databaseConfig } from '../../config/configuration';
import {
  connectionStringFromEnv,
  migrationOptionsFromEnv,
} from './migration-config';

describe('connectionStringFromEnv', () => {
  it('prefers DATABASE_URL', () => {
    expect(
      connectionStringFromEnv({
        DATABASE_URL: 'postgres://u:p@db:6543/x',
        DB_HOST: 'ignored',
      }),
    ).toBe('postgres://u:p@db:6543/x');
  });

  it('falls back to the same defaults as the application', () => {
    const app = databaseConfig({});

    expect(connectionStringFromEnv({})).toBe(
      `postgres://${app.username}:${app.password}@${app.host}:${app.port}/${app.database}`,
    );
  });

  it('builds from DB_* variables and escapes credentials', () => {
    const url = new URL(
      connectionStringFromEnv({
        DB_HOST: 'db',
        DB_PORT: '5432',
        DB_USER: 'mms',
        DB_PASSWORD: 'p@ss:w/rd#1',
        DB_NAME: 'mms_db',
      }),
    );

    expect(url.hostname).toBe('db');
    expect(url.port).toBe('5432');
    expect(decodeURIComponent(url.username)).toBe('mms');
    expect(decodeURIComponent(url.password)).toBe('p@ss:w/rd#1');
    expect(url.pathname).toBe('/mms_db');
  });
});

describe('migrationOptionsFromEnv', () => {
  it('reads the directory, lock timeouts and baseline from the environment', () => {
    expect(
      migrationOptionsFromEnv(
        {
          MIGRATIONS_DIR: '/app/migrations',
          MIGRATION_LOCK_TIMEOUT: '5s',
          MIGRATION_LOCK_WAIT: '2min',
          MIGRATION_BASELINE_THROUGH: '018_recruitment_applications.sql',
        },
        [],
        '/srv/backend',
      ),
    ).toEqual({
      directory: '/app/migrations',
      lockTimeout: '5s',
      advisoryLockTimeout: '2min',
      baselineThrough: '018_recruitment_applications.sql',
    });
  });

  it('lets --baseline-through override the environment', () => {
    expect(
      migrationOptionsFromEnv(
        { MIGRATION_BASELINE_THROUGH: '010_police_app.sql' },
        [
          'node',
          'migrate.cli.js',
          '--baseline-through=018_recruitment_applications.sql',
        ],
        '/srv/backend',
      ).baselineThrough,
    ).toBe('018_recruitment_applications.sql');
  });

  it('reads the last file to apply from --through, then MIGRATION_THROUGH', () => {
    expect(
      migrationOptionsFromEnv({ MIGRATION_THROUGH: '038_a.sql' }, [], '/app')
        .through,
    ).toBe('038_a.sql');
    expect(
      migrationOptionsFromEnv(
        { MIGRATION_THROUGH: '038_a.sql' },
        ['node', 'migrate', '--through=039_b.sql'],
        '/app',
      ).through,
    ).toBe('039_b.sql');
    expect(migrationOptionsFromEnv({}, [], '/app').through).toBeUndefined();
  });

  it('defaults to ./migrations and leaves the timeouts to the runner', () => {
    expect(migrationOptionsFromEnv({}, [], '/srv/backend')).toEqual({
      directory: path.resolve('/srv/backend', 'migrations'),
    });
  });
});
