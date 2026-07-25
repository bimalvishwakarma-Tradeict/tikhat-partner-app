import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import {
  logAction,
  buildActionDescription,
  AUDIT_ENTITY_TYPES,
} from '../services/audit.service.js';
import {
  ensureRevenueCreditSchedule,
  parseRevenueCreditTime,
} from '../crons/revenue.cron.js';
import {
  RevenueError,
  getCreditSettings,
  updateCreditSettings,
} from '../models/revenue.model.js';
import { attemptEmailDelivery } from '../services/email.service.js';
import {
  performBackup,
  getBackupDirectory,
  ensureBackupDirectory,
} from '../services/backup.service.js';
import fs from 'fs';
import path from 'path';

const MAINTENANCE_KEY = 'maintenance_mode';
const CREDIT_TIME_KEY = 'revenue_credit_time';

const TERMS_KEY = 'terms_and_conditions';
const TERMS_HISTORY_KEY = 'terms_and_conditions_history';
const TERMS_VERSION_KEY = 'terms_and_conditions_version';
const PRIVACY_KEY = 'privacy_policy';
const PRIVACY_HISTORY_KEY = 'privacy_policy_history';
const PRIVACY_VERSION_KEY = 'privacy_policy_version';
const MAX_LEGAL_HISTORY = 5;

const EMAIL_LOG_DEFAULT_PAGE = 1;
const EMAIL_LOG_DEFAULT_LIMIT = 20;
const EMAIL_LOG_MAX_LIMIT = 100;
const EMAIL_LOG_MAX_ATTEMPTS = 3;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @type {Record<string, string> | null} */
let settingsCache = null;

/**
 * @param {import('express').Request} req
 * @param {string} action
 * @param {string | null} entityId
 * @param {object | null} oldValue
 * @param {object | null} newValue
 */
async function audit(req, action, entityId, oldValue, newValue) {
  await logAction(
    req.user.userId,
    action,
    AUDIT_ENTITY_TYPES.SETTINGS,
    entityId,
    oldValue,
    newValue,
    req.ipAddress || null
  );
}

/**
 * Load all global settings from DB into a key→value map.
 * @returns {Promise<Record<string, string>>}
 */
async function loadSettingsFromDb() {
  const result = await query(
    `SELECT key, value, updated_by, updated_at, created_at
     FROM global_settings
     ORDER BY key ASC`
  );

  /** @type {Record<string, string>} */
  const map = {};
  for (const row of result.rows) {
    map[row.key] = row.value;
  }
  return map;
}

/**
 * Cached settings map (refreshed on change / first load).
 * @returns {Promise<Record<string, string>>}
 */
export async function getCachedSettings() {
  if (settingsCache) {
    return settingsCache;
  }
  settingsCache = await loadSettingsFromDb();
  return settingsCache;
}

/**
 * Force reload cache from DB.
 * @returns {Promise<Record<string, string>>}
 */
export async function refreshSettingsCache() {
  settingsCache = await loadSettingsFromDb();
  return settingsCache;
}

/**
 * Clear cache (next read reloads).
 */
export function invalidateSettingsCache() {
  settingsCache = null;
}

/**
 * @returns {boolean}
 */
export function isSettingsCacheWarm() {
  return settingsCache !== null;
}

/**
 * Whether maintenance mode is enabled (from cache).
 * @returns {Promise<boolean>}
 */
export async function isMaintenanceModeOn() {
  const settings = await getCachedSettings();
  const value = String(settings[MAINTENANCE_KEY] ?? 'off').toLowerCase().trim();
  return value === 'on' || value === 'true' || value === '1';
}

/**
 * Format HH:MM from hour/minute ints.
 * @param {unknown} hour
 * @param {unknown} minute
 * @returns {string}
 */
