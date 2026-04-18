import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { config } from '../config';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEEDS_DIR = path.join(__dirname, 'seed');

async function runMigrations() {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  });

  try {
    console.log('Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('Connected successfully!\n');

    // Create migrations table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Get executed migrations
    const { rows: executedMigrations } = await pool.query('SELECT name FROM migrations');
    const executedNames = new Set(executedMigrations.map(m => m.name));

    // Read and sort migration files
    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration files\n`);

    // Run pending migrations
    for (const file of migrationFiles) {
      if (executedNames.has(file)) {
        console.log(`[SKIP] ${file} (already executed)`);
        continue;
      }

      console.log(`[RUNNING] ${file}`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`[SUCCESS] ${file}\n`);
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`[FAILED] ${file}:`, error);
        throw error;
      }
    }

    console.log('All migrations completed!\n');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function runSeeds() {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  });

  try {
    console.log('Running seeds...');

    const seedFiles = fs.readdirSync(SEEDS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of seedFiles) {
      console.log(`[SEED] ${file}`);
      const filePath = path.join(SEEDS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        await pool.query(sql);
        console.log(`[SUCCESS] ${file}\n`);
      } catch (error) {
        console.error(`[FAILED] ${file}:`, error);
      }
    }

    console.log('All seeds completed!\n');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'migrate':
      await runMigrations();
      break;
    case 'seed':
      await runSeeds();
      break;
    case 'all':
      await runMigrations();
      await runSeeds();
      break;
    default:
      console.log('Usage: tsx migrate.ts [migrate|seed|all]');
      process.exit(1);
  }
}

main();
