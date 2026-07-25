import cron from 'node-cron';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { TIMEZONE, formatDate } from '../utils/formatDate.js';
import { sendEmail } from '../services/email.service.js';
import { getActiveAdmins } from '../models/user.model.js';
import { getISTDateParts, getDaysInMonth } from '../services/roi.service.js';

const JOB_NAME = 'roi_term_expiry_alert';
/** Midnight IST daily */
const CRON_EXPRESSION = '0 0 * * *';

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
 * Tomorrow's date string in IST (YYYY-MM-DD).
 * @param {Date} [now]
 * @returns {string}
 */
export function getTomorrowISTDateStr(now = new Date()) {
  const { year, month, day } = getISTDateParts(now);
  const daysInMonth = getDaysInMonth(year, month);
  let tYear = year;
  let tMonth = month;
  let tDay = day + 1;

  if (tDay > daysInMonth) {
    tDay = 1;
    tMonth += 1;
    if (tMonth > 12) {
      tMonth = 1;
      tYear += 1;
    }
  }

  return `${tYear}-${String(tMonth).padStart(2, '0')}-${String(tDay).padStart(2, '0')}`;
}

/**
 * Active ROI terms whose end_date is exactly tomorrow (IST).
 * @param {string} tomorrowStr
 * @returns {Promise<object[]>}
 */
async function findTermsExpiringOn(tomorrowStr) {
  const result = await query(
    `SELECT
       rs.id AS term_id,
       rs.investor_id,
       rs.roi_percentage,
       rs.start_date,
       rs.end_date,
       u.full_name AS investor_name,
       u.email AS investor_email
     FROM roi_settings rs
     INNER JOIN users u ON u.id = rs.investor_id
     WHERE rs.type = 'term'
       AND rs.is_active = TRUE
       AND u.is_deleted = FALSE
       AND rs.end_date = $1::DATE
     ORDER BY u.full_name ASC`,
    [tomorrowStr]
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
     ) VALUES ($1, $2, $3, 'system', $4, 'roi_term_expiry')`,
    [adminId, title, body, referenceId]
  );
}

/**
 * Alert admins about one expiring ROI term.
 * @param {object} term
 * @param {object[]} admins
 */
async function alertAdminsForTerm(term, admins) {
  const expiryLabel = formatDate(term.end_date);
  const title = 'ROI term expires tomorrow';
  const body = `ROI term for ${term.investor_name} expires tomorrow (${expiryLabel}). Default ROI will apply unless renewed.`;
  const detailBody = [
    body,
    `Current term rate: ${Math.round(Number(term.roi_percentage))}%.`,
    `Investor email: ${term.investor_email}`,
    `Term ID: ${term.term_id}`,
  ].join('\n');

  if (admins.length === 0) {
    await createAdminNotification(null, title, detailBody, term.term_id);
    return;
  }

  await Promise.allSettled(
    admins.map((admin) =>
      createAdminNotification(admin.id, title, detailBody, term.term_id)
    )
  );

  await Promise.allSettled(
    admins.map((admin) =>
      sendEmail(admin.email, 'custom-notification', {
        investorName: admin.full_name || 'Admin',
        subjectTitle: title,
        body: detailBody,
        referenceId: term.term_id,
        recipientType: 'admin',
      })
    )
  );
}

/**
 * Run ROI term expiry alert job once.
 * @param {{ tomorrowStr?: string }} [options]
 * @returns {Promise<object>}
 */
export async function runRoiTermExpiryAlertJob(options = {}) {
  let logId = null;
  let processedCount = 0;
  let failedCount = 0;
  const errors = [];

  try {
    logId = await insertCronLog(JOB_NAME);
    const tomorrowStr = options.tomorrowStr || getTomorrowISTDateStr();
    const terms = await findTermsExpiringOn(tomorrowStr);
    const admins = await getActiveAdmins();

    for (const term of terms) {
      try {
        await alertAdminsForTerm(term, admins);
        processedCount += 1;
      } catch (error) {
        failedCount += 1;
        errors.push({
          termId: term.term_id,
          investorId: term.investor_id,
          message: error.message,
        });
        logger.error(
          `[Cron] ${JOB_NAME} failed for term ${term.term_id}: ${error.message}`,
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
        tomorrow: tomorrowStr,
        termsFound: terms.length,
        errors,
      },
    });

    logger.info(`[Cron] ${JOB_NAME} completed`, {
      tomorrow: tomorrowStr,
      termsFound: terms.length,
      processedCount,
      failedCount,
    });

    return {
      status,
      logId,
      tomorrow: tomorrowStr,
      termsFound: terms.length,
      processedCount,
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
 * Schedule ROI term expiry alerts at 12:00 AM IST daily.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startRoiTermExpiryAlertCron() {
  const task = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await runRoiTermExpiryAlertJob();
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  );

  logger.info(`[Cron] ${JOB_NAME} registered`, {
    schedule: CRON_EXPRESSION,
    timezone: TIMEZONE,
    description: 'ROI term expiry alerts at 12:00 AM IST',
  });

  return task;
}

export const ROI_TERM_EXPIRY_CRON = Object.freeze({
  JOB_NAME,
  CRON_EXPRESSION,
  TIMEZONE,
});
