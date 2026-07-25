import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

const USER_SAFE_COLUMNS = `
  id,
  full_name,
  email,
  mobile,
  status,
  kyc_status,
  is_deleted,
  created_at,
  updated_at
`;

/**
 * Normalize Indian mobile to 10 digits.
 * @param {string | number} mobile
 * @returns {string}
 */
export function normalizeMobile(mobile) {
  let digits = String(mobile).replace(/[\s-]/g, '');

  if (digits.startsWith('+91')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  }

  return digits;
}

/**
 * Find user by email (includes soft-deleted / deleted status).
 * @param {string} email
 * @returns {Promise<object | null>}
 */
export async function findUserByEmail(email) {
  const result = await query(
    `SELECT ${USER_SAFE_COLUMNS}
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [String(email).trim()]
  );

  return result.rows[0] || null;
}

/**
 * Email is blocked if already registered or retained on a deleted account.
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isEmailTaken(email) {
  const existing = await findUserByEmail(email);
  return Boolean(existing);
}

/**
 * Create a pending Tikhat Partner (investor).
 * Never returns password_hash.
 *
 * @param {object} params
 * @param {string} params.fullName
 * @param {string} params.email
 * @param {string} params.passwordHash
 * @param {string} params.mobile
 * @returns {Promise<object>}
 */
export async function createInvestor({ fullName, email, passwordHash, mobile }) {
  const result = await query(
    `INSERT INTO users (
       full_name,
       email,
       password_hash,
       mobile,
       status,
       kyc_status
     ) VALUES ($1, $2, $3, $4, 'pending', 'pending')
     RETURNING ${USER_SAFE_COLUMNS}`,
    [
      String(fullName).trim(),
      String(email).trim().toLowerCase(),
      passwordHash,
      normalizeMobile(mobile),
    ]
  );

  const user = result.rows[0];

  logger.info('Investor registration created', {
    userId: user.id,
    email: user.email,
    status: user.status,
  });

  return user;
}

/**
 * Active admins for registration alert emails.
 * @returns {Promise<object[]>}
 */
export async function getActiveAdmins() {
  const result = await query(
    `SELECT id, full_name, email, role, status
     FROM admins
     WHERE status = 'active'
     ORDER BY created_at ASC`
  );

  return result.rows;
}

/**
 * Fetch investor by id (safe columns only).
 * @param {string} userId
 * @returns {Promise<object | null>}
 */
export async function findUserById(userId) {
  const result = await query(
    `SELECT ${USER_SAFE_COLUMNS}
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}
