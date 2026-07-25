import { query, pool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import {
  generateTransactionId,
  TRANSACTION_TYPES,
} from '../services/transaction.service.js';

export const TICKET_CATEGORIES = Object.freeze([
  'capital',
  'revenue',
  'withdrawal',
  'kyc_profile',
  'technical',
  'other',
]);

export const TICKET_STATUSES = Object.freeze([
  'open',
  'in_progress',
  'resolved',
  'closed',
]);

export const CATEGORY_LABELS = Object.freeze({
  capital: 'Capital Related',
  revenue: 'Revenue Related',
  withdrawal: 'Withdrawal Related',
  kyc_profile: 'KYC/Profile Related',
  technical: 'Technical Issue',
  other: 'Other',
});

const TICKET_COLUMNS = `
  id,
  ticket_id,
  investor_id,
  category,
  subject,
  status,
  assigned_to,
  escalated_to_super_admin,
  escalated_at,
  created_at,
  updated_at
`;

const MESSAGE_COLUMNS = `
  id,
  ticket_id,
  sender_type,
  sender_id,
  message,
  created_at,
  updated_at
`;

const ATTACHMENT_COLUMNS = `
  id,
  message_id,
  ticket_id,
  file_url,
  file_name,
  file_type,
  file_size,
  created_at,
  updated_at
`;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class SupportError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} [status]
   */
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'SupportError';
    this.code = code;
    this.status = status;
  }
}

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
 * @param {string} category
 * @returns {string}
 */
export function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

/**
 * Resolve ticket by UUID id or human ticket_id (TKT-SUP-...).
 * @param {string} idOrTicketId
 * @param {string | null} [investorId] - when set, scopes to that investor
 * @returns {Promise<object>}
 */
export async function getTicketByIdOrCode(idOrTicketId, investorId = null) {
  const params = [idOrTicketId];
  let sql = `
    SELECT ${TICKET_COLUMNS}
    FROM support_tickets
    WHERE (id::text = $1 OR ticket_id = $1)
  `;

  if (investorId) {
    params.push(investorId);
    sql += ` AND investor_id = $2`;
  }

  sql += ' LIMIT 1';

  const result = await query(sql, params);
  const row = result.rows[0];
  if (!row) {
    throw new SupportError('Support ticket not found', 'USER_NOT_FOUND', 404);
  }
  return row;
}

/**
 * @param {string} ticketUuid
 * @returns {Promise<object[]>}
 */
export async function getTicketMessages(ticketUuid) {
  const messages = await query(
    `SELECT ${MESSAGE_COLUMNS}
     FROM ticket_messages
     WHERE ticket_id = $1
     ORDER BY created_at ASC`,
    [ticketUuid]
  );

  if (messages.rows.length === 0) {
    return [];
  }

  const messageIds = messages.rows.map((m) => m.id);
  const attachments = await query(
    `SELECT ${ATTACHMENT_COLUMNS}
     FROM ticket_attachments
     WHERE message_id = ANY($1::UUID[])
     ORDER BY created_at ASC`,
    [messageIds]
  );

  const byMessage = new Map();
  for (const att of attachments.rows) {
    if (!byMessage.has(att.message_id)) {
      byMessage.set(att.message_id, []);
    }
    byMessage.get(att.message_id).push(att);
  }

  return messages.rows.map((msg) => ({
    ...msg,
    attachments: byMessage.get(msg.id) || [],
  }));
}

/**
 * @param {object} input
 * @param {string} input.investorId
 * @param {string} input.category
 * @param {string} input.subject
 * @param {string} input.message
 * @param {Array<{ file_url: string, file_name: string, file_type: string, file_size: number }>} [input.attachments]
 * @returns {Promise<{ ticket: object, message: object, attachments: object[] }>}
 */
