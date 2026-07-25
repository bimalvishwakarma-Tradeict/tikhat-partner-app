import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate, getISTParts } from '../utils/formatDate.js';
import {
  getBalanceSummary,
  getCapitalBalance,
} from '../services/balance.service.js';

const DASHBOARD_CACHE_SECONDS = 300;

const PROFILE_COMPLETION_FIELDS = Object.freeze([
  'full_name',
  'email',
  'mobile',
  'profile_photo_url',
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
]);

const CAPITAL_APPROVED_STATUSES = Object.freeze(['approved', 'completed']);
const CAPITAL_WDR_APPROVED_STATUSES = Object.freeze([
  'approved',
  'processed',
  'completed',
]);

const MONTH_LABELS = Object.freeze([
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
}

/**
 * @param {object} user
 * @returns {number}
 */
function computeProfileCompletion(user) {
  const filled = PROFILE_COMPLETION_FIELDS.filter((field) =>
    hasValue(user[field])
  ).length;
  return Math.round((filled * 100) / PROFILE_COMPLETION_FIELDS.length);
}

/**
 * Last 6 calendar months in IST (oldest → newest), including current month.
 * @returns {Array<{ year: number, month: number, label: string, month_start: string, next_month_start: string }>}
 */
function getLastSixMonthsIST() {
  const now = getISTParts(new Date());
  const months = [];

  for (let i = 5; i >= 0; i -= 1) {
    let year = now.year;
    let month = now.month - i;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const nextMonthStart = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    months.push({
      year,
      month,
      label: `${MONTH_LABELS[month - 1]} ${year}`,
      month_start: monthStart,
      next_month_start: nextMonthStart,
    });
  }

  return months;
}

/**
 * Capital balance as of a calendar date (exclusive upper bound, IST date string).
 * Includes capital_transactions and approved capital withdrawal requests.
 *
 * @param {string} investorId
 * @param {string} asOfExclusive - YYYY-MM-DD
 * @returns {Promise<number>}
 */
async function getCapitalBalanceAsOfDate(investorId, asOfExclusive) {
  const creditResult = await query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN type IN ('deposit', 'admin_credit') THEN amount
         WHEN type = 'admin_debit' THEN -amount
         WHEN type = 'withdrawal' THEN -amount
         ELSE 0
       END
     ), 0)::INTEGER AS net
     FROM capital_transactions
     WHERE investor_id = $1
       AND is_deleted = FALSE
       AND status = ANY($2::TEXT[])
       AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $3::date`,
    [investorId, [...CAPITAL_APPROVED_STATUSES], asOfExclusive]
  );

  const wdrResult = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
     FROM capital_withdrawal_requests
     WHERE investor_id = $1
       AND account_type = 'capital'
       AND is_deleted = FALSE
       AND status = ANY($2::TEXT[])
       AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $3::date`,
    [investorId, [...CAPITAL_WDR_APPROVED_STATUSES], asOfExclusive]
  );

  return Math.max(
    0,
    Math.round(Number(creditResult.rows[0]?.net) || 0) -
      Math.round(Number(wdrResult.rows[0]?.deducted) || 0)
  );
}

/**
 * @param {string} investorId
 * @returns {Promise<Array<object>>}
 */
async function buildMonthlyRevenueChart(investorId) {
  const months = getLastSixMonthsIST();

  const result = await query(
    `SELECT
       EXTRACT(YEAR FROM credit_date)::INTEGER AS year,
       EXTRACT(MONTH FROM credit_date)::INTEGER AS month,
       COALESCE(SUM(
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
       AND credit_date < $3::date
     GROUP BY 1, 2`,
    [
      investorId,
      months[0].month_start,
      months[months.length - 1].next_month_start,
    ]
  );

  const byKey = new Map(
    result.rows.map((row) => [`${row.year}-${row.month}`, Math.round(Number(row.total) || 0)])
  );

  return months.map((m) => {
    const amount = byKey.get(`${m.year}-${m.month}`) || 0;
    return {
      month: m.month,
      year: m.year,
      label: m.label,
      amount,
      amount_formatted: formatCurrency(amount),
    };
  });
}

/**
 * @param {string} investorId
 * @returns {Promise<Array<object>>}
 */
async function buildCapitalGrowthChart(investorId) {
  const months = getLastSixMonthsIST();
  const now = getISTParts(new Date());
  const chart = [];

  for (const m of months) {
    const isCurrent = m.year === now.year && m.month === now.month;
    const balance = isCurrent
      ? await getCapitalBalance(investorId)
      : await getCapitalBalanceAsOfDate(investorId, m.next_month_start);

    chart.push({
      month: m.month,
      year: m.year,
      label: m.label,
      capital_balance: balance,
      capital_balance_formatted: formatCurrency(balance),
    });
  }

  return chart;
}

