import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from './email.service.js';
import { TIMEZONE } from '../utils/formatDate.js';
import {
  generateTransactionId,
  TRANSACTION_TYPES,
} from './transaction.service.js';
import { createNotification } from './notification.service.js';
import { isEmailTaken, getActiveAdmins } from '../models/user.model.js';
import { isValidEmail } from '../utils/validators.js';
import {
  createSession,
  invalidateSession,
  getSessionById as getDbSessionById,
  isSessionActive as isDbSessionActive,
  ensureSessionSchema,
  detectSuspiciousIP,
  getActiveSessions,
} from './session.service.js';

export { detectSuspiciousIP };

const BCRYPT_ROUNDS = 12;
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
const MAX_FAILED_ATTEMPTS = 5;
const ACCESS_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_EXPIRY = '30d';
const REFRESH_TOKEN_MS = 30 * 24 * 60 * 60 * 1000;

export const DEVICE_TYPES = Object.freeze({
  MOBILE: 'mobile',
  WEB: 'web',
});

export const OTP_PURPOSE = Object.freeze({
  LOGIN: 'login',
  RESET_PASSWORD: 'reset_password',
  EMAIL_CHANGE: 'email_change',
});

/**
 * Custom auth error with HTTP status + API error code.
 */
export class AuthError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} status
   */
  constructor(message, code, status) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {string} token
 * @returns {string}
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * @returns {string} 6-digit OTP
 */
export function generateOtpCode() {
  const num = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(num).padStart(OTP_LENGTH, '0');
}

/**
 * Today's midnight in IST as a Date.
 * @returns {Date}
 */
export function getISTMidnightToday() {
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  return new Date(`${dateKey}T00:00:00.000+05:30`);
}

/**
 * @param {string} email
 * @returns {Promise<object | null>}
 */