function formatCreditTime(hour, minute) {
  const h = Math.round(Number(hour));
  const m = Math.round(Number(minute ?? 0));
  if (!Number.isInteger(h) || h < 0 || h > 23) {
    const error = new Error('revenue_credit_hour must be 0-23');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(m) || m < 0 || m > 59) {
    const error = new Error('revenue_credit_minute must be 0-59');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Upsert a single global setting.
 * @param {string} key
 * @param {string} value
 * @param {string} adminId
 * @returns {Promise<object>}
 */
async function upsertSetting(key, value, adminId) {
  const result = await query(
    `INSERT INTO global_settings (key, value, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (key)
     DO UPDATE SET
       value = EXCLUDED.value,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING id, key, value, updated_by, created_at, updated_at`,
    [key, String(value), adminId]
  );
  return result.rows[0];
}

/**
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context
 */
function handleError(res, error, context) {
  if (error instanceof RevenueError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      error: error.code,
    });
  }

  if (error.code === 'VALIDATION_ERROR') {
    return res.status(error.status || 400).json({
      success: false,
      message: error.message,
      error: 'VALIDATION_ERROR',
    });
  }

  logger.error(`[Settings] ${context}: ${error.message}`, { error });
  return res.status(500).json({
    success: false,
    message: 'Settings request failed',
    error: 'INTERNAL_ERROR',
  });
}

/**
 * Block investor APIs when maintenance mode is on.
 */
export async function maintenanceMiddleware(req, res, next) {
  try {
    const url = String(req.originalUrl || req.url || '');
    if (!url.includes('/api/v1/investor')) {
      return next();
    }

    if (!(await isMaintenanceModeOn())) {
      return next();
    }

    return res.status(503).json({
      success: false,
      message:
        'System is under maintenance. Please try again later.',
      error: 'MAINTENANCE_MODE',
    });
  } catch (error) {
    logger.error(`[Settings] maintenanceMiddleware: ${error.message}`, {
      error,
    });
    // Fail open for unexpected cache/DB errors so admins are not locked out
    return next();
  }
}

/**
 * GET /api/v1/admin/settings
 */
export async function getAllSettings(req, res) {
  try {
    const settings = await getCachedSettings();
    const credit = parseRevenueCreditTime(settings[CREDIT_TIME_KEY] || '18:00');

    return res.status(200).json({
      success: true,
      message: 'Global settings retrieved',
      data: {
        settings,
        revenue_credit_hour: credit.hour,
        revenue_credit_minute: credit.minute,
        revenue_credit_time: settings[CREDIT_TIME_KEY] || '18:00',
        maintenance_mode: settings[MAINTENANCE_KEY] || 'off',
        cache: { warm: isSettingsCacheWarm() },
      },
    });
  } catch (error) {
    return handleError(res, error, 'getAllSettings');
  }
}

/**
 * PATCH /api/v1/admin/settings (Super Admin)
 * Body: flat key/value map and/or revenue_credit_hour + revenue_credit_minute
 */
