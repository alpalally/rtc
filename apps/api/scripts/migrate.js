// Plain-JS migration runner — no build step required.
// Runs drizzle-orm migrations from dist/db/migrations against DATABASE_URL.
'use strict';

require('dotenv/config');
const path = require('path');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  // Migrations are copied to dist/db/migrations in the Dockerfile
  const migrationsFolder = path.resolve(__dirname, '../dist/db/migrations');
  console.log(`[migrate] Running migrations from: ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('[migrate] Done');
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
