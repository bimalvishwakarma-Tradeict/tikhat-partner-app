import cron from 'node-cron';
import { query, pool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { TIMEZONE, formatDate } from '../utils/formatDate.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import {
  getDailyAmount,
  getActiveROI,
  getCapitalBalanceAsOf,
  getISTDateParts,
  getMonthlyExpected,
  updateMonthlyTracking,
} from '../services/roi.service.js';
import {
  generateTransactionId,
  TRANSACTION_TYPES,
} from '../services/transaction.service.js';
import { getRevenueBalance } from '../services/balance.service.js';
import { createNotification, NOTIFICATION_TYPES } from '../services/notification.service.js';
import { sendEmail } from '../services/email.service.js';
import { getActiveAdmins } from '../models/user.model.js';

const JOB_NAME = 'revenue_credit';
const SETTINGS_KEY = 'revenue_credit_time';
const DEFAULT_CREDIT_TIME = '18:00';
const SETTINGS_POLL_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS =
  Number(process.env.REVENUE_CREDIT_RETRY_DELAY_MS) || 5 * 60 * 1000;

/** @type {import('node-cron').ScheduledTask | null} */
let scheduledTask = null;
/** @type {string | null} */
let currentCronExpression = null;
/** @type {ReturnType<typeof setInterval> | null} */
let settingsWatcher = null;
/** @type {Promise<void> | null} */
let runningJob = null;

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
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse HH:MM from global_settings into a cron expression (minute hour * * *).
 * @param {string} value
 * @returns {{ hour: number, minute: number, expression: string }}
 */
export function parseRevenueCreditTime(value) {
  const raw = String(value || DEFAULT_CREDIT_TIME).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);

  if (!match) {
    logger.warn(`[Cron] ${JOB_NAME} invalid credit time "${raw}", using ${DEFAULT_CREDIT_TIME}`);
    return parseRevenueCreditTime(DEFAULT_CREDIT_TIME);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    logger.warn(`[Cron] ${JOB_NAME} out-of-range credit time "${raw}", using ${DEFAULT_CREDIT_TIME}`);
    return parseRevenueCreditTime(DEFAULT_CREDIT_TIME);
  }

  return {
    hour,
    minute,
    expression: `${minute} ${hour} * * *`,
  };
}

/**
 * Load global revenue credit time (IST).
 * @returns {Promise<string>}
 */
export async function loadRevenueCreditTime() {
  const result = await query(
    `SELECT value
     FROM global_settings
     WHERE key = $1
     LIMIT 1`,
    [SETTINGS_KEY]
  );

  return result.rows[0]?.value || DEFAULT_CREDIT_TIME;
}

/**
 * Active investors eligible for daily credit (non-paused settings).
 * @returns {Promise<object[]>}
 */
async function getEligibleInvestors() {
  const result = await query(
    `SELECT
       u.id,
       u.full_name,
       u.email,
       u.status
     FROM users u
     LEFT JOIN revenue_credit_settings rcs
       ON rcs.investor_id = u.id
     WHERE u.is_deleted = FALSE
       AND u.status = 'active'
       AND COALESCE(rcs.is_paused, FALSE) = FALSE
     ORDER BY u.created_at ASC`
  );

  return result.rows;
}

/**
 * Idempotency: already has a non-reversed daily_auto credit for date.
 * @param {string} investorId
 * @param {string} dateStr
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<boolean>}
 */
