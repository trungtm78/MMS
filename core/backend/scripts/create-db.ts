import { Client } from 'pg';

async function createDatabase() {
  const client = new Client({
    host: 'localhost',
    port: 5433,
    database: 'postgres', // Kết nối vào database mặc định
    user: 'postgres',
    password: 'postgres',
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Check if database exists
    const checkResult = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'MMS'"
    );

    if (checkResult.rowCount === 0) {
      // Create database
      await client.query('CREATE DATABASE "MMS"');
      console.log('✅ Database MMS created successfully');
    } else {
      console.log('ℹ️ Database MMS already exists');
    }

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

createDatabase();