export async function patchGlobalSettings(req, res) {
  try {
    const body = req.body || {};
    const before = { ...(await getCachedSettings()) };
    /** @type {Record<string, string>} */
    const updates = {};

    const nested =
      body.settings && typeof body.settings === 'object' ? body.settings : {};

    // Merge nested + top-level scalar settings (except hour/minute helpers)
    for (const source of [nested, body]) {
      for (const [key, value] of Object.entries(source)) {
        if (
          key === 'settings' ||
          key === 'revenue_credit_hour' ||
          key === 'revenue_credit_minute'
        ) {
          continue;
        }
        if (typeof value === 'object' && value !== null) {
          continue;
        }
        if (value === undefined) {
          continue;
        }
        updates[key] = String(value);
      }
    }

    // Hour/minute helpers win for credit time
    if (
      body.revenue_credit_hour !== undefined ||
      body.revenue_credit_minute !== undefined ||
      nested.revenue_credit_hour !== undefined ||
      nested.revenue_credit_minute !== undefined
    ) {
      const current = parseRevenueCreditTime(
        before[CREDIT_TIME_KEY] || '18:00'
      );
      const hour =
        body.revenue_credit_hour ??
        nested.revenue_credit_hour ??
        current.hour;
      const minute =
        body.revenue_credit_minute ??
        nested.revenue_credit_minute ??
        current.minute;
      updates[CREDIT_TIME_KEY] = formatCreditTime(hour, minute);
    }

    if (body.revenue_credit_time !== undefined) {
      const parsed = parseRevenueCreditTime(String(body.revenue_credit_time));
      updates[CREDIT_TIME_KEY] =
        `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
    }

    if (body.maintenance_mode !== undefined) {
      const raw = String(body.maintenance_mode).toLowerCase().trim();
      updates[MAINTENANCE_KEY] =
        raw === 'on' || raw === 'true' || raw === '1' ? 'on' : 'off';
    }

    if (Object.keys(updates).length === 0) {
      const error = new Error('No valid settings fields to update');
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }

    const updatedRows = [];
    for (const [key, value] of Object.entries(updates)) {
      updatedRows.push(await upsertSetting(key, value, req.user.userId));
    }

    const after = await refreshSettingsCache();
    let cronSchedule = null;

    if (
      updates[CREDIT_TIME_KEY] &&
      updates[CREDIT_TIME_KEY] !== before[CREDIT_TIME_KEY]
    ) {
      cronSchedule = await ensureRevenueCreditSchedule();
    }

    await audit(
      req,
      buildActionDescription('Updated', 'global settings'),
      null,
      before,
      after
    );

    const credit = parseRevenueCreditTime(after[CREDIT_TIME_KEY] || '18:00');

    return res.status(200).json({
      success: true,
      message: 'Global settings updated',
      data: {
        settings: after,
        updated: updatedRows,
        revenue_credit_hour: credit.hour,
        revenue_credit_minute: credit.minute,
        revenue_credit_time: after[CREDIT_TIME_KEY] || '18:00',
        cronRescheduled: Boolean(cronSchedule?.rescheduled),
        cron: cronSchedule,
      },
    });
  } catch (error) {
    return handleError(res, error, 'patchGlobalSettings');
  }
}

/**
 * GET /api/v1/admin/settings/maintenance
 */
export async function getMaintenanceMode(req, res) {
  try {
    const settings = await getCachedSettings();
    const enabled = await isMaintenanceModeOn();

    return res.status(200).json({
      success: true,
      message: 'Maintenance mode retrieved',
      data: {
        maintenance_mode: settings[MAINTENANCE_KEY] || 'off',
        enabled,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getMaintenanceMode');
  }
}

/**
 * PATCH /api/v1/admin/settings/maintenance (Super Admin)
 * Body: { enabled: boolean } or { maintenance_mode: 'on'|'off' }
 */
export async function patchMaintenanceMode(req, res) {
  try {
    const before = { ...(await getCachedSettings()) };
    let next = 'off';

    if (req.body?.enabled !== undefined) {
      next =
        req.body.enabled === true ||
        req.body.enabled === 'true' ||
        req.body.enabled === 1 ||
        req.body.enabled === '1'
          ? 'on'
          : 'off';
    } else if (req.body?.maintenance_mode !== undefined) {
      const raw = String(req.body.maintenance_mode).toLowerCase().trim();
      next = raw === 'on' || raw === 'true' || raw === '1' ? 'on' : 'off';
    } else {
      const error = new Error(
        'enabled or maintenance_mode is required'
      );
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }

    const row = await upsertSetting(MAINTENANCE_KEY, next, req.user.userId);
    const after = await refreshSettingsCache();

    await audit(
      req,
      buildActionDescription(
        next === 'on' ? 'Enabled' : 'Disabled',
        'maintenance mode'
      ),
      row.id,
      { maintenance_mode: before[MAINTENANCE_KEY] || 'off' },
      { maintenance_mode: next }
    );

    return res.status(200).json({
      success: true,
      message:
        next === 'on'
          ? 'Maintenance mode enabled'
          : 'Maintenance mode disabled',
      data: {
        maintenance_mode: next,
        enabled: next === 'on',
      },
    });
  } catch (error) {
    return handleError(res, error, 'patchMaintenanceMode');
  }
}

/**
 * PATCH /api/v1/admin/revenue/investor/:id/settings
 * Body: credit_frequency?, withdrawal_frequency?, credit_time_hour?, credit_time_minute?, is_paused?
 */
export async function patchInvestorRevenueSettings(req, res) {
  try {
    const investorId = req.params.id;
    const before = await getCreditSettings(investorId);
    const after = await updateCreditSettings(
      investorId,
      req.body || {},
      req.user.userId
    );

    await audit(
      req,
      buildActionDescription('Updated', 'investor revenue settings'),
      investorId,
      before,
      after
    );

    return res.status(200).json({
      success: true,
      message: 'Investor revenue settings updated',
      data: after,
    });
  } catch (error) {
    return handleError(res, error, 'patchInvestorRevenueSettings');
  }
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return fallback;
  }
  return n;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Parse YYYY-MM-DD into a calendar date string (validated).
 * @param {unknown} value
 * @param {string} field
 * @returns {string | null}
 */
function parseDateOnly(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const error = new Error(`${field} must be YYYY-MM-DD`);
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }
  const d = new Date(`${raw}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) {
    const error = new Error(`${field} is not a valid date`);
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }
  return raw;
}

/**
 * Ensure email_logs.template_data exists (safe no-op if already present).
 */
async function ensureEmailLogsColumns() {
  await query(
    `ALTER TABLE email_logs
     ADD COLUMN IF NOT EXISTS template_data JSONB`
  );
}

/**
 * Shape a single email log row for API responses.
 * @param {object} row
 * @returns {object}
 */
function mapEmailLogRow(row) {
  return {
    id: row.id,
    recipient: row.recipient_email,
    recipient_email: row.recipient_email,
    recipient_type: row.recipient_type,
    template: row.template_name,
    template_name: row.template_name,
    subject: row.subject,
    status: row.status,
    attempts: row.attempts,
    last_attempt_at: row.last_attempt_at,
    error: row.error_message,
    error_message: row.error_message,
    reference_id: row.reference_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    investor: row.investor_id
      ? {
          id: row.investor_id,
          full_name: row.investor_name,
          email: row.investor_email,
        }
      : null,
  };
}

/**
 * Build filtered email log list query.
 * @param {import('express').Request['query']} queryParams
 * @param {{ forceFailed?: boolean }} [options]
 */
async function queryEmailLogs(queryParams, { forceFailed = false } = {}) {
  await ensureEmailLogsColumns();

  const page = toPositiveInt(queryParams.page, EMAIL_LOG_DEFAULT_PAGE);
  let limit = toPositiveInt(queryParams.limit, EMAIL_LOG_DEFAULT_LIMIT);
  if (limit > EMAIL_LOG_MAX_LIMIT) {
    limit = EMAIL_LOG_MAX_LIMIT;
  }
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];

  const status = forceFailed
    ? 'failed'
    : queryParams.status
      ? String(queryParams.status).toLowerCase().trim()
      : null;

  if (status) {
    const allowed = ['queued', 'sent', 'failed', 'retrying'];
    if (!allowed.includes(status)) {
      const error = new Error(
        'status must be one of: queued, sent, failed, retrying'
      );
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }
    params.push(status);
    conditions.push(`e.status = $${params.length}`);
  }

  if (queryParams.template || queryParams.template_name) {
    params.push(
      String(queryParams.template || queryParams.template_name)
        .trim()
        .toLowerCase()
    );
    conditions.push(`LOWER(e.template_name) = $${params.length}`);
  }

  const dateFrom = parseDateOnly(
    queryParams.date_from || queryParams.from,
    'date_from'
  );
  const dateTo = parseDateOnly(
    queryParams.date_to || queryParams.to,
    'date_to'
  );

  if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
    const error = new Error('date_from and date_to must be provided together');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    throw error;
  }

  if (dateFrom && dateTo) {
    if (dateFrom > dateTo) {
      const error = new Error('date_from must be on or before date_to');
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }
    params.push(dateFrom, dateTo);
    conditions.push(
      `(e.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $${params.length - 1}::date AND $${params.length}::date`
    );
  }

  if (queryParams.investor_id || queryParams.investorId) {
    const investorId = String(
      queryParams.investor_id || queryParams.investorId
    ).trim();
    if (!isUuid(investorId)) {
      const error = new Error('investor_id must be a valid UUID');
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }
    const investor = await query(
      `SELECT id, email FROM users WHERE id = $1 LIMIT 1`,
      [investorId]
    );
    if (!investor.rows[0]) {
      const error = new Error('Investor not found');
      error.code = 'NOT_FOUND';
      error.status = 404;
      throw error;
    }
    params.push(String(investor.rows[0].email).toLowerCase());
    conditions.push(`LOWER(e.recipient_email) = $${params.length}`);
  } else if (queryParams.email || queryParams.recipient) {
    params.push(
      String(queryParams.email || queryParams.recipient).trim().toLowerCase()
    );
    conditions.push(`LOWER(e.recipient_email) = $${params.length}`);
  } else if (queryParams.investor) {
    const raw = String(queryParams.investor).trim();
    if (isUuid(raw)) {
      const investor = await query(
        `SELECT email FROM users WHERE id = $1 LIMIT 1`,
        [raw]
      );
      if (!investor.rows[0]) {
        const error = new Error('Investor not found');
        error.code = 'NOT_FOUND';
        error.status = 404;
        throw error;
      }
      params.push(String(investor.rows[0].email).toLowerCase());
      conditions.push(`LOWER(e.recipient_email) = $${params.length}`);
    } else {
      params.push(raw.toLowerCase());
      conditions.push(`LOWER(e.recipient_email) = $${params.length}`);
    }
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM email_logs e
     ${where}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  const listParams = [...params, limit, offset];
  const listResult = await query(
    `SELECT e.id,
            e.recipient_email,
            e.recipient_type,
            e.template_name,
            e.subject,
            e.status,
            e.attempts,
            e.last_attempt_at,
            e.error_message,
            e.reference_id,
            e.created_at,
            e.updated_at,
            u.id AS investor_id,
            u.full_name AS investor_name,
            u.email AS investor_email
     FROM email_logs e
     LEFT JOIN users u
       ON LOWER(u.email) = LOWER(e.recipient_email)
      AND e.recipient_type = 'investor'
     ${where}
     ORDER BY e.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return {
    logs: listResult.rows.map(mapEmailLogRow),
    meta: {
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

/**
 * GET /api/v1/admin/email-logs
 */
export async function listEmailLogs(req, res) {
  try {
    const result = await queryEmailLogs(req.query || {}, { forceFailed: false });

    return res.status(200).json({
      success: true,
      message: 'Email logs retrieved',
      data: {
        logs: result.logs,
        meta: result.meta,
      },
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: error.message,
        error: 'NOT_FOUND',
      });
    }
    return handleError(res, error, 'listEmailLogs');
  }
}

/**
 * GET /api/v1/admin/email-logs/failed
 */
export async function listFailedEmailLogs(req, res) {
  try {
    const result = await queryEmailLogs(req.query || {}, { forceFailed: true });

    return res.status(200).json({
      success: true,
      message: 'Failed email logs retrieved',
      data: {
        logs: result.logs,
        meta: result.meta,
      },
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: error.message,
        error: 'NOT_FOUND',
      });
    }
    return handleError(res, error, 'listFailedEmailLogs');
  }
}

/**
 * POST /api/v1/admin/email-logs/:id/retry
 * Manually retry a failed email (admin override; allows retry after 3 attempts).
 */
export async function retryEmailLog(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email log id',
        error: 'VALIDATION_ERROR',
      });
    }

    await ensureEmailLogsColumns();

    const existing = await query(
      `SELECT id, recipient_email, template_name, subject, status,
              attempts, last_attempt_at, error_message, reference_id,
              created_at, updated_at, template_data
       FROM email_logs
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (!existing.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Email log not found',
        error: 'NOT_FOUND',
      });
    }

    const before = existing.rows[0];

    if (before.status === 'sent') {
      return res.status(400).json({
        success: false,
        message: 'Email already sent successfully',
        error: 'VALIDATION_ERROR',
      });
    }

    if (before.status !== 'failed' && before.status !== 'retrying') {
      return res.status(400).json({
        success: false,
        message: 'Only failed emails can be manually retried',
        error: 'VALIDATION_ERROR',
      });
    }

    if (!before.template_data) {
      return res.status(400).json({
        success: false,
        message: 'Email cannot be retried — template data missing',
        error: 'VALIDATION_ERROR',
      });
    }

    // Admin manual retry may exceed the automatic 3-attempt cap once
    await query(
      `UPDATE email_logs
       SET attempts = CASE
             WHEN attempts >= $2 THEN $2 - 1
             ELSE attempts
           END,
           status = 'failed',
           updated_at = NOW()
       WHERE id = $1`,
      [id, EMAIL_LOG_MAX_ATTEMPTS]
    );

    const delivery = await attemptEmailDelivery(id);

    const afterResult = await query(
      `SELECT e.id,
              e.recipient_email,
              e.recipient_type,
              e.template_name,
              e.subject,
              e.status,
              e.attempts,
              e.last_attempt_at,
              e.error_message,
              e.reference_id,
              e.created_at,
              e.updated_at,
              u.id AS investor_id,
              u.full_name AS investor_name,
              u.email AS investor_email
       FROM email_logs e
       LEFT JOIN users u
         ON LOWER(u.email) = LOWER(e.recipient_email)
        AND e.recipient_type = 'investor'
       WHERE e.id = $1
       LIMIT 1`,
      [id]
    );

    const after = mapEmailLogRow(afterResult.rows[0]);

    await audit(
      req,
      buildActionDescription('Retried', 'failed email'),
      id,
      {
        status: before.status,
        attempts: before.attempts,
        error_message: before.error_message,
      },
      {
        status: after.status,
        attempts: after.attempts,
        error_message: after.error_message,
        delivery,
      }
    );

    return res.status(200).json({
      success: true,
      message: delivery.success
        ? 'Email resent successfully'
        : 'Email retry attempted',
      data: {
        log: after,
        delivery,
      },
    });
  } catch (error) {
    return handleError(res, error, 'retryEmailLog');
  }
}

