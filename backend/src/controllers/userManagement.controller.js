import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import bcrypt from 'bcryptjs';
import { query, getClient } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import {
  logAction,
  buildActionDescription,
  AUDIT_ENTITY_TYPES,
} from '../services/audit.service.js';
import { sendEmail } from '../services/email.service.js';
import { createNotification } from '../services/notification.service.js';
import {
  getBalanceSummary,
} from '../services/balance.service.js';
import { getRoiSettings } from '../models/revenue.model.js';
import {
  isEmailTaken,
  normalizeMobile,
} from '../models/user.model.js';
import { resolveEmailChangeRequest, AuthError } from '../services/auth.service.js';
import {
  ensureFilesTable,
  getFileById,
  UPLOAD_ROOT,
  FILE_CATEGORIES,
} from '../services/storage.service.js';
import { formatDate } from '../utils/formatDate.js';
import {
  isValidEmail,
  isValidFullName,
  isValidIndianMobile,
  isValidPAN,
  isValidAadhar,
} from '../utils/validators.js';

const BCRYPT_ROUNDS = 12;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_STATUSES = new Set([
  'pending',
  'active',
  'paused',
  'locked',
  'self_deactivated',
  'deleted',
]);

const VALID_KYC_STATUSES = new Set(['pending', 'verified', 'rejected']);

const SORT_COLUMNS = Object.freeze({
  name: 'u.full_name',
  joining_date: 'u.joining_date',
  capital_amount: 'capital_amount',
  status: 'u.status',
});

const INVESTOR_RETURN_COLUMNS = `
  id,
  full_name,
  email,
  mobile,
  profile_photo_url,
  date_of_birth,
  address,
  pan_number,
  pan_front_url,
  pan_back_url,
  aadhar_number,
  aadhar_front_url,
  aadhar_back_url,
  bank_account_number,
  bank_ifsc,
  bank_account_name,
  bank_name,
  upi_id,
  status,
  kyc_status,
  joining_date,
  failed_login_attempts,
  is_deleted,
  created_at,
  updated_at
`;

const INVESTOR_SAFE_COLUMNS = INVESTOR_RETURN_COLUMNS.split(',')
  .map((col) => `u.${col.trim()}`)
  .join(',\n  ');

/** Profile fields that map 1:1 to users columns. */
const PROFILE_USER_FIELDS = new Set([
  'full_name',
  'email',
  'mobile',
  'date_of_birth',
  'address',
  'pan_number',
  'pan_front_url',
  'pan_back_url',
  'aadhar_number',
  'aadhar_front_url',
  'aadhar_back_url',
  'bank_account_number',
  'bank_ifsc',
  'bank_account_name',
  'bank_name',
  'upi_id',
  'profile_photo_url',
]);

/** KYC identity fields locked after approval (investor cannot change). */
const KYC_LOCK_FIELDS = new Set(['pan_number', 'aadhar_number']);

const KYC_TRACKED_FIELDS = new Set([
  'pan_number',
  'aadhar_number',
  'pan_front_url',
  'pan_back_url',
  'aadhar_front_url',
  'aadhar_back_url',
]);

const BANK_FIELDS = new Set([
  'bank_account_number',
  'bank_ifsc',
  'bank_account_name',
  'bank_name',
  'upi_id',
]);

const CAPITAL_BALANCE_SQL = `
  (
    COALESCE((
      SELECT SUM(
        CASE
          WHEN ct.type IN ('deposit', 'admin_credit')
            AND ct.status IN ('approved', 'completed')
          THEN ct.amount
          WHEN ct.type = 'admin_debit'
            AND ct.status IN ('approved', 'completed')
          THEN -ct.amount
          ELSE 0
        END
      )::INTEGER
      FROM capital_transactions ct
      WHERE ct.investor_id = u.id
        AND ct.is_deleted = FALSE
    ), 0)
    - COALESCE((
      SELECT SUM(ct.amount)::INTEGER
      FROM capital_transactions ct
      WHERE ct.investor_id = u.id
        AND ct.is_deleted = FALSE
        AND ct.type = 'withdrawal'
        AND ct.status IN ('approved', 'processed', 'completed')
    ), 0)
    - COALESCE((
      SELECT SUM(cwr.amount)::INTEGER
      FROM capital_withdrawal_requests cwr
      WHERE cwr.investor_id = u.id
        AND cwr.account_type = 'capital'
        AND cwr.is_deleted = FALSE
        AND cwr.status IN ('approved', 'processed', 'completed')
    ), 0)
  )
`;

let lockedReasonReady = false;

/**
 * Ensure users.locked_reason exists (added by unlock cron).
 */
