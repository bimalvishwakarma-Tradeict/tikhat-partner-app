import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { formatCurrency } from '../utils/formatCurrency.js';

export const AUDIT_ENTITY_TYPES = Object.freeze({
  INVESTOR: 'investor',
  ADMIN: 'admin',
  CAPITAL: 'capital',
  REVENUE: 'revenue',
  WITHDRAWAL: 'withdrawal',
  SUPPORT: 'support',
  PROFILE: 'profile',
  KYC: 'kyc',
  SETTINGS: 'settings',
  BACKDATE: 'backdate',
  NOTIFICATION: 'notification',
  OTHER: 'other',
});

const VALID_ENTITY_TYPES = new Set(Object.values(AUDIT_ENTITY_TYPES));

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ACTION_MAX_LENGTH = 100;

const LOG_COLUMNS = `
  aal.id,
  aal.admin_id,
  adm.full_name AS admin_name,
  adm.email AS admin_email,
  aal.action,
  aal.entity_type,
  aal.entity_id,
  aal.old_value,
  aal.new_value,
  aal.ip_address,
  aal.created_at
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
 * Normalize date filter to Date or null (IST day bounds for YYYY-MM-DD).
 * @param {unknown} value
 * @param {'start' | 'end'} bound
 * @returns {Date | null}
 */
function toDateBound(value, bound) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const day = value.trim();
    return bound === 'start'
      ? new Date(`${day}T00:00:00.000+05:30`)
      : new Date(`${day}T23:59:59.999+05:30`);
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Build a human-readable audit action description.
 * Example: "Approved capital deposit of ₹50,000"
 *
 * @param {string} verb - e.g. Approved, Rejected, Updated
 * @param {string} subject - e.g. capital deposit, profile update
 * @param {number | string | null} [amount]
 * @returns {string}
 */
export function buildActionDescription(verb, subject, amount = null) {
  let description = `${String(verb).trim()} ${String(subject).trim()}`.trim();

  if (amount != null && amount !== '') {
    const formatted =
      typeof amount === 'number' ? formatCurrency(amount) : String(amount);
    description = `${description} of ${formatted}`;
  }

  return description.slice(0, ACTION_MAX_LENGTH);
}

/**
 * Persist an admin activity audit log entry.
 *
 * @param {string} adminId
 * @param {string} action - Human-readable description
 * @param {string} entityType
 * @param {string | null} entityId
 * @param {object | null} oldValue
 * @param {object | null} newValue
 * @param {string | null} ipAddress
 * @returns {Promise<object>}
 */
export async function logAction(
  adminId,
  action,
  entityType,
  entityId,
  oldValue,
  newValue,
  ipAddress
) {
  if (!adminId) {
    const error = new Error('Admin ID is required');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const actionText = String(action || '').trim();
  if (!actionText) {
    const error = new Error('Action description is required');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (!VALID_ENTITY_TYPES.has(entityType)) {
    const error = new Error(
      `Invalid entity type: ${entityType}. Allowed: ${[...VALID_ENTITY_TYPES].join(', ')}`
    );
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const result = await query(
    `INSERT INTO admin_activity_logs (
       admin_id,
       action,
       entity_type,
       entity_id,
       old_value,
       new_value,
       ip_address
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
     RETURNING
       id,
       admin_id,
       action,
       entity_type,
       entity_id,
       old_value,
       new_value,
       ip_address,
       created_at`,
    [
      adminId,
      actionText.slice(0, ACTION_MAX_LENGTH),
      entityType,
      entityId || null,
      oldValue == null ? null : JSON.stringify(oldValue),
      newValue == null ? null : JSON.stringify(newValue),
      ipAddress || null,
    ]
  );

  const log = result.rows[0];

  logger.info('Admin activity logged', {
    logId: log.id,
    adminId,
    action: log.action,
    entityType,
  });

  return log;
}

/**
 * Filterable, paginated admin activity logs.
 *
 * @param {object} [filters]
 * @param {string} [filters.adminId]
 * @param {string} [filters.entityType]
 * @param {string} [filters.action] - Case-insensitive partial match
 * @param {string | Date} [filters.startDate]
 * @param {string | Date} [filters.endDate]
 * @param {string} [filters.entityId]
 * @param {object} [pagination]
 * @param {number | string} [pagination.page]
 * @param {number | string} [pagination.limit]
 * @returns {Promise<{ logs: object[], meta: object }>}
 */
export async function getActivityLogs(filters = {}, pagination = {}) {
  const page = toPositiveInt(pagination.page, DEFAULT_PAGE);
  let limit = toPositiveInt(pagination.limit, DEFAULT_LIMIT);
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  let i = 1;

  if (filters.adminId) {
    where.push(`aal.admin_id = $${i}`);
    params.push(filters.adminId);
    i += 1;
  }

  if (filters.entityType) {
    if (!VALID_ENTITY_TYPES.has(filters.entityType)) {
      const error = new Error(`Invalid entity type filter: ${filters.entityType}`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    where.push(`aal.entity_type = $${i}`);
    params.push(filters.entityType);
    i += 1;
  }

  if (filters.action) {
    where.push(`aal.action ILIKE $${i}`);
    params.push(`%${String(filters.action).trim()}%`);
    i += 1;
  }

  if (filters.entityId) {
    where.push(`aal.entity_id = $${i}`);
    params.push(String(filters.entityId));
    i += 1;
  }

  const startDate = toDateBound(filters.startDate, 'start');
  if (startDate) {
    where.push(`aal.created_at >= $${i}`);
    params.push(startDate.toISOString());
    i += 1;
  }

  const endDate = toDateBound(filters.endDate, 'end');
  if (endDate) {
    where.push(`aal.created_at <= $${i}`);
    params.push(endDate.toISOString());
    i += 1;
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM admin_activity_logs aal
     ${whereSql}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  const listParams = [...params, limit, offset];
  const listResult = await query(
    `SELECT ${LOG_COLUMNS}
     FROM admin_activity_logs aal
     INNER JOIN admins adm ON adm.id = aal.admin_id
     ${whereSql}
     ORDER BY aal.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    listParams
  );

  return {
    logs: listResult.rows,
    meta: {
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}