async function hasDailyCreditToday(investorId, dateStr, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT id
     FROM revenue_credits
     WHERE investor_id = $1
       AND credit_date = $2::DATE
       AND credit_type = 'daily_auto'
       AND is_deleted = FALSE
       AND is_reversed = FALSE
     LIMIT 1`,
    [investorId, dateStr]
  );

  return result.rows.length > 0;
}

/**
 * Fire-and-forget investor notification + email.
 * @param {object} investor
 * @param {object} credit
 * @param {number} revenueBalance
 */
function notifyInvestorCreditAsync(investor, credit, revenueBalance) {
  const title = 'Revenue credited';
  const body = `${formatCurrency(credit.amount)} credited on ${formatDate(credit.credit_date)}. ID: ${credit.transaction_id}`;

  createNotification(
    investor.id,
    title,
    body,
    NOTIFICATION_TYPES.TRANSACTION,
    credit.transaction_id,
    'revenue_credit'
  ).catch((error) => {
    logger.error(`[Cron] ${JOB_NAME} notification failed: ${error.message}`, {
      investorId: investor.id,
      error,
    });
  });

  sendEmail(investor.email, 'revenue-credit', {
    investorName: investor.full_name,
    amount: credit.amount,
    creditDate: credit.credit_date,
    runningBalance: revenueBalance,
    transactionId: credit.transaction_id,
    referenceId: credit.transaction_id,
  }).catch((error) => {
    logger.error(`[Cron] ${JOB_NAME} email failed: ${error.message}`, {
      investorId: investor.id,
      error,
    });
  });
}

/**
 * Alert all active admins after a permanent credit failure.
 * @param {object} investor
 * @param {Error} error
 */
async function alertAdminsOfCreditFailure(investor, error) {
  try {
    const admins = await getActiveAdmins();
    const body = [
      `Daily revenue credit failed after retry.`,
      `Investor: ${investor.full_name}`,
      `Email: ${investor.email}`,
      `ID: ${investor.id}`,
      `Error: ${error.message}`,
    ].join('\n');

    await Promise.all(
      admins.map((admin) =>
        sendEmail(admin.email, 'custom-notification', {
          investorName: admin.full_name || 'Admin',
          subjectTitle: 'Revenue credit failure — Tikhat Partner',
          body,
        }).catch((emailError) => {
          logger.error(
            `[Cron] ${JOB_NAME} admin alert email failed: ${emailError.message}`,
            { adminId: admin.id, error: emailError }
          );
        })
      )
    );
  } catch (alertError) {
    logger.error(`[Cron] ${JOB_NAME} admin alert failed: ${alertError.message}`, {
      error: alertError,
    });
  }
}

/**
 * Credit one investor for the given IST date (idempotent).
 * @param {object} investor
 * @param {string} dateStr - YYYY-MM-DD IST
 * @param {string | null} cronJobId
 * @returns {Promise<{ status: string, amount: number, credit?: object }>}
 */
export async function creditInvestorForDate(investor, dateStr, cronJobId = null) {
  if (await hasDailyCreditToday(investor.id, dateStr)) {
    return { status: 'already_credited', amount: 0 };
  }

  const amount = Math.round(await getDailyAmount(investor.id, dateStr));

  if (amount <= 0) {
    return { status: 'skipped_zero', amount: 0 };
  }

  const { year, month } = getISTDateParts(dateStr);
  const [roiPercentage, capitalAtTime] = await Promise.all([
    getActiveROI(investor.id, dateStr),
    getCapitalBalanceAsOf(investor.id, dateStr),
  ]);
  // Refresh expected for tracking row (pro-rated / segmented)
  await getMonthlyExpected(investor.id, year, month);

  const client = await pool.connect();
  let credit = null;

  try {
    await client.query('BEGIN');

    // Re-check inside transaction to avoid races
    if (await hasDailyCreditToday(investor.id, dateStr, client)) {
      await client.query('ROLLBACK');
      return { status: 'already_credited', amount: 0 };
    }

    const transactionId = await generateTransactionId(TRANSACTION_TYPES.REV_CR, {
      client,
    });

    const insertResult = await client.query(
      `INSERT INTO revenue_credits (
         transaction_id,
         investor_id,
         credit_date,
         amount,
         credit_type,
         roi_percentage_applied,
         capital_at_time,
         cron_job_id
       ) VALUES ($1, $2, $3::DATE, $4, 'daily_auto', $5, $6, $7)
       RETURNING
         id,
         transaction_id,
         investor_id,
         credit_date,
         amount,
         credit_type,
         roi_percentage_applied,
         capital_at_time,
         cron_job_id,
         created_at`,
      [
        transactionId,
        investor.id,
        dateStr,
        amount,
        (() => {
          const roi = Number.parseFloat(String(roiPercentage));
          return Number.isFinite(roi) && roi > 0
            ? Number.parseFloat(roi.toFixed(2))
            : null;
        })(),
        Math.round(capitalAtTime),
        cronJobId,
      ]
    );

    credit = insertResult.rows[0];

    await updateMonthlyTracking(investor.id, year, month, amount, {
      client,
      asOfDate: dateStr,
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');

    // Unique index race → treat as already credited
    if (error && error.code === '23505') {
      return { status: 'already_credited', amount: 0 };
    }

    throw error;
  } finally {
    client.release();
  }

  let revenueBalance = amount;
  try {
    revenueBalance = await getRevenueBalance(investor.id);
  } catch (balanceError) {
    logger.warn(
      `[Cron] ${JOB_NAME} could not load revenue balance for notification: ${balanceError.message}`,
      { investorId: investor.id }
    );
  }

  notifyInvestorCreditAsync(investor, credit, revenueBalance);

  return { status: 'credited', amount, credit };
}

/**
 * Process a list of investors; returns successes and failures.
 * @param {object[]} investors
 * @param {string} dateStr
 * @param {string | null} cronJobId
 */
async function processInvestors(investors, dateStr, cronJobId) {
  const credited = [];
  const skipped = [];
  const failed = [];
  let totalAmount = 0;

  for (const investor of investors) {
    try {
      const result = await creditInvestorForDate(investor, dateStr, cronJobId);

      if (result.status === 'credited') {
        credited.push({ investorId: investor.id, amount: result.amount });
        totalAmount += result.amount;
      } else {
        skipped.push({
          investorId: investor.id,
          reason: result.status,
        });
      }
    } catch (error) {
      logger.error(
        `[Cron] ${JOB_NAME} investor failed: ${error.message}`,
        { investorId: investor.id, error }
      );
      failed.push({ investor, error });
    }
  }

  return { credited, skipped, failed, totalAmount };
}

/**
 * Run the daily revenue credit job (IST calendar date).
 * @param {{ dateStr?: string, retryDelayMs?: number }} [options]
 * @returns {Promise<object>}
 */
export async function runRevenueCreditJob(options = {}) {
  if (runningJob) {
    logger.warn(`[Cron] ${JOB_NAME} already running — skipping overlapping start`);
    return { status: 'skipped_overlap' };
  }

  let resolveRunning;
  runningJob = new Promise((resolve) => {
    resolveRunning = resolve;
  });

  let logId = null;
  const retryDelayMs =
    options.retryDelayMs != null ? options.retryDelayMs : RETRY_DELAY_MS;

  try {
    const todayParts = getISTDateParts(options.dateStr || new Date());
    const dateStr = options.dateStr || todayParts.dateStr;

    logId = await insertCronLog(JOB_NAME);

    const investors = await getEligibleInvestors();
    const firstPass = await processInvestors(investors, dateStr, logId);

    let credited = [...firstPass.credited];
    let skipped = [...firstPass.skipped];
    let totalAmount = firstPass.totalAmount;
    const permanentFailures = [];

    if (firstPass.failed.length > 0) {
      logger.info(
        `[Cron] ${JOB_NAME} retrying ${firstPass.failed.length} investor(s) after ${retryDelayMs}ms`
      );
      await sleep(retryDelayMs);

      for (const item of firstPass.failed) {
        try {
          const result = await creditInvestorForDate(
            item.investor,
            dateStr,
            logId
          );

          if (result.status === 'credited') {
            credited.push({
              investorId: item.investor.id,
              amount: result.amount,
            });
            totalAmount += result.amount;
          } else {
            skipped.push({
              investorId: item.investor.id,
              reason: result.status,
            });
          }
        } catch (error) {
          permanentFailures.push({
            investorId: item.investor.id,
            email: item.investor.email,
            fullName: item.investor.full_name,
            message: error.message,
          });

          logger.error(
            `[Cron] ${JOB_NAME} retry failed for investor ${item.investor.id}: ${error.message}`,
            { error }
          );

          await alertAdminsOfCreditFailure(item.investor, error);
        }
      }
    }

    const failedCount = permanentFailures.length;
    const processedCount = credited.length;
    const status =
      failedCount === 0
        ? 'success'
        : processedCount > 0 || skipped.length > 0
          ? 'partial'
          : 'failed';

    const summary = {
      date: dateStr,
      totalInvestors: investors.length,
      creditedCount: credited.length,
      skippedCount: skipped.length,
      failedCount,
      totalAmount: Math.round(totalAmount),
      failures: permanentFailures,
    };

    await updateCronLog(logId, {
      status,
      processedCount,
      failedCount,
      totalAmount: Math.round(totalAmount),
      errorDetails: summary,
    });

    logger.info(`[Cron] ${JOB_NAME} completed`, summary);

    return {
      status,
      logId,
      ...summary,
    };
  } catch (error) {
    if (logId) {
      try {
        await updateCronLog(logId, {
          status: 'failed',
          failedCount: 1,
          errorDetails: { message: error.message },
        });
      } catch (logError) {
        logger.error(`[Cron] ${JOB_NAME} failed to update cron log`, {
          error: logError,
        });
      }
    }

    logger.error(`[Cron] ${JOB_NAME} failed`, { error });

    try {
      const admins = await getActiveAdmins();
      await Promise.all(
        admins.map((admin) =>
          sendEmail(admin.email, 'custom-notification', {
            investorName: admin.full_name || 'Admin',
            subjectTitle: `Cron job failed: ${JOB_NAME}`,
            body: `The revenue credit cron failed: ${error.message}`,
          }).catch(() => {})
        )
      );
    } catch {
      // alert best-effort
    }

    return {
      status: 'failed',
      logId,
      error: error.message,
    };
  } finally {
    resolveRunning();
    runningJob = null;
  }
}

/**
 * Apply (or re-apply) the cron schedule from global_settings.
 * @returns {Promise<{ expression: string, time: string, rescheduled: boolean }>}
 */
export async function ensureRevenueCreditSchedule() {
  const timeValue = await loadRevenueCreditTime();
  const { expression, hour, minute } = parseRevenueCreditTime(timeValue);

  if (scheduledTask && currentCronExpression === expression) {
    return {
      expression,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      rescheduled: false,
    };
  }

  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info(`[Cron] ${JOB_NAME} previous schedule stopped`, {
      previous: currentCronExpression,
    });
  }

  scheduledTask = cron.schedule(
    expression,
    async () => {
      await runRevenueCreditJob();
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  );

  currentCronExpression = expression;

  logger.info(`[Cron] ${JOB_NAME} registered`, {
    schedule: expression,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    timezone: TIMEZONE,
    description: 'Daily revenue credit at admin-configured IST time',
  });

  return {
    expression,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    rescheduled: true,
  };
}

/**
 * Start revenue credit cron + 5-minute settings watcher for reschedule.
 * @returns {{ stop: () => void }}
 */
export function startRevenueCreditCron() {
  ensureRevenueCreditSchedule().catch((error) => {
    logger.error(
      `[Cron] ${JOB_NAME} initial schedule failed: ${error.message}`,
      { error }
    );
  });

  if (settingsWatcher) {
    clearInterval(settingsWatcher);
  }

  settingsWatcher = setInterval(() => {
    ensureRevenueCreditSchedule().catch((error) => {
      logger.error(
        `[Cron] ${JOB_NAME} schedule refresh failed: ${error.message}`,
        { error }
      );
    });
  }, SETTINGS_POLL_MS);

  return {
    stop() {
      if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
      }
      if (settingsWatcher) {
        clearInterval(settingsWatcher);
        settingsWatcher = null;
      }
      currentCronExpression = null;
    },
  };
}

export const REVENUE_CREDIT_CRON = Object.freeze({
  JOB_NAME,
  SETTINGS_KEY,
  DEFAULT_CREDIT_TIME,
  SETTINGS_POLL_MS,
  RETRY_DELAY_MS,
  TIMEZONE,
});
