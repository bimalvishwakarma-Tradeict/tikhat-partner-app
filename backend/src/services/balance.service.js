import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

/** Statuses that credit capital (approved deposits / admin credits). */
const CAPITAL_CREDIT_STATUSES = Object.freeze(['approved', 'completed']);

/** Statuses that count as approved capital withdrawals (Section 9.1). */
const CAPITAL_APPROVED_WITHDRAWAL_STATUSES = Object.freeze([
  'approved',
  'processed',
  'completed',
]);

/** Pending = submitted / under_review only (Task 5.4). */
const PENDING_STATUSES = Object.freeze(['submitted', 'under_review']);

/** Revenue withdrawal statuses that reduce revenue balance. */
const REVENUE_WITHDRAWAL_STATUSES = Object.freeze([
  'submitted',
  'under_review',
  'approved',
  'processed',
  'completed',
]);

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
 * @param {string | null | undefined} investorId
 * @returns {boolean}
 */
function isValidInvestorId(investorId) {
  return typeof investorId === 'string' && investorId.trim().length > 0;
}

/**
 * Total capital invested (gross approved deposits + admin credits).
 * Used for effective ROI denominator.
 *
 * @param {string} investorId
 * @returns {Promise<number>}
 */
async function getTotalCapitalInvested(investorId) {
  const result = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
     FROM capital_transactions
     WHERE investor_id = $1
       AND is_deleted = FALSE
       AND type IN ('deposit', 'admin_credit')
       AND status = ANY($2::TEXT[])`,
    [investorId, CAPITAL_CREDIT_STATUSES]
  );

  return toWholeInt(result.rows[0]?.total);
}

/**
 * Total revenue earned (credited, not reversed).
 *
 * @param {string} investorId
 * @returns {Promise<number>}
 */
async function getTotalRevenueEarned(investorId) {
  const result = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
     FROM revenue_credits
     WHERE investor_id = $1
       AND is_deleted = FALSE
       AND is_reversed = FALSE
       AND credit_type IN ('daily_auto', 'manual_credit', 'backdate')`,
    [investorId]
  );

  return toWholeInt(result.rows[0]?.total);
}

/**
 * Capital Balance = Total Approved Deposits (+ admin credits)
 *                 − Total Approved Capital Withdrawals (− admin debits)
 *
 * Does not subtract submitted/under_review pending (those are separate via
 * getPendingWithdrawal; display = capital − pending capital portion).
 *
 * @param {string} investorId
 * @returns {Promise<number>}
 */
export async function getCapitalBalance(investorId) {
  if (!isValidInvestorId(investorId)) {
    return 0;
  }

  try {
    const creditResult = await query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN type IN ('deposit', 'admin_credit')
            AND status = ANY($2::TEXT[])
           THEN amount
           WHEN type = 'admin_debit'
            AND status = ANY($2::TEXT[])
           THEN -amount
           ELSE 0
         END
       ), 0)::INTEGER AS net
       FROM capital_transactions
       WHERE investor_id = $1
         AND is_deleted = FALSE`,
      [investorId, CAPITAL_CREDIT_STATUSES]
    );

    const wdrTxResult = await query(
      `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
       FROM capital_transactions
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND type = 'withdrawal'
         AND status = ANY($2::TEXT[])`,
      [investorId, CAPITAL_APPROVED_WITHDRAWAL_STATUSES]
    );

    const wdrReqResult = await query(
      `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
       FROM capital_withdrawal_requests
       WHERE investor_id = $1
         AND account_type = 'capital'
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])`,
      [investorId, CAPITAL_APPROVED_WITHDRAWAL_STATUSES]
    );

    const netCredits = toWholeInt(creditResult.rows[0]?.net);
    const deductedTx = toWholeInt(wdrTxResult.rows[0]?.deducted);
    const deductedReq = toWholeInt(wdrReqResult.rows[0]?.deducted);

    return toWholeInt(netCredits - deductedTx - deductedReq);
  } catch (error) {
    logger.error(`[Balance] getCapitalBalance failed: ${error.message}`, {
      error,
      investorId,
    });
    return 0;
  }
}

/**
 * Revenue Balance = Total Revenue Credited − Total Revenue Withdrawn
 * (includes in-flight revenue withdrawals so balance never overstates available).
 *
 * @param {string} investorId
 * @returns {Promise<number>}
 */
export async function getRevenueBalance(investorId) {
  if (!isValidInvestorId(investorId)) {
    return 0;
  }

  try {
    const creditResult = await query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN credit_type IN ('daily_auto', 'manual_credit', 'backdate')
           THEN amount
           WHEN credit_type = 'manual_debit'
           THEN -amount
           ELSE 0
         END
       ), 0)::INTEGER AS net
       FROM revenue_credits
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND is_reversed = FALSE`,
      [investorId]
    );

    const wdrResult = await query(
      `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
       FROM capital_withdrawal_requests
       WHERE investor_id = $1
         AND account_type = 'revenue'
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])`,
      [investorId, REVENUE_WITHDRAWAL_STATUSES]
    );

    const netCredits = toWholeInt(creditResult.rows[0]?.net);
    const deducted = toWholeInt(wdrResult.rows[0]?.deducted);

    return toWholeInt(netCredits - deducted);
  } catch (error) {
    logger.error(`[Balance] getRevenueBalance failed: ${error.message}`, {
      error,
      investorId,
    });
    return 0;
  }
}