async function findInvestorForAuth(email) {
  const result = await query(
    `SELECT
       id,
       full_name,
       email,
       password_hash,
       mobile,
       status,
       is_deleted,
       failed_login_attempts,
       updated_at,
       created_at
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [String(email).trim()]
  );

  return result.rows[0] || null;
}

/**
 * @param {string} userId
 * @returns {Promise<object | null>}
 */
async function findInvestorById(userId) {
  const result = await query(
    `SELECT
       id,
       full_name,
       email,
       password_hash,
       mobile,
       status,
       is_deleted,
       failed_login_attempts,
       updated_at,
       created_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

/**
 * Auto-unlock locked accounts after 12:00 AM IST.
 * @param {object} user
 * @returns {Promise<object>}
 */
async function maybeAutoUnlock(user) {
  if (user.status !== 'locked') {
    return user;
  }

  const lockedAt = new Date(user.updated_at);
  if (lockedAt >= getISTMidnightToday()) {
    return user;
  }

  const result = await query(
    `UPDATE users
     SET status = 'active',
         failed_login_attempts = 0,
         updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       full_name,
       email,
       password_hash,
       mobile,
       status,
       is_deleted,
       failed_login_attempts,
       updated_at,
       created_at`,
    [user.id]
  );

  logger.info('Investor auto-unlocked at IST midnight boundary', {
    userId: user.id,
  });

  return result.rows[0];
}

/**
 * @param {object} user
 */
function assertLoginAllowed(user) {
  if (!user || user.is_deleted || user.status === 'deleted') {
    throw new AuthError(
      'This account is no longer available',
      'AUTH_FORBIDDEN',
      403
    );
  }

  if (user.status === 'self_deactivated') {
    throw new AuthError(
      'Account deactivated. Contact support to reactivate.',
      'AUTH_FORBIDDEN',
      403
    );
  }

  if (user.status === 'pending') {
    throw new AuthError(
      'Account pending admin approval',
      'AUTH_FORBIDDEN',
      403
    );
  }

  if (user.status === 'locked') {
    throw new AuthError(
      'Account locked. Unlock via email OTP or wait till midnight.',
      'AUTH_ACCOUNT_LOCKED',
      423
    );
  }

  // active + paused allowed
  if (user.status !== 'active' && user.status !== 'paused') {
    throw new AuthError('Account cannot login', 'AUTH_FORBIDDEN', 403);
  }
}

/**
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function incrementFailedAttempts(userId) {
  const result = await query(
    `UPDATE users
     SET failed_login_attempts = failed_login_attempts + 1,
         updated_at = NOW()
     WHERE id = $1
     RETURNING failed_login_attempts`,
    [userId]
  );

  return result.rows[0]?.failed_login_attempts || 0;
}

/**
 * @param {string} userId
 */
async function lockAccount(userId) {
  await query(
    `UPDATE users
     SET status = 'locked',
         updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );

  logger.warn('Investor account locked after failed login attempts', { userId });
}

/**
 * @param {string} userId
 */
async function resetFailedAttempts(userId) {
  await query(
    `UPDATE users
     SET failed_login_attempts = 0,
         updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}

/**
 * Invalidate unused OTPs and store a new hashed OTP.
 * @param {string} email
 * @param {string} purpose
 * @param {string} [plainOtp] - optional override (tests)
 * @returns {Promise<{ otp: string, expiresAt: Date }>}
 */
export async function createAndStoreOtp(email, purpose, plainOtp = null) {
  const otp = plainOtp || generateOtpCode();
  const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const normalizedEmail = String(email).trim().toLowerCase();

  await query(
    `UPDATE otp_verifications
     SET is_used = TRUE,
         updated_at = NOW()
     WHERE LOWER(email) = LOWER($1)
       AND purpose = $2
       AND is_used = FALSE`,
    [normalizedEmail, purpose]
  );

  await query(
    `INSERT INTO otp_verifications (email, otp_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [normalizedEmail, otpHash, purpose, expiresAt.toISOString()]
  );

  return { otp, expiresAt };
}

/**
 * @param {string} email
 * @param {string} purpose
 * @param {string} otp
 * @returns {Promise<object>} otp row
 */
async function verifyStoredOtp(email, purpose, otp) {
  const result = await query(
    `SELECT id, otp_hash, expires_at, is_used
     FROM otp_verifications
     WHERE LOWER(email) = LOWER($1)
       AND purpose = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [String(email).trim().toLowerCase(), purpose]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AuthError('Invalid or expired OTP', 'AUTH_OTP_INVALID', 400);
  }

  if (row.is_used) {
    throw new AuthError('Invalid or expired OTP', 'AUTH_OTP_INVALID', 400);
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new AuthError('OTP has expired', 'AUTH_OTP_EXPIRED', 400);
  }

  const matches = await bcrypt.compare(String(otp), row.otp_hash);
  if (!matches) {
    throw new AuthError('Invalid or expired OTP', 'AUTH_OTP_INVALID', 400);
  }

  await query(
    `UPDATE otp_verifications
     SET is_used = TRUE,
         updated_at = NOW()
     WHERE id = $1`,
    [row.id]
  );

  return row;
}

/**
 * @param {object} user
 * @param {string} deviceType
 * @returns {Promise<{ accessToken: string, refreshToken: string, sessionId: string, expiresIn: string }>}
 */
async function createSessionAndTokens(user, deviceType) {
  if (
    deviceType !== DEVICE_TYPES.MOBILE &&
    deviceType !== DEVICE_TYPES.WEB
  ) {
    throw new AuthError(
      'device_type must be mobile or web',
      'VALIDATION_ERROR',
      400
    );
  }

  await ensureSessionSchema();

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MS);

  const accessToken = jwt.sign(
    {
      userId: user.id,
      role: 'investor',
      sessionId,
      name: user.full_name,
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    {
      userId: user.id,
      role: 'investor',
      sessionId,
      type: 'refresh',
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  const tokenHash = hashToken(refreshToken);

  await createSession({
    sessionId,
    userId: user.id,
    userType: 'investor',
    deviceType,
    tokenHash,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken,
    sessionId,
    expiresIn: ACCESS_TOKEN_EXPIRY,
    deviceType,
  };
}

/**
 * Login step 1: validate credentials and send OTP.
 * @param {string} email
 * @param {string} password
 * @param {string} deviceType
 * @returns {Promise<object>}
 */
export async function loginInvestor(email, password, deviceType) {
  if (
    deviceType !== DEVICE_TYPES.MOBILE &&
    deviceType !== DEVICE_TYPES.WEB
  ) {
    throw new AuthError(
      'device_type must be mobile or web',
      'VALIDATION_ERROR',
      400
    );
  }

  let user = await findInvestorForAuth(email);

  if (!user) {
    throw new AuthError(
      'Invalid email or password',
      'AUTH_INVALID_CREDENTIALS',
      401
    );
  }

  user = await maybeAutoUnlock(user);
  assertLoginAllowed(user);

  const passwordOk = await bcrypt.compare(String(password), user.password_hash);
  if (!passwordOk) {
    const attempts = await incrementFailedAttempts(user.id);
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await lockAccount(user.id);
      throw new AuthError(
        'Account locked. Unlock via email OTP or wait till midnight.',
        'AUTH_ACCOUNT_LOCKED',
        423
      );
    }

    throw new AuthError(
      'Invalid email or password',
      'AUTH_INVALID_CREDENTIALS',
      401
    );
  }

  const { otp, expiresAt } = await createAndStoreOtp(
    user.email,
    OTP_PURPOSE.LOGIN
  );

  await sendEmail(user.email, 'otp', {
    investorName: user.full_name,
    otp,
    purpose: 'login verification',
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    referenceId: user.id,
    recipientType: 'investor',
  });

  logger.info('Login OTP sent', { userId: user.id, deviceType });

  return {
    email: user.email,
    deviceType,
    expiresAt,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    message: 'OTP sent to your email',
  };
}

/**
 * Login step 2: verify OTP and issue tokens.
 * @param {string} email
 * @param {string} otp
 * @param {string} deviceType
 * @returns {Promise<object>}
 */
export async function verifyLoginOtp(email, otp, deviceType) {
  let user = await findInvestorForAuth(email);

  if (!user) {
    throw new AuthError('Invalid or expired OTP', 'AUTH_OTP_INVALID', 400);
  }

  user = await maybeAutoUnlock(user);
  assertLoginAllowed(user);

  await verifyStoredOtp(user.email, OTP_PURPOSE.LOGIN, otp);

  await resetFailedAttempts(user.id);

  const tokens = await createSessionAndTokens(user, deviceType);

  logger.info('Investor login verified', {
    userId: user.id,
    sessionId: tokens.sessionId,
    deviceType,
  });

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    sessionId: tokens.sessionId,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      mobile: user.mobile,
      status: user.status,
      role: 'investor',
    },
  };
}

/**
 * Resend login OTP (password already validated earlier in flow).
 * @param {string} email
 * @returns {Promise<object>}
 */
export async function resendLoginOtp(email) {
  let user = await findInvestorForAuth(email);

  if (!user) {
    // Do not reveal whether email exists
    return {
      email: String(email).trim().toLowerCase(),
      expiresInMinutes: OTP_EXPIRY_MINUTES,
      message: 'If the account exists, a new OTP has been sent',
    };
  }

  user = await maybeAutoUnlock(user);
  assertLoginAllowed(user);

  const { otp, expiresAt } = await createAndStoreOtp(
    user.email,
    OTP_PURPOSE.LOGIN
  );

  await sendEmail(user.email, 'otp', {
    investorName: user.full_name,
    otp,
    purpose: 'login verification',
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    referenceId: user.id,
    recipientType: 'investor',
  });

  return {
    email: user.email,
    expiresAt,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    message: 'OTP sent to your email',
  };
}

/**
 * Invalidate the current session.
 * @param {string} sessionId
 * @param {string} userId
 */
export async function logoutSession(sessionId, userId) {
  const invalidated = await invalidateSession(sessionId, userId, 'investor');

  if (!invalidated) {
    throw new AuthError('Session not found', 'AUTH_UNAUTHORIZED', 401);
  }

  logger.info('Investor session logged out', { sessionId, userId });
}

/**
 * Issue a new access token from a valid refresh token.
 * @param {string} refreshToken
 * @returns {Promise<object>}
 */
export async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new AuthError('Refresh token required', 'AUTH_UNAUTHORIZED', 401);
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AuthError('Invalid refresh token', 'AUTH_UNAUTHORIZED', 401);
  }

  if (payload.type !== 'refresh' || !payload.sessionId || !payload.userId) {
    throw new AuthError('Invalid refresh token', 'AUTH_UNAUTHORIZED', 401);
  }

  const session = await getSessionById(payload.sessionId);
  if (!session || session.is_active === false) {
    throw new AuthError('Session expired or invalidated', 'AUTH_UNAUTHORIZED', 401);
  }

  if (session.user_id !== payload.userId) {
    throw new AuthError('Invalid refresh token', 'AUTH_UNAUTHORIZED', 401);
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await invalidateSession(session.id);
    throw new AuthError('Session expired or invalidated', 'AUTH_UNAUTHORIZED', 401);
  }

  if (session.token_hash !== hashToken(refreshToken)) {
    throw new AuthError('Invalid refresh token', 'AUTH_UNAUTHORIZED', 401);
  }

  const user = await findInvestorById(payload.userId);

  if (!user || user.is_deleted || user.status === 'deleted') {
    throw new AuthError('Account unavailable', 'AUTH_UNAUTHORIZED', 401);
  }

  const accessToken = jwt.sign(
    {
      userId: user.id,
      role: 'investor',
      sessionId: session.id,
      name: user.full_name,
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_EXPIRY,
    sessionId: session.id,
  };
}

/**
 * @param {string} sessionId
 * @returns {Promise<object | null>}
 */
export async function getSessionById(sessionId) {
  return getDbSessionById(sessionId);
}

/**
 * Used by auth middleware to reject invalidated sessions.
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function isSessionActive(sessionId) {
  return isDbSessionActive(sessionId);
}

/**
 * Accounts that may use password-reset OTP (includes locked).
 * @param {object} user
 */
function assertPasswordResetAllowed(user) {
  if (!user || user.is_deleted || user.status === 'deleted') {
    throw new AuthError(
      'This account is no longer available',
      'AUTH_FORBIDDEN',
      403
    );
  }

  if (user.status === 'self_deactivated') {
    throw new AuthError(
      'Account deactivated. Contact support to reactivate.',
      'AUTH_FORBIDDEN',
      403
    );
  }

  if (user.status === 'pending') {
    throw new AuthError(
      'Account pending admin approval',
      'AUTH_FORBIDDEN',
      403
    );
  }
}

/**
 * Validate new password strength.
 * @param {string} password
 */
function assertStrongPassword(password) {
  const value = String(password || '');
  if (
    value.length < 8 ||
    !/[A-Z]/.test(value) ||
    !/[a-z]/.test(value) ||
    !/[0-9]/.test(value)
  ) {
    throw new AuthError(
      'Password must be at least 8 characters and include uppercase, lowercase, and a number',
      'VALIDATION_ERROR',
      400
    );
  }
}

/**
 * Authenticated investor password change.
 * @param {string} investorId
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<object>}
 */
export async function changeInvestorPassword(
  investorId,
  currentPassword,
  newPassword
) {
  assertStrongPassword(newPassword);

  const user = await findInvestorById(investorId);
  if (!user || user.is_deleted || user.status === 'deleted') {
    throw new AuthError('Account unavailable', 'AUTH_UNAUTHORIZED', 401);
  }

  if (user.status === 'self_deactivated') {
    throw new AuthError('Account is deactivated', 'AUTH_FORBIDDEN', 403);
  }

  const currentOk = await bcrypt.compare(
    String(currentPassword),
    user.password_hash
  );
  if (!currentOk) {
    throw new AuthError(
      'Current password is incorrect',
      'AUTH_INVALID_CREDENTIALS',
      401
    );
  }

  if (String(currentPassword) === String(newPassword)) {
    throw new AuthError(
      'New password must be different from current password',
      'VALIDATION_ERROR',
      400
    );
  }

  const passwordHash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
  await query(
    `UPDATE users
     SET password_hash = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [passwordHash, investorId]
  );

  logger.info('Investor password changed', { userId: investorId });

  return {
    message: 'Password updated successfully',
  };
}

/**
 * List active investor sessions (mobile + web).
 * @param {string} investorId
 * @param {string} [currentSessionId]
 * @returns {Promise<object[]>}
 */
export async function listInvestorSessions(investorId, currentSessionId) {
  const rows = await getActiveSessions(investorId, 'investor');
  return rows.map((row) => ({
    id: row.id,
    device_type: row.device_type,
    created_at: row.created_at,
    expires_at: row.expires_at,
    is_current: currentSessionId
      ? String(row.id) === String(currentSessionId)
      : false,
  }));
}

/**
 * Forgot password — send reset OTP (locked accounts allowed).
 * Always returns a generic success shape when email is unknown (no enumeration).
 *
 * @param {string} email
 * @returns {Promise<object>}
 */
export async function forgotPassword(email) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const generic = {
    email: normalizedEmail,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    message: 'If an account exists for this email, an OTP has been sent',
  };

  const user = await findInvestorForAuth(normalizedEmail);
  if (!user) {
    return generic;
  }

  try {
    assertPasswordResetAllowed(user);
  } catch (error) {
    if (error instanceof AuthError && error.code === 'AUTH_FORBIDDEN') {
      return generic;
    }
    throw error;
  }

  const { otp, expiresAt } = await createAndStoreOtp(
    user.email,
    OTP_PURPOSE.RESET_PASSWORD
  );

  await sendEmail(user.email, 'otp', {
    investorName: user.full_name,
    otp,
    purpose: 'password reset',
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    referenceId: user.id,
    recipientType: 'investor',
  });

  logger.info('Password reset OTP sent', { userId: user.id });

  return {
    email: user.email,
    expiresAt,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    message: 'OTP sent to your email',
  };
}

/**
 * Reset password with OTP — unlocks locked accounts.
 *
 * @param {string} email
 * @param {string} otp
 * @param {string} newPassword
 * @returns {Promise<object>}
 */
export async function resetPassword(email, otp, newPassword) {
  assertStrongPassword(newPassword);

  const user = await findInvestorForAuth(email);
  if (!user) {
    throw new AuthError('Invalid or expired OTP', 'AUTH_OTP_INVALID', 400);
  }

  assertPasswordResetAllowed(user);
  await verifyStoredOtp(user.email, OTP_PURPOSE.RESET_PASSWORD, otp);

  const passwordHash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);

  const result = await query(
    `UPDATE users
     SET password_hash = $1,
         failed_login_attempts = 0,
         status = CASE WHEN status = 'locked' THEN 'active' ELSE status END,
         updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, status, failed_login_attempts`,
    [passwordHash, user.id]
  );

  const updated = result.rows[0];

  logger.info('Password reset successful', {
    userId: updated.id,
    unlocked: user.status === 'locked',
  });

  return {
    email: updated.email,
    status: updated.status,
    message: 'Password reset successful. You can now login with your new password.',
  };
}

/**
 * Investor requests email change (admin approval required).
 *
 * @param {string} investorId
 * @param {string} newEmail
 * @returns {Promise<object>}
 */
export async function requestEmailChange(investorId, newEmail) {
  if (!isValidEmail(newEmail)) {
    throw new AuthError('Valid email address is required', 'VALIDATION_ERROR', 400);
  }

  const normalizedNew = String(newEmail).trim().toLowerCase();
  const user = await findInvestorById(investorId);

  if (!user || user.is_deleted || user.status === 'deleted') {
    throw new AuthError('Account unavailable', 'AUTH_UNAUTHORIZED', 401);
  }

  if (user.status === 'self_deactivated' || user.status === 'pending') {
    throw new AuthError('Account cannot request email change', 'AUTH_FORBIDDEN', 403);
  }

  if (normalizedNew === String(user.email).toLowerCase()) {
    throw new AuthError(
      'New email must be different from current email',
      'VALIDATION_ERROR',
      400
    );
  }

  if (await isEmailTaken(normalizedNew)) {
    throw new AuthError('Email is already registered', 'USER_EMAIL_EXISTS', 409);
  }

  const pending = await query(
    `SELECT id
     FROM profile_update_requests
     WHERE investor_id = $1
       AND field_name = 'email'
       AND status = 'pending'
     LIMIT 1`,
    [investorId]
  );

  if (pending.rowCount > 0) {
    throw new AuthError(
      'An email change request is already pending approval',
      'VALIDATION_ERROR',
      400
    );
  }

  const requestId = await generateTransactionId(TRANSACTION_TYPES.PRF);

  const insert = await query(
    `INSERT INTO profile_update_requests (
       id,
       investor_id,
       field_name,
       old_value,
       new_value,
       status
     ) VALUES ($1, $2, 'email', $3, $4, 'pending')
     RETURNING id, investor_id, field_name, old_value, new_value, status, created_at`,
    [requestId, investorId, user.email, normalizedNew]
  );

  const request = insert.rows[0];

  await createNotification(
    investorId,
    'Email change request submitted',
    `Your request to change email to ${normalizedNew} is pending admin approval (${requestId}).`,
    'request',
    requestId,
    'profile_update'
  );

  const admins = await getActiveAdmins();
  await Promise.allSettled(
    admins.map((admin) =>
      sendEmail(admin.email, 'custom-notification', {
        investorName: admin.full_name,
        subjectTitle: 'Email change request pending',
        body: `Tikhat Partner ${user.full_name} requested an email change.\n\nRequest ID: ${requestId}\nCurrent: ${user.email}\nNew: ${normalizedNew}\n\nPlease review in User Management.`,
        referenceId: requestId,
        recipientType: 'admin',
      })
    )
  );

  logger.info('Email change request created', {
    requestId,
    investorId,
  });

  return {
    request,
    message:
      'Your details will be updated within 24-48 hours after admin approval. Thank you for your request.',
  };
}

/**
 * Approve or reject a pending email change request and notify the investor.
 * Used by admin profile-approval flows (and tests).
 *
 * @param {string} requestId
 * @param {'approved' | 'rejected'} decision
 * @param {{ adminId?: string, rejectionReason?: string }} [options]
 * @returns {Promise<object>}
 */
export async function resolveEmailChangeRequest(
  requestId,
  decision,
  options = {}
) {
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new AuthError('Invalid decision', 'VALIDATION_ERROR', 400);
  }

  const existing = await query(
    `SELECT
       id,
       investor_id,
       field_name,
       old_value,
       new_value,
       status
     FROM profile_update_requests
     WHERE id = $1
     LIMIT 1`,
    [requestId]
  );

  const request = existing.rows[0];
  if (!request || request.field_name !== 'email') {
    throw new AuthError('Email change request not found', 'NOT_FOUND', 404);
  }

  if (request.status !== 'pending') {
    throw new AuthError('Request is not pending', 'VALIDATION_ERROR', 400);
  }

  const investor = await findInvestorById(request.investor_id);
  if (!investor) {
    throw new AuthError('Investor not found', 'NOT_FOUND', 404);
  }

  if (decision === 'approved') {
    if (await isEmailTaken(request.new_value)) {
      throw new AuthError('Email is already registered', 'USER_EMAIL_EXISTS', 409);
    }

    await query(
      `UPDATE users
       SET email = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [request.new_value, request.investor_id]
    );

    await query(
      `UPDATE profile_update_requests
       SET status = 'approved',
           admin_id = $2,
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [requestId, options.adminId || null]
    );

    await sendEmail(request.new_value, 'approval', {
      investorName: investor.full_name,
      actionLabel: 'Email change',
      message: `Your email has been updated to ${request.new_value}.`,
      referenceId: requestId,
      recipientType: 'investor',
    });

    await createNotification(
      request.investor_id,
      'Email change approved',
      `Your email was updated to ${request.new_value}.`,
      'request',
      requestId,
      'profile_update'
    );
  } else {
    const reason = String(options.rejectionReason || 'No reason provided.').trim();

    await query(
      `UPDATE profile_update_requests
       SET status = 'rejected',
           admin_id = $2,
           rejection_reason = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [requestId, options.adminId || null, reason]
    );

    await sendEmail(investor.email, 'rejection', {
      investorName: investor.full_name,
      actionLabel: 'Email change',
      reason,
      fieldName: 'email',
      referenceId: requestId,
      recipientType: 'investor',
    });

    await createNotification(
      request.investor_id,
      'Email change rejected',
      `Your email change request was not approved. Reason: ${reason}`,
      'request',
      requestId,
      'profile_update'
    );
  }

  const updated = await query(
    `SELECT id, investor_id, field_name, old_value, new_value, status, rejection_reason, updated_at
     FROM profile_update_requests
     WHERE id = $1`,
    [requestId]
  );

  return updated.rows[0];
}
