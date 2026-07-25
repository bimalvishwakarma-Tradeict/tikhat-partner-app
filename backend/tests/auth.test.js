/**
 * Auth API tests: register, login, OTP, logout, refresh, forgot password.
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

const { default: app } = await import('../src/app.js');
const { query } = await import('../src/db/connection.js');
const { setResendClient } = await import('../src/services/email.service.js');
const { OTP_PURPOSE } = await import('../src/services/auth.service.js');

const stamp = Date.now();
const investorEmail = `test.investor.${stamp}@tikhat.test`;
const investorPassword = 'TestPass1';
const investorMobile = `9${String(stamp).slice(-9)}`;
const TEST_OTP = '123456';

let dbReady = false;
let investorId = null;
let accessToken = null;
let refreshToken = null;

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
});

after(async () => {
  setResendClient(null);
  if (dbReady && investorId) {
    try {
      await query(`DELETE FROM sessions WHERE user_id = $1`, [investorId]);
      await query(`DELETE FROM otp_verifications WHERE LOWER(email) = LOWER($1)`, [
        investorEmail,
      ]);
      await query(`DELETE FROM email_logs WHERE LOWER(recipient_email) = LOWER($1)`, [
        investorEmail,
      ]);
      await query(`DELETE FROM users WHERE id = $1`, [investorId]);
    } catch {
      // best-effort cleanup
    }
  }
});

describe('Auth API', () => {
  it('rejects invalid registration payloads', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      full_name: 'Ab',
      email: 'not-an-email',
      password: 'weak',
      mobile: '123',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it('registers a new Tikhat Partner (pending)', async (t) => {
    if (!dbReady) {
      t.skip('Database unavailable');
      return;
    }

    const res = await request(app).post('/api/v1/auth/register').send({
      full_name: 'Test Investor',
      email: investorEmail,
      password: investorPassword,
      mobile: investorMobile,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    const row = await query(
      `SELECT id, status FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [investorEmail]
    );
    assert.ok(row.rows[0]?.id);
    investorId = row.rows[0].id;
    assert.equal(row.rows[0].status, 'pending');
  });

  it('blocks duplicate email registration', async (t) => {
    if (!dbReady || !investorId) {
      t.skip('Requires prior registration');
      return;
    }

    const res = await request(app).post('/api/v1/auth/register').send({
      full_name: 'Another Person',
      email: investorEmail,
      password: investorPassword,
      mobile: `8${String(stamp).slice(-9)}`,
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
  });

  it('rejects login while registration is pending', async (t) => {
    if (!dbReady || !investorId) {
      t.skip('Requires prior registration');
      return;
    }

    const res = await request(app).post('/api/v1/auth/login').send({
      email: investorEmail,
      password: investorPassword,
      device_type: 'web',
    });

    assert.ok(res.status === 403 || res.status === 401 || res.status === 400);
    assert.equal(res.body.success, false);
  });

  it('login → OTP → verify after admin approval', async (t) => {
    if (!dbReady || !investorId) {
      t.skip('Requires prior registration');
      return;
    }

    await query(
      `UPDATE users
       SET status = 'active', updated_at = NOW()
       WHERE id = $1`,
      [investorId]
    );

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: investorEmail,
      password: investorPassword,
      device_type: 'web',
    });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);

    await seedOtp(investorEmail, OTP_PURPOSE.LOGIN, TEST_OTP);

    const otpRes = await request(app).post('/api/v1/auth/verify-otp').send({
      email: investorEmail,
      otp: TEST_OTP,
      device_type: 'web',
    });

    assert.equal(otpRes.status, 200);
    assert.equal(otpRes.body.success, true);
    assert.ok(otpRes.body.data?.accessToken);
    assert.ok(otpRes.body.data?.refreshToken);

    accessToken = otpRes.body.data.accessToken;
    refreshToken = otpRes.body.data.refreshToken;
  });

  it('refreshes access token', async (t) => {
    if (!refreshToken) {
      t.skip('Requires login session');
      return;
    }

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data?.accessToken);
    accessToken = res.body.data.accessToken;
    if (res.body.data.refreshToken) {
      refreshToken = res.body.data.refreshToken;
    }
  });

  it('forgot password + reset password', async (t) => {
    if (!dbReady || !investorId) {
      t.skip('Requires registered investor');
      return;
    }

    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: investorEmail });

    assert.equal(forgotRes.status, 200);
    assert.equal(forgotRes.body.success, true);

    await seedOtp(investorEmail, OTP_PURPOSE.RESET_PASSWORD, TEST_OTP);

    const newPassword = 'NewPass12';
    const resetRes = await request(app).post('/api/v1/auth/reset-password').send({
      email: investorEmail,
      otp: TEST_OTP,
      new_password: newPassword,
    });

    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.body.success, true);

    // Restore original password for remaining tests
    const hash = await bcrypt.hash(investorPassword, 10);
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
      hash,
      investorId,
    ]);
  });

  it('logs out authenticated session', async (t) => {
    if (!accessToken) {
      t.skip('Requires login session');
      return;
    }

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});
