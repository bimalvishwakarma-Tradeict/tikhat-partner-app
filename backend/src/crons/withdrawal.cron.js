import cron from 'node-cron';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { TIMEZONE, formatDate, formatTime } from '../utils/formatDate.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { sendEmail } from '../services/email.service.js';
import { getActiveAdmins } from '../models/user.model.js';

const JOB_NAME = 'pending_withdrawal_reminder';
/** Every hour at minute 0, IST */
const CRON_EXPRESSION = '0 * * * *';

const OVERDUE_HOURS = 48;
const REMINDER_COOLDOWN_HOURS = 24;

let schemaReady = false;

/**
 * Ensure last_reminded_at exists on capital_withdrawal_requests.
 */
async function ensureWithdrawalReminderSchema() {
  if (schemaReady) {
    return;
  }

  await query(`
    ALTER TABLE capital_withdrawal_requests
    ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_capital_withdrawal_last_reminded_at
    ON capital_withdrawal_requests (last_reminded_at)
  `);

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

  schemaReady = true;
}

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
 * Overdue pending withdrawals needing a reminder.
 * @returns {Promise<object[]>}
 */
async function findOverdueWithdrawals() {
  const result = await query(
    `SELECT
       wr.id,
       wr.transaction_id,
       wr.investor_id,
       wr.amount,
       wr.account_type,
       wr.transfer_mode,
       wr.status,
       wr.created_at,
       wr.last_reminded_at,
       u.full_name AS investor_name,
       u.email AS investor_email
     FROM capital_withdrawal_requests wr
     JOIN users u ON u.id = wr.investor_id
     WHERE wr.is_deleted = FALSE
       AND wr.status IN ('submitted', 'under_review')
       AND wr.created_at <= NOW() - ($1::TEXT || ' hours')::INTERVAL
       AND (
         wr.last_reminded_at IS NULL
         OR wr.last_reminded_at <= NOW() - ($2::TEXT || ' hours')::INTERVAL
       )
     ORDER BY wr.created_at ASC`,
    [String(OVERDUE_HOURS), String(REMINDER_COOLDOWN_HOURS)]
  );

  return result.rows;
}

/**
 * @param {string | null} adminId
 * @param {string} title
 * @param {string} body
 * @param {string} referenceId
 */
async function createAdminNotification(adminId, title, body, referenceId) {
  await query(
    `INSERT INTO admin_notifications (
       admin_id,
       title,
       body,
       type,
       reference_id,
       reference_type
     ) VALUES ($1, $2, $3, 'request', $4, 'withdrawal_reminder')`,
    [adminId, title, body, referenceId]
  );
}

/**
 * Notify all active admins about one overdue withdrawal.
 * @param {object} withdrawal
 * @param {object[]} admins
 */
async function remindAdminsForWithdrawal(withdrawal, admins) {
  const amountLabel = formatCurrency(withdrawal.amount);
  const requestDate = `${formatDate(withdrawal.created_at)} ${formatTime(withdrawal.created_at)}`;
  const title = 'Pending withdrawal > 48 hours';
  const body = [
    `Investor: ${withdrawal.investor_name}`,
    `Amount: ${amountLabel}`,
    `Account: ${withdrawal.account_type}`,
    `Request date: ${requestDate}`,
    `Transaction ID: ${withdrawal.transaction_id}`,
    `Status: ${withdrawal.status}`,
  ].join('\n');

  if (admins.length === 0) {
    await createAdminNotification(null, title, body, withdrawal.transaction_id);
    return;
  }

  await Promise.allSettled(
    admins.map((admin) =>
      createAdminNotification(admin.id, title, body, withdrawal.transaction_id)
    )
  );

  await Promise.allSettled(
    admins.map((admin) =>
      sendEmail(admin.email, 'custom-notification', {
        investorName: admin.full_name,
        subjectTitle: title,
        body: `${body}\n\nPlease review and process this withdrawal in the admin panel.`,
        referenceId: withdrawal.transaction_id,
        recipientType: 'admin',
      })
    )
  );
}

/**
 * Run pending withdrawal reminder job once.
 * @returns {Promise<object>}
 */
export async function runWithdrawalReminderJob() {
  let logId = null;
  let processedCount = 0;
  let failedCount = 0;
  let totalAmount = 0;
  const errors = [];

  try {
    await ensureWithdrawalReminderSchema();
    logId = await insertCronLog(JOB_NAME);

    const overdue = await findOverdueWithdrawals();
    const admins = await getActiveAdmins();

    for (const withdrawal of overdue) {
      try {
        await remindAdminsForWithdrawal(withdrawal, admins);

        await query(
          `UPDATE capital_withdrawal_requests
           SET last_reminded_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [withdrawal.id]
        );

        processedCount += 1;
        totalAmount = Math.round(totalAmount + Number(withdrawal.amount || 0));
      } catch (error) {
        failedCount += 1;
        errors.push({
          withdrawalId: withdrawal.id,
          transactionId: withdrawal.transaction_id,
          message: error.message,
        });
        logger.error(
          `[Cron] ${JOB_NAME} failed for ${withdrawal.transaction_id}: ${error.message}`,
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
      totalAmount,
      errorDetails: {
        overdue_found: overdue.length,
        reminded: processedCount,
        failed: failedCount,
        errors: errors.length > 0 ? errors : undefined,
        cooldown_hours: REMINDER_COOLDOWN_HOURS,
        overdue_hours: OVERDUE_HOURS,
      },
    });

    logger.info(`[Cron] ${JOB_NAME} completed`, {
      processedCount,
      failedCount,
      overdueFound: overdue.length,
    });

    return {
      status,
      logId,
      processedCount,
      failedCount,
      overdueFound: overdue.length,
      totalAmount,
    };
  } catch (error) {
    if (logId) {
      try {
        await updateCronLog(logId, {
          status: 'failed',
          processedCount,
          failedCount: failedCount + 1,
          totalAmount,
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
 * Schedule hourly pending-withdrawal reminder (IST).
 * @returns {import('node-cron').ScheduledTask}
 */
export function startWithdrawalReminderCron() {
  const task = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await runWithdrawalReminderJob();
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  );

  logger.info(`[Cron] ${JOB_NAME} registered`, {
    schedule: CRON_EXPRESSION,
    timezone: TIMEZONE,
    description: 'Hourly check for withdrawals pending > 48 hours',
  });

  return task;
}

export const WITHDRAWAL_REMINDER_CRON = Object.freeze({
  JOB_NAME,
  CRON_EXPRESSION,
  TIMEZONE,
  OVERDUE_HOURS,
  REMINDER_COOLDOWN_HOURS,
});
