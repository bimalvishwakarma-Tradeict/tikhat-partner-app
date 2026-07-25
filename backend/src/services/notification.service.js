import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export const NOTIFICATION_TYPES = Object.freeze({
  TRANSACTION: 'transaction',
  REQUEST: 'request',
  SUPPORT: 'support',
  SYSTEM: 'system',
  CUSTOM: 'custom',
});

const VALID_TYPES = new Set(Object.values(NOTIFICATION_TYPES));

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const NOTIFICATION_COLUMNS = `
  id,
  investor_id,
  title,
  body,
  type,
  reference_id,
  reference_type,
  is_read,
  created_at,
  updated_at
`;

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return n;
}

/**
 * Create an in-app notification for an investor.
 *
 * @param {string} investorId
 * @param {string} title
 * @param {string} body
 * @param {string} type - transaction | request | support | system | custom
 * @param {string | null} [referenceId]
 * @param {string | null} [referenceType]
 * @returns {Promise<object>}
 */
export async function createNotification(
  investorId,
  title,
  body,
  type,
  referenceId = null,
  referenceType = null
) {
  if (!investorId) {
    const error = new Error('Investor ID is required');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (!title || !String(title).trim()) {
    const error = new Error('Notification title is required');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (!body || !String(body).trim()) {
    const error = new Error('Notification body is required');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (!VALID_TYPES.has(type)) {
    const error = new Error(
      `Invalid notification type: ${type}. Allowed: ${[...VALID_TYPES].join(', ')}`
    );
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const result = await query(
    `INSERT INTO notifications (
       investor_id,
       title,
       body,
       type,
       reference_id,
       reference_type
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [
      investorId,
      String(title).trim().slice(0, 255),
      String(body).trim(),
      type,
      referenceId || null,
      referenceType || null,
    ]
  );

  const notification = result.rows[0];

  logger.info('Notification created', {
    notificationId: notification.id,
    investorId,
    type,
  });

  return notification;
}

/**
 * Paginated notifications for an investor. Unread first, then newest.
 *
 * @param {string} investorId
 * @param {number | string} [page]
 * @param {number | string} [limit]
 * @returns {Promise<{ notifications: object[], meta: object }>}
 */
export async function getNotifications(investorId, page = DEFAULT_PAGE, limit = DEFAULT_LIMIT) {
  const pageNum = toPositiveInt(page, DEFAULT_PAGE);
  let limitNum = toPositiveInt(limit, DEFAULT_LIMIT);
  if (limitNum > MAX_LIMIT) {
    limitNum = MAX_LIMIT;
  }
  const offset = (pageNum - 1) * limitNum;

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM notifications
     WHERE investor_id = $1`,
    [investorId]
  );
  const total = countResult.rows[0]?.total || 0;

  const listResult = await query(
    `SELECT ${NOTIFICATION_COLUMNS}
     FROM notifications
     WHERE investor_id = $1
     ORDER BY is_read ASC, created_at DESC
     LIMIT $2 OFFSET $3`,
    [investorId, limitNum, offset]
  );

  return {
    notifications: listResult.rows,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

/**
 * Mark a single notification as read (owner only).
 *
 * @param {string} notificationId
 * @param {string} investorId
 * @returns {Promise<object>}
 */
export async function markAsRead(notificationId, investorId) {
  const result = await query(
    `UPDATE notifications
     SET is_read = TRUE,
         updated_at = NOW()
     WHERE id = $1
       AND investor_id = $2
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [notificationId, investorId]
  );

  if (result.rowCount === 0) {
    const error = new Error('Notification not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  return result.rows[0];
}

/**
 * Mark all notifications as read for an investor.
 *
 * @param {string} investorId
 * @returns {Promise<{ updatedCount: number }>}
 */
export async function markAllAsRead(investorId) {
  const result = await query(
    `UPDATE notifications
     SET is_read = TRUE,
         updated_at = NOW()
     WHERE investor_id = $1
       AND is_read = FALSE
     RETURNING id`,
    [investorId]
  );

  return { updatedCount: result.rowCount };
}

/**
 * Unread count for bell badge.
 *
 * @param {string} investorId
 * @returns {Promise<number>}
 */
export async function getUnreadCount(investorId) {
  const result = await query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM notifications
     WHERE investor_id = $1
       AND is_read = FALSE`,
    [investorId]
  );

  return result.rows[0]?.count || 0;
}

/**
 * Admin notification center summary:
 * pending approvals, new tickets, new registrations.
 *
 * @returns {Promise<object>}
 */
export async function getAdminSummary() {
  const [deposits, withdrawals, profiles, tickets, registrations] =
    await Promise.all([
      query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM capital_transactions
         WHERE type = 'deposit'
           AND is_deleted = FALSE
           AND status IN ('submitted', 'under_review')`
      ),
      query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM capital_withdrawal_requests
         WHERE is_deleted = FALSE
           AND status IN ('submitted', 'under_review')`
      ),
      query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM profile_update_requests
         WHERE status = 'pending'`
      ),
      query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM support_tickets
         WHERE status IN ('open', 'in_progress')`
      ),
      query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM users
         WHERE status = 'pending'
           AND is_deleted = FALSE`
      ),
    ]);

  const pendingCapitalDeposits = deposits.rows[0]?.count || 0;
  const pendingWithdrawals = withdrawals.rows[0]?.count || 0;
  const pendingProfileUpdates = profiles.rows[0]?.count || 0;
  const newTickets = tickets.rows[0]?.count || 0;
  const newRegistrations = registrations.rows[0]?.count || 0;

  const pendingApprovals =
    pendingCapitalDeposits + pendingWithdrawals + pendingProfileUpdates;

  return {
    pendingApprovals,
    pendingCapitalDeposits,
    pendingWithdrawals,
    pendingProfileUpdates,
    newTickets,
    newRegistrations,
  };
}
