/**
 * One-off: ensure roi_settings.roi_percentage is NUMERIC(5,2).
 * Usage (from backend/): node scripts/alter-roi-percentage.js
 */
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
await client.query(`
  ALTER TABLE roi_settings
  ALTER COLUMN roi_percentage TYPE NUMERIC(5,2)
  USING roi_percentage::NUMERIC(5,2)
`);
const result = await client.query(`
  SELECT data_type, numeric_precision, numeric_scale
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'roi_settings'
    AND column_name = 'roi_percentage'
`);
console.log('roi_settings.roi_percentage:', result.rows[0]);
await client.end();
