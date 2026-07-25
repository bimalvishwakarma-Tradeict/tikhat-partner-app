#!/usr/bin/env node
/**
 * Hard-delete dummy/seed operational data while keeping:
 * - All admin accounts (admins table)
 * - global_settings
 * - schema_migrations
 *
 * Usage (from backend/):
 *   npm run flush-dummy
 *   node scripts/flush-dummy-data.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Client } = pg;

async function tableExists(client, tableName) {
  const check = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS ok`,
    [tableName]
  );
  return Boolean(check.rows[0]?.ok);
}

async function deleteAll(client, tableName) {
  if (!(await tableExists(client, tableName))) {
    console.log(`  skip ${tableName} (table missing)`);
    return 0;
  }
  const result = await client.query(`DELETE FROM ${tableName}`);
  const count = result.rowCount || 0;
  console.log(`  deleted ${count} from ${tableName}`);
  return count;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in backend/.env');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('[flush-dummy] Starting hard delete of operational data…');
  console.log('[flush-dummy] Keeping: admins, global_settings, schema_migrations');

  await client.query('BEGIN');
  try {
    // Child / dependent tables first
    await deleteAll(client, 'ticket_attachments');
    await deleteAll(client, 'ticket_messages');
    await deleteAll(client, 'support_tickets');
    await deleteAll(client, 'notifications');
    await deleteAll(client, 'email_logs');
    await deleteAll(client, 'admin_activity_logs');
    await deleteAll(client, 'concurrent_edit_sessions');
    await deleteAll(client, 'cron_job_logs');
    await deleteAll(client, 'backdate_requests');
    await deleteAll(client, 'profile_update_requests');
    await deleteAll(client, 'bank_details_history');
    await deleteAll(client, 'kyc_field_approvals');
    await deleteAll(client, 'capital_transactions');
    await deleteAll(client, 'capital_withdrawal_requests');
    await deleteAll(client, 'capital_lock_status');
    await deleteAll(client, 'revenue_credits');
    await deleteAll(client, 'monthly_revenue_tracking');
    await deleteAll(client, 'revenue_credit_settings');
    await deleteAll(client, 'roi_settings');
    await deleteAll(client, 'otp_verifications');

    if (await tableExists(client, 'files')) {
      const filesResult = await client.query(`DELETE FROM files`);
      console.log(`  deleted ${filesResult.rowCount || 0} from files`);
    } else {
      console.log('  skip files (table missing)');
    }

    // Investor sessions only — keep admin sessions
    if (await tableExists(client, 'sessions')) {
      const sessionsResult = await client.query(
        `DELETE FROM sessions WHERE user_type = 'investor'`
      );
      console.log(
        `  deleted ${sessionsResult.rowCount || 0} from sessions (investor only)`
      );
    }

    // All investors in users table (admins live in admins table)
    if (await tableExists(client, 'users')) {
      const usersResult = await client.query(`DELETE FROM users`);
      console.log(`  deleted ${usersResult.rowCount || 0} from users (investors)`);
    }

    // Reset transaction ID sequences (keep rows, zero counters)
    if (await tableExists(client, 'transaction_id_sequences')) {
      const seqResult = await client.query(
        `UPDATE transaction_id_sequences
         SET last_sequence = 0,
             updated_at = NOW()`
      );
      console.log(
        `  reset ${seqResult.rowCount || 0} transaction_id_sequences to 0`
      );
    }

    await client.query('COMMIT');
    console.log('[flush-dummy] Completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[flush-dummy] Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[flush-dummy] Fatal:', error.message);
  process.exit(1);
});
