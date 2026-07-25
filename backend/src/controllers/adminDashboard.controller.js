import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate, getISTParts } from '../utils/formatDate.js';
import { getCachedSettings } from './settings.controller.js';
import {
  getCapitalBalanceAsOf,
  getActiveROI,
  calculateDailyAverage,
  getDaysInMonth,
  getISTDateParts,
  isRevenuePaused,
} from '../services/roi.service.js';

const PENDING_REQUEST_STATUSES = Object.freeze(['submitted', 'under_review']);
const WITHDRAWN_STATUSES = Object.freeze([
  'approved',
  'processed',
  'completed',
]);
const CAPITAL_CREDIT_STATUSES = Object.freeze(['approved', 'completed']);
const ACTIVE_TICKET_STATUSES = Object.freeze(['open', 'in_progress']);

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
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string | null}
 */
function parseDateParam(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const trimmed = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    const err = new Error(`${fieldName} must be YYYY-MM-DD`);
    err.code = 'VALIDATION_ERROR';
    err.statusCode = 400;
    throw err;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    const err = new Error(`${fieldName} is not a valid date`);
    err.code = 'VALIDATION_ERROR';
    err.statusCode = 400;
    throw err;
  }

  return trimmed;
}

/**
 * Format HH:MM (24h) as h:mm AM/PM.
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
 * Current IST month bounds [start, nextMonthStart).
 * @returns {{ start: string, next: string, year: number, month: number }}
 */
function getCurrentMonthBoundsIST() {
  const now = getISTParts(new Date());
  const start = `${now.year}-${String(now.month).padStart(2, '0')}-01`;
  let nextYear = now.year;
  let nextMonth = now.month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const next = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, next, year: now.year, month: now.month };
}

/**
 * Today's IST date YYYY-MM-DD.
 * @returns {string}
 */
function getTodayIST() {
  const now = getISTParts(new Date());
  return `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
}

/**
 * Investor status breakdown.
 * @returns {Promise<object>}
 */
async function getInvestorStats() {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active')::INTEGER AS active,
       COUNT(*) FILTER (WHERE status = 'paused')::INTEGER AS paused,
       COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending,
       COUNT(*) FILTER (
         WHERE status NOT IN ('deleted')
       )::INTEGER AS total
     FROM users
     WHERE is_deleted = FALSE`
  );

  const row = result.rows[0] || {};
  return {
    total: toWholeInt(row.total),
    active: toWholeInt(row.active),
    paused: toWholeInt(row.paused),
    pending: toWholeInt(row.pending),
  };
}

/**
 * Total capital under management (sum of investor capital balances).
 * @returns {Promise<number>}
 */
async function getTotalCapitalUnderManagement() {
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
     WHERE is_deleted = FALSE
       AND status = ANY($1::TEXT[])`,
    [[...CAPITAL_CREDIT_STATUSES]]
  );

  const wdrResult = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
     FROM capital_withdrawal_requests
     WHERE account_type = 'capital'
       AND is_deleted = FALSE
       AND status = ANY($1::TEXT[])`,
    [[...WITHDRAWN_STATUSES]]
  );

  return Math.max(
    0,
    toWholeInt(creditResult.rows[0]?.net) - toWholeInt(wdrResult.rows[0]?.deducted)
  );
}

/**
 * Total revenue balances across all investors.
 * @returns {Promise<number>}
 */
async function getTotalRevenueBalances() {
  const creditResult = await query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN credit_type IN ('daily_auto', 'manual_credit', 'backdate') THEN amount
         WHEN credit_type = 'manual_debit' THEN -amount
         ELSE 0
       END
     ), 0)::INTEGER AS net
     FROM revenue_credits
     WHERE is_deleted = FALSE
       AND is_reversed = FALSE`
  );

  const wdrResult = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
     FROM capital_withdrawal_requests
     WHERE account_type = 'revenue'
       AND is_deleted = FALSE
       AND status = ANY($1::TEXT[])`,
    [
      [
        'submitted',
        'under_review',
        'approved',
        'processed',
        'completed',
      ],
    ]
  );

  return Math.max(
    0,
    toWholeInt(creditResult.rows[0]?.net) - toWholeInt(wdrResult.rows[0]?.deducted)
  );
}

