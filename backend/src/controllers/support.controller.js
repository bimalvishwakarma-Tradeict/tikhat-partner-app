import fs from 'fs';
import path from 'path';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { formatDate } from '../utils/formatDate.js';
import { sendEmail } from '../services/email.service.js';
import {
  createNotification,
  NOTIFICATION_TYPES,
} from '../services/notification.service.js';
import { getActiveAdmins, findUserById } from '../models/user.model.js';
import {
  SupportError,
  getCategoryLabel,
  getTicketByIdOrCode,
  getTicketMessages,
  createTicket,
  listInvestorTickets,
  addTicketReply,
  reopenTicket,
  listAdminTickets,
  updateTicketStatus,
  assignTicket,
} from '../models/support.model.js';
import {
  logAction,
  AUDIT_ENTITY_TYPES,
} from '../services/audit.service.js';

const MAX_ATTACHMENTS = 5;

/**
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context
 */
function handleError(res, error, context) {
  if (error instanceof SupportError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      error: error.code,
    });
  }

  if (error.code === 'VALIDATION_ERROR') {
    return res.status(400).json({
      success: false,
      message: error.message,
      error: 'VALIDATION_ERROR',
    });
  }

  logger.error(`[Support] ${context}: ${error.message}`, { error });
  return res.status(500).json({
    success: false,
    message: 'Support request failed',
    error: 'INTERNAL_ERROR',
  });
}

/**
 * @param {Express.Multer.File[]} files
 * @returns {Array<object>}
 */
function mapUploadedAttachments(files = []) {
  return files.map((file) => ({
    file_url: path
      .join('support-attachments', file.filename)
      .replace(/\\/g, '/'),
    file_name: file.originalname,
    file_type: file.mimetype,
    file_size: file.size,
  }));
}

/**
 * @param {Express.Multer.File[] | undefined} files
 */