async function ensureLockedReasonColumn() {
  if (lockedReasonReady) {
    return;
  }
  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS locked_reason VARCHAR(50)
  `);
  lockedReasonReady = true;
}

/**
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context
 */
function handleError(res, error, context) {
  if (error instanceof AuthError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      error: error.code,
    });
  }

  if (error?.code === 'VALIDATION_ERROR' || error?.status === 400) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Validation failed',
      error: 'VALIDATION_ERROR',
    });
  }

  if (error?.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'Duplicate value conflicts with an existing investor',
      error: 'CONFLICT',
    });
  }

  logger.error(`[UserManagement] ${context}: ${error.message}`, { error });
  return res.status(500).json({
    success: false,
    message: 'User management request failed',
    error: 'INTERNAL_ERROR',
  });
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return n;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toOptionalWholeInt(value) {
  if (value == null || value === '') {
    return null;
  }
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return null;
  }
  return n;
}

/**
 * @param {unknown} id
 * @returns {boolean}
 */
function isUuid(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function parseDateOnly(value) {
  if (value == null || value === '') {
    return null;
  }
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return null;
  }
  const d = new Date(`${s}T00:00:00.000+05:30`);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return s;
}

/**
 * Today's date YYYY-MM-DD in IST.
 * @returns {string}
 */
function todayIST() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * @param {import('express').Request} req
 * @param {string} action
 * @param {string | null} entityId
 * @param {object | null} oldValue
 * @param {object | null} newValue
 * @param {string} [entityType]
 */
async function audit(
  req,
  action,
  entityId,
  oldValue,
  newValue,
  entityType = AUDIT_ENTITY_TYPES.INVESTOR
) {
  await logAction(
    req.user.userId,
    action,
    entityType,
    entityId,
    oldValue,
    newValue,
    req.ipAddress || null
  );
}

/**
 * Strong password check (admin-created accounts).
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
    const err = new Error(
      'Password must be at least 8 characters and include uppercase, lowercase, and a number'
    );
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

/**
 * Generate a temporary password meeting strength rules.
 * @returns {string}
 */
function generateTempPassword() {
  const raw = crypto.randomBytes(9).toString('base64url');
  return `Tk${raw}1a`;
}

/**
 * @param {string} investorId
 * @returns {Promise<object | null>}
 */
async function findInvestorRow(investorId) {
  await ensureLockedReasonColumn();
  const result = await query(
    `SELECT ${INVESTOR_SAFE_COLUMNS},
            u.locked_reason
     FROM users u
     WHERE u.id = $1
     LIMIT 1`,
    [investorId]
  );
  return result.rows[0] || null;
}

/**
 * Whether a KYC identity field is locked after admin approval.
 * @param {string} investorId
 * @param {string} fieldName
 * @returns {Promise<boolean>}
 */
export async function isKycFieldLocked(investorId, fieldName) {
  if (!KYC_LOCK_FIELDS.has(fieldName)) {
    return false;
  }

  const result = await query(
    `SELECT status
     FROM kyc_field_approvals
     WHERE investor_id = $1
       AND field_name = $2
     LIMIT 1`,
    [investorId, fieldName]
  );

  return result.rows[0]?.status === 'approved';
}

/**
 * Block investor-initiated changes to locked PAN/Aadhar.
 * @param {string} investorId
 * @param {string} fieldName
 * @throws {AuthError}
 */
export async function assertInvestorCanEditProfileField(investorId, fieldName) {
  if (await isKycFieldLocked(investorId, fieldName)) {
    throw new AuthError(
      `${fieldName} is locked after KYC verification. Contact admin to change it.`,
      'KYC_FIELD_LOCKED',
      403
    );
  }
}

/**
 * GET /api/v1/admin/investors
 */
export async function listInvestors(req, res) {
  try {
    await ensureLockedReasonColumn();

    const page = toPositiveInt(req.query.page, DEFAULT_PAGE);
    let limit = toPositiveInt(req.query.limit, DEFAULT_LIMIT);
    if (limit > MAX_LIMIT) {
      limit = MAX_LIMIT;
    }
    const offset = (page - 1) * limit;

    const search =
      typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status =
      typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const kycStatus =
      typeof req.query.kyc_status === 'string'
        ? req.query.kyc_status.trim()
        : '';
    const joiningFrom = parseDateOnly(req.query.joining_date_from);
    const joiningTo = parseDateOnly(req.query.joining_date_to);
    const capitalMin = toOptionalWholeInt(req.query.capital_min);
    const capitalMax = toOptionalWholeInt(req.query.capital_max);

    const sortKey =
      typeof req.query.sort_by === 'string' &&
      SORT_COLUMNS[req.query.sort_by]
        ? req.query.sort_by
        : 'joining_date';
    const sortDir =
      String(req.query.sort_order || 'desc').toLowerCase() === 'asc'
        ? 'ASC'
        : 'DESC';
    const orderExpr = SORT_COLUMNS[sortKey];

    const where = [];
    const params = [];
    let i = 1;

    if (status) {
      if (!VALID_STATUSES.has(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status filter',
          error: 'VALIDATION_ERROR',
        });
      }
      where.push(`u.status = $${i}`);
      params.push(status);
      i += 1;
      if (status !== 'deleted') {
        where.push('u.is_deleted = FALSE');
      }
    } else {
      where.push('u.is_deleted = FALSE');
      where.push(`u.status <> 'deleted'`);
    }

    if (kycStatus) {
      if (!VALID_KYC_STATUSES.has(kycStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid kyc_status filter',
          error: 'VALIDATION_ERROR',
        });
      }
      where.push(`u.kyc_status = $${i}`);
      params.push(kycStatus);
      i += 1;
    }

    if (search) {
      where.push(
        `(u.full_name ILIKE $${i} OR u.email ILIKE $${i} OR u.mobile ILIKE $${i})`
      );
      params.push(`%${search}%`);
      i += 1;
    }

    if (joiningFrom) {
      where.push(`u.joining_date >= $${i}::date`);
      params.push(joiningFrom);
      i += 1;
    }
    if (joiningTo) {
      where.push(`u.joining_date <= $${i}::date`);
      params.push(joiningTo);
      i += 1;
    }

    const capitalExpr = CAPITAL_BALANCE_SQL;
    if (capitalMin != null) {
      where.push(`(${capitalExpr}) >= $${i}`);
      params.push(capitalMin);
      i += 1;
    }
    if (capitalMax != null) {
      where.push(`(${capitalExpr}) <= $${i}`);
      params.push(capitalMax);
      i += 1;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM users u
       ${whereSql}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const listParams = [...params, limit, offset];
    const listResult = await query(
      `SELECT
         ${INVESTOR_SAFE_COLUMNS},
         u.locked_reason,
         (${capitalExpr})::INTEGER AS capital_amount
       FROM users u
       ${whereSql}
       ORDER BY ${orderExpr} ${sortDir} NULLS LAST, u.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      listParams
    );

    const investors = listResult.rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      mobile: row.mobile,
      status: row.status,
      kyc_status: row.kyc_status,
      joining_date: row.joining_date,
      joining_date_formatted: row.joining_date
        ? formatDate(row.joining_date)
        : null,
      capital_amount: Math.round(Number(row.capital_amount) || 0),
      locked_reason: row.locked_reason || null,
      failed_login_attempts: row.failed_login_attempts,
      is_deleted: row.is_deleted,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return res.status(200).json({
      success: true,
      message: 'Investors retrieved',
      data: {
        investors,
        meta: {
          total,
          page,
          limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'listInvestors');
  }
}

/**
 * GET /api/v1/admin/investors/:id
 * Concurrent editors attached via trackConcurrentEdit middleware.
 */
export async function getInvestorById(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const investor = await findInvestorRow(id);
    if (!investor) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    const [balances, roi] = await Promise.all([
      getBalanceSummary(id),
      getRoiSettings(id).catch(() => ({
        defaultRoi: null,
        terms: [],
        settings: [],
      })),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Investor retrieved',
      data: {
        investor: {
          ...investor,
          joining_date_formatted: investor.joining_date
            ? formatDate(investor.joining_date)
            : null,
        },
        capital_summary: {
          capital_balance: balances.capitalBalance,
          revenue_balance: balances.revenueBalance,
          total_balance: balances.totalBalance,
          pending_withdrawal: balances.pendingWithdrawal,
          displayed_capital_balance: balances.displayedCapitalBalance,
          effective_roi: balances.effectiveROI,
        },
        roi: {
          default_roi: roi.defaultRoi,
          terms: roi.terms,
        },
        concurrent_editors: req.otherEditors || [],
      },
    });
  } catch (error) {
    return handleError(res, error, 'getInvestorById');
  }
}

/**
 * POST /api/v1/admin/investors
 */
