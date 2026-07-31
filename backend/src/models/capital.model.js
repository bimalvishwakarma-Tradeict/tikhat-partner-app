import { query, pool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { getISTParts, TIMEZONE } from '../utils/formatDate.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import {
  generateTransactionId,
  TRANSACTION_TYPES,
} from '../services/transaction.service.js';

export const CAPITAL_LIMITS = Object.freeze({
  MIN_DEPOSIT: 10000,
  MAX_DEPOSIT: 1000000,
  MIN_WITHDRAWAL: 1000,
  UPI_MAX: 100000,
});

export const CAPITAL_TYPES = Object.freeze({
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  ADMIN_CREDIT: 'admin_credit',
  ADMIN_DEBIT: 'admin_debit',
});

export const ACCOUNT_TYPES = Object.freeze({
  CAPITAL: 'capital',
  REVENUE: 'revenue',
});

export const TRANSFER_MODES = Object.freeze({
  BANK: 'bank',
  UPI: 'upi',
});

export class CapitalError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} [status]
   */
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'CapitalError';
    this.code = code;
    this.status = status;
  }
}

const CAPITAL_COLUMNS = `
  id,
  transaction_id,
  investor_id,
  type,
  amount,
  original_requested_amount,
  status,
  utr_number,
  payment_screenshot_url,
  transfer_date,
  remark,
  admin_id,
  admin_remark,
  is_deleted,
  transfer_mode,
  payment_date,
  payment_utr,
  created_at,
  updated_at
`;

const WITHDRAWAL_COLUMNS = `
  id,
  transaction_id,
  investor_id,
  amount,
  account_type,
  transfer_mode,
  status,
  admin_id,
  admin_remark,
  payment_date,
  payment_utr,
  auto_cancelled_reason,
  is_deleted,
  created_at,
  updated_at
`;

const CREDITED_STATUSES = Object.freeze(['approved', 'completed']);
const DEDUCTED_WITHDRAWAL_STATUSES = Object.freeze([
  'submitted',
  'under_review',
  'approved',
  'processed',
  'completed',
]);
const PENDING_WITHDRAWAL_STATUSES = Object.freeze([
  'submitted',
  'under_review',
  'approved',
  'processed',
]);
const CANCELABLE_STATUSES = Object.freeze(['submitted', 'under_review']);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_WITHDRAWAL_FREQUENCY = 1;

let schemaReady = false;

/**
 * Ensure transfer_date column exists on capital_transactions.
 */