/**
 * @param {string} investorId
 * @returns {Promise<object>}
 */
async function getInvestorDashboardProfile(investorId) {
  const result = await query(
    `SELECT id, full_name, email, mobile, profile_photo_url, date_of_birth,
            address, pan_number, pan_front_url, pan_back_url, aadhar_number,
            aadhar_front_url, aadhar_back_url, bank_account_number, bank_ifsc,
            bank_account_name, bank_name, kyc_status, joining_date,
            banner_dismissed, created_at
     FROM users
     WHERE id = $1
       AND is_deleted = FALSE
     LIMIT 1`,
    [investorId]
  );

  return result.rows[0] || null;
}

/**
 * @param {string} investorId
 * @returns {Promise<object[]>}
 */
async function getLastCapitalTransactions(investorId) {
  const result = await query(
    `SELECT id, transaction_id, type, amount, status, transfer_date,
            payment_date, utr_number, created_at
     FROM capital_transactions
     WHERE investor_id = $1
       AND is_deleted = FALSE
     ORDER BY created_at DESC
     LIMIT 5`,
    [investorId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    transaction_id: row.transaction_id,
    type: row.type,
    amount: Math.round(Number(row.amount) || 0),
    amount_formatted: formatCurrency(row.amount),
    status: row.status,
    date: formatDate(row.payment_date || row.transfer_date || row.created_at),
    created_at: row.created_at,
  }));
}

/**
 * @param {string} investorId
 * @returns {Promise<object[]>}
 */
async function getLastRevenueTransactions(investorId) {
  const result = await query(
    `SELECT id, transaction_id, credit_date, amount, credit_type,
            is_reversed, created_at
     FROM revenue_credits
     WHERE investor_id = $1
       AND is_deleted = FALSE
     ORDER BY credit_date DESC, created_at DESC
     LIMIT 5`,
    [investorId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    transaction_id: row.transaction_id,
    credit_type: row.credit_type,
    amount: Math.round(Number(row.amount) || 0),
    amount_formatted: formatCurrency(row.amount),
    is_reversed: row.is_reversed,
    date: formatDate(row.credit_date),
    created_at: row.created_at,
  }));
}

/**
 * GET /api/v1/investor/dashboard
 * Single optimized call for investor dashboard (client cache hint: 5 min).
 */
export async function getInvestorDashboard(req, res) {
  try {
    const investorId = req.user.userId;

    const user = await getInvestorDashboardProfile(investorId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'USER_NOT_FOUND',
      });
    }

    const [
      balances,
      lastCapital,
      lastRevenue,
      monthlyRevenueChart,
      capitalGrowthChart,
    ] = await Promise.all([
      getBalanceSummary(investorId),
      getLastCapitalTransactions(investorId),
      getLastRevenueTransactions(investorId),
      buildMonthlyRevenueChart(investorId),
      buildCapitalGrowthChart(investorId),
    ]);

    const joiningSource = user.joining_date || user.created_at;
    const joiningDate = joiningSource ? formatDate(joiningSource) : null;
    const profileCompletion = computeProfileCompletion(user);

    res.set(
      'Cache-Control',
      `private, max-age=${DASHBOARD_CACHE_SECONDS}`
    );

    return res.status(200).json({
      success: true,
      message: 'Dashboard data retrieved',
      data: {
        capital_balance: balances.capitalBalance,
        capital_balance_formatted: formatCurrency(balances.capitalBalance),
        revenue_balance: balances.revenueBalance,
        revenue_balance_formatted: formatCurrency(balances.revenueBalance),
        total_balance: balances.totalBalance,
        total_balance_formatted: formatCurrency(balances.totalBalance),
        pending_withdrawal: balances.pendingWithdrawal,
        pending_withdrawal_formatted: formatCurrency(
          balances.pendingWithdrawal
        ),
        effective_roi: balances.effectiveROI,
        joining_date: joiningDate,
        partner_since: joiningDate
          ? `Partner Since: ${joiningDate}`
          : null,
        last_5_capital_transactions: lastCapital,
        last_5_revenue_transactions: lastRevenue,
        monthly_revenue_chart: monthlyRevenueChart,
        capital_growth_chart: capitalGrowthChart,
        kyc_status: user.kyc_status,
        profile_completion_percentage: profileCompletion,
        banner_dismissed: Boolean(user.banner_dismissed),
      },
    });
  } catch (error) {
    logger.error(`[Dashboard] getInvestorDashboard: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard data',
      error: 'INTERNAL_ERROR',
    });
  }
}
