import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { logger } from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Client } = pg;

const BCRYPT_SALT_ROUNDS = 12;

const GLOBAL_SETTINGS = [
  { key: 'revenue_credit_hour', value: '18' },
  { key: 'revenue_credit_minute', value: '0' },
  { key: 'min_capital_deposit', value: '10000' },
  { key: 'max_capital_deposit', value: '1000000' },
  { key: 'min_withdrawal', value: '1000' },
  { key: 'upi_transfer_limit', value: '100000' },
  { key: 'maintenance_mode', value: 'false' },
];

const seedSuperAdmin = async (client) => {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const fullName = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in backend/.env'
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const result = await client.query(
    `
    INSERT INTO admins (full_name, email, password_hash, role, status)
    VALUES ($1, $2, $3, 'super_admin', 'active')
    ON CONFLICT (email) DO UPDATE
    SET
      full_name = EXCLUDED.full_name,
      password_hash = EXCLUDED.password_hash,
      role = 'super_admin',
      status = 'active',
      updated_at = NOW()
    RETURNING id, email, role
  `,
    [fullName, email.toLowerCase().trim(), passwordHash]
  );

  logger.info('[Seed] Super Admin upserted', {
    id: result.rows[0].id,
    email: result.rows[0].email,
    role: result.rows[0].role,
  });

  return result.rows[0];
};

const seedGlobalSettings = async (client, updatedBy) => {
  for (const setting of GLOBAL_SETTINGS) {
    await client.query(
      `
      INSERT INTO global_settings (key, value, updated_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (key) DO UPDATE
      SET
        value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `,
      [setting.key, setting.value, updatedBy]
    );
  }

  logger.info('[Seed] Global settings upserted', {
    count: GLOBAL_SETTINGS.length,
    keys: GLOBAL_SETTINGS.map((s) => s.key),
  });
};

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    const superAdmin = await seedSuperAdmin(client);
    await seedGlobalSettings(client, superAdmin.id);
    await client.query('COMMIT');
    logger.info('[Seed] Complete');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  logger.error(`[Seed] Fatal: ${error.message}`, { error });
  process.exit(1);
});