/**
 * @param {string} raw
 * @returns {object[]}
 */
function parseHistoryJson(raw) {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} contentKey
 * @param {string} historyKey
 * @param {string} versionKey
 * @returns {Promise<object>}
 */
async function getLegalDocument(contentKey, historyKey, versionKey) {
  const settings = await getCachedSettings();
  const content = settings[contentKey] ?? '';
  const version = Math.round(Number(settings[versionKey] || 0)) || 0;
  const history = parseHistoryJson(settings[historyKey]);

  const meta = await query(
    `SELECT key, value, updated_by, updated_at, created_at
     FROM global_settings
     WHERE key = $1
     LIMIT 1`,
    [contentKey]
  );

  return {
    content,
    version,
    history,
    updated_by: meta.rows[0]?.updated_by || null,
    updated_at: meta.rows[0]?.updated_at || null,
    created_at: meta.rows[0]?.created_at || null,
  };
}

/**
 * Update a legal document and keep the last 5 prior versions.
 * @param {string} contentKey
 * @param {string} historyKey
 * @param {string} versionKey
 * @param {string} content
 * @param {string} adminId
 * @returns {Promise<object>}
 */
async function updateLegalDocument(
  contentKey,
  historyKey,
  versionKey,
  content,
  adminId
) {
  const before = await getLegalDocument(contentKey, historyKey, versionKey);
  const nextVersion = Math.round(Number(before.version) || 0) + 1;

  /** @type {object[]} */
  let history = [...before.history];
  if (before.content && before.version > 0) {
    history = [
      {
        version: before.version,
        content: before.content,
        updated_at: before.updated_at
          ? new Date(before.updated_at).toISOString()
          : new Date().toISOString(),
        updated_by: before.updated_by,
      },
      ...history,
    ].slice(0, MAX_LEGAL_HISTORY);
  }

  await upsertSetting(contentKey, content, adminId);
  await upsertSetting(versionKey, String(nextVersion), adminId);
  await upsertSetting(historyKey, JSON.stringify(history), adminId);
  await refreshSettingsCache();

  return getLegalDocument(contentKey, historyKey, versionKey);
}

