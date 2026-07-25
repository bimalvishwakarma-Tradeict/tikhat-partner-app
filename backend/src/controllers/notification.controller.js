import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  getAdminSummary,
  createNotification,
  NOTIFICATION_TYPES,
} from '../services/notification.service.js';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from '../services/email.service.js';
import {
  logAction,
  AUDIT_ENTITY_TYPES,
} from '../services/audit.service.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const BROADCAST_TARGET_TYPES = Object.freeze(['single', 'selected', 'all']);

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
 * Ensure admin_notifications table exists.
 */
async function ensureAdminNotificationsTable() {
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
}

/**
 * GET /api/v1/notifications
 */
export async function listNotifications(req, res) {
  try {
    const investorId = req.user.userId;
    const { page, limit } = req.query;

    const result = await getNotifications(investorId, page, limit);

    return res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: {
        notifications: result.notifications,
      },
      meta: result.meta,
    });
  } catch (error) {
    logger.error(`[Notifications] listNotifications: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve notifications',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * PATCH /api/v1/notifications/:id/read
 */
export async function markNotificationRead(req, res) {
  try {
    const investorId = req.user.userId;
    const { id } = req.params;

    const notification = await markAsRead(id, investorId);

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: { notification },
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
        error: 'NOT_FOUND',
      });
    }

    logger.error(`[Notifications] markNotificationRead: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * PATCH /api/v1/notifications/read-all
 */
export async function markAllNotificationsRead(req, res) {
  try {
    const investorId = req.user.userId;
    const result = await markAllAsRead(investorId);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: result,
    });
  } catch (error) {
    logger.error(`[Notifications] markAllNotificationsRead: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/v1/notifications/unread-count
 */
export async function unreadCount(req, res) {
  try {
    const investorId = req.user.userId;
    const count = await getUnreadCount(investorId);

    return res.status(200).json({
      success: true,
      message: 'Unread count retrieved successfully',
      data: { count },
    });
  } catch (error) {
    logger.error(`[Notifications] unreadCount: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve unread count',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/v1/admin/notifications/summary
 */
export async function adminNotificationSummary(req, res) {
  try {
    const summary = await getAdminSummary();

    return res.status(200).json({
      success: true,
      message: 'Admin notification summary retrieved successfully',
      data: { summary },
    });
  } catch (error) {
    logger.error(`[Notifications] adminNotificationSummary: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin notification summary',
      error: 'INTERNAL_ERROR',
    });
  }
}

// ---------------------------------------------------------------------------
// Task 8.5 — Admin notification center
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/admin/notifications
 * Admin's own notifications (system alerts, pending approvals, assignments).
 */
export async function listAdminNotifications(req, res) {
  try {
    await ensureAdminNotificationsTable();

    const adminId = req.user.userId;
    const pageNum = toPositiveInt(req.query.page, DEFAULT_PAGE);
    let limitNum = toPositiveInt(req.query.limit, DEFAULT_LIMIT);
    if (limitNum > MAX_LIMIT) {
      limitNum = MAX_LIMIT;
    }
    const offset = (pageNum - 1) * limitNum;

    const countResult = await query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM admin_notifications
       WHERE admin_id = $1 OR admin_id IS NULL`,
      [adminId]
    );
    const total = countResult.rows[0]?.total || 0;

    const listResult = await query(
      `SELECT id, admin_id, title, body, type, reference_id,
              reference_type, is_read, created_at, updated_at
       FROM admin_notifications
       WHERE admin_id = $1 OR admin_id IS NULL
       ORDER BY is_read ASC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [adminId, limitNum, offset]
    );

    return res.status(200).json({
      success: true,
      message: 'Admin notifications retrieved',
      data: {
        notifications: listResult.rows,
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: total === 0 ? 0 : Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    logger.error(`[Notifications] listAdminNotifications: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin notifications',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/v1/admin/notifications/pending-counts
 */
export async function getPendingCounts(req, res) {
  try {
    const summary = await getAdminSummary();

    return res.status(200).json({
      success: true,
      message: 'Pending counts retrieved',
      data: {
        capital_requests: summary.pendingCapitalDeposits,
        withdrawal_requests: summary.pendingWithdrawals,
        profile_updates: summary.pendingProfileUpdates,
        new_registrations: summary.newRegistrations,
        open_tickets: summary.newTickets,
      },
    });
  } catch (error) {
    logger.error(`[Notifications] getPendingCounts: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve pending counts',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * Resolve broadcast target investor IDs.
 * @param {string} targetType
 * @param {unknown} targetIds
 * @returns {Promise<string[]>}
 */
async function resolveBroadcastTargets(targetType, targetIds) {
  if (targetType === 'all') {
    const result = await query(
      `SELECT id
       FROM users
       WHERE is_deleted = FALSE
         AND status = 'active'
       ORDER BY created_at ASC`
    );
    return result.rows.map((row) => row.id);
  }

  const ids = Array.isArray(targetIds)
    ? targetIds.map((id) => String(id).trim()).filter(Boolean)
    : [];

  if (targetType === 'single') {
    if (ids.length !== 1) {
      const error = new Error(
        'target_ids must contain exactly one investor ID for single'
      );
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  } else if (targetType === 'selected') {
    if (ids.length < 1) {
      const error = new Error(
        'target_ids must contain at least one investor ID for selected'
      );
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  }

  const uniqueIds = [...new Set(ids)];
  const result = await query(
    `SELECT id
     FROM users
     WHERE id = ANY($1::UUID[])
       AND is_deleted = FALSE`,
    [uniqueIds]
  );

  if (result.rows.length !== uniqueIds.length) {
    const error = new Error('One or more investor IDs are invalid');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return result.rows.map((row) => row.id);
}

/**
 * POST /api/v1/admin/notifications/broadcast
 * Body: { target_type, target_ids?, title, body, send_email }
 */
export async function broadcastNotification(req, res) {
  try {
    const {
      target_type: targetTypeRaw,
      target_ids: targetIds,
      title,
      body,
      send_email: sendEmailFlag,
    } = req.body || {};

    const targetType = String(targetTypeRaw || '')
      .trim()
      .toLowerCase();

    if (!BROADCAST_TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({
        success: false,
        message: 'target_type must be single, selected, or all',
        error: 'VALIDATION_ERROR',
      });
    }

    const titleText = String(title || '').trim();
    const bodyText = String(body || '').trim();

    if (!titleText) {
      return res.status(400).json({
        success: false,
        message: 'title is required',
        error: 'VALIDATION_ERROR',
      });
    }

    if (!bodyText) {
      return res.status(400).json({
        success: false,
        message: 'body is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const sendEmailBool =
      sendEmailFlag === true ||
      sendEmailFlag === 'true' ||
      sendEmailFlag === 1 ||
      sendEmailFlag === '1';

    const investorIds = await resolveBroadcastTargets(targetType, targetIds);

    if (investorIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No target investors found',
        error: 'VALIDATION_ERROR',
      });
    }

    const created = [];
    const emailResults = [];
    let failed = 0;

    for (const investorId of investorIds) {
      try {
        const notification = await createNotification(
          investorId,
          titleText,
          bodyText,
          NOTIFICATION_TYPES.CUSTOM,
          null,
          'admin_broadcast'
        );
        created.push(notification.id);

        if (sendEmailBool) {
          const investor = await query(
            `SELECT id, full_name, email
             FROM users
             WHERE id = $1
             LIMIT 1`,
            [investorId]
          );
          const row = investor.rows[0];
          if (row?.email) {
            await sendEmail(row.email, 'custom-notification', {
              investorName: row.full_name || 'Tikhat Partner',
              subjectTitle: titleText,
              body: bodyText,
              referenceId: notification.id,
              recipientType: 'investor',
            });
            emailResults.push(row.email);
          }
        }
      } catch (error) {
        failed += 1;
        logger.error(
          `[Notifications] Broadcast failed for ${investorId}: ${error.message}`,
          { error }
        );
      }
    }

    await logAction(
      req.user.userId,
      `Broadcast notification to ${targetType} (${created.length} investors)`,
      AUDIT_ENTITY_TYPES.NOTIFICATION,
      null,
      null,
      {
        target_type: targetType,
        target_count: investorIds.length,
        notified_count: created.length,
        send_email: sendEmailBool,
        title: titleText,
      },
      req.ipAddress || null
    );

    return res.status(201).json({
      success: true,
      message: 'Broadcast sent successfully',
      data: {
        target_type: targetType,
        target_count: investorIds.length,
        notified_count: created.length,
        failed_count: failed,
        send_email: sendEmailBool,
        emails_sent: emailResults.length,
        notification_ids: created,
      },
    });
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: 'VALIDATION_ERROR',
      });
    }

    logger.error(`[Notifications] broadcastNotification: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to broadcast notification',
      error: 'INTERNAL_ERROR',
    });
  }
}