export async function createInvestor(req, res) {
  try {
    const body = req.body || {};
    const fullName = String(body.full_name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const mobileRaw = body.mobile;
    let password = body.password != null ? String(body.password) : '';

    if (!isValidFullName(fullName)) {
      return res.status(400).json({
        success: false,
        message: 'Valid full_name is required (min 3 letters)',
        error: 'VALIDATION_ERROR',
      });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Valid email is required',
        error: 'VALIDATION_ERROR',
      });
    }
    if (!isValidIndianMobile(mobileRaw)) {
      return res.status(400).json({
        success: false,
        message: 'Valid Indian mobile is required',
        error: 'VALIDATION_ERROR',
      });
    }

    if (await isEmailTaken(email)) {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered',
        error: 'USER_EMAIL_EXISTS',
      });
    }

    const generatedPassword = !password;
    if (generatedPassword) {
      password = generateTempPassword();
    } else {
      assertStrongPassword(password);
    }

    if (body.pan_number != null && body.pan_number !== '') {
      if (!isValidPAN(body.pan_number)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid PAN format',
          error: 'VALIDATION_ERROR',
        });
      }
    }
    if (body.aadhar_number != null && body.aadhar_number !== '') {
      if (!isValidAadhar(body.aadhar_number)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Aadhar number',
          error: 'VALIDATION_ERROR',
        });
      }
    }

    const joiningDate = parseDateOnly(body.joining_date) || todayIST();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const mobile = normalizeMobile(mobileRaw);

    const pan =
      body.pan_number != null && String(body.pan_number).trim()
        ? String(body.pan_number).trim().toUpperCase()
        : null;
    const aadhar =
      body.aadhar_number != null && String(body.aadhar_number).trim()
        ? String(body.aadhar_number).replace(/\s/g, '')
        : null;

    const insert = await query(
      `INSERT INTO users (
         full_name,
         email,
         password_hash,
         mobile,
         date_of_birth,
         address,
         pan_number,
         aadhar_number,
         bank_account_number,
         bank_ifsc,
         bank_account_name,
         bank_name,
         upi_id,
         status,
         kyc_status,
         joining_date
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         'active', 'pending', $14::date
       )
       RETURNING ${INVESTOR_RETURN_COLUMNS}`,
      [
        fullName,
        email,
        passwordHash,
        mobile,
        parseDateOnly(body.date_of_birth),
        body.address != null ? String(body.address).trim() : null,
        pan,
        aadhar,
        body.bank_account_number != null
          ? String(body.bank_account_number).trim()
          : null,
        body.bank_ifsc != null
          ? String(body.bank_ifsc).trim().toUpperCase()
          : null,
        body.bank_account_name != null
          ? String(body.bank_account_name).trim()
          : null,
        body.bank_name != null ? String(body.bank_name).trim() : null,
        body.upi_id != null ? String(body.upi_id).trim() : null,
        joiningDate,
      ]
    );

    const investor = insert.rows[0];

    await audit(
      req,
      buildActionDescription('Created', 'investor'),
      investor.id,
      null,
      { email: investor.email, status: investor.status }
    );

    await sendEmail(email, 'custom-notification', {
      investorName: fullName,
      subjectTitle: 'Your Tikhat Partner account is ready',
      body: generatedPassword
        ? `An admin created your Tikhat Partner account.\n\nEmail: ${email}\nTemporary password: ${password}\n\nPlease log in and change your password.`
        : `An admin created your Tikhat Partner account.\n\nEmail: ${email}\n\nYou can log in with the password provided by your administrator.`,
      referenceId: investor.id,
      recipientType: 'investor',
    });

    logger.info('Admin created investor', {
      investorId: investor.id,
      adminId: req.user.userId,
    });

    return res.status(201).json({
      success: true,
      message: 'Investor created',
      data: { investor },
    });
  } catch (error) {
    return handleError(res, error, 'createInvestor');
  }
}

/**
 * PATCH /api/v1/admin/investors/:id
 */
export async function updateInvestor(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await findInvestorRow(id);
    if (!existing || existing.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    const body = req.body || {};
    const sets = [];
    const params = [];
    let i = 1;
    const oldSnapshot = {};
    const newSnapshot = {};

    const assign = (column, value) => {
      oldSnapshot[column] = existing[column];
      newSnapshot[column] = value;
      sets.push(`${column} = $${i}`);
      params.push(value);
      i += 1;
    };

    if (body.full_name != null) {
      const fullName = String(body.full_name).trim();
      if (!isValidFullName(fullName)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid full_name',
          error: 'VALIDATION_ERROR',
        });
      }
      assign('full_name', fullName);
    }

    if (body.mobile != null) {
      if (!isValidIndianMobile(body.mobile)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid mobile',
          error: 'VALIDATION_ERROR',
        });
      }
      assign('mobile', normalizeMobile(body.mobile));
    }

    if (body.email != null) {
      const email = String(body.email).trim().toLowerCase();
      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email',
          error: 'VALIDATION_ERROR',
        });
      }
      if (email !== String(existing.email).toLowerCase()) {
        if (await isEmailTaken(email)) {
          return res.status(409).json({
            success: false,
            message: 'Email is already registered',
            error: 'USER_EMAIL_EXISTS',
          });
        }
        assign('email', email);
      }
    }

    if (body.date_of_birth !== undefined) {
      const dob =
        body.date_of_birth === null || body.date_of_birth === ''
          ? null
          : parseDateOnly(body.date_of_birth);
      if (body.date_of_birth && !dob) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date_of_birth (YYYY-MM-DD)',
          error: 'VALIDATION_ERROR',
        });
      }
      assign('date_of_birth', dob);
    }

    if (body.address !== undefined) {
      assign(
        'address',
        body.address == null ? null : String(body.address).trim()
      );
    }

    if (body.pan_number !== undefined) {
      if (body.pan_number === null || body.pan_number === '') {
        assign('pan_number', null);
      } else {
        if (!isValidPAN(body.pan_number)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid PAN format',
            error: 'VALIDATION_ERROR',
          });
        }
        assign('pan_number', String(body.pan_number).trim().toUpperCase());
      }
    }

    if (body.aadhar_number !== undefined) {
      if (body.aadhar_number === null || body.aadhar_number === '') {
        assign('aadhar_number', null);
      } else {
        if (!isValidAadhar(body.aadhar_number)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid Aadhar number',
            error: 'VALIDATION_ERROR',
          });
        }
        assign(
          'aadhar_number',
          String(body.aadhar_number).replace(/\s/g, '')
        );
      }
    }

    for (const field of [
      'bank_account_number',
      'bank_ifsc',
      'bank_account_name',
      'bank_name',
      'upi_id',
      'profile_photo_url',
      'pan_front_url',
      'pan_back_url',
      'aadhar_front_url',
      'aadhar_back_url',
    ]) {
      if (body[field] !== undefined) {
        let value =
          body[field] == null ? null : String(body[field]).trim();
        if (field === 'bank_ifsc' && value) {
          value = value.toUpperCase();
        }
        assign(field, value === '' ? null : value);
      }
    }

    if (body.kyc_status != null) {
      if (!VALID_KYC_STATUSES.has(body.kyc_status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid kyc_status',
          error: 'VALIDATION_ERROR',
        });
      }
      assign('kyc_status', body.kyc_status);
    }

    if (sets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updatable fields provided',
        error: 'VALIDATION_ERROR',
      });
    }

    sets.push('updated_at = NOW()');
    params.push(id);

    const result = await query(
      `UPDATE users
       SET ${sets.join(', ')}
       WHERE id = $${i}
         AND is_deleted = FALSE
       RETURNING ${INVESTOR_RETURN_COLUMNS}`,
      params
    );

    const investor = result.rows[0];
    if (!investor) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    await audit(
      req,
      buildActionDescription('Updated', 'investor details'),
      id,
      oldSnapshot,
      newSnapshot
    );

    return res.status(200).json({
      success: true,
      message: 'Investor updated',
      data: { investor },
    });
  } catch (error) {
    return handleError(res, error, 'updateInvestor');
  }
}