/**
 * Revenue credited in [from, to] inclusive (dates as YYYY-MM-DD).
 * @param {string} fromDate
 * @param {string} toDateInclusive
 * @returns {Promise<number>}
 */
async function getRevenueCreditedInRange(fromDate, toDateInclusive) {
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
 * Withdrawals completed/approved in range (capital + revenue).
 * @param {string} fromDate
 * @param {string} toExclusiveOrInclusive
 * @param {boolean} inclusiveEnd
 * @returns {Promise<number>}
 */
async function getWithdrawalsInRange(fromDate, toDate, inclusiveEnd = true) {
  const endOp = inclusiveEnd ? '<=' : '<';
  const result = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
     FROM capital_withdrawal_requests
     WHERE is_deleted = FALSE
       AND status = ANY($1::TEXT[])
       AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date)
           >= $2::date
       AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date)
           ${endOp} $3::date`,
    [[...WITHDRAWN_STATUSES], fromDate, toDate]
  );

  return toWholeInt(result.rows[0]?.total);
}

/**
 * Pending approvals: capital deposits + withdrawals + profile requests.
 * @returns {Promise<{ total: number, capital: number, withdrawals: number, profile: number }>}
 */
async function getPendingApprovalsCount() {
  const [capital, withdrawals, profile] = await Promise.all([
    query(
      `SELECT COUNT(*)::INTEGER AS c
       FROM capital_transactions
       WHERE is_deleted = FALSE
         AND type = 'deposit'
         AND status = ANY($1::TEXT[])`,
      [[...PENDING_REQUEST_STATUSES]]
    ),
    query(
      `SELECT COUNT(*)::INTEGER AS c
       FROM capital_withdrawal_requests
       WHERE is_deleted = FALSE
         AND status = ANY($1::TEXT[])`,
      [[...PENDING_REQUEST_STATUSES]]
    ),
    query(
      `SELECT COUNT(*)::INTEGER AS c
       FROM profile_update_requests
       WHERE status = 'pending'`
    ),
  ]);

  const capitalCount = toWholeInt(capital.rows[0]?.c);
  const withdrawalCount = toWholeInt(withdrawals.rows[0]?.c);
  const profileCount = toWholeInt(profile.rows[0]?.c);

  return {
    total: capitalCount + withdrawalCount + profileCount,
    capital: capitalCount,
    withdrawals: withdrawalCount,
    profile: profileCount,
  };
}

/**
 * @returns {Promise<number>}
 */
async function getActiveTicketsCount() {
  const result = await query(
    `SELECT COUNT(*)::INTEGER AS c
     FROM support_tickets
     WHERE status = ANY($1::TEXT[])`,
    [[...ACTIVE_TICKET_STATUSES]]
  );

  return toWholeInt(result.rows[0]?.c);
}

/**
 * Today's revenue schedule preview (deterministic daily averages).
 * @returns {Promise<object>}
 */
async function getTodayRevenueSchedule() {
  const settings = await getCachedSettings();
  const timeRaw = settings.revenue_credit_time || '18:00';
  const timeLabel = formatCreditTimeLabel(timeRaw);
  const today = getTodayIST();
  const { year, month } = getISTDateParts(today);
  const daysInMonth = getDaysInMonth(year, month);

  const eligible = await query(
    `SELECT u.id
     FROM users u
     LEFT JOIN revenue_credit_settings rcs ON rcs.investor_id = u.id
     WHERE u.is_deleted = FALSE
       AND u.status = 'active'
       AND COALESCE(rcs.is_paused, FALSE) = FALSE`
  );

  let totalAmount = 0;
  let investorCount = 0;

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
      if (amount > 0) {
        totalAmount = Math.round(totalAmount + amount);
        investorCount += 1;
      }
    } catch (error) {
      logger.warn(
        `[AdminDashboard] schedule estimate failed for ${row.id}: ${error.message}`
      );
    }
  }

  return {
    time: timeLabel,
    time_raw: timeRaw,
    investor_count: investorCount,
    total_amount: totalAmount,
    total_amount_formatted: formatCurrency(totalAmount),
    label: `${timeLabel}: ${investorCount} partners, ${formatCurrency(totalAmount)} total`,
  };
}

/**
 * Top 5 investors by capital balance.
 * @returns {Promise<object[]>}
 */
async function getTopInvestorsByCapital() {
  const result = await query(
    `WITH capital AS (
       SELECT
         investor_id,
         COALESCE(SUM(
           CASE
             WHEN type IN ('deposit', 'admin_credit') THEN amount
             WHEN type = 'admin_debit' THEN -amount
             WHEN type = 'withdrawal' THEN -amount
             ELSE 0
           END
         ), 0)::INTEGER AS tx_net
       FROM capital_transactions
       WHERE is_deleted = FALSE
         AND status = ANY($1::TEXT[])
       GROUP BY investor_id
     ),
     wdr AS (
       SELECT
         investor_id,
         COALESCE(SUM(amount), 0)::INTEGER AS deducted
       FROM capital_withdrawal_requests
       WHERE account_type = 'capital'
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])
       GROUP BY investor_id
     )
     SELECT
       u.id,
       u.full_name,
       u.email,
       GREATEST(COALESCE(c.tx_net, 0) - COALESCE(w.deducted, 0), 0)::INTEGER
         AS capital_balance
     FROM users u
     LEFT JOIN capital c ON c.investor_id = u.id
     LEFT JOIN wdr w ON w.investor_id = u.id
     WHERE u.is_deleted = FALSE
       AND u.status IN ('active', 'paused')
     ORDER BY capital_balance DESC, u.full_name ASC
     LIMIT 5`,
    [[...CAPITAL_CREDIT_STATUSES], [...WITHDRAWN_STATUSES]]
  );

  return result.rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    capital_balance: toWholeInt(row.capital_balance),
    capital_balance_formatted: formatCurrency(row.capital_balance),
  }));
}

/**
 * Top 5 investors by effective ROI.
 * @returns {Promise<object[]>}
 */
async function getTopInvestorsByRoi() {
  const result = await query(
    `WITH invested AS (
       SELECT
         investor_id,
         COALESCE(SUM(amount), 0)::INTEGER AS total_invested
       FROM capital_transactions
       WHERE is_deleted = FALSE
         AND type IN ('deposit', 'admin_credit')
         AND status = ANY($1::TEXT[])
       GROUP BY investor_id
     ),
     earned AS (
       SELECT
         investor_id,
         COALESCE(SUM(amount), 0)::INTEGER AS total_earned
       FROM revenue_credits
       WHERE is_deleted = FALSE
         AND is_reversed = FALSE
         AND credit_type IN ('daily_auto', 'manual_credit', 'backdate')
       GROUP BY investor_id
     )
     SELECT
       u.id,
       u.full_name,
       u.email,
       COALESCE(i.total_invested, 0)::INTEGER AS total_invested,
       COALESCE(e.total_earned, 0)::INTEGER AS total_earned,
       CASE
         WHEN COALESCE(i.total_invested, 0) <= 0 THEN 0
         ELSE ROUND((COALESCE(e.total_earned, 0)::NUMERIC * 10000)
                    / i.total_invested) / 100
       END AS effective_roi
     FROM users u
     LEFT JOIN invested i ON i.investor_id = u.id
     LEFT JOIN earned e ON e.investor_id = u.id
     WHERE u.is_deleted = FALSE
       AND u.status IN ('active', 'paused')
       AND COALESCE(i.total_invested, 0) > 0
     ORDER BY effective_roi DESC, total_earned DESC, u.full_name ASC
     LIMIT 5`,
    [[...CAPITAL_CREDIT_STATUSES]]
  );

  return result.rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    total_invested: toWholeInt(row.total_invested),
    total_earned: toWholeInt(row.total_earned),
    effective_roi: Math.round(Number(row.effective_roi) * 100) / 100,
  }));
}

/**
 * Recent activity feed (last 20).
 * @param {string | null} fromDate
 * @param {string | null} toDate
 * @returns {Promise<object[]>}
 */
async function getRecentActivity(fromDate, toDate) {
  const params = [];
  let dateFilterCapital = '';
  let dateFilterWdr = '';
  let dateFilterRev = '';
  let dateFilterTickets = '';
  let dateFilterProfile = '';

  if (fromDate && toDate) {
    params.push(fromDate, toDate);
    dateFilterCapital = `AND (ct.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date`;
    dateFilterWdr = `AND (wr.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date`;
    dateFilterRev = `AND rc.credit_date BETWEEN $1::date AND $2::date`;
    dateFilterTickets = `AND (st.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date`;
    dateFilterProfile = `AND (pr.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date`;
  }

  const result = await query(
    `
    (
      SELECT
        ct.created_at AS occurred_at,
        'capital_deposit'::TEXT AS activity_type,
        u.full_name AS actor_name,
        ct.transaction_id AS reference_id,
        ct.amount AS amount,
        NULL::TEXT AS extra
      FROM capital_transactions ct
      INNER JOIN users u ON u.id = ct.investor_id
      WHERE ct.is_deleted = FALSE
        AND ct.type = 'deposit'
        ${dateFilterCapital}
    )
    UNION ALL
    (
      SELECT
        wr.created_at,
        'withdrawal'::TEXT,
        u.full_name,
        wr.transaction_id,
        wr.amount,
        NULL::TEXT
      FROM capital_withdrawal_requests wr
      INNER JOIN users u ON u.id = wr.investor_id
      WHERE wr.is_deleted = FALSE
        ${dateFilterWdr}
    )
    UNION ALL
    (
      SELECT
        rc.created_at,
        'revenue_credit'::TEXT,
        u.full_name,
        rc.transaction_id,
        rc.amount,
        NULL::TEXT
      FROM revenue_credits rc
      INNER JOIN users u ON u.id = rc.investor_id
      WHERE rc.is_deleted = FALSE
        AND rc.is_reversed = FALSE
        AND rc.credit_type IN ('daily_auto', 'manual_credit', 'backdate')
        ${dateFilterRev}
    )
    UNION ALL
    (
      SELECT
        st.created_at,
        'support_ticket'::TEXT,
        u.full_name,
        st.ticket_id,
        NULL::INTEGER,
        st.subject
      FROM support_tickets st
      INNER JOIN users u ON u.id = st.investor_id
      WHERE TRUE
        ${dateFilterTickets}
    )
    UNION ALL
    (
      SELECT
        pr.created_at,
        'profile_request'::TEXT,
        u.full_name,
        pr.id,
        NULL::INTEGER,
        pr.field_name
      FROM profile_update_requests pr
      INNER JOIN users u ON u.id = pr.investor_id
      WHERE TRUE
        ${dateFilterProfile}
    )
    ORDER BY occurred_at DESC
    LIMIT 20
    `,
    params
  );

  return result.rows.map((row) => {
    let message = '';
    const amountLabel =
      row.amount === null ? null : formatCurrency(row.amount);

    switch (row.activity_type) {
      case 'capital_deposit':
        message = `Investor ${row.actor_name} submitted capital deposit — ${amountLabel}`;
        break;
      case 'withdrawal':
        message = `Investor ${row.actor_name} submitted withdrawal request — ${amountLabel}`;
        break;
      case 'revenue_credit':
        message = `Revenue credited to ${row.actor_name} — ${amountLabel}`;
        break;
      case 'support_ticket':
        message = `Investor ${row.actor_name} raised support ticket — ${row.extra || ''}`;
        break;
      case 'profile_request':
        message = `Investor ${row.actor_name} submitted profile update — ${row.extra || ''}`;
        break;
      default:
        message = `${row.actor_name} — activity`;
    }

    return {
      occurred_at: row.occurred_at,
      date: row.occurred_at ? formatDate(row.occurred_at) : null,
      activity_type: row.activity_type,
      actor_name: row.actor_name,
      message,
      reference_id: row.reference_id,
      amount: row.amount === null ? null : toWholeInt(row.amount),
      amount_formatted: amountLabel,
    };
  });
}

/**
 * GET /api/v1/admin/dashboard
 * Query: from?, to? (YYYY-MM-DD) for date-range filtered stats
 */
export async function getAdminDashboard(req, res) {
  try {
    const fromDate = parseDateParam(req.query.from, 'from');
    const toDate = parseDateParam(req.query.to, 'to');

    if ((fromDate && !toDate) || (!fromDate && toDate)) {
      return res.status(400).json({
        success: false,
        message: 'Both from and to are required when filtering by date range',
        error: 'VALIDATION_ERROR',
      });
    }

    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({
        success: false,
        message: 'from must be on or before to',
        error: 'VALIDATION_ERROR',
      });
    }

    const today = getTodayIST();
    const monthBounds = getCurrentMonthBoundsIST();

    const revenueFrom = fromDate || today;
    const revenueTo = toDate || today;
    const financeFrom = fromDate || monthBounds.start;
    const monthRevenueTo = fromDate ? toDate : today;

    const [
      totalInvestors,
      totalCapital,
      totalRevenueBalances,
      revenueToday,
      monthlyRevenue,
      pendingApprovals,
      activeTickets,
      todayRevenueSchedule,
      topByCapital,
      topByRoi,
      monthlyWithdrawals,
      recentActivity,
    ] = await Promise.all([
      getInvestorStats(),
      getTotalCapitalUnderManagement(),
      getTotalRevenueBalances(),
      getRevenueCreditedInRange(revenueFrom, revenueTo),
      getRevenueCreditedInRange(financeFrom, monthRevenueTo),
      getPendingApprovalsCount(),
      getActiveTicketsCount(),
      getTodayRevenueSchedule(),
      getTopInvestorsByCapital(),
      getTopInvestorsByRoi(),
      toDate
        ? getWithdrawalsInRange(financeFrom, toDate, true)
        : getWithdrawalsInRange(financeFrom, monthBounds.next, false),
      getRecentActivity(fromDate, toDate),
    ]);

    const netLiability = Math.round(totalCapital + totalRevenueBalances);

    return res.status(200).json({
      success: true,
      message: 'Admin dashboard data retrieved',
      data: {
        date_range: fromDate
          ? { from: fromDate, to: toDate }
          : { from: null, to: null },
        total_investors: totalInvestors,
        total_capital: totalCapital,
        total_capital_formatted: formatCurrency(totalCapital),
        revenue_today: revenueToday,
        revenue_today_formatted: formatCurrency(revenueToday),
        pending_approvals_count: pendingApprovals.total,
        pending_approvals_breakdown: pendingApprovals,
        active_tickets_count: activeTickets,
        today_revenue_schedule: todayRevenueSchedule,
        top_investors_by_capital: topByCapital,
        top_investors_by_roi: topByRoi,
        financial_summary: {
          total_capital: totalCapital,
          total_capital_formatted: formatCurrency(totalCapital),
          monthly_revenue: monthlyRevenue,
          monthly_revenue_formatted: formatCurrency(monthlyRevenue),
          monthly_withdrawals: monthlyWithdrawals,
          monthly_withdrawals_formatted: formatCurrency(monthlyWithdrawals),
          net_liability: netLiability,
          net_liability_formatted: formatCurrency(netLiability),
          period: fromDate
            ? { from: fromDate, to: toDate }
            : {
                from: monthBounds.start,
                to: today,
                label: 'current_month',
              },
        },
        recent_activity: recentActivity,
      },
    });
  } catch (error) {
    if (error.statusCode === 400 || error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: 'VALIDATION_ERROR',
      });
    }

    logger.error(`[AdminDashboard] getAdminDashboard: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin dashboard data',
      error: 'INTERNAL_ERROR',
    });
  }
}
