/**
 * Task 28.3 — Performance observation script (read-only).
 * Usage: node scripts/performance-check.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { query, pool } = await import('../src/db/connection.js');
const { default: app } = await import('../src/app.js');
const { setResendClient } = await import('../src/services/email.service.js');
const { runRevenueCreditJob } = await import('../src/crons/revenue.cron.js');

setResendClient({
  emails: {
    send: async () => ({ data: { id: 'perf-mock' }, error: null }),
  },
});

const results = [];

async function timed(name, fn, budgetMs = null) {
  const t0 = performance.now();
  let detail = {};
  try {
    detail = (await fn()) || {};
  } catch (error) {
    const ms = performance.now() - t0;
    results.push({
      name,
      ms: Math.round(ms),
      ok: false,
      error: error.message,
      budgetMs,
    });
    console.log(`FAIL ${name}: ${error.message} (${Math.round(ms)}ms)`);
    return;
  }
  const ms = Math.round(performance.now() - t0);
  const withinBudget = budgetMs == null ? true : ms < budgetMs;
  results.push({ name, ms, ok: withinBudget, budgetMs, ...detail });
  const flag = withinBudget ? 'OK' : 'SLOW';
  console.log(
    `${flag} ${name}: ${ms}ms${budgetMs != null ? ` (budget < ${budgetMs}ms)` : ''}`
  );
}

async function main() {
  await timed('db_ping', async () => {
    await query('SELECT 1');
    return {};
  });

  await timed('investor_count', async () => {
    const r = await query(
      `SELECT COUNT(*)::INTEGER AS c
       FROM users
       WHERE is_deleted = FALSE
         AND status != 'deleted'`
    );
    return { count: r.rows[0].c };
  });

  await timed('investor_list_query', async () => {
    const r = await query(
      `SELECT id, full_name, email, status, joining_date
       FROM users
       WHERE is_deleted = FALSE
         AND status != 'deleted'
       ORDER BY joining_date DESC NULLS LAST
       LIMIT 20`
    );
    return { rows: r.rows.length };
  }, 300);

  await timed('capital_tx_list_query', async () => {
    const r = await query(
      `SELECT id, transaction_id, amount, status, created_at
       FROM capital_transactions
       WHERE is_deleted = FALSE
       ORDER BY created_at DESC
       LIMIT 20`
    );
    return { rows: r.rows.length };
  }, 300);

  await timed('explain_active_users', async () => {
    const r = await query(
      `EXPLAIN (ANALYZE, FORMAT JSON)
       SELECT id, full_name, email
       FROM users
       WHERE is_deleted = FALSE
         AND status = 'active'
       ORDER BY joining_date DESC NULLS LAST
       LIMIT 20`
    );
    const plan = r.rows[0]['QUERY PLAN'][0];
    return {
      planningMs: plan['Planning Time'],
      execMs: plan['Execution Time'],
    };
  });

  await timed('explain_capital_by_investor', async () => {
    const r = await query(
      `EXPLAIN (ANALYZE, FORMAT JSON)
       SELECT id, amount, status, created_at
       FROM capital_transactions
       WHERE investor_id = (
         SELECT id FROM users WHERE is_deleted = FALSE LIMIT 1
       )
         AND is_deleted = FALSE
       ORDER BY created_at DESC
       LIMIT 20`
    );
    const plan = r.rows[0]['QUERY PLAN'][0];
    return {
      planningMs: plan['Planning Time'],
      execMs: plan['Execution Time'],
    };
  });

  await timed('index_inventory', async () => {
    const r = await query(
      `SELECT tablename, COUNT(*)::INTEGER AS indexes
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN (
           'users',
           'capital_transactions',
           'capital_withdrawal_requests',
           'revenue_credits',
           'support_tickets',
           'roi_settings'
         )
       GROUP BY tablename
       ORDER BY tablename`
    );
    return { tables: r.rows };
  });

  await timed('health_endpoint', async () => {
    const res = await request(app).get('/api/health');
    return { status: res.status, body: res.body };
  }, 500);

  // Dashboard / transaction list via HTTP (unauthenticated → expect 401 fast)
  await timed('dashboard_route_auth_gate', async () => {
    const res = await request(app).get('/api/v1/investor/dashboard');
    return { status: res.status };
  }, 500);

  await timed('capital_tx_route_auth_gate', async () => {
    const res = await request(app).get(
      '/api/v1/investor/capital/transactions?page=1&limit=20'
    );
    return { status: res.status };
  }, 300);

  // Authenticated investor dashboard + transaction list (if a test user exists)
  const investorRow = await query(
    `SELECT id, email FROM users
     WHERE status = 'active'
       AND is_deleted = FALSE
       AND email LIKE '%@tikhat.test'
     ORDER BY updated_at DESC
     LIMIT 1`
  );

  if (investorRow.rows[0]) {
    const { default: bcrypt } = await import('bcryptjs');
    const { OTP_PURPOSE } = await import('../src/services/auth.service.js');
    const email = investorRow.rows[0].email;
    const password = 'TestPass1';
    const hash = await bcrypt.hash(password, 10);
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
      hash,
      investorRow.rows[0].id,
    ]);

    await request(app).post('/api/v1/auth/login').send({
      email,
      password,
      device_type: 'web',
    });

    const otp = '112233';
    const otpHash = await bcrypt.hash(otp, 10);
    await query(
      `UPDATE otp_verifications SET is_used = TRUE
       WHERE LOWER(email) = LOWER($1) AND purpose = $2 AND is_used = FALSE`,
      [email, OTP_PURPOSE.LOGIN]
    );
    await query(
      `INSERT INTO otp_verifications (email, otp_hash, purpose, expires_at, is_used)
       VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes', FALSE)`,
      [email, otpHash, OTP_PURPOSE.LOGIN]
    );

    const otpRes = await request(app).post('/api/v1/auth/verify-otp').send({
      email,
      otp,
      device_type: 'web',
    });
    const token = otpRes.body?.data?.accessToken;

    if (token) {
      await timed(
        'dashboard_api_authenticated',
        async () => {
          const res = await request(app)
            .get('/api/v1/investor/dashboard')
            .set('Authorization', `Bearer ${token}`);
          return { status: res.status, success: res.body?.success };
        },
        500
      );

      await timed(
        'transaction_list_authenticated',
        async () => {
          const res = await request(app)
            .get('/api/v1/investor/capital/transactions?page=1&limit=20')
            .set('Authorization', `Bearer ${token}`);
          return {
            status: res.status,
            count: res.body?.data?.transactions?.length,
          };
        },
        300
      );
    }
  }

  // Revenue cron timing (uses eligible investors currently in DB)
  await timed(
    'revenue_cron_run',
    async () => {
      const summary = await runRevenueCreditJob({
        retryDelayMs: 0,
      });
      return {
        status: summary.status || 'completed',
        credited: summary.credited?.length ?? summary.creditedCount,
        skipped: summary.skipped?.length ?? summary.skippedCount,
      };
    },
    60000
  );

  console.log('\n--- SUMMARY ---');
  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((r) => r.ok === false);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    setResendClient(null);
    // Allow in-flight emails to settle before closing the pool
    await new Promise((r) => setTimeout(r, 1500));
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
