import cron from 'node-cron';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { TIMEZONE } from '../utils/formatDate.js';

const JOB_NAME = 'account_auto_unlock';
/** Midnight IST daily */
const CRON_EXPRESSION = '0 0 * * *';

let schemaReady = false;

/**
 * Ensure users.locked_reason exists for failed-attempt lock filtering.
 */
async function ensureUnlockSchema() {
  if (schemaReady) {
    return;
  }

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS locked_reason VARCHAR(50)
  `);

  schemaReady = true;
}

/**
 * @param {string} jobName
 * @returns {Promise<string>} cron_job_logs.id
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
 * @param {string} update.status
 * @param {number} [update.processedCount]
 * @param {number} [update.failedCount]
 * @param {number} [update.totalAmount]
 * @param {object | null} [update.errorDetails]
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
 * Unlock failed-attempt locks, clean old OTPs.
 * Failures are logged only — no admin alert (non-critical).
 *
 * @returns {Promise<object>}
 */
export async function runAccountUnlockJob() {
  let logId = null;
  let unlockedCount = 0;
  let otpDeletedCount = 0;

  try {
    await ensureUnlockSchema();
    logId = await insertCronLog(JOB_NAME);

    // Existing locks (pre-locked_reason) treated as failed_attempts.
    const unlockResult = await query(
      `UPDATE users
       SET status = 'active',
           failed_login_attempts = 0,
           locked_reason = NULL,
           updated_at = NOW()
       WHERE status = 'locked'
         AND is_deleted = FALSE
         AND COALESCE(locked_reason, 'failed_attempts') = 'failed_attempts'
       RETURNING id, email`
    );

    unlockedCount = unlockResult.rowCount;

    const otpResult = await query(
      `DELETE FROM otp_verifications
       WHERE created_at < NOW() - INTERVAL '1 hour'
       RETURNING id`
    );

    otpDeletedCount = otpResult.rowCount;

    await updateCronLog(logId, {
      status: 'success',
      processedCount: unlockedCount,
      errorDetails: {
        unlocked_count: unlockedCount,
        otp_deleted_count: otpDeletedCount,
        rate_limit_note:
          'In-memory rate-limit windows expire automatically; no persistent rate-limit store to clear',
      },
    });

    logger.info(`[Cron] ${JOB_NAME} completed`, {
      unlockedCount,
      otpDeletedCount,
    });

    return {
      status: 'success',
      logId,
      unlockedCount,
      otpDeletedCount,
    };
  } catch (error) {
    if (logId) {
      try {
        await updateCronLog(logId, {
          status: 'failed',
          processedCount: unlockedCount,
          failedCount: 1,
          errorDetails: {
            message: error.message,
            unlocked_count: unlockedCount,
            otp_deleted_count: otpDeletedCount,
          },
        });
      } catch (logError) {
        logger.error(`[Cron] ${JOB_NAME} failed to update cron log`, {
          error: logError,
        });
      }
    }

    // Non-critical: log only — do NOT alert admin
    logger.error(`[Cron] ${JOB_NAME} failed`, { error });

    return {
      status: 'failed',
      logId,
      unlockedCount,
      otpDeletedCount,
      error: error.message,
    };
  }
}

/**
 * Schedule account auto-unlock at 12:00 AM IST daily.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startAccountUnlockCron() {
  const task = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await runAccountUnlockJob();
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  );

  logger.info(`[Cron] ${JOB_NAME} registered`, {
    schedule: CRON_EXPRESSION,
    timezone: TIMEZONE,
    description: 'Daily account unlock at 12:00 AM IST',
  });

  return task;
}

export const UNLOCK_CRON = Object.freeze({
  JOB_NAME,
  CRON_EXPRESSION,
  TIMEZONE,
});
