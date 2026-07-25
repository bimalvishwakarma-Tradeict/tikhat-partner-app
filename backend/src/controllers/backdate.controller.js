import { query, pool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { formatDate } from '../utils/formatDate.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import bcrypt from 'bcryptjs';
import {
  logAction,
  buildActionDescription,
  AUDIT_ENTITY_TYPES,
} from '../services/audit.service.js';
import {
  generateTransactionId,
  TRANSACTION_TYPES,
} from '../services/transaction.service.js';
import { sendEmail } from '../services/email.service.js';
import { getRevenueBalance } from '../services/balance.service.js';
import {
  findUserById,
  isEmailTaken,
  normalizeMobile,
} from '../models/user.model.js';
import {
  isValidEmail,
  isValidFullName,
  isValidIndianMobile,
  isValidPAN,
  isValidAadhar,
} from '../utils/validators.js';
import {
  getISTDateParts,
  getDaysInMonth,
  getActiveROI,
  getCapitalBalanceAsOf,
  calculateDailyAverage,
  getDailyRange,
  calculateDailyAmounts,
  isLastDayOfMonth,
  getMonthlyExpected,
  getCreditedTotalInMonth,
  updateMonthlyTracking,
} from '../services/roi.service.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BCRYPT_ROUNDS = 12;
const MIN_CAPITAL = 10000;
const MAX_CAPITAL = 1000000;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * ROI % as decimal (2 places). Never integer-round.
 * @param {unknown} value
 * @returns {number}
 */
function parseRoiPercent(value) {
  const n = Number.parseFloat(String(value));
  if (!Number.isFinite(n)) {
    return NaN;
  }
  return Number.parseFloat(n.toFixed(2));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidRoiPercent(value) {
  const n = parseRoiPercent(value);
  return Number.isFinite(n) && n > 0;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function parseDateOnly(value, field) {
  const raw = String(value || '').trim();
  if (!DATE_RE.test(raw)) {
    const error = new Error(`${field} must be YYYY-MM-DD`);
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }
  const parts = getISTDateParts(`${raw}T00:00:00+05:30`);
  if (parts.dateStr !== raw) {
    const error = new Error(`${field} is not a valid calendar date`);
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }
  return raw;
}

/**
 * @param {string} start
 * @param {string} end
 * @returns {string[]}
 */
function enumerateDatesInclusive(start, end) {
  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    const { year, month, day } = getISTDateParts(`${cursor}T00:00:00+05:30`);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    const y = next.getUTCFullYear();
    const m = String(next.getUTCMonth() + 1).padStart(2, '0');
    const d = String(next.getUTCDate()).padStart(2, '0');
    cursor = `${y}-${m}-${d}`;
  }
  return dates;
}

/**
 * Random integer inclusive.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomIntInclusive(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

/**
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context
 */
function handleError(res, error, context) {
  if (error.code === 'VALIDATION_ERROR') {
    return res.status(error.status || 400).json({
      success: false,
      message: error.message,
      error: 'VALIDATION_ERROR',
    });
  }
  if (error.code === 'NOT_FOUND') {
    return res.status(404).json({
      success: false,
      message: error.message,
      error: 'NOT_FOUND',
    });
  }
  if (error.code === 'CONFLICT') {
    return res.status(409).json({
      success: false,
      message: error.message,
      error: 'CONFLICT',
    });
  }

  logger.error(`[Backdate] ${context}: ${error.message}`, { error });
  return res.status(500).json({
    success: false,
    message: 'Backdate request failed',
    error: 'INTERNAL_ERROR',
  });
}

/**
 * @param {import('express').Request} req
 * @param {string} action
 * @param {string | null} entityId
 * @param {object | null} oldValue
 * @param {object | null} newValue
 */
async function audit(req, action, entityId, oldValue, newValue) {
  await logAction(
    req.user.userId,
    action,
    AUDIT_ENTITY_TYPES.BACKDATE,
    entityId,
    oldValue,
    newValue,
    req.ipAddress || null
  );
}

/**
 * Ensure admin_notifications table exists.
 */
async function ensureAdminNotificationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id UUID,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      reference_id VARCHAR(100),
      reference_type VARCHAR(50),
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * @param {string | null} adminId
 * @param {string} title
 * @param {string} body
 * @param {string} referenceId
 */
async function createAdminNotification(adminId, title, body, referenceId) {
  await ensureAdminNotificationsTable();
  await query(
    `INSERT INTO admin_notifications (
       admin_id, title, body, type, reference_id, reference_type
     ) VALUES ($1, $2, $3, 'backdate', $4, 'backdate_request')`,
    [adminId, title, body, referenceId]
  );
}

/**
 * @returns {Promise<object[]>}
 */
async function getSuperAdmins() {
  const result = await query(
    `SELECT id, full_name, email, role, status
     FROM admins
     WHERE status = 'active'
       AND role = 'super_admin'
     ORDER BY created_at ASC`
  );
  return result.rows;
}

/**
 * Notify all Super Admins about a new backdate request.
 * @param {object} request
 * @param {object} investor
 * @param {object} submitter
 */
async function notifySuperAdminsNewRequest(request, investor, submitter) {
  const title = 'Backdate approval required';
  const body = `${submitter.full_name || 'An admin'} submitted a ${request.type} backdate for ${investor.full_name || 'investor'} (${request.id})`;

  const supers = await getSuperAdmins();
  if (supers.length === 0) {
    await createAdminNotification(null, title, body, request.id);
    return;
  }

  await Promise.all(
    supers.map((admin) =>
      createAdminNotification(admin.id, title, body, request.id).then(() =>
        sendEmail(admin.email, 'custom-notification', {
          investorName: admin.full_name || 'Super Admin',
          subjectTitle: title,
          body,
          recipientType: 'admin',
        }).catch(() => {})
      )
    )
  );
}

/**
 * Notify the submitting admin of approval/rejection.
 * @param {object} request
 * @param {string} title
 * @param {string} body
 */
async function notifySubmittingAdmin(request, title, body) {
  const adminResult = await query(
    `SELECT id, full_name, email, status
     FROM admins
     WHERE id = $1
     LIMIT 1`,
    [request.submitted_by]
  );
  const admin = adminResult.rows[0];
  if (!admin || admin.status !== 'active') {
    return;
  }

  await createAdminNotification(admin.id, title, body, request.id);
  await sendEmail(admin.email, 'custom-notification', {
    investorName: admin.full_name || 'Admin',
    subjectTitle: title,
    body,
    recipientType: 'admin',
  }).catch((err) => {
    logger.error(
      `[Backdate] submitter notify email failed: ${err.message}`,
      { error: err }
    );
  });
}

/**
 * Resolve a single-day credit amount (does not skip paused investors).
 * @param {string} investorId
 * @param {string} dateStr
 * @param {{ amount?: number|null, roiPercentage?: number|null }} options
 * @returns {Promise<{ amount: number, roi: number, capital: number }>}
 */
async function resolveSingleDayAmount(investorId, dateStr, options = {}) {
  const capital = Math.round(
    await getCapitalBalanceAsOf(investorId, dateStr)
  );
  const resolvedRoi =
    options.roiPercentage != null
      ? parseRoiPercent(options.roiPercentage)
      : parseRoiPercent(await getActiveROI(investorId, dateStr));

  if (options.amount != null && options.amount !== '') {
    const amount = Math.round(Number(options.amount));
    if (!Number.isInteger(amount) || amount <= 0) {
      const error = new Error('amount must be a positive whole number');
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }
    return { amount, roi: resolvedRoi, capital };
  }

  if (resolvedRoi <= 0 || capital <= 0) {
    const error = new Error(
      'Cannot calculate amount: investor has no capital or ROI for this date'
    );
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }

  const { year, month } = getISTDateParts(`${dateStr}T00:00:00+05:30`);
  const daysInMonth = getDaysInMonth(year, month);

  if (isLastDayOfMonth(`${dateStr}T00:00:00+05:30`)) {
    const expectedTotal = await getMonthlyExpected(investorId, year, month);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const creditedSoFar = await getCreditedTotalInMonth(
      investorId,
      monthStart,
      dateStr
    );
    const amount = Math.max(
      0,
      Math.round(expectedTotal) - Math.round(creditedSoFar)
    );
    if (amount <= 0) {
      const error = new Error(
        'Calculated last-day remaining amount is zero'
      );
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }
    return { amount, roi: resolvedRoi, capital };
  }

  const dailyAverage = calculateDailyAverage(capital, resolvedRoi, daysInMonth);
  const { min, max } = getDailyRange(dailyAverage);
  const amount = randomIntInclusive(min, max);
  if (amount <= 0) {
    const error = new Error('Calculated daily amount is zero');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }
  return { amount, roi: resolvedRoi, capital };
}

/**
 * Build bulk distribution preview using 90–110% algorithm (month-grouped).
 * @param {string} investorId
 * @param {string} startDate
 * @param {string} endDate
 * @param {number | null} roiOverride
 * @returns {Promise<{ expected_total: number, distribution: object[], day_count: number }>}
 */
export async function buildBulkRevenueDistribution(
  investorId,
  startDate,
  endDate,
  roiOverride = null
) {
  const dates = enumerateDatesInclusive(startDate, endDate);
  if (dates.length === 0) {
    const error = new Error('Date range produced no days');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }

  /** @type {Map<string, string[]>} */
  const byMonth = new Map();
  for (const dateStr of dates) {
    const { year, month } = getISTDateParts(`${dateStr}T00:00:00+05:30`);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!byMonth.has(key)) {
      byMonth.set(key, []);
    }
    byMonth.get(key).push(dateStr);
  }

  /** @type {object[]} */
  const distribution = [];
  let expectedTotal = 0;

  for (const monthDates of byMonth.values()) {
    /** @type {{ date: string, capital: number, roi: number, dailyAvg: number }[]} */
    const meta = [];

    for (const dateStr of monthDates) {
      const capital = Math.round(
        await getCapitalBalanceAsOf(investorId, dateStr)
      );
      const roi =
        roiOverride != null
          ? parseRoiPercent(roiOverride)
          : parseRoiPercent(await getActiveROI(investorId, dateStr));

      if (capital <= 0 || roi <= 0) {
        meta.push({ date: dateStr, capital, roi, dailyAvg: 0 });
        continue;
      }

      const { year, month } = getISTDateParts(`${dateStr}T00:00:00+05:30`);
      const daysInMonth = getDaysInMonth(year, month);
      const dailyAvg = calculateDailyAverage(capital, roi, daysInMonth);
      meta.push({ date: dateStr, capital, roi, dailyAvg });
    }

    const monthSubtotal = Math.round(
      meta.reduce((sum, row) => sum + row.dailyAvg, 0)
    );
    const amounts = calculateDailyAmounts(
      monthSubtotal,
      meta.length,
      0,
      meta.length
    );

    for (let i = 0; i < meta.length; i += 1) {
      const amount = Math.round(amounts[i] || 0);
      distribution.push({
        date: meta[i].date,
        amount,
        roi_percentage: meta[i].roi,
        capital_at_time: meta[i].capital,
      });
      expectedTotal += amount;
    }
  }

  expectedTotal = Math.round(expectedTotal);

  if (expectedTotal <= 0) {
    const error = new Error(
      'Expected bulk revenue is zero — check capital and ROI for the period'
    );
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }

  return {
    expected_total: expectedTotal,
    distribution,
    day_count: distribution.length,
  };
}

/**
 * Today's date as YYYY-MM-DD in IST.
 * @returns {string}
 */
function getTodayIST() {
  return getISTDateParts(new Date()).dateStr;
}

/**
 * Estimate / build revenue distribution for a period with optional capital boost
 * or fixed capital (new investor). Inclusive of startDate..endDate.
 *
 * @param {object} options
 * @param {string | null} options.investorId
 * @param {string} options.startDate
 * @param {string} options.endDate
 * @param {number | null} [options.roiOverride]
 * @param {number} [options.capitalBoost=0]
 * @param {string | null} [options.boostFromDate]
 * @param {number | null} [options.fixedCapital]
 * @returns {Promise<{ expected_total: number, distribution: object[], day_count: number }>}
 */
export async function buildPeriodRevenueEstimate({
  investorId,
  startDate,
  endDate,
  roiOverride = null,
  capitalBoost = 0,
  boostFromDate = null,
  fixedCapital = null,
}) {
  const dates = enumerateDatesInclusive(startDate, endDate);
  if (dates.length === 0) {
    const error = new Error('Date range produced no days');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }

  /** @type {Map<string, string[]>} */
  const byMonth = new Map();
  for (const dateStr of dates) {
    const { year, month } = getISTDateParts(`${dateStr}T00:00:00+05:30`);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!byMonth.has(key)) {
      byMonth.set(key, []);
    }
    byMonth.get(key).push(dateStr);
  }

  /** @type {object[]} */
  const distribution = [];
  let expectedTotal = 0;
  const boost = Math.round(Number(capitalBoost) || 0);

  for (const monthDates of byMonth.values()) {
    /** @type {{ date: string, capital: number, roi: number, dailyAvg: number }[]} */
    const meta = [];

    for (const dateStr of monthDates) {
      let capital;
      if (fixedCapital != null) {
        capital = Math.round(Number(fixedCapital));
      } else {
        capital = Math.round(
          await getCapitalBalanceAsOf(investorId, dateStr)
        );
        if (
          boostFromDate &&
          dateStr >= boostFromDate &&
          boost > 0
        ) {
          capital += boost;
        }
      }

      let roi;
      if (roiOverride != null) {
        roi = parseRoiPercent(roiOverride);
      } else if (investorId) {
        roi = parseRoiPercent(await getActiveROI(investorId, dateStr));
      } else {
        roi = 0;
      }

      if (capital <= 0 || roi <= 0) {
        meta.push({ date: dateStr, capital, roi, dailyAvg: 0 });
        continue;
      }

      const { year, month } = getISTDateParts(`${dateStr}T00:00:00+05:30`);
      const daysInMonth = getDaysInMonth(year, month);
      const dailyAvg = calculateDailyAverage(capital, roi, daysInMonth);
      meta.push({ date: dateStr, capital, roi, dailyAvg });
    }

    const monthSubtotal = Math.round(
      meta.reduce((sum, row) => sum + row.dailyAvg, 0)
    );
    const amounts = calculateDailyAmounts(
      monthSubtotal,
      meta.length,
      0,
      meta.length
    );

    for (let i = 0; i < meta.length; i += 1) {
      const amount = Math.round(amounts[i] || 0);
      distribution.push({
        date: meta[i].date,
        amount,
        roi_percentage: meta[i].roi,
        capital_at_time: meta[i].capital,
      });
      expectedTotal += amount;
    }
  }

  return {
    expected_total: Math.round(expectedTotal),
    distribution,
    day_count: distribution.length,
  };
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number}
 */