export async function createTicket({
  investorId,
  category,
  subject,
  message,
  attachments = [],
}) {
  const normalizedCategory = String(category || '')
    .trim()
    .toLowerCase();
  if (!TICKET_CATEGORIES.includes(normalizedCategory)) {
    throw new SupportError(
      `Invalid category. Allowed: ${TICKET_CATEGORIES.join(', ')}`,
      'VALIDATION_ERROR',
      400
    );
  }

  const subjectText = String(subject || '').trim();
  if (!subjectText || subjectText.length > 500) {
    throw new SupportError(
      'Subject is required (max 500 characters)',
      'VALIDATION_ERROR',
      400
    );
  }

  const messageText = String(message || '').trim();
  if (!messageText) {
    throw new SupportError('Message is required', 'VALIDATION_ERROR', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ticketCode = await generateTransactionId(TRANSACTION_TYPES.SUP, {
      client,
    });

    const ticketResult = await client.query(
      `INSERT INTO support_tickets (
         ticket_id, investor_id, category, subject, status
       ) VALUES ($1, $2, $3, $4, 'open')
       RETURNING ${TICKET_COLUMNS}`,
      [ticketCode, investorId, normalizedCategory, subjectText]
    );
    const ticket = ticketResult.rows[0];

    const messageResult = await client.query(
      `INSERT INTO ticket_messages (
         ticket_id, sender_type, sender_id, message
       ) VALUES ($1, 'investor', $2, $3)
       RETURNING ${MESSAGE_COLUMNS}`,
      [ticket.id, investorId, messageText]
    );
    const msg = messageResult.rows[0];

    const savedAttachments = [];
    for (const file of attachments) {
      const att = await client.query(
        `INSERT INTO ticket_attachments (
           message_id, ticket_id, file_url, file_name, file_type, file_size
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${ATTACHMENT_COLUMNS}`,
        [
          msg.id,
          ticket.id,
          file.file_url,
          file.file_name,
          file.file_type,
          file.file_size,
        ]
      );
      savedAttachments.push(att.rows[0]);
    }

    await client.query('COMMIT');

    logger.info('Support ticket created', {
      ticketId: ticket.ticket_id,
      investorId,
      category: normalizedCategory,
    });

    return {
      ticket,
      message: { ...msg, attachments: savedAttachments },
      attachments: savedAttachments,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {string} investorId
 * @param {object} filters
 * @returns {Promise<{ tickets: object[], meta: object }>}
 */
export async function listInvestorTickets(investorId, filters = {}) {
  const page = toPositiveInt(filters.page, DEFAULT_PAGE);
  let limit = toPositiveInt(filters.limit, DEFAULT_LIMIT);
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  const offset = (page - 1) * limit;

  const conditions = ['st.investor_id = $1'];
  const params = [investorId];

  if (filters.status) {
    const status = String(filters.status).trim().toLowerCase();
    if (!TICKET_STATUSES.includes(status)) {
      throw new SupportError('Invalid status filter', 'VALIDATION_ERROR', 400);
    }
    params.push(status);
    conditions.push(`st.status = $${params.length}`);
  }

  if (filters.category) {
    const category = String(filters.category).trim().toLowerCase();
    if (!TICKET_CATEGORIES.includes(category)) {
      throw new SupportError('Invalid category filter', 'VALIDATION_ERROR', 400);
    }
    params.push(category);
    conditions.push(`st.category = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM support_tickets st
     WHERE ${where}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  params.push(limit, offset);
  const listResult = await query(
    `SELECT
       st.id,
       st.ticket_id,
       st.investor_id,
       st.category,
       st.subject,
       st.status,
       st.assigned_to,
       st.escalated_to_super_admin,
       st.escalated_at,
       st.created_at,
       st.updated_at,
       st.escalated_to_super_admin AS is_escalated
     FROM support_tickets st
     WHERE ${where}
     ORDER BY st.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    tickets: listResult.rows.map((row) => ({
      ...row,
      is_escalated: Boolean(row.is_escalated ?? row.escalated_to_super_admin),
      category_label: getCategoryLabel(row.category),
    })),
    meta: {
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

/**
 * @param {string} ticketUuid
 * @param {string} senderType
 * @param {string} senderId
 * @param {string} message
 * @param {Array<object>} [attachments]
 * @returns {Promise<object>}
 */
export async function addTicketReply(
  ticketUuid,
  senderType,
  senderId,
  message,
  attachments = []
) {
  const messageText = String(message || '').trim();
  if (!messageText) {
    throw new SupportError('Message is required', 'VALIDATION_ERROR', 400);
  }

  if (senderType !== 'investor' && senderType !== 'admin') {
    throw new SupportError('Invalid sender type', 'VALIDATION_ERROR', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ticketLock = await client.query(
      `SELECT ${TICKET_COLUMNS}
       FROM support_tickets
       WHERE id = $1
       FOR UPDATE`,
      [ticketUuid]
    );
    const ticket = ticketLock.rows[0];
    if (!ticket) {
      throw new SupportError('Support ticket not found', 'USER_NOT_FOUND', 404);
    }

    if (ticket.status === 'closed' && senderType === 'investor') {
      throw new SupportError(
        'Cannot reply to a closed ticket',
        'VALIDATION_ERROR',
        400
      );
    }

    const messageResult = await client.query(
      `INSERT INTO ticket_messages (
         ticket_id, sender_type, sender_id, message
       ) VALUES ($1, $2, $3, $4)
       RETURNING ${MESSAGE_COLUMNS}`,
      [ticketUuid, senderType, senderId, messageText]
    );
    const msg = messageResult.rows[0];

    const savedAttachments = [];
    for (const file of attachments) {
      const att = await client.query(
        `INSERT INTO ticket_attachments (
           message_id, ticket_id, file_url, file_name, file_type, file_size
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${ATTACHMENT_COLUMNS}`,
        [
          msg.id,
          ticketUuid,
          file.file_url,
          file.file_name,
          file.file_type,
          file.file_size,
        ]
      );
      savedAttachments.push(att.rows[0]);
    }

    // Admin reply on open ticket → move to in_progress
    if (senderType === 'admin' && ticket.status === 'open') {
      await client.query(
        `UPDATE support_tickets
         SET status = 'in_progress', updated_at = NOW()
         WHERE id = $1`,
        [ticketUuid]
      );
      ticket.status = 'in_progress';
    } else {
      await client.query(
        `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
        [ticketUuid]
      );
    }

    await client.query('COMMIT');

    return {
      ticket,
      message: { ...msg, attachments: savedAttachments },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reopen a resolved ticket (investor).
 * @param {string} ticketUuid
 * @param {string} investorId
 * @returns {Promise<object>}
 */
export async function reopenTicket(ticketUuid, investorId) {
  const existing = await getTicketByIdOrCode(ticketUuid, investorId);

  if (existing.status === 'closed') {
    throw new SupportError(
      'Closed tickets cannot be reopened',
      'VALIDATION_ERROR',
      400
    );
  }

  if (existing.status !== 'resolved') {
    throw new SupportError(
      'Only resolved tickets can be reopened',
      'VALIDATION_ERROR',
      400
    );
  }

  const result = await query(
    `UPDATE support_tickets
     SET status = 'open',
         updated_at = NOW()
     WHERE id = $1
       AND investor_id = $2
       AND status = 'resolved'
     RETURNING ${TICKET_COLUMNS}`,
    [existing.id, investorId]
  );

  if (result.rowCount === 0) {
    throw new SupportError(
      'Only resolved tickets can be reopened',
      'VALIDATION_ERROR',
      400
    );
  }

  return result.rows[0];
}

/**
 * Admin list with filters + sort.
 * @param {object} filters
 * @returns {Promise<{ tickets: object[], meta: object }>}
 */
export async function listAdminTickets(filters = {}) {
  const page = toPositiveInt(filters.page, DEFAULT_PAGE);
  let limit = toPositiveInt(filters.limit, DEFAULT_LIMIT);
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  const offset = (page - 1) * limit;

  const conditions = ['TRUE'];
  const params = [];

  if (filters.status) {
    const status = String(filters.status).trim().toLowerCase();
    if (!TICKET_STATUSES.includes(status)) {
      throw new SupportError('Invalid status filter', 'VALIDATION_ERROR', 400);
    }
    params.push(status);
    conditions.push(`st.status = $${params.length}`);
  }

  if (filters.category) {
    const category = String(filters.category).trim().toLowerCase();
    if (!TICKET_CATEGORIES.includes(category)) {
      throw new SupportError('Invalid category filter', 'VALIDATION_ERROR', 400);
    }
    params.push(category);
    conditions.push(`st.category = $${params.length}`);
  }

  if (filters.investor_id) {
    params.push(String(filters.investor_id).trim());
    conditions.push(`st.investor_id = $${params.length}`);
  }

  if (filters.assigned_to) {
    params.push(String(filters.assigned_to).trim());
    conditions.push(`st.assigned_to = $${params.length}`);
  }

  if (filters.date_from) {
    params.push(String(filters.date_from).trim());
    conditions.push(
      `(st.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $${params.length}::date`
    );
  }

  if (filters.date_to) {
    params.push(String(filters.date_to).trim());
    conditions.push(
      `(st.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $${params.length}::date`
    );
  }

  if (filters.investor_name) {
    params.push(`%${String(filters.investor_name).trim()}%`);
    conditions.push(`u.full_name ILIKE $${params.length}`);
  }

  if (filters.escalated === true || filters.escalated === 'true') {
    conditions.push('st.escalated_to_super_admin = TRUE');
  }

  const sortBy = String(filters.sort_by || 'date').trim().toLowerCase();
  const sortOrder =
    String(filters.sort_order || 'desc').trim().toLowerCase() === 'asc'
      ? 'ASC'
      : 'DESC';

  let orderClause = `st.created_at ${sortOrder}`;
  if (sortBy === 'status') {
    orderClause = `st.status ${sortOrder}, st.created_at DESC`;
  } else if (sortBy === 'investor_name' || sortBy === 'investor') {
    orderClause = `u.full_name ${sortOrder}, st.created_at DESC`;
  } else if (sortBy === 'category') {
    orderClause = `st.category ${sortOrder}, st.created_at DESC`;
  } else if (sortBy === 'date') {
    orderClause = `st.created_at ${sortOrder}`;
  }

  const where = conditions.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM support_tickets st
     INNER JOIN users u ON u.id = st.investor_id
     WHERE ${where}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  params.push(limit, offset);
  const listResult = await query(
    `SELECT
       st.id,
       st.ticket_id,
       st.investor_id,
       st.category,
       st.subject,
       st.status,
       st.assigned_to,
       st.escalated_to_super_admin,
       st.escalated_at,
       st.created_at,
       st.updated_at,
       st.escalated_to_super_admin AS is_escalated,
       u.full_name AS investor_name,
       u.email AS investor_email,
       a.full_name AS assigned_admin_name
     FROM support_tickets st
     INNER JOIN users u ON u.id = st.investor_id
     LEFT JOIN admins a ON a.id = st.assigned_to
     WHERE ${where}
     ORDER BY ${orderClause}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    tickets: listResult.rows.map((row) => ({
      ...row,
      is_escalated: Boolean(row.is_escalated),
      category_label: getCategoryLabel(row.category),
    })),
    meta: {
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

/**
 * @param {string} ticketUuid
 * @param {string} status
 * @returns {Promise<object>}
 */
export async function updateTicketStatus(ticketUuid, status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!['in_progress', 'resolved', 'closed'].includes(normalized)) {
    throw new SupportError(
      'Status must be in_progress, resolved, or closed',
      'VALIDATION_ERROR',
      400
    );
  }

  const existing = await getTicketByIdOrCode(ticketUuid);

  const result = await query(
    `UPDATE support_tickets
     SET status = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${TICKET_COLUMNS}`,
    [existing.id, normalized]
  );

  return result.rows[0];
}

/**
 * @param {string} ticketUuid
 * @param {string} adminId
 * @returns {Promise<object>}
 */
export async function assignTicket(ticketUuid, adminId) {
  const existing = await getTicketByIdOrCode(ticketUuid);

  const admin = await query(
    `SELECT id, full_name, email, status
     FROM admins
     WHERE id = $1
       AND status = 'active'
     LIMIT 1`,
    [adminId]
  );

  if (!admin.rows[0]) {
    throw new SupportError('Admin not found or inactive', 'USER_NOT_FOUND', 404);
  }

  const result = await query(
    `UPDATE support_tickets
     SET assigned_to = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${TICKET_COLUMNS}`,
    [existing.id, adminId]
  );

  return {
    ticket: result.rows[0],
    assignedAdmin: admin.rows[0],
  };
}