/**
 * PATCH /api/v1/admin/investors/:id/approve
 */
export async function approveInvestor(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await findInvestorRow(id);
    if (!existing || existing.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending registrations can be approved',
        error: 'VALIDATION_ERROR',
      });
    }

    const joiningDate = existing.joining_date || todayIST();

    const result = await query(
      `UPDATE users
       SET status = 'active',
           joining_date = COALESCE(joining_date, $2::date),
           failed_login_attempts = 0,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${INVESTOR_RETURN_COLUMNS}`,
      [id, joiningDate]
    );

    const investor = result.rows[0];

    await audit(
      req,
      buildActionDescription('Approved', 'investor registration'),
      id,
      { status: 'pending' },
      { status: 'active' }
    );

    await sendEmail(investor.email, 'approval', {
      investorName: investor.full_name,
      actionLabel: 'Registration',
      message:
        'Your Tikhat Partner registration has been approved. You can now log in to your account.',
      referenceId: investor.id,
      recipientType: 'investor',
    });

    await createNotification(
      id,
      'Registration approved',
      'Your Tikhat Partner account is now active. Welcome aboard!',
      'request',
      id,
      'registration'
    );

    return res.status(200).json({
      success: true,
      message: 'Investor approved',
      data: { investor },
    });
  } catch (error) {
    return handleError(res, error, 'approveInvestor');
  }
}

/**
 * PATCH /api/v1/admin/investors/:id/reject
 */
export async function rejectInvestor(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const reason = String(req.body?.reason || req.body?.rejection_reason || '')
      .trim();
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'rejection_reason is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await findInvestorRow(id);
    if (!existing || existing.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending registrations can be rejected',
        error: 'VALIDATION_ERROR',
      });
    }

    const result = await query(
      `UPDATE users
       SET status = 'deleted',
           is_deleted = TRUE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${INVESTOR_RETURN_COLUMNS}`,
      [id]
    );

    const investor = result.rows[0];

    await audit(
      req,
      buildActionDescription('Rejected', 'investor registration'),
      id,
      { status: 'pending' },
      { status: 'deleted', reason }
    );

    await sendEmail(existing.email, 'rejection', {
      investorName: existing.full_name,
      actionLabel: 'Registration',
      reason,
      fieldName: 'registration',
      referenceId: id,
      recipientType: 'investor',
    });

    return res.status(200).json({
      success: true,
      message: 'Investor registration rejected',
      data: { investor, rejection_reason: reason },
    });
  } catch (error) {
    return handleError(res, error, 'rejectInvestor');
  }
}

/**
 * PATCH /api/v1/admin/investors/:id/pause
 */
export async function pauseInvestor(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await findInvestorRow(id);
    if (!existing || existing.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    if (existing.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only active investors can be paused',
        error: 'VALIDATION_ERROR',
      });
    }

    const result = await query(
      `UPDATE users
       SET status = 'paused',
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${INVESTOR_RETURN_COLUMNS}`,
      [id]
    );

    const investor = result.rows[0];

    await audit(
      req,
      buildActionDescription('Paused', 'investor'),
      id,
      { status: 'active' },
      { status: 'paused' }
    );

    await sendEmail(investor.email, 'custom-notification', {
      investorName: investor.full_name,
      subjectTitle: 'Account paused',
      body: 'Your Tikhat Partner account has been paused by admin. Daily revenue credit is stopped until your account is resumed. You may still log in and submit withdrawals.',
      referenceId: id,
      recipientType: 'investor',
    });

    await createNotification(
      id,
      'Account paused',
      'Your account has been paused. Revenue credit is stopped until resumed.',
      'system',
      id,
      'account'
    );

    return res.status(200).json({
      success: true,
      message: 'Investor paused',
      data: { investor },
    });
  } catch (error) {
    return handleError(res, error, 'pauseInvestor');
  }
}

/**
 * PATCH /api/v1/admin/investors/:id/resume
 */
export async function resumeInvestor(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await findInvestorRow(id);
    if (!existing || existing.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    if (existing.status !== 'paused') {
      return res.status(400).json({
        success: false,
        message: 'Only paused investors can be resumed',
        error: 'VALIDATION_ERROR',
      });
    }

    const result = await query(
      `UPDATE users
       SET status = 'active',
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${INVESTOR_RETURN_COLUMNS}`,
      [id]
    );

    const investor = result.rows[0];

    await audit(
      req,
      buildActionDescription('Resumed', 'investor'),
      id,
      { status: 'paused' },
      { status: 'active' }
    );

    await sendEmail(investor.email, 'approval', {
      investorName: investor.full_name,
      actionLabel: 'Account resume',
      message:
        'Your Tikhat Partner account has been resumed. Daily revenue credit will continue as per your settings.',
      referenceId: id,
      recipientType: 'investor',
    });

    await createNotification(
      id,
      'Account resumed',
      'Your account is active again. Revenue credit has resumed.',
      'system',
      id,
      'account'
    );

    return res.status(200).json({
      success: true,
      message: 'Investor resumed',
      data: { investor },
    });
  } catch (error) {
    return handleError(res, error, 'resumeInvestor');
  }
}

/**
 * PATCH /api/v1/admin/investors/:id/unlock
 */