function parsePositiveAmount(value, field) {
  const amount = Math.round(Number(value));
  if (!Number.isInteger(amount) || amount <= 0) {
    const error = new Error(`${field} must be a positive whole number`);
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }
  return amount;
}

/**
 * @param {number} amount
 */
function assertCapitalLimits(amount) {
  if (amount < MIN_CAPITAL || amount > MAX_CAPITAL) {
    const error = new Error(
      `amount must be between ₹${MIN_CAPITAL.toLocaleString('en-IN')} and ₹${MAX_CAPITAL.toLocaleString('en-IN')}`
    );
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }
}

/**
 * Insert approved capital deposit with backdated payment_date.
 * @param {import('pg').PoolClient} client
 * @param {object} params
 */
async function insertBackdatedCapitalDeposit(client, params) {
  const {
    investorId,
    amount,
    dateStr,
    utrNumber,
    remark,
    adminId,
  } = params;

  const { year } = getISTDateParts(`${dateStr}T00:00:00+05:30`);
  const transactionId = await generateTransactionId(TRANSACTION_TYPES.CAP_DEP, {
    client,
    year,
  });

  const result = await client.query(
    `INSERT INTO capital_transactions (
       transaction_id,
       investor_id,
       type,
       amount,
       original_requested_amount,
       status,
       utr_number,
       remark,
       admin_id,
       admin_remark,
       payment_date,
       payment_utr
     ) VALUES (
       $1, $2, 'deposit', $3, $3, 'approved', $4, $5, $6, $7, $8::date, $4
     )
     RETURNING id, transaction_id, investor_id, type, amount, status,
               utr_number, payment_date, remark, created_at`,
    [
      transactionId,
      investorId,
      Math.round(amount),
      utrNumber || null,
      remark || null,
      adminId,
      'Backdated capital entry approved',
      dateStr,
    ]
  );

  return result.rows[0];
}

