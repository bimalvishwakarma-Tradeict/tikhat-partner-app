import cron from 'node-cron';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { TIMEZONE, getISTParts } from '../utils/formatDate.js';
import { sendEmail } from '../services/email.service.js';

const JOB_NAME = 'monthly_summary_email';
/** 12:00 AM IST on the 1st = 18:30 UTC on the last day of the previous month.
 *  Scheduled daily at 18:30 UTC; callback only runs when IST day is 1. */
const CRON_EXPRESSION = '30 18 * * *';

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

const WITHDRAWN_STATUSES = Object.freeze([
  'approved',
  'processed',
  'completed',
]);

const CAPITAL_STATUSES = Object.freeze(['approved', 'completed']);

/**
 * @param {string} jobName
 * @returns {Promise<string>}
 */
async function insertCronLog(jobName) {
  const result = await query(
    `INSERT INTO cron_job_logs (
       job_name,
       started_at,
       status
     ) VALUES ($1, NOW(), 'running')
     RETURNING id`,
    [jobName]
  );
  return result.rows[0].id;
}

/**
 * @param {string} logId
 * @param {object} update
 */
async function updateCronLog(
  logId,
  {
    status,
    processedCount = 0,
    failedCount = 0,
    totalAmount = 0,
    errorDetails = null,
  }
) {
  await query(
    `UPDATE cron_job_logs
     SET status = $2,
         completed_at = NOW(),
         processed_count = $3,
         failed_count = $4,
         total_amount = $5,
         error_details = $6::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [
      logId,
      status,
      processedCount,
      failedCount,
      totalAmount,
      errorDetails === null ? null : JSON.stringify(errorDetails),
    ]
  );
}

/**
 * Previous calendar month in IST (or override).
 * @param {{ year?: number, month?: number }} [options]
 * @returns {{ year: number, month: number, monthStart: string, nextMonthStart: string, monthLabel: string, referenceId: string }}
 */
export function getPreviousMonthBoundsIST(options = {}) {
  const now = getISTParts(new Date());
  let year = options.year;
  let month = options.month;

  if (!year || !month) {
    year = now.year;
    month = now.month - 1;
    if (month <= 0) {
      month = 12;
      year -= 1;
    }
  }

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const nextMonthStart = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  return {
    year,
    month,
    monthStart,
    nextMonthStart,
    monthLabel: `${MONTH_LABELS[month - 1]} ${year}`,
    referenceId: `monthly-summary-${year}-${String(month).padStart(2, '0')}`,
  };
}

/**
 * Active + paused investors (pending excluded per AC).
 * @returns {Promise<object[]>}
 */
async function getSummaryInvestors() {
  const result = await query(
    `SELECT id, full_name, email, status
     FROM users
     WHERE is_deleted = FALSE
       AND status IN ('active', 'paused')
     ORDER BY created_at ASC`
  );
  return result.rows;
}

/**
 * Capital balance as of exclusive date (YYYY-MM-DD).
 * @param {string} investorId
 * @param {string} asOfExclusive
 * @returns {Promise<number>}
 */
async function getCapitalAsOf(investorId, asOfExclusive) {
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
    [investorId, [...CAPITAL_STATUSES], asOfExclusive]
  );

  const wdrResult = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
     FROM capital_withdrawal_requests
     WHERE investor_id = $1
       AND account_type = 'capital'
       AND is_deleted = FALSE
       AND status = ANY($2::TEXT[])
       AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $3::date`,
    [investorId, [...WITHDRAWN_STATUSES], asOfExclusive]
  );

  return Math.max(
    0,
    Math.round(Number(creditResult.rows[0]?.net) || 0) -
      Math.round(Number(wdrResult.rows[0]?.deducted) || 0)
  );
}

/**
 * Revenue balance as of exclusive end date.
 * @param {string} investorId
 * @param {string} asOfExclusive
 * @returns {Promise<number>}
 */