export async function unlockInvestor(req, res) {
  try {
    await ensureLockedReasonColumn();
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await findInvestorRow(id);
    if (!existing || existing.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    if (existing.status !== 'locked') {
      return res.status(400).json({
        success: false,
        message: 'Only locked investors can be unlocked',
        error: 'VALIDATION_ERROR',
      });
    }

    const result = await query(
      `UPDATE users
       SET status = 'active',
           failed_login_attempts = 0,
           locked_reason = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${INVESTOR_RETURN_COLUMNS}, locked_reason`,
      [id]
    );

    const investor = result.rows[0];

    await audit(
      req,
      buildActionDescription('Unlocked', 'investor'),
      id,
      { status: 'locked', locked_reason: existing.locked_reason },
      { status: 'active' }
    );

    await sendEmail(investor.email, 'approval', {
      investorName: investor.full_name,
      actionLabel: 'Account unlock',
      message:
        'Your Tikhat Partner account has been unlocked by admin. You can log in again.',
      referenceId: id,
      recipientType: 'investor',
    });

    return res.status(200).json({
      success: true,
      message: 'Investor unlocked',
      data: { investor },
    });
  } catch (error) {
    return handleError(res, error, 'unlockInvestor');
  }
}

/**
 * DELETE /api/v1/admin/investors/:id
 */
export async function softDeleteInvestor(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await findInvestorRow(id);
    if (!existing || existing.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    const result = await query(
      `UPDATE users
       SET status = 'deleted',
           is_deleted = TRUE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${INVESTOR_RETURN_COLUMNS}`,
      [id]
    );

    const investor = result.rows[0];

    await audit(
      req,
      buildActionDescription('Deleted', 'investor'),
      id,
      { status: existing.status, is_deleted: false },
      { status: 'deleted', is_deleted: true, email_retained: existing.email }
    );

    await sendEmail(existing.email, 'custom-notification', {
      investorName: existing.full_name,
      subjectTitle: 'Account deleted',
      body: 'Your Tikhat Partner account has been deleted by admin. This email cannot be used to register again.',
      referenceId: id,
      recipientType: 'investor',
    });

    return res.status(200).json({
      success: true,
      message: 'Investor soft deleted',
      data: { investor },
    });
  } catch (error) {
    return handleError(res, error, 'softDeleteInvestor');
  }
}

/**
 * DELETE /api/v1/admin/investors/:id/flush-transactions
 * Super Admin only — hard-delete all transactional data for one investor.
 */
export async function flushInvestorTransactions(req, res) {
  const client = await getClient();
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await findInvestorRow(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    const counts = {};

    await client.query('BEGIN');

    const del = async (label, sql, params = [id]) => {
      const result = await client.query(sql, params);
      counts[label] = result.rowCount || 0;
    };

    await del(
      'ticket_attachments',
      `DELETE FROM ticket_attachments
       WHERE ticket_id IN (
         SELECT id FROM support_tickets WHERE investor_id = $1
       )`
    );
    await del(
      'ticket_messages',
      `DELETE FROM ticket_messages
       WHERE ticket_id IN (
         SELECT id FROM support_tickets WHERE investor_id = $1
       )`
    );
    await del(
      'support_tickets',
      `DELETE FROM support_tickets WHERE investor_id = $1`
    );
    await del(
      'notifications',
      `DELETE FROM notifications WHERE investor_id = $1`
    );
    await del(
      'profile_update_requests',
      `DELETE FROM profile_update_requests WHERE investor_id = $1`
    );
    await del(
      'bank_details_history',
      `DELETE FROM bank_details_history WHERE investor_id = $1`
    );
    await del(
      'kyc_field_approvals',
      `DELETE FROM kyc_field_approvals WHERE investor_id = $1`
    );
    await del(
      'backdate_requests',
      `DELETE FROM backdate_requests WHERE investor_id = $1`
    );
    await del(
      'capital_transactions',
      `DELETE FROM capital_transactions WHERE investor_id = $1`
    );
    await del(
      'capital_withdrawal_requests',
      `DELETE FROM capital_withdrawal_requests WHERE investor_id = $1`
    );
    await del(
      'revenue_credits',
      `DELETE FROM revenue_credits WHERE investor_id = $1`
    );
    await del(
      'monthly_revenue_tracking',
      `DELETE FROM monthly_revenue_tracking WHERE investor_id = $1`
    );
    await del(
      'roi_terms',
      `DELETE FROM roi_settings WHERE investor_id = $1 AND type = 'term'`
    );

    // Reset capital lock (keep row if present)
    const lockUpdate = await client.query(
      `UPDATE capital_lock_status
       SET is_locked = FALSE,
           locked_by = NULL,
           locked_at = NULL,
           unlock_reason = NULL,
           updated_at = NOW()
       WHERE investor_id = $1`,
      [id]
    );
    counts.capital_lock_status = lockUpdate.rowCount || 0;
    if ((lockUpdate.rowCount || 0) === 0) {
      await client.query(
        `INSERT INTO capital_lock_status (investor_id, is_locked)
         VALUES ($1, FALSE)
         ON CONFLICT (investor_id) DO NOTHING`,
        [id]
      );
    }

    // Reset revenue credit settings to defaults
    const rcsUpdate = await client.query(
      `UPDATE revenue_credit_settings
       SET credit_frequency = 'daily',
           credit_time_hour = 18,
           credit_time_minute = 0,
           withdrawal_frequency = 1,
           is_paused = FALSE,
           paused_by = NULL,
           paused_at = NULL,
           updated_at = NOW()
       WHERE investor_id = $1`,
      [id]
    );
    counts.revenue_credit_settings = rcsUpdate.rowCount || 0;
    if ((rcsUpdate.rowCount || 0) === 0) {
      await client.query(
        `INSERT INTO revenue_credit_settings (investor_id)
         VALUES ($1)
         ON CONFLICT (investor_id) DO NOTHING`,
        [id]
      );
    }

    // Reset KYC status on investor profile
    await client.query(
      `UPDATE users
       SET kyc_status = 'pending',
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    counts.kyc_status_reset = 1;

    // Optional files owned by this investor
    try {
      await ensureFilesTable();
      await del(
        'files',
        `DELETE FROM files WHERE owner_type = 'investor' AND owner_id = $1`
      );
    } catch {
      counts.files = 0;
    }

    await client.query('COMMIT');

    await audit(
      req,
      'Flushed all investor transactions',
      id,
      {
        email: existing.email,
        kyc_status: existing.kyc_status,
      },
      {
        flushed: true,
        counts,
        kyc_status: 'pending',
      }
    );

    logger.info('Investor transactions flushed', {
      investorId: id,
      adminId: req.user?.userId,
      counts,
    });

    return res.status(200).json({
      success: true,
      message: 'All investor transactions flushed successfully',
      data: {
        investor_id: id,
        counts,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    return handleError(res, error, 'flushInvestorTransactions');
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/admin/investors/:id/joining-date
 */
export async function updateJoiningDate(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const joiningDate = parseDateOnly(
      req.body?.joining_date ?? req.body?.joiningDate
    );
    if (!joiningDate) {
      return res.status(400).json({
        success: false,
        message: 'joining_date is required (YYYY-MM-DD)',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await findInvestorRow(id);
    if (!existing || existing.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    const result = await query(
      `UPDATE users
       SET joining_date = $2::date,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${INVESTOR_RETURN_COLUMNS}`,
      [id, joiningDate]
    );

    const investor = result.rows[0];

    await audit(
      req,
      buildActionDescription('Updated', 'joining date'),
      id,
      { joining_date: existing.joining_date },
      { joining_date: joiningDate }
    );

    return res.status(200).json({
      success: true,
      message: 'Joining date updated',
      data: {
        investor: {
          ...investor,
          joining_date_formatted: formatDate(joiningDate),
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'updateJoiningDate');
  }
}

/**
 * DELETE /api/v1/admin/investors/:id/edit — release concurrent edit session
 */
export async function releaseInvestorEdit(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Concurrent edit session released',
    data: { investor_id: req.params.id },
  });
}

/* -------------------------------------------------------------------------- */
/* Task 11.2 — Profile update approvals                                       */
/* -------------------------------------------------------------------------- */

/**
 * Upsert KYC field approval row.
 * @param {string} investorId
 * @param {string} fieldName
 * @param {'approved' | 'rejected' | 'pending'} status
 * @param {string} adminId
 * @param {string | null} rejectionReason
 */
async function upsertKycFieldApproval(
  investorId,
  fieldName,
  status,
  adminId,
  rejectionReason = null
) {
  await query(
    `INSERT INTO kyc_field_approvals (
       investor_id,
       field_name,
       status,
       admin_id,
       rejection_reason,
       reviewed_at
     ) VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (investor_id, field_name)
     DO UPDATE SET
       status = EXCLUDED.status,
       admin_id = EXCLUDED.admin_id,
       rejection_reason = EXCLUDED.rejection_reason,
       reviewed_at = NOW(),
       updated_at = NOW()`,
    [investorId, fieldName, status, adminId, rejectionReason]
  );
}

/**
 * Archive current bank details before applying approved bank field change.
 * @param {object} investor
 * @param {string} adminId
 */
async function archiveBankDetails(investor, adminId) {
  await query(
    `INSERT INTO bank_details_history (
       investor_id,
       bank_account_number,
       bank_ifsc,
       bank_account_name,
       bank_name,
       upi_id,
       changed_by,
       admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, 'admin', $7)`,
    [
      investor.id,
      investor.bank_account_number,
      investor.bank_ifsc,
      investor.bank_account_name,
      investor.bank_name,
      investor.upi_id,
      adminId,
    ]
  );
}

/**
 * Apply approved profile field value onto users row.
 * @param {object} investor
 * @param {string} fieldName
 * @param {string} newValue
 * @param {string} adminId
 */
async function applyApprovedField(investor, fieldName, newValue, adminId) {
  if (!PROFILE_USER_FIELDS.has(fieldName)) {
    const err = new Error(`Unsupported profile field: ${fieldName}`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (fieldName === 'email') {
    return;
  }

  if (BANK_FIELDS.has(fieldName)) {
    await archiveBankDetails(investor, adminId);
  }

  let value = newValue;
  if (fieldName === 'mobile') {
    value = normalizeMobile(newValue);
  } else if (fieldName === 'pan_number') {
    value = String(newValue).trim().toUpperCase();
  } else if (fieldName === 'aadhar_number') {
    value = String(newValue).replace(/\s/g, '');
  } else if (fieldName === 'bank_ifsc') {
    value = String(newValue).trim().toUpperCase();
  } else if (fieldName === 'date_of_birth') {
    value = parseDateOnly(newValue);
    if (!value) {
      const err = new Error('Invalid date_of_birth value');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  } else {
    value = String(newValue).trim();
  }

  await query(
    `UPDATE users
     SET ${fieldName} = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [value, investor.id]
  );
}

/**
 * GET /api/v1/admin/profile-requests
 */
export async function listPendingProfileRequests(req, res) {
  try {
    const result = await query(
      `SELECT
         pr.id,
         pr.investor_id,
         pr.field_name,
         pr.old_value,
         pr.new_value,
         pr.status,
         pr.created_at,
         pr.updated_at,
         u.full_name,
         u.email,
         u.mobile
       FROM profile_update_requests pr
       INNER JOIN users u ON u.id = pr.investor_id
       WHERE pr.status = 'pending'
         AND u.is_deleted = FALSE
       ORDER BY pr.created_at ASC`
    );

    /** @type {Map<string, object>} */
    const byInvestor = new Map();

    for (const row of result.rows) {
      if (!byInvestor.has(row.investor_id)) {
        byInvestor.set(row.investor_id, {
          investor_id: row.investor_id,
          full_name: row.full_name,
          email: row.email,
          mobile: row.mobile,
          request_count: 0,
          requests: [],
        });
      }
      const group = byInvestor.get(row.investor_id);
      group.request_count += 1;
      group.requests.push({
        id: row.id,
        field_name: row.field_name,
        old_value: row.old_value,
        new_value: row.new_value,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    const badgeCount = result.rows.length;

    return res.status(200).json({
      success: true,
      message: 'Pending profile requests retrieved',
      data: {
        badge_count: badgeCount,
        investors: [...byInvestor.values()],
      },
    });
  } catch (error) {
    return handleError(res, error, 'listPendingProfileRequests');
  }
}

/**
 * GET /api/v1/admin/profile-requests/investor/:id
 */
export async function listInvestorProfileRequests(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const investor = await findInvestorRow(id);
    if (!investor || investor.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    const result = await query(
      `SELECT
         id,
         investor_id,
         field_name,
         old_value,
         new_value,
         status,
         rejection_reason,
         admin_id,
         created_at,
         updated_at
       FROM profile_update_requests
       WHERE investor_id = $1
         AND status = 'pending'
       ORDER BY created_at ASC`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Investor profile requests retrieved',
      data: {
        investor_id: id,
        full_name: investor.full_name,
        email: investor.email,
        request_count: result.rows.length,
        requests: result.rows,
      },
    });
  } catch (error) {
    return handleError(res, error, 'listInvestorProfileRequests');
  }
}

/**
 * PATCH /api/v1/admin/profile-requests/:id/approve
 */
export async function approveProfileRequest(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.userId;

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
      [id]
    );

    const request = existing.rows[0];
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Profile update request not found',
        error: 'NOT_FOUND',
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Request is not pending',
        error: 'VALIDATION_ERROR',
      });
    }

    const investor = await findInvestorRow(request.investor_id);
    if (!investor || investor.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    if (request.field_name === 'email') {
      await resolveEmailChangeRequest(id, 'approved', { adminId });
    } else {
      if (KYC_LOCK_FIELDS.has(request.field_name)) {
        // Admin approval of a new value is allowed even if previously locked
        // (investor-initiated edits remain blocked via assertInvestorCanEditProfileField).
      }

      await applyApprovedField(
        investor,
        request.field_name,
        request.new_value,
        adminId
      );

      await query(
        `UPDATE profile_update_requests
         SET status = 'approved',
             admin_id = $2,
             rejection_reason = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [id, adminId]
      );

      if (KYC_TRACKED_FIELDS.has(request.field_name)) {
        await upsertKycFieldApproval(
          request.investor_id,
          request.field_name,
          'approved',
          adminId,
          null
        );
      }

      await sendEmail(investor.email, 'approval', {
        investorName: investor.full_name,
        actionLabel: `Profile update (${request.field_name})`,
        message: `Your ${request.field_name} update has been approved and applied.`,
        referenceId: id,
        recipientType: 'investor',
      });

      await createNotification(
        request.investor_id,
        'Profile update approved',
        `Your ${request.field_name} change was approved.`,
        'request',
        id,
        'profile_update'
      );
    }

    await audit(
      req,
      buildActionDescription('Approved', `profile field ${request.field_name}`),
      request.investor_id,
      { field: request.field_name, old_value: request.old_value },
      { field: request.field_name, new_value: request.new_value },
      AUDIT_ENTITY_TYPES.PROFILE
    );

    const updated = await query(
      `SELECT id, investor_id, field_name, old_value, new_value, status, updated_at
       FROM profile_update_requests
       WHERE id = $1`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Profile field update approved',
      data: { request: updated.rows[0] },
    });
  } catch (error) {
    return handleError(res, error, 'approveProfileRequest');
  }
}

/**
 * PATCH /api/v1/admin/profile-requests/:id/reject
 */
export async function rejectProfileRequest(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.userId;
    const reason = String(
      req.body?.reason || req.body?.rejection_reason || ''
    ).trim();

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'rejection_reason is required',
        error: 'VALIDATION_ERROR',
      });
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
      [id]
    );

    const request = existing.rows[0];
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Profile update request not found',
        error: 'NOT_FOUND',
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Request is not pending',
        error: 'VALIDATION_ERROR',
      });
    }

    const investor = await findInvestorRow(request.investor_id);
    if (!investor || investor.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    if (request.field_name === 'email') {
      await resolveEmailChangeRequest(id, 'rejected', {
        adminId,
        rejectionReason: reason,
      });
    } else {
      await query(
        `UPDATE profile_update_requests
         SET status = 'rejected',
             admin_id = $2,
             rejection_reason = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [id, adminId, reason]
      );

      if (KYC_TRACKED_FIELDS.has(request.field_name)) {
        await upsertKycFieldApproval(
          request.investor_id,
          request.field_name,
          'rejected',
          adminId,
          reason
        );
      }

      await sendEmail(investor.email, 'rejection', {
        investorName: investor.full_name,
        actionLabel: `Profile update (${request.field_name})`,
        reason,
        fieldName: request.field_name,
        referenceId: id,
        recipientType: 'investor',
      });

      await createNotification(
        request.investor_id,
        'Profile update rejected',
        `Your ${request.field_name} change was rejected. Reason: ${reason}`,
        'request',
        id,
        'profile_update'
      );
    }

    await audit(
      req,
      buildActionDescription('Rejected', `profile field ${request.field_name}`),
      request.investor_id,
      { field: request.field_name, new_value: request.new_value },
      { status: 'rejected', reason },
      AUDIT_ENTITY_TYPES.PROFILE
    );

    const updated = await query(
      `SELECT
         id,
         investor_id,
         field_name,
         old_value,
         new_value,
         status,
         rejection_reason,
         updated_at
       FROM profile_update_requests
       WHERE id = $1`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Profile field update rejected',
      data: { request: updated.rows[0] },
    });
  } catch (error) {
    return handleError(res, error, 'rejectProfileRequest');
  }
}