function cleanupUploadedFiles(files) {
  if (!files?.length) return;
  for (const file of files) {
    try {
      if (file?.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (error) {
      logger.warn(`[Support] Failed to cleanup upload: ${error.message}`);
    }
  }
}

/**
 * Persist admin notification row.
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
       admin_id, title, body, type, reference_id, reference_type
     ) VALUES ($1, $2, $3, 'support', $4, 'support_ticket')`,
    [adminId, title, body, referenceId]
  );
}

/**
 * @param {object} ticket
 * @param {object} investor
 */
async function notifyAdminsNewTicket(ticket, investor) {
  const admins = await getActiveAdmins();
  const title = 'New support ticket';
  const body = `${investor.full_name || 'A Tikhat Partner'} raised ticket ${ticket.ticket_id}: ${ticket.subject}`;

  if (admins.length === 0) {
    await createAdminNotification(null, title, body, ticket.ticket_id);
    return;
  }

  await Promise.all(
    admins.map((admin) =>
      createAdminNotification(admin.id, title, body, ticket.ticket_id)
    )
  );
}

/**
 * @param {object} ticket
 * @returns {object}
 */
function serializeTicket(ticket) {
  return {
    id: ticket.id,
    ticket_id: ticket.ticket_id,
    investor_id: ticket.investor_id,
    category: ticket.category,
    category_label: getCategoryLabel(ticket.category),
    subject: ticket.subject,
    status: ticket.status,
    assigned_to: ticket.assigned_to || null,
    is_escalated: Boolean(
      ticket.is_escalated ?? ticket.escalated_to_super_admin
    ),
    escalated_at: ticket.escalated_at,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    created_at_formatted: ticket.created_at
      ? formatDate(ticket.created_at)
      : null,
  };
}

/**
 * Public attachment metadata — never expose filesystem paths.
 * @param {object} attachment
 * @returns {object}
 */
function serializeAttachment(attachment) {
  if (!attachment) {
    return null;
  }
  return {
    id: attachment.id || null,
    file_name: attachment.file_name || null,
    file_type: attachment.file_type || null,
    file_size: attachment.file_size || null,
    created_at: attachment.created_at || null,
  };
}

/**
 * @param {object} message
 * @returns {object}
 */
function serializeMessage(message) {
  if (!message) {
    return null;
  }
  const { attachments, ...rest } = message;
  return {
    ...rest,
    attachments: Array.isArray(attachments)
      ? attachments.map(serializeAttachment)
      : [],
  };
}

/**
 * POST /api/v1/investor/support/tickets
 * Multipart: category, subject, message, attachments[]
 */
export async function createInvestorTicket(req, res) {
  try {
    const files = req.files || [];
    if (files.length > MAX_ATTACHMENTS) {
      cleanupUploadedFiles(files);
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_ATTACHMENTS} attachments allowed`,
        error: 'VALIDATION_ERROR',
      });
    }

    const investorId = req.user.userId;
    const { category, subject, message } = req.body;

    const result = await createTicket({
      investorId,
      category,
      subject,
      message,
      attachments: mapUploadedAttachments(files),
    });

    const investor = await findUserById(investorId);

    sendEmail(investor?.email, 'support', {
      investorName: investor?.full_name || 'Tikhat Partner',
      ticketId: result.ticket.ticket_id,
      category: getCategoryLabel(result.ticket.category),
      messagePreview: String(message || '').trim(),
      eventLabel: 'Ticket created',
      referenceId: result.ticket.ticket_id,
      recipientType: 'investor',
    }).catch((err) => {
      logger.warn(`[Support] Confirmation email failed: ${err.message}`);
    });

    try {
      await notifyAdminsNewTicket(result.ticket, investor || {});
    } catch (error) {
      logger.error(`[Support] Admin notify failed: ${error.message}`, {
        error,
        ticketId: result.ticket.ticket_id,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      data: {
        ticket: serializeTicket(result.ticket),
        message: serializeMessage(result.message),
      },
    });
  } catch (error) {
    cleanupUploadedFiles(req.files);
    return handleError(res, error, 'createInvestorTicket');
  }
}

/**
 * GET /api/v1/investor/support/tickets
 */
export async function listMyTickets(req, res) {
  try {
    const data = await listInvestorTickets(req.user.userId, {
      status: req.query.status,
      category: req.query.category,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json({
      success: true,
      message: 'Support tickets retrieved',
      data: {
        tickets: data.tickets.map(serializeTicket),
        meta: data.meta,
      },
    });
  } catch (error) {
    return handleError(res, error, 'listMyTickets');
  }
}

/**
 * GET /api/v1/investor/support/tickets/:id
 */
export async function getMyTicket(req, res) {
  try {
    const ticket = await getTicketByIdOrCode(req.params.id, req.user.userId);
    const messages = await getTicketMessages(ticket.id);

    return res.status(200).json({
      success: true,
      message: 'Support ticket retrieved',
      data: {
        ticket: serializeTicket(ticket),
        messages: messages.map(serializeMessage),
      },
    });
  } catch (error) {
    return handleError(res, error, 'getMyTicket');
  }
}

/**
 * POST /api/v1/investor/support/tickets/:id/reply
 */
export async function replyMyTicket(req, res) {
  try {
    const files = req.files || [];
    if (files.length > MAX_ATTACHMENTS) {
      cleanupUploadedFiles(files);
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_ATTACHMENTS} attachments allowed`,
        error: 'VALIDATION_ERROR',
      });
    }

    const ticket = await getTicketByIdOrCode(req.params.id, req.user.userId);
    const result = await addTicketReply(
      ticket.id,
      'investor',
      req.user.userId,
      req.body.message,
      mapUploadedAttachments(files)
    );

    return res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      data: {
        ticket: serializeTicket(result.ticket),
        message: serializeMessage(result.message),
      },
    });
  } catch (error) {
    cleanupUploadedFiles(req.files);
    return handleError(res, error, 'replyMyTicket');
  }
}

/**
 * PATCH /api/v1/investor/support/tickets/:id/reopen
 */
export async function reopenMyTicket(req, res) {
  try {
    const ticket = await reopenTicket(req.params.id, req.user.userId);

    return res.status(200).json({
      success: true,
      message: 'Ticket reopened successfully',
      data: {
        ticket: serializeTicket(ticket),
      },
    });
  } catch (error) {
    return handleError(res, error, 'reopenMyTicket');
  }
}

// ---------------------------------------------------------------------------
// Task 8.2 — Admin support APIs
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/admin/support/tickets
 */
export async function listAllTickets(req, res) {
  try {
    const data = await listAdminTickets({
      status: req.query.status,
      category: req.query.category,
      investor_id: req.query.investor_id,
      assigned_to: req.query.assigned_to,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      investor_name: req.query.investor_name,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      page: req.query.page,
      limit: req.query.limit,
      escalated: req.query.escalated,
    });

    return res.status(200).json({
      success: true,
      message: 'Support tickets retrieved',
      data: {
        tickets: data.tickets.map((row) => ({
          ...serializeTicket(row),
          investor_name: row.investor_name,
          investor_email: row.investor_email,
          assigned_admin_name: row.assigned_admin_name || null,
        })),
        meta: data.meta,
      },
    });
  } catch (error) {
    return handleError(res, error, 'listAllTickets');
  }
}

/**
 * GET /api/v1/admin/support/tickets/:id
 */