/**
 * Total Balance = Capital Balance + Revenue Balance
 *
 * @param {string} investorId
 * @returns {Promise<number>}
 */
export async function getTotalBalance(investorId) {
  if (!isValidInvestorId(investorId)) {
    return 0;
  }

  const [capital, revenue] = await Promise.all([
    getCapitalBalance(investorId),
    getRevenueBalance(investorId),
  ]);

  return toWholeInt(capital + revenue);
}

/**
 * Pending withdrawal = amounts in submitted / under_review
 * (capital + revenue withdrawal requests).
 *
 * @param {string} investorId
 * @returns {Promise<number>}
 */
export async function getPendingWithdrawal(investorId) {
  if (!isValidInvestorId(investorId)) {
    return 0;
  }

  try {
    const reqResult = await query(
      `SELECT COALESCE(SUM(amount), 0)::INTEGER AS pending
       FROM capital_withdrawal_requests
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])`,
      [investorId, PENDING_STATUSES]
    );

    const txResult = await query(
      `SELECT COALESCE(SUM(amount), 0)::INTEGER AS pending
       FROM capital_transactions
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND type = 'withdrawal'
         AND status = ANY($2::TEXT[])`,
      [investorId, PENDING_STATUSES]
    );

    return toWholeInt(
      toWholeInt(reqResult.rows[0]?.pending) +
        toWholeInt(txResult.rows[0]?.pending)
    );
  } catch (error) {
    logger.error(`[Balance] getPendingWithdrawal failed: ${error.message}`, {
      error,
      investorId,
    });
    return 0;
  }
}

/**
 * Displayed capital after holding pending capital withdrawals:
 * capitalBalance − pending capital withdrawals (submitted/under_review).
 *
 * @param {string} investorId
 * @returns {Promise<number>}
 */
export async function getDisplayedCapitalBalance(investorId) {
  if (!isValidInvestorId(investorId)) {
    return 0;
  }

  const capital = await getCapitalBalance(investorId);

  const pendingCapital = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS pending
     FROM capital_withdrawal_requests
     WHERE investor_id = $1
       AND account_type = 'capital'
       AND is_deleted = FALSE
       AND status = ANY($2::TEXT[])`,
    [investorId, PENDING_STATUSES]
  );

  const pendingTx = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS pending
     FROM capital_transactions
     WHERE investor_id = $1
       AND is_deleted = FALSE
       AND type = 'withdrawal'
       AND status = ANY($2::TEXT[])`,
    [investorId, PENDING_STATUSES]
  );

  return toWholeInt(
    capital -
      toWholeInt(pendingCapital.rows[0]?.pending) -
      toWholeInt(pendingTx.rows[0]?.pending)
  );
}

/**
 * Effective ROI = (Total Revenue Earned ÷ Total Capital Invested) × 100
 * Returns percentage rounded to 2 decimal places. 0 when capital is 0.
 *
 * @param {string} investorId
 * @returns {Promise<number>}
 */
export async function getEffectiveROI(investorId) {
  if (!isValidInvestorId(investorId)) {
    return 0;
  }

  try {
    const [revenueEarned, capitalInvested] = await Promise.all([
      getTotalRevenueEarned(investorId),
      getTotalCapitalInvested(investorId),
    ]);

    if (capitalInvested <= 0) {
      return 0;
    }

    // Two-decimal percentage as whole-number-safe math (no float drift)
    return Math.round((revenueEarned * 10000) / capitalInvested) / 100;
  } catch (error) {
    logger.error(`[Balance] getEffectiveROI failed: ${error.message}`, {
      error,
      investorId,
    });
    return 0;
  }
}

/**
 * Snapshot of all balance figures for an investor.
 *
 * @param {string} investorId
 * @returns {Promise<object>}
 */
export async function getBalanceSummary(investorId) {
  const [
    capitalBalance,
    revenueBalance,
    totalBalance,
    pendingWithdrawal,
    displayedCapitalBalance,
    effectiveROI,
  ] = await Promise.all([
    getCapitalBalance(investorId),
    getRevenueBalance(investorId),
    getTotalBalance(investorId),
    getPendingWithdrawal(investorId),
    getDisplayedCapitalBalance(investorId),
    getEffectiveROI(investorId),
  ]);

  return {
    capitalBalance,
    revenueBalance,
    totalBalance,
    pendingWithdrawal,
    displayedCapitalBalance,
    effectiveROI,
  };
}