async function getRevenueBalanceAsOf(investorId, asOfExclusive) {
  const creditResult = await query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN credit_type IN ('daily_auto', 'manual_credit', 'backdate') THEN amount
         WHEN credit_type = 'manual_debit' THEN -amount
         ELSE 0
       END
     ), 0)::INTEGER AS net
     FROM revenue_credits
     WHERE investor_id = $1
       AND is_deleted = FALSE
       AND is_reversed = FALSE
       AND credit_date < $2::date`,
    [investorId, asOfExclusive]
  );

  const wdrResult = await query(
    `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
     FROM capital_withdrawal_requests
     WHERE investor_id = $1
       AND account_type = 'revenue'
       AND is_deleted = FALSE
       AND status = ANY($2::TEXT[])
       AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $3::date`,
    [investorId, [...WITHDRAWN_STATUSES], asOfExclusive]
  );

  return Math.max(
    0,
    Math.round(Number(creditResult.rows[0]?.net) || 0) -
      Math.round(Number(wdrResult.rows[0]?.deducted) || 0)
  );
}

/**
 * @param {string} investorId
 * @param {object} bounds
 * @returns {Promise<object>}
 */
export async function buildInvestorMonthStats(investorId, bounds) {
  const { monthStart, nextMonthStart } = bounds;

  const [revenueResult, capitalWdr, revenueWdr, openingCapital, closingCapital, closingRevenue] =
    await Promise.all([
      query(
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
           AND credit_date < $3::date`,
        [investorId, monthStart, nextMonthStart]
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
         FROM capital_withdrawal_requests
         WHERE investor_id = $1
           AND account_type = 'capital'
           AND is_deleted = FALSE
           AND status = ANY($2::TEXT[])
           AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) >= $3::date
           AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $4::date`,
        [investorId, [...WITHDRAWN_STATUSES], monthStart, nextMonthStart]
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0)::INTEGER AS total
         FROM capital_withdrawal_requests
         WHERE investor_id = $1
           AND account_type = 'revenue'
           AND is_deleted = FALSE
           AND status = ANY($2::TEXT[])
           AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) >= $3::date
           AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $4::date`,
        [investorId, [...WITHDRAWN_STATUSES], monthStart, nextMonthStart]
      ),
      getCapitalAsOf(investorId, monthStart),
      getCapitalAsOf(investorId, nextMonthStart),
      getRevenueBalanceAsOf(investorId, nextMonthStart),
    ]);

  const totalRevenueCredited = Math.round(
    Number(revenueResult.rows[0]?.total) || 0
  );
  const capitalWithdrawn = Math.round(Number(capitalWdr.rows[0]?.total) || 0);
  const revenueWithdrawn = Math.round(Number(revenueWdr.rows[0]?.total) || 0);

  return {
    totalRevenueCredited,
    capitalWithdrawn,
    revenueWithdrawn,
    totalWithdrawals: Math.round(capitalWithdrawn + revenueWithdrawn),
    openingCapital,
    closingCapital,
    capitalBalance: closingCapital,
    closingRevenueBalance: closingRevenue,
    revenueBalance: closingRevenue,
  };
}

/**
 * Whether monthly-summary already queued/sent for this investor + month.
 * @param {string} email
 * @param {string} referenceId
 * @returns {Promise<boolean>}
 */
async function wasSummaryAlreadySent(email, referenceId) {
  const result = await query(
    `SELECT id
     FROM email_logs
     WHERE recipient_email = $1
       AND template_name = 'monthly-summary'
       AND reference_id = $2
       AND status IN ('queued', 'sent', 'retrying')
     LIMIT 1`,
    [email.trim().toLowerCase(), referenceId]
  );
  return result.rows.length > 0;
}

/**
 * Run monthly summary email job once.
 * @param {{ year?: number, month?: number }} [options] - month being summarized
 * @returns {Promise<object>}
 */
