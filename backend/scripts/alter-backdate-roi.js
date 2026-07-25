/**
 * One-off: allow decimal ROI % on backdate approval path.
 * - backdate_requests.roi_percentage → NUMERIC(5,2)
 * - revenue_credits.roi_percentage_applied → NUMERIC(5,2)
 *   (required: capital/revenue backdate approval inserts 2.25 here)
 *
 * Usage (from backend/):
 *   node scripts/alter-backdate-roi.js
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
  ALTER TABLE backdate_requests
  ALTER COLUMN roi_percentage TYPE NUMERIC(5,2)
  USING roi_percentage::NUMERIC(5,2)
`);
console.log('backdate_requests.roi_percentage → NUMERIC(5,2)');

await client.query(`
  ALTER TABLE revenue_credits
  ALTER COLUMN roi_percentage_applied TYPE NUMERIC(5,2)
  USING roi_percentage_applied::NUMERIC(5,2)
`);
console.log('revenue_credits.roi_percentage_applied → NUMERIC(5,2)');

const cols = await client.query(`
  SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'backdate_requests' AND column_name = 'roi_percentage')
      OR (table_name = 'revenue_credits' AND column_name = 'roi_percentage_applied')
    )
  ORDER BY table_name, column_name
`);
console.log(cols.rows);

await client.end();
