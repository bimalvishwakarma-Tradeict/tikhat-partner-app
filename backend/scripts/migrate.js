import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { logger } from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Client } = pg;

const migrationsDir = path.resolve(__dirname, '../../database/migrations');

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_schema_migrations_name UNIQUE (migration_name)
    )
  `);
};

const getAppliedMigrations = async (client) => {
  const result = await client.query(`
    SELECT migration_name FROM schema_migrations ORDER BY migration_name
  `);
  return new Set(result.rows.map((row) => row.migration_name));
};

const listMigrationFiles = () => {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d{3}_.+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return files;
};

const applyMigration = async (client, fileName) => {
  const filePath = path.join(migrationsDir, fileName);
  const sql = fs.readFileSync(filePath, 'utf8');

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      `
      INSERT INTO schema_migrations (migration_name)
      VALUES ($1)
      ON CONFLICT (migration_name) DO NOTHING
    `,
      [fileName]
    );
    await client.query('COMMIT');
    logger.info(`[Migrate] Applied ${fileName}`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[Migrate] Failed ${fileName}: ${error.message}`, { error });
    throw error;
  }
};

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = listMigrationFiles();

    logger.info(`[Migrate] Found ${files.length} migration file(s)`);

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (applied.has(file)) {
        skippedCount += 1;
        logger.info(`[Migrate] Skipping already applied ${file}`);
        continue;
      }

      await applyMigration(client, file);
      appliedCount += 1;
    }

    logger.info('[Migrate] Complete', {
      appliedCount,
      skippedCount,
      total: files.length,
    });
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  logger.error(`[Migrate] Fatal: ${error.message}`, { error });
  process.exit(1);
});