export async function runMonthlySummaryJob(options = {}) {
  let logId = null;
  let processedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors = [];

  try {
    logId = await insertCronLog(JOB_NAME);
    const bounds = getPreviousMonthBoundsIST(options);
    const investors = await getSummaryInvestors();

    for (const investor of investors) {
      try {
        if (!investor.email) {
          skippedCount += 1;
          continue;
        }

        const already = await wasSummaryAlreadySent(
          investor.email,
          bounds.referenceId
        );
        if (already) {
          skippedCount += 1;
          continue;
        }

        const stats = await buildInvestorMonthStats(investor.id, bounds);

        await sendEmail(investor.email, 'monthly-summary', {
          investorName: investor.full_name || 'Tikhat Partner',
          monthLabel: bounds.monthLabel,
          totalRevenueCredited: stats.totalRevenueCredited,
          capitalBalance: stats.closingCapital,
          revenueWithdrawn: stats.revenueWithdrawn,
          capitalWithdrawn: stats.capitalWithdrawn,
          closingRevenueBalance: stats.closingRevenueBalance,
          referenceId: bounds.referenceId,
          recipientType: 'investor',
        });

        processedCount += 1;
      } catch (error) {
        failedCount += 1;
        errors.push({
          investorId: investor.id,
          email: investor.email,
          message: error.message,
        });
        logger.error(
          `[Cron] ${JOB_NAME} failed for ${investor.id}: ${error.message}`,
          { error }
        );
      }
    }

    const status =
      failedCount === 0
        ? 'success'
        : processedCount > 0
          ? 'partial'
          : 'failed';

    await updateCronLog(logId, {
      status,
      processedCount,
      failedCount,
      errorDetails: {
        monthLabel: bounds.monthLabel,
        referenceId: bounds.referenceId,
        investors: investors.length,
        skippedCount,
        errors,
      },
    });

    logger.info(`[Cron] ${JOB_NAME} completed`, {
      monthLabel: bounds.monthLabel,
      investors: investors.length,
      processedCount,
      skippedCount,
      failedCount,
    });

    return {
      status,
      logId,
      monthLabel: bounds.monthLabel,
      referenceId: bounds.referenceId,
      investors: investors.length,
      processedCount,
      skippedCount,
      failedCount,
    };
  } catch (error) {
    if (logId) {
      try {
        await updateCronLog(logId, {
          status: 'failed',
          processedCount,
          failedCount: failedCount + 1,
          errorDetails: { message: error.message },
        });
      } catch (logError) {
        logger.error(`[Cron] ${JOB_NAME} failed to update cron log`, {
          error: logError,
        });
      }
    }

    logger.error(`[Cron] ${JOB_NAME} failed`, { error });
    return {
      status: 'failed',
      logId,
      processedCount,
      failedCount,
      error: error.message,
    };
  }
}

/**
 * If today is 1st IST (server recovery catch-up), run summary job.
 * Idempotent via email_logs — safe to call on every boot on the 1st.
 */
async function maybeCatchUpOnFirstOfMonth() {
  try {
    const { day } = getISTParts(new Date());
    if (day !== 1) {
      return;
    }
    logger.info(
      `[Cron] ${JOB_NAME} catch-up: 1st of month detected, running summary`
    );
    await runMonthlySummaryJob();
  } catch (error) {
    logger.error(`[Cron] ${JOB_NAME} catch-up failed: ${error.message}`, {
      error,
    });
  }
}

/**
 * Schedule monthly summary emails at 12:00 AM IST on the 1st.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startMonthlySummaryCron() {
  const task = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      const { day } = getISTParts(new Date());
      if (day !== 1) {
        return;
      }
      await runMonthlySummaryJob();
    },
    {
      scheduled: true,
    }
  );

  logger.info(`[Cron] ${JOB_NAME} registered`, {
    schedule: CRON_EXPRESSION,
    description: 'Monthly summary emails at 12:00 AM IST on the 1st (18:30 UTC)',
  });

  // Same-day recovery if server was down at midnight on the 1st
  setImmediate(() => {
    maybeCatchUpOnFirstOfMonth();
  });

  return task;
}

export const MONTHLY_SUMMARY_CRON = Object.freeze({
  JOB_NAME,
  CRON_EXPRESSION,
  TIMEZONE,
});
