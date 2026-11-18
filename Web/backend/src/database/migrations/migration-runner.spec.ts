// Migration runner: decides which SQL migration files to apply and records them,
// so every database (fresh, partially migrated, or pre-existing) converges safely.
import {
  checksum,
  MigrationBaselineError,
  MigrationBaselineRequiredError,
  MigrationBaselineSchemaError,
  MigrationChecksumError,
  MigrationMissingError,
  runMigrations,
  type MigrationFile,
  type MigrationStore,
  type SchemaInventory,
} from './migration-runner';

class MemoryStore implements MigrationStore {
  readonly checksums = new Map<string, string>();
  readonly executed: string[] = [];
  failOn?: string;
  inventory: SchemaInventory = { tables: [], columns: [], indexes: [] };
  inspections = 0;
  private tableEnsured = false;

  inspectSchema(): Promise<SchemaInventory> {
    this.inspections++;
    return Promise.resolve(this.inventory);
  }

  ensureTable(): Promise<void> {
    this.tableEnsured = true;
    return Promise.resolve();
  }

  appliedChecksums(): Promise<Map<string, string>> {
    if (!this.tableEnsured) {
      return Promise.reject(
        new Error('schema_migrations read before it was ensured'),
      );
    }
    return Promise.resolve(new Map(this.checksums));
  }

  applyInTransaction(file: MigrationFile, sum: string): Promise<void> {
    if (file.name === this.failOn) {
      return Promise.reject(new Error(`syntax error in ${file.name}`));
    }
    this.executed.push(file.name);
    this.checksums.set(file.name, sum);
    return Promise.resolve();
  }

  failBaseline = false;

  // All or nothing, like the Postgres store's single transaction
  baseline(
    entries: { file: MigrationFile; checksum: string }[],
  ): Promise<void> {
    if (this.failBaseline) {
      return Promise.reject(new Error('baseline write failed'));
    }
    for (const entry of entries)
      this.checksums.set(entry.file.name, entry.checksum);
    return Promise.resolve();
  }
}

const file = (name: string, sql = `-- ${name}\nSELECT 1;`): MigrationFile => ({
  name,
  sql,
});

describe('runMigrations', () => {
  it('applies pending files in filename order', async () => {
    const store = new MemoryStore();

    const report = await runMigrations(store, [
      file('010_police_app.sql'),
      file('001_identity_access.sql'),
      file('002_personnel.sql'),
    ]);

    expect(store.executed).toEqual([
      '001_identity_access.sql',
      '002_personnel.sql',
      '010_police_app.sql',
    ]);
    expect(report.applied).toEqual(store.executed);
  });

  it('skips files that were already applied unchanged', async () => {
    const store = new MemoryStore();
    const first = file('001_identity_access.sql');
    store.checksums.set(first.name, checksum(first.sql));

    const report = await runMigrations(store, [
      first,
      file('002_personnel.sql'),
    ]);

    expect(store.executed).toEqual(['002_personnel.sql']);
    expect(report.skipped).toEqual(['001_identity_access.sql']);
  });

  it('refuses to run when an applied file was edited, before applying anything', async () => {
    const store = new MemoryStore();
    store.checksums.set('001_identity_access.sql', checksum('-- original'));

    await expect(
      runMigrations(store, [
        file('001_identity_access.sql', '-- edited'),
        file('002_personnel.sql'),
      ]),
    ).rejects.toBeInstanceOf(MigrationChecksumError);
    expect(store.executed).toEqual([]);
  });

  // Codex round 2: a recorded migration deleted or renamed on disk went unnoticed, so
  // fresh and existing installations silently diverged
  it('refuses to run when applied migrations are no longer on disk, naming each one', async () => {
    const store = new MemoryStore();
    store.checksums.set(
      '001_identity_access.sql',
      checksum(file('001_identity_access.sql').sql),
    );
    store.checksums.set(
      '018_recruitment_applications.sql',
      checksum('-- applied'),
    );
    store.checksums.set('015_notifications.sql', checksum('-- applied'));

    const run = runMigrations(store, [
      file('001_identity_access.sql'),
      file('019_schema_contract_tables.sql'),
    ]);

    await expect(run).rejects.toBeInstanceOf(MigrationMissingError);
    await expect(run).rejects.toMatchObject({
      fileNames: ['015_notifications.sql', '018_recruitment_applications.sql'],
      message: expect.stringMatching(
        /015_notifications\.sql[\s\S]*018_recruitment_applications\.sql/,
      ) as unknown,
    });
    expect(store.executed).toEqual([]);
  });

  it('stops at the first failing file and names it', async () => {
    const store = new MemoryStore();
    store.failOn = '002_personnel.sql';

    await expect(
      runMigrations(store, [
        file('001_identity_access.sql'),
        file('002_personnel.sql'),
        file('003_tasks.sql'),
      ]),
    ).rejects.toThrow('002_personnel.sql');
    expect(store.executed).toEqual(['001_identity_access.sql']);
    expect(store.checksums.has('003_tasks.sql')).toBe(false);
  });

  it('baselines an existing database without re-running old files', async () => {
    const store = new MemoryStore();

    const report = await runMigrations(
      store,
      [
        file('001_identity_access.sql'),
        file('002_personnel.sql'),
        file('003_tasks.sql'),
      ],
      { baselineThrough: '002_personnel.sql' },
    );

    expect(store.executed).toEqual(['003_tasks.sql']);
    expect(report.baselined).toEqual([
      '001_identity_access.sql',
      '002_personnel.sql',
    ]);
    expect([...store.checksums.keys()].sort()).toEqual([
      '001_identity_access.sql',
      '002_personnel.sql',
      '003_tasks.sql',
    ]);
  });
});

