import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import {
  AuthError,
  hashToken,
  createAndStoreOtp,
  OTP_PURPOSE,
  DEVICE_TYPES,
} from '../services/auth.service.js';
import { sendEmail } from '../services/email.service.js';

const BCRYPT_ROUNDS = 12;
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
const ACCESS_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_EXPIRY = '30d';
const REFRESH_TOKEN_MS = 30 * 24 * 60 * 60 * 1000;

const ADMIN_SAFE_COLUMNS = `
  id,
  full_name,
  email,
  mobile,
  role,
  status,
  created_by,
  created_at,
  updated_at
`;

const DELETED_EMAIL_SUFFIX = '@tikhat.invalid';

/**
 * @param {string} adminId
 * @returns {string}
 */
export function buildDeletedAdminEmail(adminId) {
  return `deleted.${adminId}${DELETED_EMAIL_SUFFIX}`;
}

/**
 * @param {string} email
 * @returns {boolean}
 */
export function isSoftDeletedEmail(email) {
  return String(email || '').endsWith(DELETED_EMAIL_SUFFIX);
}

/**
 * @param {string} email
 * @returns {Promise<object | null>}
 */
export async function findAdminByEmail(email) {
  const result = await query(
    `SELECT
       id,
       full_name,
       email,
       password_hash,
       mobile,
       role,
       status,
       created_by,
       created_at,
       updated_at
     FROM admins
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [String(email).trim()]
  );

  return result.rows[0] || null;
}

/**
 * @param {string} adminId
 * @returns {Promise<object | null>}
 */
export async function findAdminById(adminId) {
  const result = await query(
    `SELECT ${ADMIN_SAFE_COLUMNS}
     FROM admins
     WHERE id = $1
     LIMIT 1`,
    [adminId]
  );

  return result.rows[0] || null;
}

/**
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isAdminEmailTaken(email) {
  const existing = await findAdminByEmail(email);
  return Boolean(existing);
}

/**
 * @returns {Promise<object[]>}
 */
export async function listAdmins() {
  const result = await query(
    `SELECT ${ADMIN_SAFE_COLUMNS}
     FROM admins
     WHERE email NOT LIKE $1
     ORDER BY
       CASE role WHEN 'super_admin' THEN 0 ELSE 1 END,
       created_at ASC`,
    [`deleted.%${DELETED_EMAIL_SUFFIX}`]
  );

  return result.rows;
}

/**
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function createAdmin({
  fullName,
  email,
  passwordHash,
  mobile,
  role,
  createdBy,
}) {
  if (role !== 'admin' && role !== 'super_admin') {
    throw new AuthError(
      'role must be admin or super_admin',
      'VALIDATION_ERROR',
      400
    );
  }

  const result = await query(
    `INSERT INTO admins (
       full_name,
       email,
       password_hash,
       mobile,
       role,
       status,
       created_by
     ) VALUES ($1, $2, $3, $4, $5, 'active', $6)
     RETURNING ${ADMIN_SAFE_COLUMNS}`,
    [
      String(fullName).trim(),
      String(email).trim().toLowerCase(),
      passwordHash,
      mobile || null,
      role,
      createdBy || null,
    ]
  );

  logger.info('Admin created', {
    adminId: result.rows[0].id,
    email: result.rows[0].email,
    role,
  });

  return result.rows[0];
}

/**
 * @param {string} adminId
 * @param {'active' | 'suspended'} status
 * @returns {Promise<object>}
 */
export async function updateAdminStatus(adminId, status) {
  if (status !== 'active' && status !== 'suspended') {
    throw new AuthError('Invalid status', 'VALIDATION_ERROR', 400);
  }

  const result = await query(
    `UPDATE admins
     SET status = $2,
         updated_at = NOW()
     WHERE id = $1
       AND email NOT LIKE $3
     RETURNING ${ADMIN_SAFE_COLUMNS}`,
    [adminId, status, `deleted.%${DELETED_EMAIL_SUFFIX}`]
  );

  if (result.rowCount === 0) {
    throw new AuthError('Admin not found', 'NOT_FOUND', 404);
  }

  return result.rows[0];
}

/**
 * Soft delete: suspend + free email for reuse.
 * @param {string} adminId
 * @returns {Promise<object>}
 */
export async function softDeleteAdmin(adminId) {
  const existing = await findAdminById(adminId);
  if (!existing || isSoftDeletedEmail(existing.email)) {
    throw new AuthError('Admin not found', 'NOT_FOUND', 404);
  }

  if (existing.role === 'super_admin') {
    const supers = await query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM admins
       WHERE role = 'super_admin'
         AND status = 'active'
         AND email NOT LIKE $1`,
      [`deleted.%${DELETED_EMAIL_SUFFIX}`]
    );
    if ((supers.rows[0]?.count || 0) <= 1) {
      throw new AuthError(
        'Cannot delete the only Super Admin',
        'AUTH_FORBIDDEN',
        403
      );
    }
  }

  const deletedEmail = buildDeletedAdminEmail(adminId);
  const result = await query(
    `UPDATE admins
     SET status = 'suspended',
         email = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${ADMIN_SAFE_COLUMNS}`,
    [adminId, deletedEmail]
  );

  return result.rows[0];
}

