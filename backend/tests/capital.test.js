/**
 * Capital API / balance tests: deposit, withdraw, approve, reject, balances.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Minimal 1x1 JPEG for multipart uploads
const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

const { default: app } = await import('../src/app.js');
const { query } = await import('../src/db/connection.js');
const { setResendClient } = await import('../src/services/email.service.js');
const { OTP_PURPOSE } = await import('../src/services/auth.service.js');
const {
  normalizeAmount,
  getCapitalBalance,
  getRevenueBalance,
  createDepositRequest,
  CAPITAL_LIMITS,
} = await import('../src/models/capital.model.js');

const stamp = Date.now();
const investorEmail = `test.capital.${stamp}@tikhat.test`;
const investorPassword = 'TestPass1';
const investorMobile = `7${String(stamp).slice(-9)}`;
const TEST_OTP = '654321';

let dbReady = false;
let investorId = null;
let investorToken = null;
let adminToken = null;
let depositId = null;
let depositTxnId = null;

async function seedOtp(email, purpose, otp = TEST_OTP) {
  const hash = await bcrypt.hash(otp, 10);
  await query(
    `UPDATE otp_verifications
     SET is_used = TRUE
     WHERE LOWER(email) = LOWER($1) AND purpose = $2 AND is_used = FALSE`,
    [email, purpose]
  );
  await query(
    `INSERT INTO otp_verifications (email, otp_hash, purpose, expires_at, is_used)
     VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes', FALSE)`,
    [email.trim().toLowerCase(), hash, purpose]
  );
}

async function loginInvestor() {
  await request(app).post('/api/v1/auth/login').send({
    email: investorEmail,
    password: investorPassword,
    device_type: 'web',
  });
  await seedOtp(investorEmail, OTP_PURPOSE.LOGIN, TEST_OTP);
  const otpRes = await request(app).post('/api/v1/auth/verify-otp').send({
    email: investorEmail,
    otp: TEST_OTP,
    device_type: 'web',
  });
  investorToken = otpRes.body.data?.accessToken || null;
}

async function loginAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    return null;
  }

  const loginRes = await request(app).post('/api/v1/auth/admin/login').send({
    email,
    password,
    device_type: 'web',
  });

  if (loginRes.status !== 200) {
    return null;
  }

  await seedOtp(email, OTP_PURPOSE.LOGIN, TEST_OTP);
  const otpRes = await request(app).post('/api/v1/auth/admin/verify-otp').send({
    email,
    otp: TEST_OTP,
    device_type: 'web',
  });

  adminToken = otpRes.body.data?.accessToken || null;
  return adminToken;
}

before(async () => {
  setResendClient({
    emails: {
      send: async () => ({ data: { id: 'test-email-id' }, error: null }),
    },
  });

  try {
    await query('SELECT 1');
    dbReady = true;
  } catch {
    dbReady = false;
  }

  if (!dbReady) {
    return;
  }

  const reg = await request(app).post('/api/v1/auth/register').send({
    full_name: 'Capital Test Investor',
    email: investorEmail,
    password: investorPassword,
    mobile: investorMobile,
  });

  if (reg.status === 201) {
    const row = await query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [investorEmail]
    );
    investorId = row.rows[0]?.id || null;
    if (investorId) {
      await query(
        `UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [investorId]
      );
      await loginInvestor();
      await loginAdmin();
    }
  }
});

after(async () => {
  setResendClient(null);
  if (dbReady && investorId) {
    try {
      await query(
        `DELETE FROM capital_withdrawal_requests WHERE investor_id = $1`,
        [investorId]
      );
      await query(`DELETE FROM capital_transactions WHERE investor_id = $1`, [
        investorId,
      ]);
      await query(`DELETE FROM capital_lock_status WHERE investor_id = $1`, [
        investorId,
      ]);
      await query(`DELETE FROM sessions WHERE user_id = $1`, [investorId]);
      await query(`DELETE FROM otp_verifications WHERE LOWER(email) = LOWER($1)`, [
        investorEmail,
      ]);
      await query(`DELETE FROM email_logs WHERE LOWER(recipient_email) = LOWER($1)`, [
        investorEmail,
      ]);
      await query(`DELETE FROM users WHERE id = $1`, [investorId]);
    } catch {
      // best-effort
    }
  }
});

describe('Capital amounts & limits', () => {
  it('normalizeAmount rounds to whole rupees', () => {
    assert.equal(normalizeAmount(10000.4), 10000);
    assert.equal(normalizeAmount('15000'), 15000);
  });

  it('exposes capital limits from business rules', () => {
    assert.equal(CAPITAL_LIMITS.MIN_DEPOSIT, 10000);
    assert.equal(CAPITAL_LIMITS.MAX_DEPOSIT, 1000000);
    assert.equal(CAPITAL_LIMITS.MIN_WITHDRAWAL, 1000);
  });
});

describe('Capital deposit / approve / reject / balance', () => {
  it('submits a capital deposit request', async (t) => {
    if (!investorToken || !investorId) {
      t.skip('Investor session unavailable');
      return;
    }

    const utr = `UTR${stamp}DEP01`;
    const res = await request(app)
      .post('/api/v1/investor/capital/deposit')
      .set('Authorization', `Bearer ${investorToken}`)
      .field('amount', '25000')
      .field('transfer_date', '2024-07-15')
      .field('utr_number', utr)
      .field('remark', 'test deposit')
      .attach('payment_screenshot', JPEG_1X1, {
        filename: 'shot.jpg',
        contentType: 'image/jpeg',
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.ok(res.body.transactionId || res.body.data?.transaction_id);

    const rows = await query(
      `SELECT id, transaction_id, amount, status
       FROM capital_transactions
       WHERE investor_id = $1 AND type = 'deposit'
       ORDER BY created_at DESC
       LIMIT 1`,
      [investorId]
    );
    depositId = rows.rows[0]?.id;
    depositTxnId = rows.rows[0]?.transaction_id;
    assert.ok(depositId);
    assert.ok(String(depositTxnId).startsWith('TKT-CAP-DEP-'));
    assert.equal(rows.rows[0].status, 'submitted');
  });

  it('admin rejects a deposit without changing balance', async (t) => {
    if (!adminToken || !depositId || !investorId) {
      t.skip('Admin session or deposit unavailable');
      return;
    }

    const before = await getCapitalBalance(investorId);
    const res = await request(app)
      .patch(`/api/v1/admin/capital/deposit/${depositId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Invalid UTR for test reject' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);

    const after = await getCapitalBalance(investorId);
    assert.equal(after.capitalBalance, before.capitalBalance);
    assert.ok(after.capitalBalance >= 0);
  });

  it('admin approves deposit (optionally with modified amount) and balance updates', async (t) => {
    if (!investorToken || !adminToken || !investorId) {
      t.skip('Sessions unavailable');
      return;
    }

    const utr = `UTR${stamp}DEP02`;
    const create = await request(app)
      .post('/api/v1/investor/capital/deposit')
      .set('Authorization', `Bearer ${investorToken}`)
      .field('amount', '30000')
      .field('transfer_date', '2024-07-16')
      .field('utr_number', utr)
      .attach('payment_screenshot', JPEG_1X1, {
        filename: 'shot.jpg',
        contentType: 'image/jpeg',
      });

    assert.equal(create.status, 201, JSON.stringify(create.body));

    const row = await query(
      `SELECT id FROM capital_transactions
       WHERE investor_id = $1 AND type = 'deposit' AND status = 'submitted'
       ORDER BY created_at DESC LIMIT 1`,
      [investorId]
    );
    const id = row.rows[0]?.id;
    assert.ok(id);

    const before = await getCapitalBalance(investorId);
    const approve = await request(app)
      .patch(`/api/v1/admin/capital/deposit/${id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 28000, admin_remark: 'Adjusted after verification' });

    assert.equal(approve.status, 200, JSON.stringify(approve.body));
    assert.equal(approve.body.success, true);

    const after = await getCapitalBalance(investorId);
    assert.equal(after.capitalBalance, before.capitalBalance + 28000);
    assert.ok(after.capitalBalance >= 0);
  });

  it('creates withdrawal request and keeps capital balance non-negative', async (t) => {
    if (!investorToken || !investorId) {
      t.skip('Investor session unavailable');
      return;
    }

    const balance = await getCapitalBalance(investorId);
    if (balance.capitalBalance < 1000) {
      t.skip('Insufficient capital for withdrawal test');
      return;
    }

    const amount = Math.min(1000, balance.capitalBalance);
    const res = await request(app)
      .post('/api/v1/investor/capital/withdraw')
      .set('Authorization', `Bearer ${investorToken}`)
      .send({
        amount,
        account_type: 'capital',
        transfer_mode: 'bank',
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.success, true);

    const after = await getCapitalBalance(investorId);
    assert.ok(after.capitalBalance >= 0);
    assert.ok(after.pendingWithdrawalAmount >= amount);
  });

  it('balance calculation: approved deposits − approved withdrawals ≥ 0', async (t) => {
    if (!investorId) {
      t.skip('Investor unavailable');
      return;
    }

    const capital = await getCapitalBalance(investorId);
    const revenue = await getRevenueBalance(investorId);
    assert.ok(capital.capitalBalance >= 0);
    assert.ok(typeof revenue === 'number' && revenue >= 0);
  });

  it('model helpers create deposit with transaction id format', async (t) => {
    if (!investorId) {
      t.skip('Investor unavailable');
      return;
    }

    const dep = await createDepositRequest({
      investorId,
      amount: 10000,
      transferDate: '2024-07-17',
      utrNumber: `UTR${stamp}MODEL`,
      paymentScreenshotUrl: 'payment-screenshots/test.jpg',
      remark: 'model unit',
    });

    assert.ok(dep.transaction_id.startsWith('TKT-CAP-DEP-'));
    assert.equal(dep.amount, 10000);
    assert.equal(dep.status, 'submitted');
  });
});