// A baseline marks files applied without running them: a mistake silently skips schema
describe('runMigrations baseline safety', () => {
  const files = () => [
    file('001_identity_access.sql'),
    file('018_recruitment_applications.sql'),
    file('019_schema_contract_tables.sql'),
  ];

  it('refuses a baseline name that is not one of the migration files', async () => {
    const store = new MemoryStore();

    // '019' sorts after '018_…' and before '019_…': a prefix would have skipped 018
    await expect(
      runMigrations(store, files(), { baselineThrough: '019' }),
    ).rejects.toThrow(/019/);
    expect(store.checksums.size).toBe(0);
    expect(store.executed).toEqual([]);
  });

  it('refuses to baseline a database that already has migration history', async () => {
    const store = new MemoryStore();
    const [first] = files();
    store.checksums.set(first.name, checksum(first.sql));

    await expect(
      runMigrations(store, files(), {
        baselineThrough: '018_recruitment_applications.sql',
      }),
    ).rejects.toThrow(/history/);
    expect(store.checksums.size).toBe(1);
    expect(store.executed).toEqual([]);
  });

  it('records the baseline all at once, so a failure leaves no partial history', async () => {
    const store = new MemoryStore();
    store.failBaseline = true;

    await expect(
      runMigrations(store, files(), {
        baselineThrough: '018_recruitment_applications.sql',
      }),
    ).rejects.toThrow('baseline');
    expect(store.checksums.size).toBe(0);
    expect(store.executed).toEqual([]);
  });
});

