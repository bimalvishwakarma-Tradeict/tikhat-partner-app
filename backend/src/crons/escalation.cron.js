import cron from 'node-cron';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { TIMEZONE, formatDate } from '../utils/formatDate.js';
import { sendEmail } from '../services/email.service.js';

const JOB_NAME = 'ticket_escalation';
/** Midnight IST daily = 18:30 UTC previous day */
const CRON_EXPRESSION = '30 18 * * *';

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
 * Active Super Admins.
 * @returns {Promise<object[]>}
 */
async function getSuperAdmins() {
  const result = await query(
    `SELECT id, full_name, email, role, status
     FROM admins
     WHERE status = 'active'
       AND role = 'super_admin'
     ORDER BY created_at ASC`
  );

  return result.rows;
}

/**
 * Tickets open/in_progress for 7+ days that are not yet escalated.
 * @returns {Promise<object[]>}
 */
export async function findTicketsDueForEscalation() {
  const result = await query(
    `SELECT
       st.id,
       st.ticket_id,
       st.investor_id,
       st.category,
       st.subject,
       st.status,
       st.created_at,
       st.escalated_to_super_admin,
       u.full_name AS investor_name,
       u.email AS investor_email
     FROM support_tickets st
     INNER JOIN users u ON u.id = st.investor_id
     WHERE st.status IN ('open', 'in_progress')
       AND st.escalated_to_super_admin = FALSE
       AND st.created_at < (NOW() - INTERVAL '7 days')
     ORDER BY st.created_at ASC`
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

  await query(
    `INSERT INTO admin_notifications (
       admin_id,
       title,
       body,
       type,
       reference_id,
       reference_type
     ) VALUES ($1, $2, $3, 'support', $4, 'support_ticket_escalation')`,
    [adminId, title, body, referenceId]
  );
}

/**
 * Escalate one ticket and notify Super Admins.
 * @param {object} ticket
 * @param {object[]} superAdmins
 * @returns {Promise<object>}
 */
async function escalateTicket(ticket, superAdmins) {
  const updated = await query(
    `UPDATE support_tickets
     SET escalated_to_super_admin = TRUE,
         escalated_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND escalated_to_super_admin = FALSE
       AND status IN ('open', 'in_progress')
     RETURNING id, ticket_id, escalated_to_super_admin, escalated_at`,
    [ticket.id]
  );

  if (updated.rowCount === 0) {
    return { skipped: true, reason: 'already_escalated_or_resolved' };
  }

  const title = 'Support ticket escalated (7+ days)';
  const body = [
    `Ticket ${ticket.ticket_id} has been unresolved for 7+ days and requires Super Admin attention.`,
    `Investor: ${ticket.investor_name} (${ticket.investor_email})`,
    `Subject: ${ticket.subject}`,
    `Status: ${ticket.status}`,
    `Opened: ${formatDate(ticket.created_at)}`,
  ].join('\n');

  if (superAdmins.length === 0) {
    await createAdminNotification(null, title, body, ticket.ticket_id);
  } else {
    await Promise.allSettled(
      superAdmins.map((admin) =>
        createAdminNotification(admin.id, title, body, ticket.ticket_id)
      )
    );

    await Promise.allSettled(
      superAdmins.map((admin) =>
        sendEmail(admin.email, 'custom-notification', {
          investorName: admin.full_name || 'Super Admin',
          subjectTitle: title,
          body,
          referenceId: ticket.ticket_id,
          recipientType: 'admin',
        })
      )
    );
  }

  return {
    skipped: false,
    ticket: updated.rows[0],
  };
}

/**
 * Run ticket escalation job once.
 * @returns {Promise<object>}
 */
export async function runTicketEscalationJob() {
  let logId = null;
  let processedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors = [];
  const escalatedIds = [];

  try {
    logId = await insertCronLog(JOB_NAME);
    const tickets = await findTicketsDueForEscalation();
    const superAdmins = await getSuperAdmins();

    for (const ticket of tickets) {
      try {
        const result = await escalateTicket(ticket, superAdmins);
        if (result.skipped) {
          skippedCount += 1;
        } else {
          processedCount += 1;
          escalatedIds.push(ticket.ticket_id);
        }
      } catch (error) {
        failedCount += 1;
        errors.push({
          ticketId: ticket.ticket_id,
          message: error.message,
        });
        logger.error(
          `[Cron] ${JOB_NAME} failed for ${ticket.ticket_id}: ${error.message}`,
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
        candidates: tickets.length,
        skippedCount,
        escalatedIds,
        errors,
      },
    });

    logger.info(`[Cron] ${JOB_NAME} completed`, {
      candidates: tickets.length,
      processedCount,
      skippedCount,
      failedCount,
    });

    return {
      status,
      logId,
      candidates: tickets.length,
      processedCount,
      skippedCount,
      failedCount,
      escalatedIds,
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
 * Schedule ticket escalation at 12:00 AM IST daily.
 * @returns {import('node-cron').ScheduledTask}
 */
export function startTicketEscalationCron() {
  const task = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await runTicketEscalationJob();
    },
    {
      scheduled: true,
    }
  );

  logger.info(`[Cron] ${JOB_NAME} registered`, {
    schedule: CRON_EXPRESSION,
    description: 'Escalate unresolved support tickets after 7 days at 12:00 AM IST (18:30 UTC)',
  });

  return task;
}

export const TICKET_ESCALATION_CRON = Object.freeze({
  JOB_NAME,
  CRON_EXPRESSION,
  TIMEZONE,
});