/* -------------------------------------------------------------------------- */
/* Task 11.3 — KYC management                                                 */
/* -------------------------------------------------------------------------- */

const KYC_DOCUMENT_FIELDS = Object.freeze([
  {
    key: 'pan_front',
    userColumn: 'pan_front_url',
    category: FILE_CATEGORIES.KYC_PAN_FRONT,
  },
  {
    key: 'pan_back',
    userColumn: 'pan_back_url',
    category: FILE_CATEGORIES.KYC_PAN_BACK,
  },
  {
    key: 'aadhar_front',
    userColumn: 'aadhar_front_url',
    category: FILE_CATEGORIES.KYC_AADHAR_FRONT,
  },
  {
    key: 'aadhar_back',
    userColumn: 'aadhar_back_url',
    category: FILE_CATEGORIES.KYC_AADHAR_BACK,
  },
]);

/**
 * @param {string} relativeUrl
 * @returns {string}
 */
function resolveUploadAbsolutePath(relativeUrl) {
  const relative = String(relativeUrl || '')
    .replace(/^\/+/, '')
    .replace(/^uploads\//, '');
  return path.join(UPLOAD_ROOT, relative);
}

/**
 * Build download URL for admin KYC file access.
 * @param {string} fileId
 * @returns {string}
 */
function adminFileDownloadUrl(fileId) {
  return `/api/v1/admin/files/${fileId}/download`;
}

/**
 * Resolve KYC document metadata for an investor.
 * @param {object} investor
 * @returns {Promise<object>}
 */
async function resolveKycDocuments(investor) {
  await ensureFilesTable();

  const filesResult = await query(
    `SELECT
       id,
       category,
       original_name,
       stored_name,
       file_url,
       mime_type,
       size,
       created_at
     FROM files
     WHERE owner_id = $1
       AND owner_type = 'investor'
       AND category = ANY($2::TEXT[])
     ORDER BY created_at DESC`,
    [
      investor.id,
      KYC_DOCUMENT_FIELDS.map((d) => d.category),
    ]
  );

  /** @type {Map<string, object>} */
  const byCategory = new Map();
  /** @type {Map<string, object>} */
  const byId = new Map();
  /** @type {Map<string, object>} */
  const byUrl = new Map();

  for (const row of filesResult.rows) {
    byId.set(row.id, row);
    byUrl.set(row.file_url, row);
    if (!byCategory.has(row.category)) {
      byCategory.set(row.category, row);
    }
  }

  /** @type {Record<string, object | null>} */
  const documents = {};

  for (const doc of KYC_DOCUMENT_FIELDS) {
    const stored = investor[doc.userColumn];
    let file = null;

    if (stored && UUID_RE.test(String(stored))) {
      file = byId.get(stored) || (await getFileById(stored));
    } else if (stored) {
      const normalized = String(stored)
        .replace(/^\/+/, '')
        .replace(/^uploads\//, '');
      file = byUrl.get(normalized) || byUrl.get(String(stored));
    }

    if (!file) {
      file = byCategory.get(doc.category) || null;
    }

    documents[doc.key] = file
      ? {
          file_id: file.id,
          category: file.category,
          original_name: file.original_name,
          mime_type: file.mime_type,
          size: file.size,
          download_url: adminFileDownloadUrl(file.id),
          created_at: file.created_at,
        }
      : stored
        ? {
            file_id: UUID_RE.test(String(stored)) ? String(stored) : null,
            category: doc.category,
            download_url: UUID_RE.test(String(stored))
              ? adminFileDownloadUrl(String(stored))
              : null,
          }
        : null;
  }

  return documents;
}

/**
 * GET /api/v1/admin/investors/:id/kyc
 */
export async function getInvestorKyc(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const investor = await findInvestorRow(id);
    if (!investor || investor.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    const [documents, approvals] = await Promise.all([
      resolveKycDocuments(investor),
      query(
        `SELECT
           id,
           field_name,
           status,
           admin_id,
           rejection_reason,
           reviewed_at,
           created_at,
           updated_at
         FROM kyc_field_approvals
         WHERE investor_id = $1
         ORDER BY field_name ASC`,
        [id]
      ),
    ]);

    const panLocked = await isKycFieldLocked(id, 'pan_number');
    const aadharLocked = await isKycFieldLocked(id, 'aadhar_number');

    return res.status(200).json({
      success: true,
      message: 'KYC details retrieved',
      data: {
        investor_id: id,
        full_name: investor.full_name,
        email: investor.email,
        kyc_status: investor.kyc_status,
        pan_number: investor.pan_number,
        aadhar_number: investor.aadhar_number,
        pan_locked: panLocked,
        aadhar_locked: aadharLocked,
        documents,
        field_approvals: approvals.rows,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getInvestorKyc');
  }
}

/**
 * GET /api/v1/admin/files/:fileId/download
 */
export async function downloadAdminFile(req, res) {
  try {
    const { fileId } = req.params;
    if (!isUuid(fileId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file id',
        error: 'VALIDATION_ERROR',
      });
    }

    const file = await getFileById(fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found',
        error: 'NOT_FOUND',
      });
    }

    const absolutePath = resolveUploadAbsolutePath(file.file_url);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        message: 'File missing on disk',
        error: 'NOT_FOUND',
      });
    }

    const safeName = String(file.original_name || file.stored_name || 'download')
      .replace(/[\r\n"]/g, '_');

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}"`
    );
    if (file.size) {
      res.setHeader('Content-Length', String(file.size));
    }

    const stream = createReadStream(absolutePath);
    stream.on('error', (error) => {
      logger.error(`[UserManagement] download stream failed: ${error.message}`, {
        error,
        fileId,
      });
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Failed to download file',
          error: 'INTERNAL_ERROR',
        });
      } else {
        res.end();
      }
    });

    return stream.pipe(res);
  } catch (error) {
    return handleError(res, error, 'downloadAdminFile');
  }
}