/**
 * @param {string} adminId
 * @param {string} passwordHash
 * @returns {Promise<object>}
 */
export async function updateAdminPassword(adminId, passwordHash) {
  const result = await query(
    `UPDATE admins
     SET password_hash = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${ADMIN_SAFE_COLUMNS}`,
    [adminId, passwordHash]
  );

  if (result.rowCount === 0) {
    throw new AuthError('Admin not found', 'NOT_FOUND', 404);
  }

  return result.rows[0];
}

/**
 * @param {string} adminId
 * @returns {Promise<string | null>}
 */
export async function getAdminPasswordHash(adminId) {
  const result = await query(
    `SELECT password_hash FROM admins WHERE id = $1 LIMIT 1`,
    [adminId]
  );
  return result.rows[0]?.password_hash || null;
}

/**
 * @param {string} email
 * @param {string} purpose
 * @param {string} otp
 */
async function verifyAdminOtp(email, purpose, otp) {
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
  if (!row || row.is_used) {
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
}

/**
 * @param {object} admin
 * @param {string} deviceType
 */
async function createAdminSessionAndTokens(admin, deviceType) {
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

  await query(
    `DELETE FROM sessions
     WHERE user_id = $1
       AND user_type = 'admin'
       AND device_type = $2`,
    [admin.id, deviceType]
  );

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MS);

  const accessToken = jwt.sign(
    {
      userId: admin.id,
      role: admin.role,
      sessionId,
      name: admin.full_name,
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    {
      userId: admin.id,
      role: admin.role,
      sessionId,
      type: 'refresh',
      userType: 'admin',
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  await query(
    `INSERT INTO sessions (
       id,
       user_id,
       user_type,
       device_type,
       token_hash,
       expires_at
     ) VALUES ($1, $2, 'admin', $3, $4, $5)`,
    [sessionId, admin.id, deviceType, hashToken(refreshToken), expiresAt.toISOString()]
  );

  return {
    accessToken,
    refreshToken,
    sessionId,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  };
}

/**
 * Admin login step 1 — validate credentials, send OTP.
 * @param {string} email
 * @param {string} password
 * @param {string} deviceType
 */
export async function loginAdmin(email, password, deviceType) {
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

  const admin = await findAdminByEmail(email);

  if (!admin || isSoftDeletedEmail(admin.email)) {
    throw new AuthError(
      'Invalid email or password',
      'AUTH_INVALID_CREDENTIALS',
      401
    );
  }

  if (admin.status === 'suspended') {
    throw new AuthError('Account suspended', 'AUTH_FORBIDDEN', 403);
  }

  const passwordOk = await bcrypt.compare(String(password), admin.password_hash);
  if (!passwordOk) {
    throw new AuthError(
      'Invalid email or password',
      'AUTH_INVALID_CREDENTIALS',
      401
    );
  }

  const { otp, expiresAt } = await createAndStoreOtp(
    admin.email,
    OTP_PURPOSE.LOGIN
  );

  await sendEmail(admin.email, 'otp', {
    investorName: admin.full_name,
    otp,
    purpose: 'admin login verification',
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    referenceId: admin.id,
    recipientType: 'admin',
  });

  logger.info('Admin login OTP sent', { adminId: admin.id, deviceType });

  return {
    email: admin.email,
    deviceType,
    expiresAt,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    message: 'OTP sent to your email',
  };
}

/**
 * Admin login step 2 — verify OTP, issue tokens.
 * @param {string} email
 * @param {string} otp
 * @param {string} deviceType
 */
export async function verifyAdminLoginOtp(email, otp, deviceType) {
  const admin = await findAdminByEmail(email);

  if (!admin || isSoftDeletedEmail(admin.email)) {
    throw new AuthError('Invalid or expired OTP', 'AUTH_OTP_INVALID', 400);
  }

  if (admin.status === 'suspended') {
    throw new AuthError('Account suspended', 'AUTH_FORBIDDEN', 403);
  }

  await verifyAdminOtp(admin.email, OTP_PURPOSE.LOGIN, otp);

  const tokens = await createAdminSessionAndTokens(admin, deviceType);

  logger.info('Admin login verified', {
    adminId: admin.id,
    sessionId: tokens.sessionId,
    role: admin.role,
  });

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    sessionId: tokens.sessionId,
    user: {
      id: admin.id,
      full_name: admin.full_name,
      email: admin.email,
      mobile: admin.mobile,
      role: admin.role,
      status: admin.status,
    },
  };
}

/**
 * @param {string} email
 */
export async function resendAdminLoginOtp(email) {
  const admin = await findAdminByEmail(email);

  if (!admin || isSoftDeletedEmail(admin.email) || admin.status === 'suspended') {
    return {
      email: String(email).trim().toLowerCase(),
      expiresInMinutes: OTP_EXPIRY_MINUTES,
      message: 'If the account exists, a new OTP has been sent',
    };
  }

  const { otp, expiresAt } = await createAndStoreOtp(
    admin.email,
    OTP_PURPOSE.LOGIN
  );

  await sendEmail(admin.email, 'otp', {
    investorName: admin.full_name,
    otp,
    purpose: 'admin login verification',
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    referenceId: admin.id,
    recipientType: 'admin',
  });

  return {
    email: admin.email,
    expiresAt,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    message: 'OTP sent to your email',
  };
}

/**
 * @param {string} sessionId
 * @param {string} adminId
 */
export async function logoutAdminSession(sessionId, adminId) {
  const result = await query(
    `DELETE FROM sessions
     WHERE id = $1
       AND user_id = $2
       AND user_type = 'admin'
     RETURNING id`,
    [sessionId, adminId]
  );

  if (result.rowCount === 0) {
    throw new AuthError('Session not found', 'AUTH_UNAUTHORIZED', 401);
  }
}

/**
 * @param {string} refreshToken
 */
export async function refreshAdminAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new AuthError('Refresh token required', 'AUTH_UNAUTHORIZED', 401);
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AuthError('Invalid refresh token', 'AUTH_UNAUTHORIZED', 401);
  }

  if (
    payload.type !== 'refresh' ||
    !payload.sessionId ||
    !payload.userId ||
    (payload.role !== 'admin' && payload.role !== 'super_admin')
  ) {
    throw new AuthError('Invalid refresh token', 'AUTH_UNAUTHORIZED', 401);
  }

  const sessionResult = await query(
    `SELECT id, user_id, token_hash, expires_at
     FROM sessions
     WHERE id = $1 AND user_type = 'admin'
     LIMIT 1`,
    [payload.sessionId]
  );

  const session = sessionResult.rows[0];
  if (!session || session.user_id !== payload.userId) {
    throw new AuthError('Session expired or invalidated', 'AUTH_UNAUTHORIZED', 401);
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await query(`DELETE FROM sessions WHERE id = $1`, [session.id]);
    throw new AuthError('Session expired or invalidated', 'AUTH_UNAUTHORIZED', 401);
  }

  if (session.token_hash !== hashToken(refreshToken)) {
    throw new AuthError('Invalid refresh token', 'AUTH_UNAUTHORIZED', 401);
  }

  const admin = await findAdminById(payload.userId);
  if (!admin || admin.status === 'suspended' || isSoftDeletedEmail(admin.email)) {
    throw new AuthError('Account unavailable', 'AUTH_UNAUTHORIZED', 401);
  }

  const accessToken = jwt.sign(
    {
      userId: admin.id,
      role: admin.role,
      sessionId: session.id,
      name: admin.full_name,
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
