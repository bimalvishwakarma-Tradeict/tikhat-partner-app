import cron from 'node-cron';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { TIMEZONE } from '../utils/formatDate.js';
import { performBackup } from '../services/backup.service.js';

const JOB_NAME = 'database_backup';
/** 12:00 AM IST daily = 18:30 UTC previous day */
const CRON_EXPRESSION = '30 18 * * *';

/** @type {import('node-cron').ScheduledTask | null} */
let scheduledTask = null;

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
 * Run daily backup job (idempotent for the IST calendar day).
 * @returns {Promise<object>}
 */
export async function runBackupJob() {
  let logId = null;

  try {
    logId = await insertCronLog(JOB_NAME);

    const result = await performBackup({
      trigger: 'cron',
      skipIfTodayExists: true,
    });

    const status =
      result.skipped || result.success ? 'success' : 'failed';

    await updateCronLog(logId, {
      status,
      processedCount: result.skipped ? 0 : 1,
      failedCount: result.driveError ? 1 : 0,
      totalAmount: Math.round(Number(result.fileSize) || 0),
      errorDetails: {
        skipped: Boolean(result.skipped),
        fileName: result.fileName || null,
        localPath: result.localPath || null,
        driveUrl: result.driveUrl || null,
        driveError: result.driveError || null,
        encrypted: Boolean(result.encrypted),
      },
    });

    logger.info(`[Cron] ${JOB_NAME} completed`, {
      logId,
      skipped: result.skipped,
      fileName: result.fileName,
      driveUrl: result.driveUrl,
    });

    return { status, logId, ...result };
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
    return {
      status: 'failed',
      logId,
      error: error.message,
    };
  }
}

/**
 * @returns {boolean}
 */
export function isBackupCronActive() {
  return scheduledTask !== null;
}

/**
 * Schedule database backup at 12:00 AM IST daily.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startBackupCron() {
  if (scheduledTask) {
    return scheduledTask;
  }

  scheduledTask = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await runBackupJob();
    },
    {
      scheduled: true,
    }
  );

  logger.info(`[Cron] ${JOB_NAME} registered`, {
    schedule: CRON_EXPRESSION,
    description: 'Daily database backup at 12:00 AM IST (18:30 UTC)',
  });

  return scheduledTask;
}

export const BACKUP_CRON = Object.freeze({
  JOB_NAME,
  CRON_EXPRESSION,
  TIMEZONE,
});