/**
 * PATCH /api/v1/admin/investors/:id/kyc/status
 */
export async function updateInvestorKycStatus(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const kycStatus = String(req.body?.kyc_status || '').trim();
    const reason = String(req.body?.reason || req.body?.rejection_reason || '')
      .trim();

    if (!VALID_KYC_STATUSES.has(kycStatus)) {
      return res.status(400).json({
        success: false,
        message: 'kyc_status must be pending, verified, or rejected',
        error: 'VALIDATION_ERROR',
      });
    }

    if (kycStatus === 'rejected' && !reason) {
      return res.status(400).json({
        success: false,
        message: 'rejection_reason is required when rejecting KYC',
        error: 'VALIDATION_ERROR',
      });
    }

    const investor = await findInvestorRow(id);
    if (!investor || investor.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    const result = await query(
      `UPDATE users
       SET kyc_status = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${INVESTOR_RETURN_COLUMNS}`,
      [id, kycStatus]
    );

    const updated = result.rows[0];
    const adminId = req.user.userId;

    if (kycStatus === 'verified') {
      await upsertKycFieldApproval(id, 'pan_number', 'approved', adminId, null);
      await upsertKycFieldApproval(id, 'aadhar_number', 'approved', adminId, null);
      if (investor.pan_number) {
        await upsertKycFieldApproval(
          id,
          'pan_front_url',
          'approved',
          adminId,
          null
        );
        await upsertKycFieldApproval(
          id,
          'pan_back_url',
          'approved',
          adminId,
          null
        );
      }
      if (investor.aadhar_number) {
        await upsertKycFieldApproval(
          id,
          'aadhar_front_url',
          'approved',
          adminId,
          null
        );
        await upsertKycFieldApproval(
          id,
          'aadhar_back_url',
          'approved',
          adminId,
          null
        );
      }

      await sendEmail(investor.email, 'approval', {
        investorName: investor.full_name,
        actionLabel: 'KYC verification',
        message:
          'Your KYC has been verified. PAN and Aadhar details are now locked.',
        referenceId: id,
        recipientType: 'investor',
      });

      await createNotification(
        id,
        'KYC verified',
        'Your KYC verification is complete. PAN and Aadhar are locked.',
        'request',
        id,
        'kyc'
      );
    } else if (kycStatus === 'rejected') {
      await sendEmail(investor.email, 'rejection', {
        investorName: investor.full_name,
        actionLabel: 'KYC verification',
        reason,
        fieldName: 'kyc',
        referenceId: id,
        recipientType: 'investor',
      });

      await createNotification(
        id,
        'KYC rejected',
        `Your KYC was rejected. Reason: ${reason}`,
        'request',
        id,
        'kyc'
      );
    }

    await audit(
      req,
      buildActionDescription(
        kycStatus === 'verified'
          ? 'Verified'
          : kycStatus === 'rejected'
            ? 'Rejected'
            : 'Updated',
        'KYC status'
      ),
      id,
      { kyc_status: investor.kyc_status },
      {
        kyc_status: kycStatus,
        reason: kycStatus === 'rejected' ? reason : null,
        pan_locked: kycStatus === 'verified',
        aadhar_locked: kycStatus === 'verified',
      },
      AUDIT_ENTITY_TYPES.KYC
    );

    return res.status(200).json({
      success: true,
      message: 'KYC status updated',
      data: {
        investor_id: id,
        kyc_status: updated.kyc_status,
        pan_locked: kycStatus === 'verified' || (await isKycFieldLocked(id, 'pan_number')),
        aadhar_locked:
          kycStatus === 'verified' ||
          (await isKycFieldLocked(id, 'aadhar_number')),
      },
    });
  } catch (error) {
    return handleError(res, error, 'updateInvestorKycStatus');
  }
}