/**
 * GET /api/v1/public/terms
 */
export async function getPublicTerms(req, res) {
  try {
    const doc = await getLegalDocument(
      TERMS_KEY,
      TERMS_HISTORY_KEY,
      TERMS_VERSION_KEY
    );

    return res.status(200).json({
      success: true,
      message: 'Terms and Conditions retrieved',
      data: {
        content: doc.content,
        version: doc.version,
        updated_at: doc.updated_at,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getPublicTerms');
  }
}

/**
 * GET /api/v1/public/privacy
 */
export async function getPublicPrivacy(req, res) {
  try {
    const doc = await getLegalDocument(
      PRIVACY_KEY,
      PRIVACY_HISTORY_KEY,
      PRIVACY_VERSION_KEY
    );

    return res.status(200).json({
      success: true,
      message: 'Privacy Policy retrieved',
      data: {
        content: doc.content,
        version: doc.version,
        updated_at: doc.updated_at,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getPublicPrivacy');
  }
}

/**
 * PATCH /api/v1/admin/settings/terms (Super Admin)
 * Body: { content: string }
 */
export async function patchTerms(req, res) {
  try {
    const content = req.body?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'content is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const before = await getLegalDocument(
      TERMS_KEY,
      TERMS_HISTORY_KEY,
      TERMS_VERSION_KEY
    );
    const after = await updateLegalDocument(
      TERMS_KEY,
      TERMS_HISTORY_KEY,
      TERMS_VERSION_KEY,
      content.trim(),
      req.user.userId
    );

    await audit(
      req,
      buildActionDescription('Updated', 'terms and conditions'),
      null,
      { version: before.version, content: before.content },
      { version: after.version, content: after.content }
    );

    return res.status(200).json({
      success: true,
      message: 'Terms and Conditions updated',
      data: {
        content: after.content,
        version: after.version,
        updated_at: after.updated_at,
        history: after.history,
      },
    });
  } catch (error) {
    return handleError(res, error, 'patchTerms');
  }
}

/**
 * PATCH /api/v1/admin/settings/privacy (Super Admin)
 * Body: { content: string }
 */
export async function patchPrivacy(req, res) {
  try {
    const content = req.body?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'content is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const before = await getLegalDocument(
      PRIVACY_KEY,
      PRIVACY_HISTORY_KEY,
      PRIVACY_VERSION_KEY
    );
    const after = await updateLegalDocument(
      PRIVACY_KEY,
      PRIVACY_HISTORY_KEY,
      PRIVACY_VERSION_KEY,
      content.trim(),
      req.user.userId
    );

    await audit(
      req,
      buildActionDescription('Updated', 'privacy policy'),
      null,
      { version: before.version, content: before.content },
      { version: after.version, content: after.content }
    );

    return res.status(200).json({
      success: true,
      message: 'Privacy Policy updated',
      data: {
        content: after.content,
        version: after.version,
        updated_at: after.updated_at,
        history: after.history,
      },
    });
  } catch (error) {
    return handleError(res, error, 'patchPrivacy');
  }
}

/**
 * GET /api/v1/admin/settings/terms/history
 */
export async function getTermsHistory(req, res) {
  try {
    const doc = await getLegalDocument(
      TERMS_KEY,
      TERMS_HISTORY_KEY,
      TERMS_VERSION_KEY
    );

    return res.status(200).json({
      success: true,
      message: 'Terms version history retrieved',
      data: {
        current: {
          content: doc.content,
          version: doc.version,
          updated_at: doc.updated_at,
          updated_by: doc.updated_by,
        },
        history: doc.history,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getTermsHistory');
  }
}

/**
 * GET /api/v1/admin/settings/terms
 * Current T&C with version history (admin).
 */
export async function getAdminTerms(req, res) {
  try {
    const doc = await getLegalDocument(
      TERMS_KEY,
      TERMS_HISTORY_KEY,
      TERMS_VERSION_KEY
    );

    return res.status(200).json({
      success: true,
      message: 'Terms and Conditions retrieved',
      data: {
        content: doc.content,
        version: doc.version,
        updated_at: doc.updated_at,
        updated_by: doc.updated_by,
        history: doc.history,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getAdminTerms');
  }
}

/**
 * GET /api/v1/admin/settings/privacy
 * Current privacy policy with version history (admin).
 */
export async function getAdminPrivacy(req, res) {
  try {
    const doc = await getLegalDocument(
      PRIVACY_KEY,
      PRIVACY_HISTORY_KEY,
      PRIVACY_VERSION_KEY
    );

    return res.status(200).json({
      success: true,
      message: 'Privacy Policy retrieved',
      data: {
        content: doc.content,
        version: doc.version,
        updated_at: doc.updated_at,
        updated_by: doc.updated_by,
        history: doc.history,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getAdminPrivacy');
  }
}

/**
 * GET /api/v1/admin/settings/backup/history
 * List local backup archive files with dates/sizes.
 */
export async function listBackupHistory(req, res) {
  try {
    await ensureBackupDirectory();
    const dir = getBackupDirectory();

    if (!fs.existsSync(dir)) {
      return res.status(200).json({
        success: true,
        message: 'Backup history retrieved',
        data: { backups: [], directory: dir },
      });
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const backups = entries
      .filter(
        (e) =>
          e.isFile() &&
          (e.name.endsWith('.tar.gz') ||
            e.name.endsWith('.enc') ||
            e.name.endsWith('.sql') ||
            e.name.endsWith('.dump'))
      )
      .map((e) => {
        const fullPath = path.join(dir, e.name);
        const stat = fs.statSync(fullPath);
        return {
          file_name: e.name,
          size_bytes: stat.size,
          created_at: stat.mtime.toISOString(),
          created_at_ms: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.created_at_ms - a.created_at_ms)
      .map(({ created_at_ms, ...rest }) => rest);

    return res.status(200).json({
      success: true,
      message: 'Backup history retrieved',
      data: {
        directory: dir,
        backups,
        count: backups.length,
      },
    });
  } catch (error) {
    return handleError(res, error, 'listBackupHistory');
  }
}

/**
 * POST /api/v1/admin/settings/backup (Super Admin)
 * Trigger an immediate full database backup.
 */
export async function triggerManualBackup(req, res) {
  try {
    const result = await performBackup({
      trigger: 'manual',
      skipIfTodayExists: false,
    });

    await audit(
      req,
      buildActionDescription('Triggered', 'manual backup'),
      null,
      null,
      {
        fileName: result.fileName,
        fileSize: result.fileSize,
        driveUrl: result.driveUrl,
        timestamp: result.timestamp,
      }
    );

    return res.status(200).json({
      success: true,
      message: result.driveError
        ? 'Backup created locally; Google Drive upload failed'
        : 'Backup completed successfully',
      data: {
        fileName: result.fileName,
        localPath: result.localPath,
        fileSize: result.fileSize,
        driveUrl: result.driveUrl,
        driveFolderPath: result.driveFolderPath || null,
        driveError: result.driveError || null,
        encrypted: result.encrypted,
        timestamp: result.timestamp,
        deletedOldCount: result.deletedOldCount || 0,
      },
    });
  } catch (error) {
    logger.error(`[Settings] triggerManualBackup: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Backup failed',
      error: 'BACKUP_FAILED',
    });
  }
}