/**
 * Apply stored distribution as backdate revenue credits (skips zero amounts).
 * @param {import('pg').PoolClient} client
 * @param {string} investorId
 * @param {object[]} distribution
 * @param {{ skipExisting?: boolean }} [options]
 */
async function applyDistributionCredits(
  client,
  investorId,
  distribution,
  options = {}
) {
  /** @type {object[]} */
  const created = [];
  /** @type {Set<string>} */
  let existing = new Set();

  if (options.skipExisting) {
    const dates = distribution.map((d) => d.date).filter(Boolean);
    if (dates.length > 0) {
      const existingResult = await client.query(
        `SELECT credit_date::text AS credit_date
         FROM revenue_credits
         WHERE investor_id = $1
           AND is_deleted = FALSE
           AND is_reversed = FALSE
           AND credit_date = ANY($2::date[])`,
        [investorId, dates]
      );
      existing = new Set(
        existingResult.rows.map((r) => String(r.credit_date).slice(0, 10))
      );
    }
  }

  for (const row of distribution) {
    const amount = Math.round(Number(row.amount) || 0);
    if (amount <= 0) {
      continue;
    }
    const dateStr = row.date;
    if (existing.has(dateStr)) {
      continue;
    }
    const credit = await insertBackdateCredit(client, {
      investorId,
      dateStr,
      amount,
      roiPercentage: row.roi_percentage,
      capitalAtTime: row.capital_at_time,
    });
    created.push(credit);
  }

  return created;
}

/**
 * POST /api/v1/admin/backdate/capital/preview
 */
export async function previewCapitalBackdate(req, res) {
  try {
    const investorId = req.body?.investor_id;
    const dateStr = parseDateOnly(req.body?.date, 'date');
    const amount = parsePositiveAmount(req.body?.amount, 'amount');
    assertCapitalLimits(amount);

    const today = getTodayIST();
    if (dateStr > today) {
      return res.status(400).json({
        success: false,
        message: 'date must be today or in the past',
        error: 'VALIDATION_ERROR',
      });
    }

    const investor = await requireInvestor(investorId);
    let roiOverride = null;
    if (
      req.body?.roi_percentage !== undefined &&
      req.body?.roi_percentage !== null &&
      req.body?.roi_percentage !== ''
    ) {
      roiOverride = parseRoiPercent(req.body.roi_percentage);
    }

    const estimate = await buildPeriodRevenueEstimate({
      investorId: investor.id,
      startDate: dateStr,
      endDate: today,
      roiOverride,
      capitalBoost: amount,
      boostFromDate: dateStr,
    });

    return res.status(200).json({
      success: true,
      message: 'Capital backdate revenue preview',
      data: {
        investor_id: investor.id,
        capital_date: dateStr,
        capital_amount: amount,
        capital_amount_formatted: formatCurrency(amount),
        from_date: dateStr,
        to_date: today,
        expected_total: estimate.expected_total,
        expected_total_formatted: formatCurrency(estimate.expected_total),
        day_count: estimate.day_count,
        distribution: estimate.distribution.map((row) => ({
          ...row,
          amount_formatted: formatCurrency(row.amount),
        })),
      },
    });
  } catch (error) {
    return handleError(res, error, 'previewCapitalBackdate');
  }
}

/**
 * POST /api/v1/admin/backdate/capital
 */