export async function ensureCapitalSchema() {
  if (schemaReady) {
    return;
  }

  await query(`
    ALTER TABLE capital_transactions
    ADD COLUMN IF NOT EXISTS transfer_date DATE
  `);

  schemaReady = true;
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
 * Normalize amount to whole rupees (no floating point money).
 * @param {unknown} amount
 * @returns {number}
 */
export function normalizeAmount(amount) {
  return Math.round(Number(amount));
}

/**
 * @param {string} utr
 * @returns {string}
 */
export function normalizeUtr(utr) {
  return String(utr || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Global UTR uniqueness check across capital transactions.
 * @param {string} utrNumber
 * @returns {Promise<boolean>} true if already used
 */
export async function isUtrTaken(utrNumber) {
  await ensureCapitalSchema();
  const normalized = normalizeUtr(utrNumber);

  const result = await query(
    `SELECT id
     FROM capital_transactions
     WHERE UPPER(REPLACE(utr_number, ' ', '')) = $1
       AND is_deleted = FALSE
     LIMIT 1`,
    [normalized]
  );

  return result.rowCount > 0;
}

/**
 * Create a capital deposit request (status: submitted).
 *
 * @param {object} params
 * @param {string} params.investorId
 * @param {number} params.amount
 * @param {string} [params.transferDate] - YYYY-MM-DD
 * @param {string} [params.transactionDate] - alias for transferDate
 * @param {string} params.utrNumber
 * @param {string} params.paymentScreenshotUrl
 * @param {string | null} [params.remark]
 * @returns {Promise<object>}
 */
export async function createDepositRequest({
  investorId,
  amount,
  transferDate,
  transactionDate,
  utrNumber,
  paymentScreenshotUrl,
  remark = null,
}) {
  await ensureCapitalSchema();

  const wholeAmount = normalizeAmount(amount);
  const utr = normalizeUtr(utrNumber);
  const dateValue = transferDate || transactionDate;
  if (!dateValue) {
    throw new CapitalError(
      'transfer_date / transaction_date is required',
      'VALIDATION_ERROR',
      400
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const transactionId = await generateTransactionId(TRANSACTION_TYPES.CAP_DEP, {
      client,
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
         payment_screenshot_url,
         transfer_date,
         remark
       ) VALUES ($1, $2, 'deposit', $3, $3, 'submitted', $4, $5, $6::date, $7)
       RETURNING ${CAPITAL_COLUMNS}`,
      [
        transactionId,
        investorId,
        wholeAmount,
        utr,
        paymentScreenshotUrl,
        dateValue,
        remark ? String(remark).trim() : null,
      ]
    );

    await client.query('COMMIT');

    const row = result.rows[0];

    logger.info('Capital deposit request created', {
      investorId,
      transactionId: row.transaction_id,
      amount: wholeAmount,
    });

    return row;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Insert an already-approved capital deposit with an explicit transaction date.
 * Used by backdate approval — never defaults the business date to NOW().
 *
 * @param {import('pg').PoolClient} client
 * @param {object} params
 * @param {string} params.investorId
 * @param {number} params.amount
 * @param {string} params.transactionDate - YYYY-MM-DD (required backdate / transfer date)
 * @param {string | null} [params.utrNumber]
 * @param {string | null} [params.remark]
 * @param {string} params.adminId
 * @param {string} [params.adminRemark]
 * @param {string} params.transactionId
 * @returns {Promise<object>}
 */
export async function insertApprovedCapitalDeposit(client, {
  investorId,
  amount,
  transactionDate,
  utrNumber = null,
  remark = null,
  adminId,
  adminRemark = 'Backdated capital entry approved',
  transactionId,
}) {
  if (!transactionDate) {
    throw new CapitalError(
      'transactionDate is required',
      'VALIDATION_ERROR',
      400
    );
  }

  const wholeAmount = normalizeAmount(amount);
  const createdAtIso = `${String(transactionDate).slice(0, 10)}T00:00:00.000+05:30`;

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
       transfer_date,
       payment_date,
       payment_utr,
       created_at,
       updated_at
     ) VALUES (
       $1, $2, 'deposit', $3, $3, 'approved', $4, $5, $6, $7,
       $8::date, $8::date, $4, $9::timestamptz, $9::timestamptz
     )
     RETURNING ${CAPITAL_COLUMNS}`,
    [
      transactionId,
      investorId,
      wholeAmount,
      utrNumber || null,
      remark || null,
      adminId,
      adminRemark,
      String(transactionDate).slice(0, 10),
      createdAtIso,
    ]
  );

  return result.rows[0];
}

/**
 * Paginated capital transactions for an investor.
 *
 * @param {string} investorId
 * @param {number | string} [page]
 * @param {number | string} [limit]
 * @returns {Promise<{ transactions: object[], meta: object }>}
 */
export async function getInvestorCapitalTransactions(
  investorId,
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT
) {
  await ensureCapitalSchema();

  const pageNum = toPositiveInt(page, DEFAULT_PAGE);
  let limitNum = toPositiveInt(limit, DEFAULT_LIMIT);
  if (limitNum > MAX_LIMIT) {
    limitNum = MAX_LIMIT;
  }
  const offset = (pageNum - 1) * limitNum;

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM capital_transactions
     WHERE investor_id = $1
       AND is_deleted = FALSE`,
    [investorId]
  );
  const total = countResult.rows[0]?.total || 0;

  const listResult = await query(
    `SELECT ${CAPITAL_COLUMNS}
     FROM capital_transactions
     WHERE investor_id = $1
       AND is_deleted = FALSE
     ORDER BY COALESCE(
       transfer_date,
       payment_date,
       (created_at AT TIME ZONE '${TIMEZONE}')::date
     ) DESC,
     created_at DESC
     LIMIT $2 OFFSET $3`,
    [investorId, limitNum, offset]
  );

  return {
    transactions: listResult.rows,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

/**
 * Capital balance = approved deposits/credits − deducted withdrawals/debits.
 * Pending withdrawal = in-flight capital withdrawal amounts.
 *
 * @param {string} investorId
 * @returns {Promise<object>}
 */
export async function getCapitalBalance(investorId, options = {}) {
  await ensureCapitalSchema();

  const run = (text, params) =>
    options.client ? options.client.query(text, params) : query(text, params);

  const txResult = await run(
    `SELECT
       COALESCE(SUM(
         CASE
           WHEN type IN ('deposit', 'admin_credit')
            AND status = ANY($2::TEXT[])
           THEN amount
           ELSE 0
         END
       ), 0)::INTEGER AS credited,
       COALESCE(SUM(
         CASE
           WHEN type IN ('withdrawal', 'admin_debit')
            AND status = ANY($3::TEXT[])
           THEN amount
           ELSE 0
         END
       ), 0)::INTEGER AS deducted,
       COALESCE(SUM(
         CASE
           WHEN type = 'withdrawal'
            AND status = ANY($4::TEXT[])
           THEN amount
           ELSE 0
         END
       ), 0)::INTEGER AS pending_from_tx
     FROM capital_transactions
     WHERE investor_id = $1
       AND is_deleted = FALSE`,
    [
      investorId,
      CREDITED_STATUSES,
      DEDUCTED_WITHDRAWAL_STATUSES,
      PENDING_WITHDRAWAL_STATUSES,
    ]
  );

  const wdrResult = await run(
    `SELECT
       COALESCE(SUM(
         CASE
           WHEN status = ANY($2::TEXT[])
           THEN amount
           ELSE 0
         END
       ), 0)::INTEGER AS deducted,
       COALESCE(SUM(
         CASE
           WHEN status = ANY($3::TEXT[])
           THEN amount
           ELSE 0
         END
       ), 0)::INTEGER AS pending
     FROM capital_withdrawal_requests
     WHERE investor_id = $1
       AND account_type = 'capital'
       AND is_deleted = FALSE`,
    [investorId, DEDUCTED_WITHDRAWAL_STATUSES, PENDING_WITHDRAWAL_STATUSES]
  );

  const credited = txResult.rows[0]?.credited || 0;
  const deductedTx = txResult.rows[0]?.deducted || 0;
  const pendingTx = txResult.rows[0]?.pending_from_tx || 0;
  const deductedReq = wdrResult.rows[0]?.deducted || 0;
  const pendingReq = wdrResult.rows[0]?.pending || 0;

  const capitalBalance = Math.round(credited - deductedTx - deductedReq);
  const pendingWithdrawalAmount = Math.round(pendingTx + pendingReq);

  const lockResult = await run(
    `SELECT is_locked
     FROM capital_lock_status
     WHERE investor_id = $1
     LIMIT 1`,
    [investorId]
  );

  const isLocked = lockResult.rows[0]?.is_locked === true;

  return {
    capitalBalance,
    pendingWithdrawalAmount,
    isLocked,
    statusLabel: isLocked
      ? 'Locked for Withdrawal'
      : 'Available for Withdrawal',
  };
}

/**
 * @param {string} investorId
 * @returns {Promise<boolean>}
 */
export async function isCapitalLocked(investorId) {
  const result = await query(
    `SELECT is_locked
     FROM capital_lock_status
     WHERE investor_id = $1
     LIMIT 1`,
    [investorId]
  );

  return result.rows[0]?.is_locked === true;
}

/**
 * Admin-set monthly withdrawal frequency (default 1).
 * @param {string} investorId
 * @returns {Promise<number>}
 */
export async function getWithdrawalFrequencyLimit(investorId) {
  const result = await query(
    `SELECT withdrawal_frequency
     FROM revenue_credit_settings
     WHERE investor_id = $1
     LIMIT 1`,
    [investorId]
  );

  if (!result.rows[0]) {
    return DEFAULT_WITHDRAWAL_FREQUENCY;
  }

  return Number(result.rows[0].withdrawal_frequency);
}

/**
 * Count non-cancelled/rejected withdrawals in the current IST calendar month.
 * @param {string} investorId
 * @returns {Promise<number>}
 */
export async function countWithdrawalsThisMonth(investorId) {
  const { year, month } = getISTParts(new Date());

  const result = await query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM capital_withdrawal_requests
     WHERE investor_id = $1
       AND is_deleted = FALSE
       AND status NOT IN ('cancelled', 'rejected')
       AND EXTRACT(YEAR FROM (created_at AT TIME ZONE $4)) = $2
       AND EXTRACT(MONTH FROM (created_at AT TIME ZONE $4)) = $3`,
    [investorId, year, month, TIMEZONE]
  );

  return result.rows[0]?.count || 0;
}

/**
 * Revenue Balance = credits − manual debits − revenue withdrawals (deducted statuses).
 * @param {string} investorId
 * @returns {Promise<number>}
 */
export async function getRevenueBalance(investorId, options = {}) {
  const run = (text, params) =>
    options.client ? options.client.query(text, params) : query(text, params);

  const creditResult = await run(
    `SELECT COALESCE(SUM(
       CASE
         WHEN credit_type IN ('daily_auto', 'manual_credit', 'backdate')
         THEN amount
         WHEN credit_type = 'manual_debit'
         THEN -amount
         ELSE 0
       END
     ), 0)::INTEGER AS net_credits
     FROM revenue_credits
     WHERE investor_id = $1
       AND is_deleted = FALSE
       AND is_reversed = FALSE`,
    [investorId]
  );

  const wdrResult = await run(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
     FROM capital_withdrawal_requests
     WHERE investor_id = $1
       AND account_type = 'revenue'
       AND is_deleted = FALSE
       AND status = ANY($2::TEXT[])`,
    [investorId, DEDUCTED_WITHDRAWAL_STATUSES]
  );

  const netCredits = creditResult.rows[0]?.net_credits || 0;
  const deducted = wdrResult.rows[0]?.deducted || 0;

  return Math.round(netCredits - deducted);
}

/**
 * Pending withdrawal amount for an account type.
 * @param {string} investorId
 * @param {'capital' | 'revenue'} accountType
 * @returns {Promise<number>}
 */
export async function getPendingWithdrawalAmount(investorId, accountType) {
  const result = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS pending
     FROM capital_withdrawal_requests
     WHERE investor_id = $1
       AND account_type = $2
       AND is_deleted = FALSE
       AND status = ANY($3::TEXT[])`,
    [investorId, accountType, PENDING_WITHDRAWAL_STATUSES]
  );

  return result.rows[0]?.pending || 0;
}

/**
 * Create withdrawal request — amount is immediately reflected as deducted via status=submitted.
 *
 * @param {object} params
 * @param {string} params.investorId
 * @param {number} params.amount
 * @param {'capital' | 'revenue'} params.accountType
 * @param {'bank' | 'upi'} params.transferMode
 * @returns {Promise<object>}
 */
export async function createWithdrawalRequest({
  investorId,
  amount,
  accountType,
  transferMode,
}) {
  await ensureCapitalSchema();

  const wholeAmount = normalizeAmount(amount);
  const normalizedAccount = String(accountType || '').toLowerCase();
  const normalizedMode = String(transferMode || '').toLowerCase();

  if (
    normalizedAccount !== ACCOUNT_TYPES.CAPITAL &&
    normalizedAccount !== ACCOUNT_TYPES.REVENUE
  ) {
    throw new CapitalError(
      'account_type must be capital or revenue',
      'VALIDATION_ERROR',
      400
    );
  }

  if (
    normalizedMode !== TRANSFER_MODES.BANK &&
    normalizedMode !== TRANSFER_MODES.UPI
  ) {
    throw new CapitalError(
      'transfer_mode must be bank or upi',
      'VALIDATION_ERROR',
      400
    );
  }

  if (!Number.isFinite(wholeAmount) || wholeAmount <= 0) {
    throw new CapitalError(
      'Amount must be a valid whole number',
      'VALIDATION_ERROR',
      400
    );
  }

  if (wholeAmount < CAPITAL_LIMITS.MIN_WITHDRAWAL) {
    throw new CapitalError(
      `Minimum withdrawal amount is ${formatCurrency(CAPITAL_LIMITS.MIN_WITHDRAWAL)}`,
      'WITHDRAWAL_BELOW_MINIMUM',
      400
    );
  }

  if (
    normalizedMode === TRANSFER_MODES.UPI &&
    wholeAmount > CAPITAL_LIMITS.UPI_MAX
  ) {
    throw new CapitalError(
      `UPI transfer limit is ${formatCurrency(CAPITAL_LIMITS.UPI_MAX)}. Please use bank transfer for higher amounts.`,
      'VALIDATION_ERROR',
      400
    );
  }

  if (normalizedAccount === ACCOUNT_TYPES.CAPITAL) {
    if (await isCapitalLocked(investorId)) {
      throw new CapitalError(
        'Your capital is locked for withdrawal. You cannot submit a capital withdrawal request at this time.',
        'CAPITAL_LOCKED',
        400
      );
    }
  }

  const frequencyLimit = await getWithdrawalFrequencyLimit(investorId);
  if (frequencyLimit > 0) {
    const used = await countWithdrawalsThisMonth(investorId);
    if (used >= frequencyLimit) {
      throw new CapitalError(
        `Withdrawal frequency exceeded. You are allowed ${frequencyLimit} withdrawal(s) this month.`,
        'WITHDRAWAL_FREQUENCY_EXCEEDED',
        400
      );
    }
  }

  let availableBalance;
  if (normalizedAccount === ACCOUNT_TYPES.CAPITAL) {
    const capital = await getCapitalBalance(investorId);
    availableBalance = capital.capitalBalance;
  } else {
    availableBalance = await getRevenueBalance(investorId);
  }

  if (wholeAmount > availableBalance) {
    throw new CapitalError(
      'Insufficient balance for this withdrawal',
      'WITHDRAWAL_INSUFFICIENT_BALANCE',
      400
    );
  }

  const txnType =
    normalizedAccount === ACCOUNT_TYPES.CAPITAL
      ? TRANSACTION_TYPES.CAP_WDR
      : TRANSACTION_TYPES.REV_WDR;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Serialize concurrent deductions for this investor (Task 26.2)
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1::text))',
      [investorId]
    );

    let availableInTxn;
    if (normalizedAccount === ACCOUNT_TYPES.CAPITAL) {
      const capital = await getCapitalBalance(investorId, { client });
      availableInTxn = capital.capitalBalance;
    } else {
      availableInTxn = await getRevenueBalance(investorId, { client });
    }

    if (wholeAmount > availableInTxn) {
      throw new CapitalError(
        'Insufficient balance for this withdrawal',
        'WITHDRAWAL_INSUFFICIENT_BALANCE',
        400
      );
    }

    const transactionId = await generateTransactionId(txnType, { client });

    const result = await client.query(
      `INSERT INTO capital_withdrawal_requests (
         transaction_id,
         investor_id,
         amount,
         account_type,
         transfer_mode,
         status
       ) VALUES ($1, $2, $3, $4, $5, 'submitted')
       RETURNING ${WITHDRAWAL_COLUMNS}`,
      [
        transactionId,
        investorId,
        wholeAmount,
        normalizedAccount,
        normalizedMode,
      ]
    );

    await client.query('COMMIT');

    const row = result.rows[0];

    logger.info('Withdrawal request created', {
      investorId,
      transactionId: row.transaction_id,
      amount: wholeAmount,
      accountType: normalizedAccount,
    });

    return row;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Cancel own pending withdrawal (submitted / under_review only). Restores balance.
 *
 * @param {string} requestId
 * @param {string} investorId
 * @returns {Promise<object>}
 */
export async function cancelWithdrawalRequest(requestId, investorId) {
  const existing = await query(
    `SELECT ${WITHDRAWAL_COLUMNS}
     FROM capital_withdrawal_requests
     WHERE id = $1
       AND investor_id = $2
       AND is_deleted = FALSE
     LIMIT 1`,
    [requestId, investorId]
  );

  const row = existing.rows[0];
  if (!row) {
    throw new CapitalError('Withdrawal request not found', 'USER_NOT_FOUND', 404);
  }

  if (!CANCELABLE_STATUSES.includes(row.status)) {
    throw new CapitalError(
      'Only submitted or under review withdrawal requests can be cancelled',
      'VALIDATION_ERROR',
      400
    );
  }

  const result = await query(
    `UPDATE capital_withdrawal_requests
     SET status = 'cancelled',
         updated_at = NOW()
     WHERE id = $1
       AND investor_id = $2
       AND status = ANY($3::TEXT[])
     RETURNING ${WITHDRAWAL_COLUMNS}`,
    [requestId, investorId, CANCELABLE_STATUSES]
  );

  if (result.rowCount === 0) {
    throw new CapitalError(
      'Only submitted or under review withdrawal requests can be cancelled',
      'VALIDATION_ERROR',
      400
    );
  }

  logger.info('Withdrawal request cancelled', {
    investorId,
    requestId,
    transactionId: result.rows[0].transaction_id,
    amount: result.rows[0].amount,
  });

  return result.rows[0];
}

/**
 * @param {string} requestId
 * @param {string} investorId
 * @returns {Promise<object | null>}
 */
export async function getWithdrawalById(requestId, investorId) {
  const result = await query(
    `SELECT ${WITHDRAWAL_COLUMNS}
     FROM capital_withdrawal_requests
     WHERE id = $1
       AND investor_id = $2
       AND is_deleted = FALSE
     LIMIT 1`,
    [requestId, investorId]
  );

  return result.rows[0] || null;
}