/**
 * POST /api/v1/admin/investors/:id/kyc/override
 * Admin overrides locked PAN/Aadhar (investor cannot).
 */
export async function overrideKycField(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const fieldName = String(req.body?.field_name || '').trim();
    const newValueRaw = req.body?.new_value;
    const reason = String(req.body?.reason || '').trim();

    if (!KYC_LOCK_FIELDS.has(fieldName)) {
      return res.status(400).json({
        success: false,
        message: 'field_name must be pan_number or aadhar_number',
        error: 'VALIDATION_ERROR',
      });
    }

    if (newValueRaw == null || String(newValueRaw).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'new_value is required',
        error: 'VALIDATION_ERROR',
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'reason is required for KYC override',
        error: 'VALIDATION_ERROR',
      });
    }

    let newValue;
    if (fieldName === 'pan_number') {
      if (!isValidPAN(String(newValueRaw))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid PAN format',
          error: 'VALIDATION_ERROR',
        });
      }
      newValue = String(newValueRaw).trim().toUpperCase();
    } else {
      if (!isValidAadhar(String(newValueRaw))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Aadhar number',
          error: 'VALIDATION_ERROR',
        });
      }
      newValue = String(newValueRaw).replace(/\s/g, '');
    }

    const investor = await findInvestorRow(id);
    if (!investor || investor.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    const oldValue = investor[fieldName] || null;

    const duplicate = await query(
      `SELECT id
       FROM users
       WHERE ${fieldName} = $1
         AND id <> $2
       LIMIT 1`,
      [newValue, id]
    );
    if (duplicate.rowCount > 0) {
      return res.status(409).json({
        success: false,
        message: `${fieldName} is already used by another investor`,
        error: 'CONFLICT',
      });
    }

    await query(
      `UPDATE users
       SET ${fieldName} = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [newValue, id]
    );

    await upsertKycFieldApproval(
      id,
      fieldName,
      'approved',
      req.user.userId,
      null
    );

    await audit(
      req,
      buildActionDescription('Overrode', `KYC field ${fieldName}`),
      id,
      {
        field_name: fieldName,
        old_value: oldValue,
        admin_id: req.user.userId,
      },
      {
        field_name: fieldName,
        new_value: newValue,
        admin_id: req.user.userId,
        admin_name: req.user.name || null,
        reason,
      },
      AUDIT_ENTITY_TYPES.KYC
    );

    await sendEmail(investor.email, 'custom-notification', {
      investorName: investor.full_name,
      subjectTitle: 'KYC details updated by admin',
      body: `An administrator updated your ${fieldName}.\n\nReason: ${reason}`,
      referenceId: id,
      recipientType: 'investor',
    });

    await createNotification(
      id,
      'KYC field updated by admin',
      `Your ${fieldName} was updated by admin. Reason: ${reason}`,
      'system',
      id,
      'kyc'
    );

    return res.status(200).json({
      success: true,
      message: 'KYC field overridden',
      data: {
        investor_id: id,
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
        reason,
        admin_id: req.user.userId,
      },
    });
  } catch (error) {
    return handleError(res, error, 'overrideKycField');
  }
}