// Databases migrated by the old shell runner hold schema but no history. Starting again at
// 001 fails on non-idempotent statements, and a wrong baseline silently skips schema.
describe('runMigrations on a database without migration history', () => {
  const files = () => [
    file(
      '001_identity_access.sql',
      'CREATE TABLE users (id uuid PRIMARY KEY, email text);\nCREATE INDEX idx_users_email ON users (email);',
    ),
    file(
      '002_personnel.sql',
      'CREATE TABLE IF NOT EXISTS militia_profiles (id uuid);\nALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;',
    ),
    file('003_tasks.sql', 'CREATE TABLE tasks (id uuid);'),
  ];
  // What files 001 and 002 leave in the database
  const schemaThrough002 = (): SchemaInventory => ({
    tables: ['militia_profiles', 'users'],
    columns: [
      { table: 'militia_profiles', column: 'id' },
      { table: 'users', column: 'email' },
      { table: 'users', column: 'id' },
      { table: 'users', column: 'phone' },
    ],
    indexes: ['idx_users_email', 'users_pkey'],
  });

  it('refuses to guess when the database already has tables, naming the setting to use', async () => {
    const store = new MemoryStore();
    store.inventory = schemaThrough002();

    const run = runMigrations(store, files());

    await expect(run).rejects.toBeInstanceOf(MigrationBaselineRequiredError);
    await expect(run).rejects.toBeInstanceOf(MigrationBaselineError);
    await expect(run).rejects.toThrow(/before migration history existed/);
    await expect(run).rejects.toThrow(
      'MIGRATION_BASELINE_THROUGH=<last applied file>',
    );
    await expect(run).rejects.toMatchObject({
      tables: ['militia_profiles', 'users'],
    });
    expect(store.executed).toEqual([]);
    expect(store.checksums.size).toBe(0);
  });

  it('migrates an empty database from the first file', async () => {
    const store = new MemoryStore();

    const report = await runMigrations(store, files());

    expect(report.applied).toEqual([
      '001_identity_access.sql',
      '002_personnel.sql',
      '003_tasks.sql',
    ]);
  });

  it('does not inspect the schema once migration history exists', async () => {
    const store = new MemoryStore();
    const [first] = files();
    store.checksums.set(first.name, checksum(first.sql));
    store.inventory = schemaThrough002();

    const report = await runMigrations(store, files());

    expect(report.applied).toEqual(['002_personnel.sql', '003_tasks.sql']);
    expect(store.inspections).toBe(0);
  });

  it('baselines once every table, column and index the baselined files create exists', async () => {
    const store = new MemoryStore();
    store.inventory = schemaThrough002();

    const report = await runMigrations(store, files(), {
      baselineThrough: '002_personnel.sql',
    });

    expect(report.baselined).toEqual([
      '001_identity_access.sql',
      '002_personnel.sql',
    ]);
    expect(store.executed).toEqual(['003_tasks.sql']);
  });

  it('refuses a baseline whose objects are missing, listing every one by file', async () => {
    const store = new MemoryStore();
    store.inventory = {
      tables: ['users'],
      columns: [
        { table: 'users', column: 'email' },
        { table: 'users', column: 'id' },
      ],
      indexes: ['users_pkey'],
    };

    const run = runMigrations(store, files(), {
      baselineThrough: '002_personnel.sql',
    });

    await expect(run).rejects.toBeInstanceOf(MigrationBaselineSchemaError);
    await expect(run).rejects.toMatchObject({
      missing: [
        {
          kind: 'index',
          name: 'idx_users_email',
          file: '001_identity_access.sql',
        },
        {
          kind: 'table',
          name: 'militia_profiles',
          file: '002_personnel.sql',
        },
        {
          kind: 'column',
          table: 'users',
          name: 'phone',
          file: '002_personnel.sql',
        },
      ],
    });
    await expect(run).rejects.toThrow(
      '001_identity_access.sql: index idx_users_email; 002_personnel.sql: table militia_profiles, column users.phone',
    );
    await expect(run).rejects.toThrow(/Nothing was recorded/);
    expect(store.executed).toEqual([]);
    expect(store.checksums.size).toBe(0);
  });

  it('tells the operator that an empty database needs no baseline', async () => {
    const store = new MemoryStore();

    const run = runMigrations(store, files(), {
      baselineThrough: '002_personnel.sql',
    });

    await expect(run).rejects.toBeInstanceOf(MigrationBaselineSchemaError);
    await expect(run).rejects.toThrow(/no application tables/);
    await expect(run).rejects.toThrow(/remove MIGRATION_BASELINE_THROUGH/);
    expect(store.checksums.size).toBe(0);
  });
});

describe('checksum', () => {
  it('is stable across CRLF and LF checkouts', () => {
    expect(checksum('SELECT 1;\r\nSELECT 2;\r\n')).toBe(
      checksum('SELECT 1;\nSELECT 2;\n'),
    );
  });

  it('changes when the SQL changes', () => {
    expect(checksum('SELECT 1;')).not.toBe(checksum('SELECT 2;'));
  });
});
