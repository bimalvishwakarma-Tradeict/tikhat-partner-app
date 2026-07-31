import { query, pool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { getISTParts } from '../utils/formatDate.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import {
  logAction,
  buildActionDescription,
  AUDIT_ENTITY_TYPES,
} from '../services/audit.service.js';
import { getRevenueBalance, getEffectiveROI } from '../services/balance.service.js';
import {
  generateTransactionId,
  TRANSACTION_TYPES,
} from '../services/transaction.service.js';
import {
  createNotification,
  NOTIFICATION_TYPES,
} from '../services/notification.service.js';
import { sendEmail } from '../services/email.service.js';
import {
  RevenueError,
  getInvestorOrThrow,
  getRoiSettings,
  setDefaultRoi,
  addTermRoi,
  deleteTermRoi,
  getActiveRoiForDate,
  updateCreditSettings,
  getCreditSettings,
} from '../models/revenue.model.js';
import {
  getActiveROI,
  getCapitalBalanceAsOf,
  calculateDailyAverage,
  getDaysInMonth,
  getISTDateParts,
  isRevenuePaused,
} from '../services/roi.service.js';
import { loadRevenueCreditTime } from '../crons/revenue.cron.js';
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Normalize a SQL DATE / timestamp to YYYY-MM-DD without timezone shift.
 * Prefer credit_date calendar value over created_at.
 * @param {unknown} value
 * @returns {string | null}
 */
function toDateOnlyString(value) {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    return match ? match[1] : value.slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

const REVENUE_WITHDRAWAL_STATUSES = Object.freeze([
  'submitted',
  'under_review',
  'approved',
  'processed',
  'completed',
]);

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
 * @param {string} creditType
 * @param {string | null} [remark]
 * @returns {string}
 */
/**
 * @param {string} creditType
 * @param {string | null} [remark]
 * @param {{ forInvestor?: boolean }} [options]
 * @returns {string}
 */
function describeRevenueEntry(creditType, remark = null, options = {}) {
  const forInvestor = options.forInvestor !== false;

  // Investor-facing: never show "Backdate" / "Backdated".
  // All credit entries are labeled "Revenue Credit".
  if (forInvestor) {
    if (creditType === 'manual_debit') {
      return 'Admin revenue debit';
    }
    if (creditType === 'revenue_withdrawal') {
      return 'Revenue withdrawal';
    }
    return 'Revenue Credit';
  }

  // Admin-facing labels (Backdated allowed)
  if (creditType === 'backdate') {
    return 'Backdated revenue credit';
  }

  const base = {
    daily_auto: 'Daily revenue credit',
    manual_credit: 'Admin revenue credit',
    manual_debit: 'Admin revenue debit',
    revenue_withdrawal: 'Revenue withdrawal',
  }[creditType] || 'Revenue transaction';

  if (remark && String(remark).trim()) {
    return `${base} — ${String(remark).trim()}`;
  }
  return base;
}

/**
 * Investor-safe public type for ledger rows (never "backdate").
 * @param {string} creditType
 * @param {boolean} forInvestor
 * @returns {string}
 */
function publicRevenueType(creditType, forInvestor) {
  if (!forInvestor) {
    return creditType;
  }
  if (
    creditType === 'backdate' ||
    creditType === 'daily_auto' ||
    creditType === 'manual_credit'
  ) {
    return 'revenue_credit';
  }
  return creditType;
}

/**
 * @param {object} row
 * @returns {string}
 */
function encodeRevenueCursor(row) {
  return Buffer.from(
    JSON.stringify({ t: row.sort_at, i: row.id }),
    'utf8'
  ).toString('base64url');
}

/**
 * @param {string | undefined} cursor
 * @returns {{ t: string, i: string } | null}
 */
function decodeRevenueCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    );
    if (!parsed?.t || !parsed?.i) {
      return null;
    }
    return { t: String(parsed.t), i: String(parsed.i) };
  } catch {
    return null;
  }
}

/**
 * Build chronological ledger rows (credits + revenue withdrawals) with running balance.
 * @param {string} investorId
 * @param {{ month?: number, year?: number }} [filters]
 * @returns {Promise<object[]>}
 */