export async function submitCapitalBackdate(req, res) {
  try {
    const investorId = req.body?.investor_id;
    const dateStr = parseDateOnly(req.body?.date, 'date');
    const amount = parsePositiveAmount(req.body?.amount, 'amount');
    assertCapitalLimits(amount);

    const today = getTodayIST();
    if (dateStr > today) {
      return res.status(400).json({
        success: false,
        message: 'date must be today or in the past',
        error: 'VALIDATION_ERROR',
      });
    }

    const utrNumber = String(req.body?.utr_number || '')
      .trim()
      .toUpperCase();
    if (!utrNumber) {
      return res.status(400).json({
        success: false,
        message: 'utr_number is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const utrTaken = await query(
      `SELECT id FROM capital_transactions
       WHERE utr_number = $1
       LIMIT 1`,
      [utrNumber]
    );
    if (utrTaken.rows[0]) {
      return res.status(409).json({
        success: false,
        message: 'UTR number already exists',
        error: 'CONFLICT',
      });
    }

    const remark =
      req.body?.remark != null ? String(req.body.remark).trim() : '';
    const sendEmailFlag =
      req.body?.send_email === true ||
      req.body?.send_email === 'true' ||
      req.body?.send_email === 1 ||
      req.body?.send_email === '1';
    const autoCalculate =
      req.body?.auto_calculate_revenue === true ||
      req.body?.auto_calculate_revenue === 'true' ||
      req.body?.auto_calculate_revenue === 1 ||
      req.body?.auto_calculate_revenue === '1' ||
      req.body?.auto_calculate_revenue === undefined;

    const investor = await requireInvestor(investorId);

    let revenuePreview = null;
    if (autoCalculate) {
      revenuePreview = await buildPeriodRevenueEstimate({
        investorId: investor.id,
        startDate: dateStr,
        endDate: today,
        capitalBoost: amount,
        boostFromDate: dateStr,
      });
    }

    const details = {
      amount,
      date: dateStr,
      utr_number: utrNumber,
      remark,
      auto_calculate_revenue: autoCalculate,
      revenue_to_date: today,
      revenue_preview: revenuePreview,
    };

    const insert = await query(
      `INSERT INTO backdate_requests (
         submitted_by,
         investor_id,
         type,
         start_date,
         end_date,
         roi_percentage,
         details,
         status,
         send_email_to_investor
       ) VALUES ($1, $2, 'capital', $3::date, $3::date, NULL, $4::jsonb, 'pending', $5)
       RETURNING id, submitted_by, approved_by, investor_id, type,
                 start_date, end_date, roi_percentage, details, status,
                 send_email_to_investor, execution_log, created_at, updated_at`,
      [
        req.user.userId,
        investor.id,
        dateStr,
        JSON.stringify(details),
        sendEmailFlag,
      ]
    );

    const request = insert.rows[0];
    await notifySuperAdminsNewRequest(request, investor, {
      id: req.user.userId,
      full_name: req.user.name,
    });

    await audit(
      req,
      buildActionDescription('Submitted', 'capital backdate'),
      request.id,
      null,
      { amount, date: dateStr, auto_calculate_revenue: autoCalculate }
    );

    return res.status(201).json({
      success: true,
      message: 'Capital backdate request submitted for Super Admin approval',
      data: {
        request: serializeRequest({
          ...request,
          investor_name: investor.full_name,
          investor_email: investor.email,
          submitted_by_name: req.user.name,
        }),
        preview: revenuePreview
          ? {
              expected_total: revenuePreview.expected_total,
              expected_total_formatted: formatCurrency(
                revenuePreview.expected_total
              ),
              day_count: revenuePreview.day_count,
              from_date: dateStr,
              to_date: today,
            }
          : null,
      },
    });
  } catch (error) {
    return handleError(res, error, 'submitCapitalBackdate');
  }
}

/**
 * POST /api/v1/admin/backdate/new-investor
 */
export async function submitNewInvestorBackdate(req, res) {
  try {
    const body = req.body || {};
    const fullName = String(body.full_name || body.fullName || '').trim();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const mobile = body.mobile;
    const password = String(body.password || '');
    const joiningDate = parseDateOnly(body.joining_date, 'joining_date');
    const initialCapital = parsePositiveAmount(
      body.initial_capital,
      'initial_capital'
    );
    assertCapitalLimits(initialCapital);

    const roiPercentage = parseRoiPercent(body.roi_percentage);
    if (!isValidRoiPercent(roiPercentage)) {
      return res.status(400).json({
        success: false,
        message:
          'roi_percentage must be a positive number (up to 2 decimal places)',
        error: 'VALIDATION_ERROR',
      });
    }

    const today = getTodayIST();
    if (joiningDate > today) {
      return res.status(400).json({
        success: false,
        message: 'joining_date must be today or in the past',
        error: 'VALIDATION_ERROR',
      });
    }

    if (!isValidFullName(fullName)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid full_name',
        error: 'VALIDATION_ERROR',
      });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email',
        error: 'VALIDATION_ERROR',
      });
    }
    if (!isValidIndianMobile(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile',
        error: 'VALIDATION_ERROR',
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'password must be at least 8 characters',
        error: 'VALIDATION_ERROR',
      });
    }

    if (await isEmailTaken(email)) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
        error: 'CONFLICT',
      });
    }

    const panNumber = body.pan_number
      ? String(body.pan_number).trim().toUpperCase()
      : null;
    const aadharNumber = body.aadhar_number
      ? String(body.aadhar_number).replace(/\s/g, '')
      : null;

    if (panNumber && !isValidPAN(panNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pan_number',
        error: 'VALIDATION_ERROR',
      });
    }
    if (aadharNumber && !isValidAadhar(aadharNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid aadhar_number',
        error: 'VALIDATION_ERROR',
      });
    }

    if (panNumber) {
      const panTaken = await query(
        `SELECT id FROM users WHERE pan_number = $1 LIMIT 1`,
        [panNumber]
      );
      if (panTaken.rows[0]) {
        return res.status(409).json({
          success: false,
          message: 'PAN already registered',
          error: 'CONFLICT',
        });
      }
    }
    if (aadharNumber) {
      const aadharTaken = await query(
        `SELECT id FROM users WHERE aadhar_number = $1 LIMIT 1`,
        [aadharNumber]
      );
      if (aadharTaken.rows[0]) {
        return res.status(409).json({
          success: false,
          message: 'Aadhar already registered',
          error: 'CONFLICT',
        });
      }
    }

    const sendEmailFlag =
      body.send_email === true ||
      body.send_email === 'true' ||
      body.send_email === 1 ||
      body.send_email === '1';

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const revenuePreview = await buildPeriodRevenueEstimate({
      investorId: null,
      startDate: joiningDate,
      endDate: today,
      roiOverride: roiPercentage,
      fixedCapital: initialCapital,
    });

    const details = {
      full_name: fullName,
      email,
      mobile: normalizeMobile(mobile),
      password_hash: passwordHash,
      pan_number: panNumber,
      aadhar_number: aadharNumber,
      bank_account_number: body.bank_account_number
        ? String(body.bank_account_number).trim()
        : null,
      bank_ifsc: body.bank_ifsc
        ? String(body.bank_ifsc).trim().toUpperCase()
        : null,
      bank_account_name: body.bank_account_name
        ? String(body.bank_account_name).trim()
        : null,
      bank_name: body.bank_name ? String(body.bank_name).trim() : null,
      upi_id: body.upi_id ? String(body.upi_id).trim() : null,
      joining_date: joiningDate,
      initial_capital: initialCapital,
      roi_percentage: roiPercentage,
      utr_number: body.utr_number
        ? String(body.utr_number).trim().toUpperCase()
        : `BD-NI-${Date.now()}`,
      revenue_to_date: today,
      revenue_preview: {
        expected_total: revenuePreview.expected_total,
        day_count: revenuePreview.day_count,
        distribution: revenuePreview.distribution,
      },
    };

    const insert = await query(
      `INSERT INTO backdate_requests (
         submitted_by,
         investor_id,
         type,
         start_date,
         end_date,
         roi_percentage,
         details,
         status,
         send_email_to_investor
       ) VALUES ($1, NULL, 'new_investor', $2::date, $3::date, $4, $5::jsonb, 'pending', $6)
       RETURNING id, submitted_by, approved_by, investor_id, type,
                 start_date, end_date, roi_percentage, details, status,
                 send_email_to_investor, execution_log, created_at, updated_at`,
      [
        req.user.userId,
        joiningDate,
        today,
        roiPercentage,
        JSON.stringify(details),
        sendEmailFlag,
      ]
    );

    const request = insert.rows[0];
    await notifySuperAdminsNewRequest(
      request,
      { full_name: fullName, email },
      { id: req.user.userId, full_name: req.user.name }
    );

    await audit(
      req,
      buildActionDescription('Submitted', 'new investor backdate'),
      request.id,
      null,
      {
        email,
        joining_date: joiningDate,
        initial_capital: initialCapital,
        expected_revenue: revenuePreview.expected_total,
      }
    );

    // Never return password_hash to client
    const safeDetails = { ...details };
    delete safeDetails.password_hash;

    return res.status(201).json({
      success: true,
      message:
        'New investor backdate request submitted for Super Admin approval',
      data: {
        request: serializeRequest({
          ...request,
          details: {
            ...request.details,
            password_hash: undefined,
          },
          investor_name: fullName,
          investor_email: email,
          submitted_by_name: req.user.name,
        }),
        preview: {
          joining_date: joiningDate,
          initial_capital: initialCapital,
          initial_capital_formatted: formatCurrency(initialCapital),
          roi_percentage: roiPercentage,
          expected_total: revenuePreview.expected_total,
          expected_total_formatted: formatCurrency(
            revenuePreview.expected_total
          ),
          day_count: revenuePreview.day_count,
          from_date: joiningDate,
          to_date: today,
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'submitNewInvestorBackdate');
  }
}

/**
 * Execute capital backdate request.
 * @param {object} request
 * @param {string} approverId
 */
async function executeCapitalBackdate(request, approverId) {
  const investor = await findUserById(request.investor_id);
  if (!investor || investor.is_deleted) {
    const error = new Error('Investor not found');
    error.code = 'NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const details =
    request.details && typeof request.details === 'object'
      ? request.details
      : {};
  const amount = Math.round(Number(details.amount));
  const dateStr = details.date || request.start_date;
  const utrNumber = details.utr_number;
  const autoCalculate = details.auto_calculate_revenue !== false;
  const sendEmailFlag = Boolean(request.send_email_to_investor);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const capitalTxn = await insertBackdatedCapitalDeposit(client, {
      investorId: investor.id,
      amount,
      dateStr,
      utrNumber,
      remark: details.remark || null,
      adminId: approverId,
    });

    /** @type {object[]} */
    let credits = [];
    if (autoCalculate) {
      const distribution = Array.isArray(details.revenue_preview?.distribution)
        ? details.revenue_preview.distribution
        : [];

      if (distribution.length === 0) {
        throw Object.assign(
          new Error('Revenue distribution missing from capital backdate request'),
          { code: 'VALIDATION_ERROR', status: 400 }
        );
      }

      credits = await applyDistributionCredits(
        client,
        investor.id,
        distribution,
        { skipExisting: true }
      );
    }

    const executionLog = {
      executed_at: new Date().toISOString(),
      approved_by: approverId,
      capital_transaction: {
        id: capitalTxn.id,
        transaction_id: capitalTxn.transaction_id,
        amount: capitalTxn.amount,
        payment_date: capitalTxn.payment_date,
      },
      auto_calculate_revenue: autoCalculate,
      credit_count: credits.length,
      total_amount: Math.round(
        credits.reduce((sum, c) => sum + Number(c.amount), 0)
      ),
      credits: credits.map((c) => ({
        id: c.id,
        transaction_id: c.transaction_id,
        credit_date: c.credit_date,
        amount: c.amount,
      })),
      send_email: sendEmailFlag,
    };

    const updated = await client.query(
      `UPDATE backdate_requests
       SET status = 'executed',
           approved_by = $2,
           execution_log = $3::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id, submitted_by, approved_by, investor_id, type,
                 start_date, end_date, roi_percentage, details, status,
                 send_email_to_investor, execution_log, created_at, updated_at`,
      [request.id, approverId, JSON.stringify(executionLog)]
    );

    if (!updated.rows[0]) {
      throw Object.assign(new Error('Request is no longer pending'), {
        code: 'CONFLICT',
        status: 409,
      });
    }

    await client.query('COMMIT');

    for (const credit of credits) {
      try {
        await maybeEmailInvestorCredit(investor, credit, sendEmailFlag);
      } catch (emailErr) {
        logger.error(
          `[Backdate] capital revenue email failed: ${emailErr.message}`,
          { error: emailErr }
        );
      }
    }

    if (sendEmailFlag) {
      try {
        await sendEmail(investor.email, 'capital-transaction', {
          investorName: investor.full_name,
          amount: capitalTxn.amount,
          transactionId: capitalTxn.transaction_id,
          transactionType: 'Capital deposit',
          status: 'Approved',
          message: 'Backdated capital credited to your account',
          referenceId: capitalTxn.transaction_id,
        });
      } catch {
        // best-effort
      }
    }

    return {
      request: updated.rows[0],
      executionLog,
      credits,
      capitalTransaction: capitalTxn,
      investor,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute new investor backdate request.
 * @param {object} request
 * @param {string} approverId
 */
async function executeNewInvestorBackdate(request, approverId) {
  const details =
    request.details && typeof request.details === 'object'
      ? request.details
      : {};

  if (!details.password_hash || !details.email || !details.joining_date) {
    const error = new Error('Invalid new investor backdate details');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }

  if (await isEmailTaken(details.email)) {
    const error = new Error('Email already registered');
    error.code = 'CONFLICT';
    error.status = 409;
    throw error;
  }

  const sendEmailFlag = Boolean(request.send_email_to_investor);
  const joiningDate = details.joining_date;
  const initialCapital = Math.round(Number(details.initial_capital));
  const roiPercentage = parseRoiPercent(details.roi_percentage);
  const createdAtIso = `${joiningDate}T00:00:00.000+05:30`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userInsert = await client.query(
      `INSERT INTO users (
         full_name,
         email,
         password_hash,
         mobile,
         pan_number,
         aadhar_number,
         bank_account_number,
         bank_ifsc,
         bank_account_name,
         bank_name,
         upi_id,
         status,
         kyc_status,
         joining_date,
         created_at,
         updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         'active', 'verified', $12::date, $13::timestamptz, NOW()
       )
       RETURNING id, full_name, email, mobile, status, kyc_status,
                 joining_date, created_at, updated_at`,
      [
        details.full_name,
        details.email,
        details.password_hash,
        details.mobile,
        details.pan_number,
        details.aadhar_number,
        details.bank_account_number,
        details.bank_ifsc,
        details.bank_account_name,
        details.bank_name,
        details.upi_id,
        joiningDate,
        createdAtIso,
      ]
    );

    const investor = userInsert.rows[0];

    await client.query(
      `INSERT INTO roi_settings (
         investor_id, type, roi_percentage, is_active, created_by
       ) VALUES ($1, 'default', $2, TRUE, $3)`,
      [investor.id, roiPercentage, approverId]
    );

    const capitalTxn = await insertBackdatedCapitalDeposit(client, {
      investorId: investor.id,
      amount: initialCapital,
      dateStr: joiningDate,
      utrNumber: details.utr_number,
      remark: 'Initial capital (backdated new investor)',
      adminId: approverId,
    });

    const distribution = Array.isArray(details.revenue_preview?.distribution)
      ? details.revenue_preview.distribution
      : (
          await buildPeriodRevenueEstimate({
            investorId: null,
            startDate: joiningDate,
            endDate: getTodayIST(),
            roiOverride: roiPercentage,
            fixedCapital: initialCapital,
          })
        ).distribution;

    const credits = await applyDistributionCredits(
      client,
      investor.id,
      distribution,
      { skipExisting: false }
    );

    const executionLog = {
      executed_at: new Date().toISOString(),
      approved_by: approverId,
      investor_id: investor.id,
      joining_date: joiningDate,
      capital_transaction: {
        id: capitalTxn.id,
        transaction_id: capitalTxn.transaction_id,
        amount: capitalTxn.amount,
        payment_date: capitalTxn.payment_date,
      },
      credit_count: credits.length,
      total_amount: Math.round(
        credits.reduce((sum, c) => sum + Number(c.amount), 0)
      ),
      credits: credits.map((c) => ({
        id: c.id,
        transaction_id: c.transaction_id,
        credit_date: c.credit_date,
        amount: c.amount,
      })),
      send_email: sendEmailFlag,
    };

    const updated = await client.query(
      `UPDATE backdate_requests
       SET status = 'executed',
           approved_by = $2,
           investor_id = $3,
           execution_log = $4::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id, submitted_by, approved_by, investor_id, type,
                 start_date, end_date, roi_percentage, details, status,
                 send_email_to_investor, execution_log, created_at, updated_at`,
      [
        request.id,
        approverId,
        investor.id,
        JSON.stringify(executionLog),
      ]
    );

    if (!updated.rows[0]) {
      throw Object.assign(new Error('Request is no longer pending'), {
        code: 'CONFLICT',
        status: 409,
      });
    }

    // Strip password_hash from stored details after execution
    const sanitizedDetails = { ...details };
    delete sanitizedDetails.password_hash;
    await client.query(
      `UPDATE backdate_requests
       SET details = $2::jsonb
       WHERE id = $1`,
      [request.id, JSON.stringify(sanitizedDetails)]
    );

    await client.query('COMMIT');

    if (sendEmailFlag) {
      try {
        await sendEmail(investor.email, 'approval', {
          investorName: investor.full_name,
          subjectTitle: 'Welcome to Tikhat Partner',
          body: `Your Tikhat Partner account is active. Joining date: ${formatDate(joiningDate)}. Initial capital ${formatCurrency(initialCapital)} has been credited.`,
          referenceId: capitalTxn.transaction_id,
        });
      } catch (emailErr) {
        logger.error(
          `[Backdate] welcome email failed: ${emailErr.message}`,
          { error: emailErr }
        );
      }
    }

    return {
      request: { ...updated.rows[0], details: sanitizedDetails },
      executionLog,
      credits,
      capitalTransaction: capitalTxn,
      investor,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {object} row
 * @returns {object}
 */
function serializeRequest(row) {
  const details =
    row.details && typeof row.details === 'object' ? { ...row.details } : {};
  if (details.password_hash) {
    delete details.password_hash;
  }

  return {
    id: row.id,
    submitted_by: row.submitted_by,
    submitted_by_name: row.submitted_by_name || null,
    approved_by: row.approved_by || null,
    investor_id: row.investor_id,
    investor_name: row.investor_name || null,
    investor_email: row.investor_email || null,
    type: row.type,
    start_date: row.start_date,
    end_date: row.end_date,
    roi_percentage: row.roi_percentage,
    details,
    status: row.status,
    send_email_to_investor: Boolean(row.send_email_to_investor),
    execution_log: row.execution_log || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_at_formatted: row.created_at ? formatDate(row.created_at) : null,
  };
}

/**
 * Load investor or throw.
 * @param {string} investorId
 */
async function requireInvestor(investorId) {
  if (!isUuid(investorId)) {
    const error = new Error('investor_id must be a valid UUID');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }
  const investor = await findUserById(investorId);
  if (!investor || investor.is_deleted) {
    const error = new Error('Investor not found');
    error.code = 'NOT_FOUND';
    error.status = 404;
    throw error;
  }
  return investor;
}

/**
 * POST /api/v1/admin/backdate/revenue/single
 */
export async function submitSingleRevenueBackdate(req, res) {
  try {
    const investorId = req.body?.investor_id;
    const dateStr = parseDateOnly(req.body?.date, 'date');
    const remark =
      req.body?.remark != null ? String(req.body.remark).trim() : '';
    const sendEmailFlag =
      req.body?.send_email === true ||
      req.body?.send_email === 'true' ||
      req.body?.send_email === 1 ||
      req.body?.send_email === '1';

    let amountInput = null;
    if (req.body?.amount !== undefined && req.body?.amount !== null && req.body?.amount !== '') {
      amountInput = Math.round(Number(req.body.amount));
    }

    let roiInput = null;
    if (
      req.body?.roi_percentage !== undefined &&
      req.body?.roi_percentage !== null &&
      req.body?.roi_percentage !== ''
    ) {
      roiInput = parseRoiPercent(req.body.roi_percentage);
      if (!isValidRoiPercent(roiInput)) {
        return res.status(400).json({
          success: false,
          message:
            'roi_percentage must be a positive number (up to 2 decimal places)',
          error: 'VALIDATION_ERROR',
        });
      }
    }

    const investor = await requireInvestor(investorId);
    const resolved = await resolveSingleDayAmount(investor.id, dateStr, {
      amount: amountInput,
      roiPercentage: roiInput,
    });

    const details = {
      date: dateStr,
      amount: amountInput,
      resolved_amount: resolved.amount,
      roi_percentage: roiInput,
      resolved_roi: resolved.roi,
      capital_at_time: resolved.capital,
      remark,
    };

    const insert = await query(
      `INSERT INTO backdate_requests (
         submitted_by,
         investor_id,
         type,
         start_date,
         end_date,
         roi_percentage,
         details,
         status,
         send_email_to_investor
       ) VALUES ($1, $2, 'single_revenue', $3::date, $3::date, $4, $5::jsonb, 'pending', $6)
       RETURNING id, submitted_by, approved_by, investor_id, type,
                 start_date, end_date, roi_percentage, details, status,
                 send_email_to_investor, execution_log, created_at, updated_at`,
      [
        req.user.userId,
        investor.id,
        dateStr,
        roiInput,
        JSON.stringify(details),
        sendEmailFlag,
      ]
    );

    const request = insert.rows[0];
    const submitter = {
      id: req.user.userId,
      full_name: req.user.name,
    };

    await notifySuperAdminsNewRequest(request, investor, submitter);

    await audit(
      req,
      buildActionDescription('Submitted', 'single revenue backdate'),
      request.id,
      null,
      { type: request.type, details }
    );

    return res.status(201).json({
      success: true,
      message: 'Backdate revenue request submitted for Super Admin approval',
      data: {
        request: serializeRequest({
          ...request,
          investor_name: investor.full_name,
          investor_email: investor.email,
          submitted_by_name: req.user.name,
        }),
        preview: {
          date: dateStr,
          amount: resolved.amount,
          amount_formatted: formatCurrency(resolved.amount),
          roi_percentage: resolved.roi,
          capital_at_time: resolved.capital,
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'submitSingleRevenueBackdate');
  }
}

/**
 * POST /api/v1/admin/backdate/revenue/bulk
 */
export async function submitBulkRevenueBackdate(req, res) {
  try {
    const investorId = req.body?.investor_id;
    const startDate = parseDateOnly(req.body?.start_date, 'start_date');
    const endDate = parseDateOnly(req.body?.end_date, 'end_date');
    const remark =
      req.body?.remark != null ? String(req.body.remark).trim() : '';
    const sendEmailFlag =
      req.body?.send_email === true ||
      req.body?.send_email === 'true' ||
      req.body?.send_email === 1 ||
      req.body?.send_email === '1';

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: 'start_date must be on or before end_date',
        error: 'VALIDATION_ERROR',
      });
    }

    let roiInput = null;
    if (
      req.body?.roi_percentage !== undefined &&
      req.body?.roi_percentage !== null &&
      req.body?.roi_percentage !== ''
    ) {
      roiInput = parseRoiPercent(req.body.roi_percentage);
      if (!isValidRoiPercent(roiInput)) {
        return res.status(400).json({
          success: false,
          message:
            'roi_percentage must be a positive number (up to 2 decimal places)',
          error: 'VALIDATION_ERROR',
        });
      }
    }

    const investor = await requireInvestor(investorId);
    const preview = await buildBulkRevenueDistribution(
      investor.id,
      startDate,
      endDate,
      roiInput
    );

    const details = {
      start_date: startDate,
      end_date: endDate,
      roi_percentage: roiInput,
      remark,
      expected_total: preview.expected_total,
      day_count: preview.day_count,
      distribution: preview.distribution,
    };

    const insert = await query(
      `INSERT INTO backdate_requests (
         submitted_by,
         investor_id,
         type,
         start_date,
         end_date,
         roi_percentage,
         details,
         status,
         send_email_to_investor
       ) VALUES ($1, $2, 'bulk_revenue', $3::date, $4::date, $5, $6::jsonb, 'pending', $7)
       RETURNING id, submitted_by, approved_by, investor_id, type,
                 start_date, end_date, roi_percentage, details, status,
                 send_email_to_investor, execution_log, created_at, updated_at`,
      [
        req.user.userId,
        investor.id,
        startDate,
        endDate,
        roiInput,
        JSON.stringify(details),
        sendEmailFlag,
      ]
    );

    const request = insert.rows[0];
    await notifySuperAdminsNewRequest(
      request,
      investor,
      { id: req.user.userId, full_name: req.user.name }
    );

    await audit(
      req,
      buildActionDescription('Submitted', 'bulk revenue backdate'),
      request.id,
      null,
      { type: request.type, expected_total: preview.expected_total }
    );

    return res.status(201).json({
      success: true,
      message: 'Bulk backdate revenue request submitted for Super Admin approval',
      data: {
        request: serializeRequest({
          ...request,
          investor_name: investor.full_name,
          investor_email: investor.email,
          submitted_by_name: req.user.name,
        }),
        preview: {
          expected_total: preview.expected_total,
          expected_total_formatted: formatCurrency(preview.expected_total),
          day_count: preview.day_count,
          distribution: preview.distribution.map((row) => ({
            ...row,
            amount_formatted: formatCurrency(row.amount),
          })),
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'submitBulkRevenueBackdate');
  }
}

/**
 * GET /api/v1/admin/backdate/requests
 * Super Admin → all pending; Admin → own pending only.
 */
export async function listBackdateRequests(req, res) {
  try {
    const isSuper = req.user.role === 'super_admin';
    const statusFilter =
      req.query.status != null
        ? String(req.query.status).toLowerCase().trim()
        : 'pending';

    const allowed = ['pending', 'approved', 'rejected', 'executed', 'all'];
    if (!allowed.includes(statusFilter)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status filter',
        error: 'VALIDATION_ERROR',
      });
    }

    const conditions = [];
    const params = [];

    if (statusFilter !== 'all') {
      params.push(statusFilter);
      conditions.push(`br.status = $${params.length}`);
    }

    if (!isSuper) {
      params.push(req.user.userId);
      conditions.push(`br.submitted_by = $${params.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT br.id, br.submitted_by, br.approved_by, br.investor_id,
              br.type, br.start_date, br.end_date, br.roi_percentage,
              br.details, br.status, br.send_email_to_investor,
              br.execution_log, br.created_at, br.updated_at,
              u.full_name AS investor_name,
              u.email AS investor_email,
              a.full_name AS submitted_by_name
       FROM backdate_requests br
       LEFT JOIN users u ON u.id = br.investor_id
       LEFT JOIN admins a ON a.id = br.submitted_by
       ${where}
       ORDER BY br.created_at DESC`,
      params
    );

    return res.status(200).json({
      success: true,
      message: 'Backdate requests retrieved',
      data: {
        requests: result.rows.map(serializeRequest),
        meta: {
          total: result.rows.length,
          scope: isSuper ? 'all' : 'own',
          status: statusFilter,
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'listBackdateRequests');
  }
}

/**
 * Insert one backdated revenue credit + update monthly tracking.
 * credit_type stays 'backdate' for admin/audit. Investor-facing label is
 * mapped to "Revenue Credit" in revenue.controller (never "Backdated").
 * @param {import('pg').PoolClient} client
 * @param {object} params
 */
async function insertBackdateCredit(client, params) {
  const {
    investorId,
    dateStr,
    amount,
    roiPercentage,
    capitalAtTime,
  } = params;

  const { year, month } = getISTDateParts(`${dateStr}T00:00:00+05:30`);
  const transactionId = await generateTransactionId(TRANSACTION_TYPES.REV_CR, {
    client,
    year,
  });

  const insertResult = await client.query(
    `INSERT INTO revenue_credits (
       transaction_id,
       investor_id,
       credit_date,
       amount,
       credit_type,
       roi_percentage_applied,
       capital_at_time
     ) VALUES ($1, $2, $3::date, $4, 'backdate', $5, $6)
     RETURNING id, transaction_id, investor_id, credit_date, amount,
               credit_type, roi_percentage_applied, capital_at_time, created_at`,
    [
      transactionId,
      investorId,
      dateStr,
      Math.round(amount),
      Number.isFinite(parseRoiPercent(roiPercentage))
        ? parseRoiPercent(roiPercentage)
        : null,
      Math.round(capitalAtTime),
    ]
  );

  await updateMonthlyTracking(investorId, year, month, Math.round(amount), {
    client,
    asOfDate: dateStr,
  });

  return insertResult.rows[0];
}

/**
 * Optionally email investor for a credit.
 * @param {object} investor
 * @param {object} credit
 * @param {boolean} sendEmailFlag
 */
async function maybeEmailInvestorCredit(investor, credit, sendEmailFlag) {
  if (!sendEmailFlag) {
    return;
  }

  let revenueBalance = credit.amount;
  try {
    revenueBalance = await getRevenueBalance(investor.id);
  } catch {
    // best-effort
  }

  await sendEmail(investor.email, 'revenue-credit', {
    investorName: investor.full_name,
    amount: credit.amount,
    creditDate: credit.credit_date,
    runningBalance: revenueBalance,
    transactionId: credit.transaction_id,
    referenceId: credit.transaction_id,
  });
}

/**
 * Execute a pending single/bulk revenue backdate request.
 * @param {object} request
 * @param {string} approverId
 * @returns {Promise<object>}
 */
async function executeRevenueBackdate(request, approverId) {
  const investor = await findUserById(request.investor_id);
  if (!investor || investor.is_deleted) {
    const error = new Error('Investor not found');
    error.code = 'NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const details =
    request.details && typeof request.details === 'object'
      ? request.details
      : {};
  const sendEmailFlag = Boolean(request.send_email_to_investor);
  /** @type {object[]} */
  const createdCredits = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (request.type === 'single_revenue') {
      const dateStr = details.date || request.start_date;
      const amount = Math.round(Number(details.resolved_amount));
      const roi = parseRoiPercent(
        details.resolved_roi ?? details.roi_percentage ?? 0
      );
      const capital = Math.round(Number(details.capital_at_time ?? 0));

      if (!dateStr || amount <= 0) {
        throw Object.assign(new Error('Invalid single backdate details'), {
          code: 'VALIDATION_ERROR',
          status: 400,
        });
      }

      const credit = await insertBackdateCredit(client, {
        investorId: investor.id,
        dateStr,
        amount,
        roiPercentage: roi,
        capitalAtTime: capital,
      });
      createdCredits.push(credit);
    } else if (request.type === 'bulk_revenue') {
      const distribution = Array.isArray(details.distribution)
        ? details.distribution
        : [];
      if (distribution.length === 0) {
        throw Object.assign(new Error('Bulk distribution missing'), {
          code: 'VALIDATION_ERROR',
          status: 400,
        });
      }

      for (const row of distribution) {
        const amount = Math.round(Number(row.amount) || 0);
        if (amount <= 0) {
          continue;
        }
        const credit = await insertBackdateCredit(client, {
          investorId: investor.id,
          dateStr: row.date,
          amount,
          roiPercentage: row.roi_percentage,
          capitalAtTime: row.capital_at_time,
        });
        createdCredits.push(credit);
      }

      if (createdCredits.length === 0) {
        throw Object.assign(new Error('No positive amounts to credit'), {
          code: 'VALIDATION_ERROR',
          status: 400,
        });
      }
    } else {
      throw Object.assign(
        new Error(`Unsupported backdate type for revenue execution: ${request.type}`),
        { code: 'VALIDATION_ERROR', status: 400 }
      );
    }

    const executionLog = {
      executed_at: new Date().toISOString(),
      approved_by: approverId,
      credit_count: createdCredits.length,
      total_amount: Math.round(
        createdCredits.reduce((sum, c) => sum + Number(c.amount), 0)
      ),
      credits: createdCredits.map((c) => ({
        id: c.id,
        transaction_id: c.transaction_id,
        credit_date: c.credit_date,
        amount: c.amount,
      })),
      send_email: sendEmailFlag,
    };

    const updated = await client.query(
      `UPDATE backdate_requests
       SET status = 'executed',
           approved_by = $2,
           execution_log = $3::jsonb,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'pending'
       RETURNING id, submitted_by, approved_by, investor_id, type,
                 start_date, end_date, roi_percentage, details, status,
                 send_email_to_investor, execution_log, created_at, updated_at`,
      [request.id, approverId, JSON.stringify(executionLog)]
    );

    if (!updated.rows[0]) {
      throw Object.assign(new Error('Request is no longer pending'), {
        code: 'CONFLICT',
        status: 409,
      });
    }

    await client.query('COMMIT');

    // Emails after commit
    for (const credit of createdCredits) {
      try {
        await maybeEmailInvestorCredit(investor, credit, sendEmailFlag);
      } catch (emailErr) {
        logger.error(
          `[Backdate] investor credit email failed: ${emailErr.message}`,
          { error: emailErr, transactionId: credit.transaction_id }
        );
      }
    }

    return {
      request: updated.rows[0],
      executionLog,
      credits: createdCredits,
      investor,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/admin/backdate/requests/:id/approve
 * Super Admin only — approve and execute immediately.
 */
export async function approveBackdateRequest(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request id',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await query(
      `SELECT id, submitted_by, approved_by, investor_id, type,
              start_date, end_date, roi_percentage, details, status,
              send_email_to_investor, execution_log, created_at, updated_at
       FROM backdate_requests
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (!existing.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Backdate request not found',
        error: 'NOT_FOUND',
      });
    }

    const request = existing.rows[0];
    if (request.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: `Request is already ${request.status}`,
        error: 'CONFLICT',
      });
    }

    let result;
    if (
      request.type === 'single_revenue' ||
      request.type === 'bulk_revenue'
    ) {
      result = await executeRevenueBackdate(request, req.user.userId);
    } else if (request.type === 'capital') {
      result = await executeCapitalBackdate(request, req.user.userId);
    } else if (request.type === 'new_investor') {
      result = await executeNewInvestorBackdate(request, req.user.userId);
    } else {
      return res.status(400).json({
        success: false,
        message: `Unsupported backdate type: ${request.type}`,
        error: 'VALIDATION_ERROR',
      });
    }

    const creditCount = result.executionLog?.credit_count ?? 0;
    const totalAmount = result.executionLog?.total_amount ?? 0;

    await notifySubmittingAdmin(
      request,
      'Backdate request approved',
      `Your ${request.type} backdate request (${request.id}) was approved and executed. Credits created: ${creditCount}, total ${formatCurrency(totalAmount)}.`
    );

    await audit(
      req,
      buildActionDescription('Approved', 'backdate request'),
      request.id,
      { status: 'pending' },
      { status: 'executed', execution_log: result.executionLog }
    );

    return res.status(200).json({
      success: true,
      message: 'Backdate request approved and executed',
      data: {
        request: serializeRequest({
          ...result.request,
          investor_name: result.investor?.full_name,
          investor_email: result.investor?.email,
        }),
        execution: result.executionLog,
        credits: result.credits || [],
        capital_transaction: result.capitalTransaction || null,
        investor: result.investor
          ? {
              id: result.investor.id,
              full_name: result.investor.full_name,
              email: result.investor.email,
              status: result.investor.status,
              joining_date: result.investor.joining_date || null,
              created_at: result.investor.created_at,
            }
          : null,
      },
    });
  } catch (error) {
    return handleError(res, error, 'approveBackdateRequest');
  }
}

/**
 * PATCH /api/v1/admin/backdate/requests/:id/reject
 * Super Admin only — reject with reason (no ledger entries).
 */
export async function rejectBackdateRequest(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request id',
        error: 'VALIDATION_ERROR',
      });
    }

    const reason = String(req.body?.reason || req.body?.rejection_reason || '')
      .trim();
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'reason is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await query(
      `SELECT id, submitted_by, approved_by, investor_id, type,
              start_date, end_date, roi_percentage, details, status,
              send_email_to_investor, execution_log, created_at, updated_at
       FROM backdate_requests
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (!existing.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Backdate request not found',
        error: 'NOT_FOUND',
      });
    }

    const request = existing.rows[0];
    if (request.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: `Request is already ${request.status}`,
        error: 'CONFLICT',
      });
    }

    const executionLog = {
      rejected_at: new Date().toISOString(),
      rejected_by: req.user.userId,
      reason,
    };

    const updated = await query(
      `UPDATE backdate_requests
       SET status = 'rejected',
           approved_by = $2,
           execution_log = $3::jsonb,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'pending'
       RETURNING id, submitted_by, approved_by, investor_id, type,
                 start_date, end_date, roi_percentage, details, status,
                 send_email_to_investor, execution_log, created_at, updated_at`,
      [id, req.user.userId, JSON.stringify(executionLog)]
    );

    if (!updated.rows[0]) {
      return res.status(409).json({
        success: false,
        message: 'Request is no longer pending',
        error: 'CONFLICT',
      });
    }

    await notifySubmittingAdmin(
      request,
      'Backdate request rejected',
      `Your ${request.type} backdate request (${request.id}) was rejected. Reason: ${reason}`
    );

    await audit(
      req,
      buildActionDescription('Rejected', 'backdate request'),
      request.id,
      { status: 'pending' },
      { status: 'rejected', reason }
    );

    return res.status(200).json({
      success: true,
      message: 'Backdate request rejected',
      data: {
        request: serializeRequest(updated.rows[0]),
      },
    });
  } catch (error) {
    return handleError(res, error, 'rejectBackdateRequest');
  }
}

/**
 * GET /api/v1/admin/backdate/history
 * Completed (executed) and rejected backdate requests with filters.
 */
export async function getBackdateHistory(req, res) {
  try {
    const conditions = [`br.status IN ('executed', 'rejected')`];
    const params = [];

    if (req.query.investor_id || req.query.investorId) {
      const investorId = String(
        req.query.investor_id || req.query.investorId
      ).trim();
      if (!isUuid(investorId)) {
        return res.status(400).json({
          success: false,
          message: 'investor_id must be a valid UUID',
          error: 'VALIDATION_ERROR',
        });
      }
      params.push(investorId);
      conditions.push(`br.investor_id = $${params.length}`);
    }

    if (req.query.type) {
      const type = String(req.query.type).trim();
      const allowedTypes = [
        'single_revenue',
        'bulk_revenue',
        'capital',
        'new_investor',
      ];
      if (!allowedTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid type filter',
          error: 'VALIDATION_ERROR',
        });
      }
      params.push(type);
      conditions.push(`br.type = $${params.length}`);
    }

    if (req.query.status) {
      const status = String(req.query.status).toLowerCase().trim();
      // "completed" alias for executed
      const normalized =
        status === 'completed' ? 'executed' : status;
      if (!['executed', 'rejected'].includes(normalized)) {
        return res.status(400).json({
          success: false,
          message: 'status must be executed, completed, or rejected',
          error: 'VALIDATION_ERROR',
        });
      }
      params.push(normalized);
      conditions.push(`br.status = $${params.length}`);
    }

    const dateFrom = req.query.date_from || req.query.from;
    const dateTo = req.query.date_to || req.query.to;
    if (dateFrom || dateTo) {
      if (!dateFrom || !dateTo) {
        return res.status(400).json({
          success: false,
          message: 'date_from and date_to must be provided together',
          error: 'VALIDATION_ERROR',
        });
      }
      const from = parseDateOnly(dateFrom, 'date_from');
      const to = parseDateOnly(dateTo, 'date_to');
      if (from > to) {
        return res.status(400).json({
          success: false,
          message: 'date_from must be on or before date_to',
          error: 'VALIDATION_ERROR',
        });
      }
      params.push(from, to);
      conditions.push(
        `(br.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $${params.length - 1}::date AND $${params.length}::date`
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await query(
      `SELECT br.id, br.submitted_by, br.approved_by, br.investor_id,
              br.type, br.start_date, br.end_date, br.roi_percentage,
              br.details, br.status, br.send_email_to_investor,
              br.execution_log, br.created_at, br.updated_at,
              u.full_name AS investor_name,
              u.email AS investor_email,
              a.full_name AS submitted_by_name,
              ap.full_name AS approved_by_name
       FROM backdate_requests br
       LEFT JOIN users u ON u.id = br.investor_id
       LEFT JOIN admins a ON a.id = br.submitted_by
       LEFT JOIN admins ap ON ap.id = br.approved_by
       ${where}
       ORDER BY br.updated_at DESC, br.created_at DESC`,
      params
    );

    const requests = result.rows.map((row) => ({
      ...serializeRequest(row),
      approved_by_name: row.approved_by_name || null,
      execution_summary: row.execution_log
        ? {
            credit_count: row.execution_log.credit_count ?? null,
            total_amount: row.execution_log.total_amount ?? null,
            executed_at:
              row.execution_log.executed_at ||
              row.execution_log.rejected_at ||
              null,
            reason: row.execution_log.reason || null,
          }
        : null,
    }));

    return res.status(200).json({
      success: true,
      message: 'Backdate history retrieved',
      data: {
        requests,
        meta: {
          total: requests.length,
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'getBackdateHistory');
  }
}

/**
 * GET /api/v1/admin/backdate/requests/:id/log
 * Execution (or rejection) log for a specific backdate request.
 */
export async function getBackdateRequestLog(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request id',
        error: 'VALIDATION_ERROR',
      });
    }

    const result = await query(
      `SELECT br.id, br.submitted_by, br.approved_by, br.investor_id,
              br.type, br.start_date, br.end_date, br.roi_percentage,
              br.details, br.status, br.send_email_to_investor,
              br.execution_log, br.created_at, br.updated_at,
              u.full_name AS investor_name,
              u.email AS investor_email,
              a.full_name AS submitted_by_name,
              ap.full_name AS approved_by_name
       FROM backdate_requests br
       LEFT JOIN users u ON u.id = br.investor_id
       LEFT JOIN admins a ON a.id = br.submitted_by
       LEFT JOIN admins ap ON ap.id = br.approved_by
       WHERE br.id = $1
       LIMIT 1`,
      [id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Backdate request not found',
        error: 'NOT_FOUND',
      });
    }

    const row = result.rows[0];

    if (row.status === 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Request has not been executed or rejected yet',
        error: 'VALIDATION_ERROR',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Backdate execution log retrieved',
      data: {
        request: {
          ...serializeRequest(row),
          approved_by_name: row.approved_by_name || null,
        },
        execution_log: row.execution_log || null,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getBackdateRequestLog');
  }
}
