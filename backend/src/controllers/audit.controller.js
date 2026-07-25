import { getActivityLogs } from '../services/audit.service.js';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';

const DEFAULT_AUDIT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_CRON_LIMIT = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
 * @param {import('express').Request} req
 * @returns {object}
 */
function pickAuditFilters(req) {
  const q = req.query || {};
  return {
    adminId: q.admin_id || q.adminId || undefined,
    entityType: q.entity_type || q.entityType || undefined,
    action: q.action || undefined,
    startDate: q.start_date || q.startDate || undefined,
    endDate: q.end_date || q.endDate || undefined,
    entityId: q.entity_id || q.entityId || undefined,
  };
}

/**
 * GET /api/v1/admin/audit-logs
 * Query: admin_id, entity_type, action, start_date, end_date, entity_id, page, limit
 */
export async function listAuditLogs(req, res) {
  try {
    const filters = pickAuditFilters(req);
    const page = req.query.page;
    let limit = toPositiveInt(req.query.limit, DEFAULT_AUDIT_LIMIT);
    if (limit > MAX_LIMIT) {
      limit = MAX_LIMIT;
    }

    const result = await getActivityLogs(filters, { page, limit });

    return res.status(200).json({
      success: true,
      message: 'Audit logs retrieved successfully',
      data: {
        logs: result.logs,
        meta: result.meta,
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

    logger.error(`[Audit] listAuditLogs: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve audit logs',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/v1/admin/audit-logs/investor/:id
 * All admin actions targeting a specific investor entity_id.
 */
export async function listInvestorAuditLogs(req, res) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investor id',
        error: 'VALIDATION_ERROR',
      });
    }

    const filters = pickAuditFilters(req);
    filters.entityId = id;

    const page = req.query.page;
    let limit = toPositiveInt(req.query.limit, DEFAULT_AUDIT_LIMIT);
    if (limit > MAX_LIMIT) {
      limit = MAX_LIMIT;
    }

    const result = await getActivityLogs(filters, { page, limit });

    return res.status(200).json({
      success: true,
      message: 'Investor audit logs retrieved successfully',
      data: {
        investor_id: id,
        logs: result.logs,
        meta: result.meta,
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

    logger.error(`[Audit] listInvestorAuditLogs: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve investor audit logs',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/v1/admin/cron-logs
 * Query: job_name, status, start_date / end_date (or date), page, limit
 */
export async function listCronLogs(req, res) {
  try {
    const page = toPositiveInt(req.query.page, 1);
    let limit = toPositiveInt(req.query.limit, DEFAULT_CRON_LIMIT);
    if (limit > MAX_LIMIT) {
      limit = MAX_LIMIT;
    }
    const offset = (page - 1) * limit;

    const jobName = req.query.job_name
      ? String(req.query.job_name).trim()
      : '';
    const status = req.query.status ? String(req.query.status).trim() : '';
    const startDate =
      req.query.start_date || req.query.startDate || req.query.date || '';
    const endDate = req.query.end_date || req.query.endDate || startDate || '';

    const where = [];
    const params = [];

    if (jobName) {
      params.push(jobName);
      where.push(`job_name = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(String(startDate).trim())) {
      params.push(`${String(startDate).trim()}T00:00:00.000+05:30`);
      where.push(`started_at >= $${params.length}::timestamptz`);
    }
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(String(endDate).trim())) {
      params.push(`${String(endDate).trim()}T23:59:59.999+05:30`);
      where.push(`started_at <= $${params.length}::timestamptz`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM cron_job_logs
       ${whereSql}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    params.push(limit, offset);
    const listResult = await query(
      `SELECT
         id,
         job_name,
         started_at,
         completed_at,
         status,
         processed_count,
         failed_count,
         total_amount,
         error_details,
         created_at,
         updated_at
       FROM cron_job_logs
       ${whereSql}
       ORDER BY started_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const logs = listResult.rows.map((row) => ({
      ...row,
      total_amount_formatted: formatCurrency(
        Math.round(Number(row.total_amount) || 0)
      ),
      started_at_formatted: row.started_at ? formatDate(row.started_at) : null,
      completed_at_formatted: row.completed_at
        ? formatDate(row.completed_at)
        : null,
    }));

    return res.status(200).json({
      success: true,
      message: 'Cron job logs retrieved',
      data: {
        logs,
        meta: {
          total,
          page,
          limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error(`[Audit] listCronLogs: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve cron logs',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/v1/admin/cron-logs/latest
 * Latest execution of each cron job (by job_name).
 */
export async function listLatestCronLogs(req, res) {
  try {
    const result = await query(
      `SELECT DISTINCT ON (job_name)
         id,
         job_name,
         started_at,
         completed_at,
         status,
         processed_count,
         failed_count,
         total_amount,
         error_details,
         created_at,
         updated_at
       FROM cron_job_logs
       ORDER BY job_name ASC, started_at DESC`
    );

    const logs = result.rows.map((row) => ({
      ...row,
      total_amount_formatted: formatCurrency(
        Math.round(Number(row.total_amount) || 0)
      ),
      started_at_formatted: row.started_at ? formatDate(row.started_at) : null,
      completed_at_formatted: row.completed_at
        ? formatDate(row.completed_at)
        : null,
    }));

    return res.status(200).json({
      success: true,
      message: 'Latest cron job logs retrieved',
      data: {
        logs,
        count: logs.length,
      },
    });
  } catch (error) {
    logger.error(`[Audit] listLatestCronLogs: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve latest cron logs',
      error: 'INTERNAL_ERROR',
    });
  }
}