async function buildRevenueLedger(investorId, filters = {}) {
  await ensureRevenueCreditRemarkColumn();

  const params = [investorId];
  let dateFilterCredits = '';
  let dateFilterWithdrawals = '';
  let backdatedOnly = false;

  if (
    filters.backdated === true ||
    filters.backdated === 'true' ||
    filters.backdated === '1' ||
    filters.backdated === 1
  ) {
    backdatedOnly = true;
  }

  if (filters.month != null && filters.year != null) {
    const month = Math.round(Number(filters.month));
    const year = Math.round(Number(filters.year));
    if (
      !Number.isFinite(month) ||
      !Number.isFinite(year) ||
      month < 1 ||
      month > 12 ||
      year < 2020
    ) {
      throw new RevenueError(
        'Invalid month/year filter',
        'VALIDATION_ERROR',
        400
      );
    }
    params.push(year, month);
    dateFilterCredits = `AND EXTRACT(YEAR FROM credit_date) = $2
       AND EXTRACT(MONTH FROM credit_date) = $3`;
    dateFilterWithdrawals = `AND EXTRACT(YEAR FROM (created_at AT TIME ZONE 'Asia/Kolkata')::date) = $2
       AND EXTRACT(MONTH FROM (created_at AT TIME ZONE 'Asia/Kolkata')::date) = $3`;
  }

  const backdateCreditFilter = backdatedOnly
    ? `AND credit_type = 'backdate'`
    : '';

  const creditsResult = await query(
    `SELECT
       id::TEXT AS id,
       transaction_id,
       credit_date AS entry_date,
       credit_date,
       amount,
       credit_type AS entry_type,
       is_reversed,
       COALESCE(admin_remark, reversal_reason) AS remark,
       created_at,
       (credit_date::text || 'T00:00:00+05:30')::timestamptz AS sort_at
     FROM revenue_credits
     WHERE investor_id = $1
       AND is_deleted = FALSE
       ${dateFilterCredits}
       ${backdateCreditFilter}
     ORDER BY credit_date ASC, created_at ASC`,
    params
  );

  /** @type {object[]} */
  let wdrRows = [];
  if (!backdatedOnly) {
    const wdrParams = [...params, [...REVENUE_WITHDRAWAL_STATUSES]];
    const wdrStatusIdx = wdrParams.length;
    const wdrResult = await query(
      `SELECT
         id::TEXT AS id,
         transaction_id,
         (created_at AT TIME ZONE 'Asia/Kolkata')::date AS entry_date,
         amount,
         'revenue_withdrawal'::TEXT AS entry_type,
         FALSE AS is_reversed,
         NULL::TEXT AS remark,
         created_at,
         created_at AS sort_at
       FROM capital_withdrawal_requests
       WHERE investor_id = $1
         AND account_type = 'revenue'
         AND is_deleted = FALSE
         AND status = ANY($${wdrStatusIdx}::TEXT[])
         ${dateFilterWithdrawals}
       ORDER BY created_at ASC`,
      wdrParams
    );
    wdrRows = wdrResult.rows;
  }

  const merged = [...creditsResult.rows, ...wdrRows].sort((a, b) => {
    const dateA = toDateOnlyString(a.entry_date) || '';
    const dateB = toDateOnlyString(b.entry_date) || '';
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    const ta = new Date(a.sort_at).getTime();
    const tb = new Date(b.sort_at).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });

  let running = 0;
  return merged.map((row) => {
    const amount = Math.round(Number(row.amount) || 0);
    const type = row.entry_type;
    let creditAmount = 0;
    let debitAmount = 0;

    const countsTowardBalance = row.is_reversed !== true;

    if (type === 'manual_debit' || type === 'revenue_withdrawal') {
      debitAmount = amount;
      if (countsTowardBalance) {
        running = Math.round(running - amount);
      }
    } else {
      creditAmount = amount;
      if (countsTowardBalance) {
        running = Math.round(running + amount);
      }
    }

    // Display date = credit_date (entry_date), never created_at
    const dateValue =
      toDateOnlyString(row.credit_date) ||
      toDateOnlyString(row.entry_date);

    const forInvestor = filters.forAdmin !== true;
    const description = describeRevenueEntry(type, row.remark, {
      forInvestor,
    });

    const sortAtIso =
      dateValue != null
        ? `${dateValue}T00:00:00.000+05:30`
        : row.sort_at instanceof Date
          ? row.sort_at.toISOString()
          : new Date(row.sort_at).toISOString();

    return {
      id: row.id,
      transaction_id: row.transaction_id,
      date: dateValue,
      credit_date: dateValue,
      description,
      particular: description,
      credit_amount: creditAmount,
      debit_amount: debitAmount,
      type: publicRevenueType(type, forInvestor),
      credit_type: publicRevenueType(type, forInvestor),
      // Never expose backdate flag to investors
      is_backdated: forInvestor ? false : type === 'backdate',
      is_reversed: row.is_reversed === true,
      balance: running,
      sort_at: sortAtIso,
    };
  });
}

/**
 * Paginate ledger (newest first). Supports page/limit and cursor.
 * @param {object[]} ledgerAsc
 * @param {object} pagination
 */
function paginateRevenueLedger(ledgerAsc, pagination = {}) {
  const newestFirst = [...ledgerAsc].reverse();
  const limitNum = Math.min(
    toPositiveInt(pagination.limit, DEFAULT_LIMIT),
    MAX_LIMIT
  );

  const cursor = decodeRevenueCursor(pagination.cursor);
  if (cursor) {
    const startIdx = newestFirst.findIndex(
      (row) =>
        row.sort_at < cursor.t ||
        (row.sort_at === cursor.t && row.id < cursor.i)
    );
    const sliceStart = startIdx === -1 ? newestFirst.length : startIdx;
    const pageRows = newestFirst.slice(sliceStart, sliceStart + limitNum);
    const last = pageRows[pageRows.length - 1];
    const hasMore = sliceStart + limitNum < newestFirst.length;

    return {
      transactions: pageRows.map(
        ({ sort_at: _s, id: _i, ...rest }) => rest
      ),
      meta: {
        total: newestFirst.length,
        limit: limitNum,
        cursor: pagination.cursor || null,
        nextCursor: hasMore && last ? encodeRevenueCursor(last) : null,
        hasMore,
        mode: 'cursor',
      },
    };
  }

  const pageNum = toPositiveInt(pagination.page, DEFAULT_PAGE);
  const offset = (pageNum - 1) * limitNum;
  const pageRows = newestFirst.slice(offset, offset + limitNum);
  const last = pageRows[pageRows.length - 1];
  const hasMore = offset + limitNum < newestFirst.length;

  return {
    transactions: pageRows.map(({ sort_at: _s, id: _i, ...rest }) => rest),
    meta: {
      total: newestFirst.length,
      page: pageNum,
      limit: limitNum,
      totalPages:
        newestFirst.length === 0
          ? 0
          : Math.ceil(newestFirst.length / limitNum),
      nextCursor: hasMore && last ? encodeRevenueCursor(last) : null,
      hasMore,
      mode: 'page',
    },
  };
}

/**
 * Ensure optional admin_remark column and allow TKT-ADM IDs on revenue_credits.
 */
let revenueCreditSchemaReady = false;