export async function getAdminTicket(req, res) {
  try {
    const ticket = await getTicketByIdOrCode(req.params.id);
    const messages = await getTicketMessages(ticket.id);
    const investor = await findUserById(ticket.investor_id);

    return res.status(200).json({
      success: true,
      message: 'Support ticket retrieved',
      data: {
        ticket: {
          ...serializeTicket(ticket),
          investor_name: investor?.full_name || null,
          investor_email: investor?.email || null,
        },
        messages: messages.map(serializeMessage),
      },
    });
  } catch (error) {
    return handleError(res, error, 'getAdminTicket');
  }
}

/**
 * POST /api/v1/admin/support/tickets/:id/reply
 */
export async function adminReplyTicket(req, res) {
  try {
    const files = req.files || [];
    if (files.length > MAX_ATTACHMENTS) {
      cleanupUploadedFiles(files);
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_ATTACHMENTS} attachments allowed`,
        error: 'VALIDATION_ERROR',
      });
    }

    const ticket = await getTicketByIdOrCode(req.params.id);
    const result = await addTicketReply(
      ticket.id,
      'admin',
      req.user.userId,
      req.body.message,
      mapUploadedAttachments(files)
    );

    const investor = await findUserById(ticket.investor_id);

    sendEmail(investor?.email, 'support', {
      investorName: investor?.full_name || 'Tikhat Partner',
      ticketId: ticket.ticket_id,
      category: getCategoryLabel(ticket.category),
      messagePreview: String(req.body.message || '').trim(),
      eventLabel: 'New reply on your ticket',
      referenceId: ticket.ticket_id,
      recipientType: 'investor',
    }).catch((err) => {
      logger.warn(`[Support] Admin reply email failed: ${err.message}`);
    });

    createNotification(
      ticket.investor_id,
      'Support ticket reply',
      `Admin replied to ticket ${ticket.ticket_id}.`,
      NOTIFICATION_TYPES.SUPPORT,
      ticket.ticket_id,
      'support_ticket'
    ).catch((err) => {
      logger.warn(`[Support] Investor notification failed: ${err.message}`);
    });

    await logAction(
      req.user.userId,
      `Replied to support ticket ${ticket.ticket_id}`,
      AUDIT_ENTITY_TYPES.SUPPORT,
      ticket.id,
      null,
      { ticket_id: ticket.ticket_id },
      req.ipAddress || null
    );

    return res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      data: {
        ticket: serializeTicket(result.ticket),
        message: serializeMessage(result.message),
      },
    });
  } catch (error) {
    cleanupUploadedFiles(req.files);
    return handleError(res, error, 'adminReplyTicket');
  }
}

/**
 * PATCH /api/v1/admin/support/tickets/:id/status
 * Body: { status: in_progress | resolved | closed }
 */
export async function patchTicketStatus(req, res) {
  try {
    const before = await getTicketByIdOrCode(req.params.id);
    const nextStatus = String(req.body.status || '')
      .trim()
      .toLowerCase();
    const escalated = Boolean(
      before.is_escalated ?? before.escalated_to_super_admin
    );

    if (
      escalated &&
      (nextStatus === 'resolved' || nextStatus === 'closed') &&
      req.user.role !== 'super_admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can resolve or close escalated tickets',
        error: 'AUTH_FORBIDDEN',
      });
    }

    const after = await updateTicketStatus(req.params.id, nextStatus);

    if (after.status === 'resolved' || after.status === 'closed') {
      const investor = await findUserById(after.investor_id);
      const eventLabel =
        after.status === 'resolved' ? 'Ticket resolved' : 'Ticket closed';

      sendEmail(investor?.email, 'support', {
        investorName: investor?.full_name || 'Tikhat Partner',
        ticketId: after.ticket_id,
        category: getCategoryLabel(after.category),
        messagePreview: after.subject,
        eventLabel,
        referenceId: after.ticket_id,
        recipientType: 'investor',
      }).catch((err) => {
        logger.warn(`[Support] Status email failed: ${err.message}`);
      });

      createNotification(
        after.investor_id,
        eventLabel,
        `Your support ticket ${after.ticket_id} is now ${after.status}.`,
        NOTIFICATION_TYPES.SUPPORT,
        after.ticket_id,
        'support_ticket'
      ).catch((err) => {
        logger.warn(`[Support] Status notification failed: ${err.message}`);
      });
    }

    await logAction(
      req.user.userId,
      `Changed support ticket status to ${after.status}`,
      AUDIT_ENTITY_TYPES.SUPPORT,
      after.id,
      { status: before.status },
      { status: after.status, ticket_id: after.ticket_id },
      req.ipAddress || null
    );

    return res.status(200).json({
      success: true,
      message: 'Ticket status updated',
      data: {
        ticket: serializeTicket(after),
      },
    });
  } catch (error) {
    return handleError(res, error, 'patchTicketStatus');
  }
}

/**
 * PATCH /api/v1/admin/support/tickets/:id/assign
 * Body: { admin_id }
 */
export async function assignTicketToAdmin(req, res) {
  try {
    const adminId = req.body.admin_id;
    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: 'admin_id is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const before = await getTicketByIdOrCode(req.params.id);
    const { ticket, assignedAdmin } = await assignTicket(req.params.id, adminId);

    await createAdminNotification(
      assignedAdmin.id,
      'Support ticket assigned',
      `Ticket ${ticket.ticket_id} (${ticket.subject}) was assigned to you.`,
      ticket.ticket_id
    );

    await logAction(
      req.user.userId,
      `Assigned support ticket to ${assignedAdmin.full_name}`,
      AUDIT_ENTITY_TYPES.SUPPORT,
      ticket.id,
      { assigned_to: before.assigned_to },
      { assigned_to: ticket.assigned_to, ticket_id: ticket.ticket_id },
      req.ipAddress || null
    );

    return res.status(200).json({
      success: true,
      message: 'Ticket assigned successfully',
      data: {
        ticket: serializeTicket(ticket),
        assigned_admin: {
          id: assignedAdmin.id,
          full_name: assignedAdmin.full_name,
          email: assignedAdmin.email,
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'assignTicketToAdmin');
  }
}

// ---------------------------------------------------------------------------
// Task 8.4 — Support summary APIs
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/admin/support/summary
 */
export async function getSupportSummary(req, res) {
  try {
    const result = await query(
      `SELECT
         COUNT(*)::INTEGER AS total_tickets,
         COUNT(*) FILTER (WHERE status = 'open')::INTEGER AS open_count,
         COUNT(*) FILTER (WHERE status = 'in_progress')::INTEGER AS in_progress_count,
         COUNT(*) FILTER (WHERE status = 'resolved')::INTEGER AS resolved_count,
         COUNT(*) FILTER (WHERE status = 'closed')::INTEGER AS closed_count,
         COUNT(*) FILTER (
           WHERE escalated_to_super_admin = TRUE
         )::INTEGER AS escalated_count
       FROM support_tickets`
    );

    const row = result.rows[0] || {};

    return res.status(200).json({
      success: true,
      message: 'Support summary retrieved',
      data: {
        total_tickets: Math.round(Number(row.total_tickets) || 0),
        open_count: Math.round(Number(row.open_count) || 0),
        in_progress_count: Math.round(Number(row.in_progress_count) || 0),
        resolved_count: Math.round(Number(row.resolved_count) || 0),
        closed_count: Math.round(Number(row.closed_count) || 0),
        escalated_count: Math.round(Number(row.escalated_count) || 0),
      },
    });
  } catch (error) {
    return handleError(res, error, 'getSupportSummary');
  }
}

/**
 * GET /api/v1/admin/support/investor/:id/tickets
 */
export async function getInvestorSupportTickets(req, res) {
  try {
    const investorId = req.params.id;
    const investor = await findUserById(investorId);
    if (!investor || investor.is_deleted) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'USER_NOT_FOUND',
      });
    }

    const data = await listAdminTickets({
      investor_id: investorId,
      status: req.query.status,
      category: req.query.category,
      page: req.query.page,
      limit: req.query.limit,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
    });

    return res.status(200).json({
      success: true,
      message: 'Investor support tickets retrieved',
      data: {
        investor: {
          id: investor.id,
          full_name: investor.full_name,
          email: investor.email,
        },
        tickets: data.tickets.map((row) => ({
          ...serializeTicket(row),
          investor_name: row.investor_name,
          investor_email: row.investor_email,
          assigned_admin_name: row.assigned_admin_name || null,
        })),
        meta: data.meta,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getInvestorSupportTickets');
  }
}

/**
 * GET /api/v1/admin/support/tickets/escalated
 */
export async function listEscalatedTickets(req, res) {
  try {
    const data = await listAdminTickets({
      escalated: true,
      status: req.query.status,
      category: req.query.category,
      investor_id: req.query.investor_id,
      assigned_to: req.query.assigned_to,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      investor_name: req.query.investor_name,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json({
      success: true,
      message: 'Escalated support tickets retrieved',
      data: {
        tickets: data.tickets.map((row) => ({
          ...serializeTicket(row),
          investor_name: row.investor_name,
          investor_email: row.investor_email,
          assigned_admin_name: row.assigned_admin_name || null,
        })),
        meta: data.meta,
      },
    });
  } catch (error) {
    return handleError(res, error, 'listEscalatedTickets');
  }
}