async function ensureRevenueCreditRemarkColumn() {
  if (revenueCreditSchemaReady) {
    return;
  }

  await query(`
    ALTER TABLE revenue_credits
    ADD COLUMN IF NOT EXISTS admin_remark TEXT
  `);

  await query(`
    ALTER TABLE revenue_credits
    DROP CONSTRAINT IF EXISTS chk_revenue_credits_transaction_id_format
  `);

  await query(`
    ALTER TABLE revenue_credits
    ADD CONSTRAINT chk_revenue_credits_transaction_id_format
    CHECK (
      transaction_id ~ '^TKT-REV-CR-[0-9]{4}-[0-9]{5}$'
      OR transaction_id ~ '^TKT-ADM-[0-9]{4}-[0-9]{5}$'
    )
  `);

  revenueCreditSchemaReady = true;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeAmount(value) {
  return Math.round(Number(value));
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toRoiPercentDecimal(value) {
  const n = Number.parseFloat(String(value));
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Number.parseFloat(n.toFixed(2));
}

/**
 * Ensure ROI row payloads expose decimal roi_percentage (2 places).
 * @param {object | null | undefined} row
 * @returns {object | null}
 */
function withDecimalRoi(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    roi_percentage: toRoiPercentDecimal(row.roi_percentage),
  };
}

/**
 * @param {string | undefined} value
 * @returns {boolean}
 */
function isValidDateStr(value) {
  if (!value || typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Notify investor of manual revenue credit/debit.
 * @param {object} investor
 * @param {object} payload
 */
async function notifyManualRevenue(investor, payload) {
  const {
    title,
    body,
    transactionId,
    amount,
    creditDate,
    kind,
  } = payload;

  createNotification(
    investor.id,
    title,
    body,
    NOTIFICATION_TYPES.TRANSACTION,
    transactionId,
    'revenue_credit'
  ).catch((error) => {
    logger.error(`[Revenue] notification failed: ${error.message}`, { error });
  });

  if (kind === 'credit') {
    getRevenueBalance(investor.id)
      .then((runningBalance) =>
        sendEmail(investor.email, 'revenue-credit', {
          investorName: investor.full_name,
          amount,
          creditDate,
          runningBalance,
          transactionId,
          referenceId: transactionId,
        })
      )
      .catch((error) => {
        logger.error(`[Revenue] email failed: ${error.message}`, { error });
      });
    return;
  }

  sendEmail(investor.email, 'custom-notification', {
    investorName: investor.full_name,
    subjectTitle: title,
    body,
  }).catch((error) => {
    logger.error(`[Revenue] email failed: ${error.message}`, { error });
  });
}

/**
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context
 */
function handleError(res, error, context) {
  if (error instanceof RevenueError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      error: error.code,
    });
  }

  logger.error(`[Revenue] ${context}: ${error.message}`, { error });
  return res.status(500).json({
    success: false,
    message: 'Revenue settings request failed',
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
    AUDIT_ENTITY_TYPES.REVENUE,
    entityId,
    oldValue,
    newValue,
    req.ipAddress || null
  );
}

/**
 * GET /api/v1/admin/revenue/investor/:id/roi
 */
export async function getInvestorRoi(req, res) {
  try {
    const data = await getRoiSettings(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'ROI settings retrieved',
      data: {
        defaultRoi: withDecimalRoi(data.defaultRoi),
        terms: (data.terms || []).map(withDecimalRoi),
        settings: (data.settings || []).map(withDecimalRoi),
      },
    });
  } catch (error) {
    return handleError(res, error, 'getInvestorRoi');
  }
}

/**
 * POST /api/v1/admin/revenue/investor/:id/roi/default
 * Body: { percentage }
 */
export async function setInvestorDefaultRoi(req, res) {
  try {
    const before = await getRoiSettings(req.params.id);
    const rawPercentage = req.body.percentage ?? req.body.roi_percentage;
    const percentage = Number.parseFloat(String(rawPercentage));
    if (!Number.isFinite(percentage) || percentage <= 0) {
      return res.status(400).json({
        success: false,
        message:
          'ROI percentage must be a positive number (up to 2 decimal places)',
        error: 'VALIDATION_ERROR',
      });
    }

    const row = await setDefaultRoi(
      req.params.id,
      percentage,
      req.user.userId
    );

    await audit(
      req,
      buildActionDescription('Set', 'default ROI', row.roi_percentage),
      row.id,
      before.defaultRoi,
      row
    );

    return res.status(200).json({
      success: true,
      message: 'Default ROI updated',
      data: withDecimalRoi(row),
    });
  } catch (error) {
    return handleError(res, error, 'setInvestorDefaultRoi');
  }
}

/**
 * POST /api/v1/admin/revenue/investor/:id/roi/term
 * Body: { percentage, start_date, end_date }
 */
export async function addInvestorTermRoi(req, res) {
  try {
    const rawPercentage = req.body.percentage ?? req.body.roi_percentage;
    const percentage = Number.parseFloat(String(rawPercentage));
    if (!Number.isFinite(percentage) || percentage <= 0) {
      return res.status(400).json({
        success: false,
        message:
          'ROI percentage must be a positive number (up to 2 decimal places)',
        error: 'VALIDATION_ERROR',
      });
    }

    const row = await addTermRoi({
      investorId: req.params.id,
      percentage,
      startDate: req.body.start_date,
      endDate: req.body.end_date,
      adminId: req.user.userId,
    });

    await audit(
      req,
      buildActionDescription('Added', 'term ROI', row.roi_percentage),
      row.id,
      null,
      row
    );

    return res.status(201).json({
      success: true,
      message: 'Term ROI added',
      data: withDecimalRoi(row),
    });
  } catch (error) {
    return handleError(res, error, 'addInvestorTermRoi');
  }
}

/**
 * DELETE /api/v1/admin/revenue/investor/:id/roi/term/:termId
 */
export async function removeInvestorTermRoi(req, res) {
  try {
    const row = await deleteTermRoi(req.params.id, req.params.termId);

    await audit(
      req,
      buildActionDescription('Removed', 'term ROI', row.roi_percentage),
      row.id,
      row,
      { is_active: false }
    );

    return res.status(200).json({
      success: true,
      message: 'Term ROI removed',
      data: withDecimalRoi(row),
    });
  } catch (error) {
    return handleError(res, error, 'removeInvestorTermRoi');
  }
}

/**
 * GET /api/v1/admin/revenue/investor/:id/roi/active?date=YYYY-MM-DD
 */
export async function getInvestorActiveRoi(req, res) {
  try {
    const data = await getActiveRoiForDate(req.params.id, req.query.date);
    return res.status(200).json({
      success: true,
      message: 'Active ROI retrieved',
      data: {
        ...data,
        roiPercentage: toRoiPercentDecimal(data.roiPercentage),
        setting: withDecimalRoi(data.setting),
      },
    });
  } catch (error) {
    return handleError(res, error, 'getInvestorActiveRoi');
  }
}

/**
 * PATCH /api/v1/admin/revenue/settings/:id
 * :id = investor_id
 * Body: credit_frequency?, withdrawal_frequency?, is_paused?, credit_time_hour?, credit_time_minute?
 */
export async function patchRevenueSettings(req, res) {
  try {
    const before = await getCreditSettings(req.params.id);
    const after = await updateCreditSettings(
      req.params.id,
      req.body || {},
      req.user.userId
    );

    await audit(
      req,
      buildActionDescription('Updated', 'revenue credit settings'),
      req.params.id,
      before,
      after
    );

    return res.status(200).json({
      success: true,
      message: 'Revenue credit settings updated',
      data: after,
    });
  } catch (error) {
    return handleError(res, error, 'patchRevenueSettings');
  }
}

// ---------------------------------------------------------------------------
// Task 6.3 — Investor revenue APIs
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/investor/revenue/transactions
 * Query: month?, year?, page?, limit?, cursor?
 */
export async function getMyRevenueTransactions(req, res) {
  try {
    const investorId = req.user.userId;
    const { month, year, page, limit, cursor } = req.query;

    const filters = {};
    if (month !== undefined || year !== undefined) {
      if (month === undefined || year === undefined) {
        throw new RevenueError(
          'Both month and year are required when filtering',
          'VALIDATION_ERROR',
          400
        );
      }
      filters.month = month;
      filters.year = year;
    }

    const ledger = await buildRevenueLedger(investorId, filters);
    const data = paginateRevenueLedger(ledger, { page, limit, cursor });

    return res.status(200).json({
      success: true,
      message: 'Revenue transactions retrieved',
      data,
    });
  } catch (error) {
    return handleError(res, error, 'getMyRevenueTransactions');
  }
}

/**
 * GET /api/v1/investor/revenue/summary
 */
export async function getMyRevenueSummary(req, res) {
  try {
    const investorId = req.user.userId;
    const now = getISTParts(new Date());

    const [monthlyLedger, overallCredits, withdrawnResult, revenueBalance] =
      await Promise.all([
        buildRevenueLedger(investorId, {
          month: now.month,
          year: now.year,
        }),
        query(
          `SELECT COALESCE(SUM(
             CASE
               WHEN credit_type IN ('daily_auto', 'manual_credit', 'backdate')
               THEN amount
               WHEN credit_type = 'manual_debit'
               THEN -amount
               ELSE 0
             END
           ), 0)::INTEGER AS total
           FROM revenue_credits
           WHERE investor_id = $1
             AND is_deleted = FALSE
             AND is_reversed = FALSE`,
          [investorId]
        ),
        query(
          `SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
           FROM capital_withdrawal_requests
           WHERE investor_id = $1
             AND account_type = 'revenue'
             AND is_deleted = FALSE
             AND status = ANY($2::TEXT[])`,
          [investorId, [...REVENUE_WITHDRAWAL_STATUSES]]
        ),
        getRevenueBalance(investorId),
      ]);

    const monthlyTotal = monthlyLedger.reduce((sum, row) => {
      if (row.is_reversed) return sum;
      return Math.round(sum + row.credit_amount - row.debit_amount);
    }, 0);

    return res.status(200).json({
      success: true,
      message: 'Revenue summary retrieved',
      data: {
        monthly_total: monthlyTotal,
        overall_total: Math.round(Number(overallCredits.rows[0]?.total) || 0),
        total_withdrawn: Math.round(Number(withdrawnResult.rows[0]?.total) || 0),
        revenue_balance: Math.round(Number(revenueBalance) || 0),
        month: now.month,
        year: now.year,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getMyRevenueSummary');
  }
}

/**
 * GET /api/v1/investor/revenue/monthly?month=7&year=2024
 */
export async function getMyRevenueMonthly(req, res) {
  try {
    const investorId = req.user.userId;
    const month = req.query.month;
    const year = req.query.year;

    if (month === undefined || year === undefined) {
      throw new RevenueError(
        'month and year query params are required',
        'VALIDATION_ERROR',
        400
      );
    }

    const ledger = await buildRevenueLedger(investorId, { month, year });
    const total = ledger.reduce((sum, row) => {
      if (row.is_reversed) return sum;
      return Math.round(sum + row.credit_amount - row.debit_amount);
    }, 0);

    const { page, limit, cursor } = req.query;
    const paged = paginateRevenueLedger(ledger, { page, limit, cursor });

    return res.status(200).json({
      success: true,
      message: 'Monthly revenue retrieved',
      data: {
        month: Math.round(Number(month)),
        year: Math.round(Number(year)),
        total,
        ...paged,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getMyRevenueMonthly');
  }
}

// ---------------------------------------------------------------------------
// Task 6.4 — Admin revenue management
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/admin/revenue/investor/:id/transactions
 */
export async function getAdminInvestorRevenueTransactions(req, res) {
  try {
    await getInvestorOrThrow(req.params.id);
    const { month, year, page, limit, cursor, backdated } = req.query;
    const filters = {};
    if (month !== undefined || year !== undefined) {
      if (month === undefined || year === undefined) {
        throw new RevenueError(
          'Both month and year are required when filtering',
          'VALIDATION_ERROR',
          400
        );
      }
      filters.month = month;
      filters.year = year;
    }
    if (backdated !== undefined) {
      filters.backdated = backdated;
    }

    const ledger = await buildRevenueLedger(req.params.id, {
      ...filters,
      forAdmin: true,
    });
    const data = paginateRevenueLedger(ledger, { page, limit, cursor });

    return res.status(200).json({
      success: true,
      message: 'Investor revenue transactions retrieved',
      data,
    });
  } catch (error) {
    return handleError(res, error, 'getAdminInvestorRevenueTransactions');
  }
}

/**
 * GET /api/v1/admin/revenue/investor/:id/summary
 */
export async function getAdminInvestorRevenueSummary(req, res) {
  try {
    const investor = await getInvestorOrThrow(req.params.id);
    const now = getISTParts(new Date());
    const today = `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;

    const [
      monthlyLedger,
      overallCredits,
      withdrawnResult,
      revenueBalance,
      roiSettings,
      creditSettings,
      activeRoi,
    ] = await Promise.all([
      buildRevenueLedger(investor.id, { month: now.month, year: now.year }),
      query(
        `SELECT COALESCE(SUM(
           CASE
             WHEN credit_type IN ('daily_auto', 'manual_credit', 'backdate')
             THEN amount
             WHEN credit_type = 'manual_debit'
             THEN -amount
             ELSE 0
           END
         ), 0)::INTEGER AS total
         FROM revenue_credits
         WHERE investor_id = $1
           AND is_deleted = FALSE
           AND is_reversed = FALSE`,
        [investor.id]
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
         FROM capital_withdrawal_requests
         WHERE investor_id = $1
           AND account_type = 'revenue'
           AND is_deleted = FALSE
           AND status = ANY($2::TEXT[])`,
        [investor.id, [...REVENUE_WITHDRAWAL_STATUSES]]
      ),
      getRevenueBalance(investor.id),
      getRoiSettings(investor.id),
      getCreditSettings(investor.id),
      getActiveROI(investor.id, today),
    ]);

    const monthlyTotal = monthlyLedger.reduce((sum, row) => {
      if (row.is_reversed) return sum;
      return Math.round(sum + row.credit_amount - row.debit_amount);
    }, 0);

    return res.status(200).json({
      success: true,
      message: 'Investor revenue summary retrieved',
      data: {
        investor: {
          id: investor.id,
          full_name: investor.full_name,
          email: investor.email,
          status: investor.status,
        },
        monthly_total: monthlyTotal,
        overall_total: Math.round(Number(overallCredits.rows[0]?.total) || 0),
        total_withdrawn: Math.round(Number(withdrawnResult.rows[0]?.total) || 0),
        revenue_balance: Math.round(Number(revenueBalance) || 0),
        month: now.month,
        year: now.year,
        roi: {
          activePercentage: activeRoi,
          defaultRoi: roiSettings.defaultRoi,
          terms: roiSettings.terms,
        },
        creditSettings,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getAdminInvestorRevenueSummary');
  }
}

/**
 * POST /api/v1/admin/revenue/investor/:id/credit
 * Body: date, amount, remark?
 */
export async function adminManualCredit(req, res) {
  const client = await pool.connect();
  try {
    await ensureRevenueCreditRemarkColumn();
    const investor = await getInvestorOrThrow(req.params.id);
    const amount = normalizeAmount(req.body.amount);
    const creditDate = req.body.date || req.body.credit_date;
    const remark = req.body.remark ? String(req.body.remark).trim() : null;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RevenueError(
        'Valid positive amount is required',
        'VALIDATION_ERROR',
        400
      );
    }
    if (!isValidDateStr(creditDate)) {
      throw new RevenueError(
        'date is required in YYYY-MM-DD format',
        'VALIDATION_ERROR',
        400
      );
    }

    await client.query('BEGIN');
    const transactionId = await generateTransactionId(TRANSACTION_TYPES.ADM, {
      client,
    });

    const result = await client.query(
      `INSERT INTO revenue_credits (
         transaction_id,
         investor_id,
         credit_date,
         amount,
         credit_type,
         admin_remark
       ) VALUES ($1, $2, $3::DATE, $4, 'manual_credit', $5)
       RETURNING
         id,
         transaction_id,
         investor_id,
         credit_date,
         amount,
         credit_type,
         admin_remark,
         is_reversed,
         created_at`,
      [transactionId, investor.id, String(creditDate).trim(), amount, remark]
    );
    await client.query('COMMIT');

    const row = result.rows[0];

    await audit(
      req,
      buildActionDescription('Credited', 'revenue', amount),
      row.id,
      null,
      row
    );

    notifyManualRevenue(investor, {
      kind: 'credit',
      title: 'Revenue credited',
      body: `Admin credited ${formatCurrency(amount)} to your revenue account on ${formatDate(creditDate)}. Transaction ID: ${transactionId}.`,
      transactionId,
      amount,
      creditDate,
    });

    const revenueBalance = await getRevenueBalance(investor.id);

    return res.status(201).json({
      success: true,
      message: 'Revenue credited',
      data: { entry: row, revenueBalance },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleError(res, error, 'adminManualCredit');
  } finally {
    client.release();
  }
}

/**
 * POST /api/v1/admin/revenue/investor/:id/debit
 * Body: date, amount, remark?
 */
export async function adminManualDebit(req, res) {
  const client = await pool.connect();
  try {
    await ensureRevenueCreditRemarkColumn();
    const investor = await getInvestorOrThrow(req.params.id);
    const amount = normalizeAmount(req.body.amount);
    const creditDate = req.body.date || req.body.credit_date;
    const remark = req.body.remark ? String(req.body.remark).trim() : null;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RevenueError(
        'Valid positive amount is required',
        'VALIDATION_ERROR',
        400
      );
    }
    if (!isValidDateStr(creditDate)) {
      throw new RevenueError(
        'date is required in YYYY-MM-DD format',
        'VALIDATION_ERROR',
        400
      );
    }

    const balance = await getRevenueBalance(investor.id);
    if (amount > balance) {
      throw new RevenueError(
        'Debit amount exceeds available revenue balance',
        'VALIDATION_ERROR',
        400
      );
    }

    await client.query('BEGIN');
    const transactionId = await generateTransactionId(TRANSACTION_TYPES.ADM, {
      client,
    });

    const result = await client.query(
      `INSERT INTO revenue_credits (
         transaction_id,
         investor_id,
         credit_date,
         amount,
         credit_type,
         admin_remark
       ) VALUES ($1, $2, $3::DATE, $4, 'manual_debit', $5)
       RETURNING
         id,
         transaction_id,
         investor_id,
         credit_date,
         amount,
         credit_type,
         admin_remark,
         is_reversed,
         created_at`,
      [transactionId, investor.id, String(creditDate).trim(), amount, remark]
    );
    await client.query('COMMIT');

    const row = result.rows[0];

    await audit(
      req,
      buildActionDescription('Debited', 'revenue', amount),
      row.id,
      null,
      row
    );

    notifyManualRevenue(investor, {
      kind: 'debit',
      title: 'Revenue debited',
      body: `Admin debited ${formatCurrency(amount)} from your revenue account on ${formatDate(creditDate)}. Transaction ID: ${transactionId}.`,
      transactionId,
      amount,
      creditDate,
    });

    const revenueBalance = await getRevenueBalance(investor.id);

    return res.status(201).json({
      success: true,
      message: 'Revenue debited',
      data: { entry: row, revenueBalance },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleError(res, error, 'adminManualDebit');
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/admin/revenue/entry/:id/reverse
 * Body: reason?
 * Creates counter-entry and marks original reversed.
 */
export async function reverseRevenueEntry(req, res) {
  const client = await pool.connect();
  try {
    await ensureRevenueCreditRemarkColumn();
    const entryId = req.params.id;
    const reason = req.body?.reason
      ? String(req.body.reason).trim()
      : 'Reversed by admin';

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT
         id,
         transaction_id,
         investor_id,
         credit_date,
         amount,
         credit_type,
         admin_remark,
         is_reversed,
         is_deleted
       FROM revenue_credits
       WHERE id = $1
       FOR UPDATE`,
      [entryId]
    );

    const original = existing.rows[0];
    if (!original || original.is_deleted) {
      throw new RevenueError('Revenue entry not found', 'USER_NOT_FOUND', 404);
    }
    if (original.is_reversed) {
      throw new RevenueError(
        'Revenue entry is already reversed',
        'VALIDATION_ERROR',
        400
      );
    }

    // Counter-entry type flips credit/debit
    let counterType = 'manual_debit';
    if (
      original.credit_type === 'manual_debit'
    ) {
      counterType = 'manual_credit';
    }

    // If reversing a credit, ensure balance won't go negative after reverse
    if (counterType === 'manual_debit') {
      const balance = await getRevenueBalance(original.investor_id);
      if (original.amount > balance) {
        throw new RevenueError(
          'Cannot reverse: revenue balance would go negative',
          'VALIDATION_ERROR',
          400
        );
      }
    }

    const counterTxnId = await generateTransactionId(TRANSACTION_TYPES.ADM, {
      client,
    });

    const counterResult = await client.query(
      `INSERT INTO revenue_credits (
         transaction_id,
         investor_id,
         credit_date,
         amount,
         credit_type,
         admin_remark,
         is_reversed,
         reversed_by,
         reversed_at,
         reversal_reason
       ) VALUES ($1, $2, $3::DATE, $4, $5, $6, TRUE, $7, NOW(), $8)
       RETURNING
         id,
         transaction_id,
         investor_id,
         credit_date,
         amount,
         credit_type,
         admin_remark,
         is_reversed,
         reversed_by,
         reversed_at,
         reversal_reason,
         created_at`,
      [
        counterTxnId,
        original.investor_id,
        original.credit_date,
        original.amount,
        counterType,
        `Counter-entry for reversal of ${original.transaction_id}`,
        req.user.userId,
        reason,
      ]
    );

    const updated = await client.query(
      `UPDATE revenue_credits
       SET is_reversed = TRUE,
           reversed_by = $2,
           reversed_at = NOW(),
           reversal_reason = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         transaction_id,
         investor_id,
         credit_date,
         amount,
         credit_type,
         is_reversed,
         reversed_by,
         reversed_at,
         reversal_reason`,
      [original.id, req.user.userId, reason]
    );

    await client.query('COMMIT');

    const counter = counterResult.rows[0];
    const reversed = updated.rows[0];

    await audit(
      req,
      buildActionDescription('Reversed', 'revenue entry', original.amount),
      original.id,
      original,
      { reversed, counter }
    );

    const investor = await getInvestorOrThrow(original.investor_id);
    notifyManualRevenue(investor, {
      kind: 'debit',
      title: 'Revenue entry reversed',
      body: `A revenue entry of ${formatCurrency(original.amount)} (${original.transaction_id}) was reversed. Counter entry: ${counterTxnId}.`,
      transactionId: counterTxnId,
      amount: original.amount,
      creditDate: original.credit_date,
    });

    return res.status(200).json({
      success: true,
      message: 'Revenue entry reversed',
      data: {
        original: reversed,
        counterEntry: counter,
        revenueBalance: await getRevenueBalance(original.investor_id),
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleError(res, error, 'reverseRevenueEntry');
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/admin/revenue/investor/:id/pause
 */
export async function pauseInvestorRevenue(req, res) {
  try {
    const before = await getCreditSettings(req.params.id);
    const after = await updateCreditSettings(
      req.params.id,
      { is_paused: true },
      req.user.userId
    );

    await audit(
      req,
      buildActionDescription('Paused', 'revenue credit'),
      req.params.id,
      before,
      after
    );

    return res.status(200).json({
      success: true,
      message: 'Daily revenue credit paused',
      data: after,
    });
  } catch (error) {
    return handleError(res, error, 'pauseInvestorRevenue');
  }
}

/**
 * PATCH /api/v1/admin/revenue/investor/:id/resume
 */
export async function resumeInvestorRevenue(req, res) {
  try {
    const before = await getCreditSettings(req.params.id);
    const after = await updateCreditSettings(
      req.params.id,
      { is_paused: false },
      req.user.userId
    );

    await audit(
      req,
      buildActionDescription('Resumed', 'revenue credit'),
      req.params.id,
      before,
      after
    );

    return res.status(200).json({
      success: true,
      message: 'Daily revenue credit resumed',
      data: after,
    });
  } catch (error) {
    return handleError(res, error, 'resumeInvestorRevenue');
  }
}

/* -------------------------------------------------------------------------- */
/* Task 12.2 — Revenue management dashboard                                   */
/* -------------------------------------------------------------------------- */

/**
 * @param {unknown} value
 * @returns {number}
 */
function toWholeInt(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return 0;
  }
  return n;
}

/**
 * @param {string} hhmm
 * @returns {string}
 */
function formatCreditTimeLabel(hhmm) {
  const parts = String(hhmm || '18:00').split(':');
  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1] || '0', 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return '6:00 PM';
  }
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

/**
 * @returns {string}
 */
function getTodayIST() {
  const now = getISTParts(new Date());
  return `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
}

/**
 * @returns {{ start: string, today: string }}
 */
function getMonthStartAndTodayIST() {
  const now = getISTParts(new Date());
  const today = `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
  const start = `${now.year}-${String(now.month).padStart(2, '0')}-01`;
  return { start, today };
}

/**
 * @param {string} fromDate
 * @param {string} toDateInclusive
 * @returns {Promise<number>}
 */
async function sumRevenueCreditedInRange(fromDate, toDateInclusive) {
  const result = await query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN credit_type IN ('daily_auto', 'manual_credit', 'backdate') THEN amount
         WHEN credit_type = 'manual_debit' THEN -amount
         ELSE 0
       END
     ), 0)::INTEGER AS total
     FROM revenue_credits
     WHERE is_deleted = FALSE
       AND is_reversed = FALSE
       AND credit_date >= $1::date
       AND credit_date <= $2::date`,
    [fromDate, toDateInclusive]
  );
  return toWholeInt(result.rows[0]?.total);
}

/**
 * Build today's schedule estimate (eligible partners + amounts).
 * @returns {Promise<object>}
 */
async function buildTodayRevenueSchedule() {
  const timeRaw = (await loadRevenueCreditTime()) || '18:00';
  const timeLabel = formatCreditTimeLabel(timeRaw);
  const today = getTodayIST();
  const { year, month } = getISTDateParts(today);
  const daysInMonth = getDaysInMonth(year, month);

  const eligible = await query(
    `SELECT u.id, u.full_name, u.email
     FROM users u
     LEFT JOIN revenue_credit_settings rcs ON rcs.investor_id = u.id
     WHERE u.is_deleted = FALSE
       AND u.status = 'active'
       AND COALESCE(rcs.is_paused, FALSE) = FALSE
     ORDER BY u.full_name ASC`
  );

  const investors = [];
  let totalAmount = 0;

  for (const row of eligible.rows) {
    try {
      if (await isRevenuePaused(row.id)) {
        continue;
      }
      const capital = await getCapitalBalanceAsOf(row.id, today);
      if (capital <= 0) {
        continue;
      }
      const roiPercent = await getActiveROI(row.id, today);
      if (roiPercent <= 0) {
        continue;
      }
      const amount = Math.round(
        calculateDailyAverage(capital, roiPercent, daysInMonth)
      );
      if (amount <= 0) {
        continue;
      }
      totalAmount = Math.round(totalAmount + amount);
      investors.push({
        investor_id: row.id,
        full_name: row.full_name,
        email: row.email,
        capital_balance: capital,
        roi_percent: roiPercent,
        estimated_credit: amount,
        estimated_credit_formatted: formatCurrency(amount),
      });
    } catch (error) {
      logger.warn(
        `[Revenue] schedule estimate failed for ${row.id}: ${error.message}`
      );
    }
  }

  return {
    date: today,
    time: timeLabel,
    time_raw: timeRaw,
    investor_count: investors.length,
    total_amount: totalAmount,
    total_amount_formatted: formatCurrency(totalAmount),
    label: `${timeLabel}: ${investors.length} partners, ${formatCurrency(totalAmount)} total`,
    investors,
  };
}

/**
 * GET /api/v1/admin/revenue/dashboard
 */
export async function getRevenueDashboard(req, res) {
  try {
    const { start, today } = getMonthStartAndTodayIST();

    const [todayTotal, monthTotal, pausedResult, schedule] = await Promise.all([
      sumRevenueCreditedInRange(today, today),
      sumRevenueCreditedInRange(start, today),
      query(
        `SELECT COUNT(DISTINCT u.id)::INTEGER AS c
         FROM users u
         LEFT JOIN revenue_credit_settings rcs ON rcs.investor_id = u.id
         WHERE u.is_deleted = FALSE
           AND (
             u.status = 'paused'
             OR COALESCE(rcs.is_paused, FALSE) = TRUE
           )`
      ),
      buildTodayRevenueSchedule(),
    ]);

    const pausedCount = toWholeInt(pausedResult.rows[0]?.c);

    return res.status(200).json({
      success: true,
      message: 'Revenue management dashboard retrieved',
      data: {
        revenue_credited_today: todayTotal,
        revenue_credited_today_formatted: formatCurrency(todayTotal),
        revenue_credited_this_month: monthTotal,
        revenue_credited_this_month_formatted: formatCurrency(monthTotal),
        paused_investors_count: pausedCount,
        next_scheduled_credit: {
          time: schedule.time,
          time_raw: schedule.time_raw,
          date: schedule.date,
          investor_count: schedule.investor_count,
          total_amount: schedule.total_amount,
          total_amount_formatted: schedule.total_amount_formatted,
          label: schedule.label,
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'getRevenueDashboard');
  }
}

/**
 * GET /api/v1/admin/revenue/investors
 */
export async function listRevenueInvestors(req, res) {
  try {
    const page = toPositiveInt(req.query.page, DEFAULT_PAGE);
    let limit = toPositiveInt(req.query.limit, DEFAULT_LIMIT);
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    const offset = (page - 1) * limit;
    const search = req.query.search ? String(req.query.search).trim() : '';

    const params = [];
    let where = `u.is_deleted = FALSE AND u.status NOT IN ('deleted')`;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    const countResult = await query(
      `SELECT COUNT(*)::INTEGER AS total FROM users u WHERE ${where}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    params.push(limit, offset);
    const listResult = await query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.mobile,
         u.status,
         COALESCE(rcs.is_paused, FALSE) AS revenue_paused,
         rcs.credit_frequency,
         def.roi_percentage AS default_roi
       FROM users u
       LEFT JOIN revenue_credit_settings rcs ON rcs.investor_id = u.id
       LEFT JOIN LATERAL (
         SELECT roi_percentage
         FROM roi_settings
         WHERE investor_id = u.id
           AND type = 'default'
           AND is_active = TRUE
         ORDER BY created_at DESC
         LIMIT 1
       ) def ON TRUE
       WHERE ${where}
       ORDER BY u.full_name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const today = getTodayIST();
    const investors = [];

    for (const row of listResult.rows) {
      const [revenueBalance, effectiveRoi, monthCredits, activeRoi] =
        await Promise.all([
          getRevenueBalance(row.id),
          getEffectiveROI(row.id),
          sumRevenueCreditedForInvestorMonth(row.id, today),
          getActiveROI(row.id, today).catch(() => 0),
        ]);

      investors.push({
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        mobile: row.mobile,
        status: row.status,
        revenue_paused: row.revenue_paused === true,
        credit_frequency: row.credit_frequency || 'daily',
        default_roi:
          row.default_roi != null
            ? toRoiPercentDecimal(row.default_roi)
            : null,
        active_roi: toRoiPercentDecimal(activeRoi),
        effective_roi:
          effectiveRoi != null ? toRoiPercentDecimal(effectiveRoi) : effectiveRoi,
        revenue_balance: revenueBalance,
        revenue_balance_formatted: formatCurrency(revenueBalance),
        revenue_credited_this_month: monthCredits,
        revenue_credited_this_month_formatted: formatCurrency(monthCredits),
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Revenue investors retrieved',
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
    return handleError(res, error, 'listRevenueInvestors');
  }
}

/**
 * @param {string} investorId
 * @param {string} todayYmd
 * @returns {Promise<number>}
 */
async function sumRevenueCreditedForInvestorMonth(investorId, todayYmd) {
  const { year, month } = getISTDateParts(todayYmd);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const result = await query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN credit_type IN ('daily_auto', 'manual_credit', 'backdate') THEN amount
         WHEN credit_type = 'manual_debit' THEN -amount
         ELSE 0
       END
     ), 0)::INTEGER AS total
     FROM revenue_credits
     WHERE investor_id = $1
       AND is_deleted = FALSE
       AND is_reversed = FALSE
       AND credit_date >= $2::date
       AND credit_date <= $3::date`,
    [investorId, start, todayYmd]
  );
  return toWholeInt(result.rows[0]?.total);
}

/**
 * GET /api/v1/admin/revenue/schedule/today
 */
export async function getTodayRevenueSchedule(req, res) {
  try {
    const schedule = await buildTodayRevenueSchedule();
    return res.status(200).json({
      success: true,
      message: "Today's revenue credit schedule retrieved",
      data: schedule,
    });
  } catch (error) {
    return handleError(res, error, 'getTodayRevenueSchedule');
  }
}

/**
 * GET /api/v1/admin/cron-logs
 * Query: job_name, status, page, limit
 */
export async function listCronLogs(req, res) {
  try {
    const page = toPositiveInt(req.query.page, DEFAULT_PAGE);
    let limit = toPositiveInt(req.query.limit, DEFAULT_LIMIT);
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    const offset = (page - 1) * limit;

    const jobName = req.query.job_name
      ? String(req.query.job_name).trim()
      : '';
    const status = req.query.status ? String(req.query.status).trim() : '';

    const where = [];
    const params = [];

    if (jobName) {
      params.push(jobName);
      where.push(`job_name = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM cron_job_logs
       ${whereSql}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    params.push(limit, offset);
    const listResult = await query(
      `SELECT
         id,
         job_name,
         started_at,
         completed_at,
         status,
         processed_count,
         failed_count,
         total_amount,
         error_details,
         created_at,
         updated_at
       FROM cron_job_logs
       ${whereSql}
       ORDER BY started_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const logs = listResult.rows.map((row) => ({
      ...row,
      total_amount_formatted: formatCurrency(toWholeInt(row.total_amount)),
      started_at_formatted: row.started_at
        ? formatDate(row.started_at)
        : null,
      completed_at_formatted: row.completed_at
        ? formatDate(row.completed_at)
        : null,
    }));

    return res.status(200).json({
      success: true,
      message: 'Cron job logs retrieved',
      data: {
        logs,
        meta: {
          total,
          page,
          limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'listCronLogs');
  }
}
