import { query, pool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { getActiveROI as getActiveROIFromService } from '../services/roi.service.js';

export class RevenueError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} [status]
   */
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'RevenueError';
    this.code = code;
    this.status = status;
  }
}

const ROI_COLUMNS = `
  id,
  investor_id,
  type,
  roi_percentage,
  start_date,
  end_date,
  created_by,
  is_active,
  created_at,
  updated_at
`;

const SETTINGS_COLUMNS = `
  investor_id,
  credit_frequency,
  credit_time_hour,
  credit_time_minute,
  withdrawal_frequency,
  is_paused,
  paused_by,
  paused_at,
  created_at,
  updated_at
`;

/**
 * Normalize ROI % to 2 decimal places (e.g. 4.50). Does not integer-round.
 * @param {unknown} value
 * @returns {number}
 */
function toRoiPercent(value) {
  const n = Number.parseFloat(String(value));
  if (!Number.isFinite(n)) {
    return NaN;
  }
  return Math.round(n * 100) / 100;
}

/**
 * Ensure API rows expose roi_percentage as a decimal number.
 * @param {object | null} row
 * @returns {object | null}
 */
function mapRoiRow(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    roi_percentage: toRoiPercent(row.roi_percentage),
  };
}

/**
 * @param {string | undefined} value
 * @returns {boolean}
 */
function isValidDateStr(value) {
  if (!value || typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * @param {string} investorId
 * @returns {Promise<object>}
 */
export async function getInvestorOrThrow(investorId) {
  const result = await query(
    `SELECT id, full_name, email, status, is_deleted
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [investorId]
  );

  if (!result.rows[0] || result.rows[0].is_deleted) {
    throw new RevenueError('Investor not found', 'USER_NOT_FOUND', 404);
  }

  return result.rows[0];
}

/**
 * All ROI settings for an investor (default + terms).
 * @param {string} investorId
 * @returns {Promise<object>}
 */
export async function getRoiSettings(investorId) {
  await getInvestorOrThrow(investorId);

  const result = await query(
    `SELECT ${ROI_COLUMNS}
     FROM roi_settings
     WHERE investor_id = $1
       AND is_active = TRUE
     ORDER BY
       CASE type WHEN 'default' THEN 0 ELSE 1 END,
       start_date ASC NULLS FIRST,
       created_at ASC`,
    [investorId]
  );

  const defaultRoi = result.rows.find((r) => r.type === 'default') || null;
  const terms = result.rows.filter((r) => r.type === 'term');

  return {
    defaultRoi: mapRoiRow(defaultRoi),
    terms: terms.map(mapRoiRow),
    settings: result.rows.map(mapRoiRow),
  };
}

/**
 * Set / replace active default ROI percentage.
 * @param {string} investorId
 * @param {number} percentage
 * @param {string} adminId
 * @returns {Promise<object>}
 */
export async function setDefaultRoi(investorId, percentage, adminId) {
  await getInvestorOrThrow(investorId);

  const roi = toRoiPercent(percentage);
  if (!Number.isFinite(roi) || roi <= 0) {
    throw new RevenueError(
      'ROI percentage must be a positive number (up to 2 decimal places)',
      'VALIDATION_ERROR',
      400
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE roi_settings
       SET is_active = FALSE,
           updated_at = NOW()
       WHERE investor_id = $1
         AND type = 'default'
         AND is_active = TRUE`,
      [investorId]
    );

    const result = await client.query(
      `INSERT INTO roi_settings (
         investor_id,
         type,
         roi_percentage,
         start_date,
         end_date,
         created_by,
         is_active
       ) VALUES ($1, 'default', $2, CURRENT_DATE, NULL, $3, TRUE)
       RETURNING ${ROI_COLUMNS}`,
      [investorId, roi, adminId]
    );

    await client.query('COMMIT');

    logger.info('Default ROI set', { investorId, roi, adminId });
    return mapRoiRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Add term-based ROI.
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function addTermRoi({
  investorId,
  percentage,
  startDate,
  endDate,
  adminId,
}) {
  await getInvestorOrThrow(investorId);

  const roi = toRoiPercent(percentage);
  if (!Number.isFinite(roi) || roi <= 0) {
    throw new RevenueError(
      'ROI percentage must be a positive number (up to 2 decimal places)',
      'VALIDATION_ERROR',
      400
    );
  }

  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) {
    throw new RevenueError(
      'start_date and end_date are required in YYYY-MM-DD format',
      'VALIDATION_ERROR',
      400
    );
  }

  if (String(endDate).trim() < String(startDate).trim()) {
    throw new RevenueError(
      'end_date must be on or after start_date',
      'VALIDATION_ERROR',
      400
    );
  }

  const result = await query(
    `INSERT INTO roi_settings (
       investor_id,
       type,
       roi_percentage,
       start_date,
       end_date,
       created_by,
       is_active
     ) VALUES ($1, 'term', $2, $3::DATE, $4::DATE, $5, TRUE)
     RETURNING ${ROI_COLUMNS}`,
    [investorId, roi, String(startDate).trim(), String(endDate).trim(), adminId]
  );

  logger.info('Term ROI added', {
    investorId,
    roi,
    startDate,
    endDate,
    termId: result.rows[0].id,
  });

  return mapRoiRow(result.rows[0]);
}

/**
 * Soft-delete (deactivate) a term ROI.
 * @param {string} investorId
 * @param {string} termId
 * @returns {Promise<object>}
 */
export async function deleteTermRoi(investorId, termId) {
  await getInvestorOrThrow(investorId);

  const existing = await query(
    `SELECT ${ROI_COLUMNS}
     FROM roi_settings
     WHERE id = $1
       AND investor_id = $2
       AND type = 'term'
       AND is_active = TRUE
     LIMIT 1`,
    [termId, investorId]
  );

  if (!existing.rows[0]) {
    throw new RevenueError('ROI term not found', 'USER_NOT_FOUND', 404);
  }

  const result = await query(
    `UPDATE roi_settings
     SET is_active = FALSE,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${ROI_COLUMNS}`,
    [termId]
  );

  logger.info('Term ROI deleted', { investorId, termId });
  return mapRoiRow(result.rows[0]);
}

/**
 * Active ROI for a date (uses roi.service — term overrides default).
 * @param {string} investorId
 * @param {string} dateStr
 * @returns {Promise<object>}
 */
export async function getActiveRoiForDate(investorId, dateStr) {
  await getInvestorOrThrow(investorId);

  const date = dateStr && isValidDateStr(dateStr) ? dateStr.trim() : null;
  if (!date) {
    throw new RevenueError(
      'date query param is required in YYYY-MM-DD format',
      'VALIDATION_ERROR',
      400
    );
  }

  const percentage = await getActiveROIFromService(investorId, date);

  const termResult = await query(
    `SELECT ${ROI_COLUMNS}
     FROM roi_settings
     WHERE investor_id = $1
       AND type = 'term'
       AND is_active = TRUE
       AND start_date <= $2::DATE
       AND end_date >= $2::DATE
     ORDER BY start_date DESC
     LIMIT 1`,
    [investorId, date]
  );

  const defaultResult = await query(
    `SELECT ${ROI_COLUMNS}
     FROM roi_settings
     WHERE investor_id = $1
       AND type = 'default'
       AND is_active = TRUE
     LIMIT 1`,
    [investorId]
  );

  const source = termResult.rows[0]
    ? 'term'
    : defaultResult.rows[0]
      ? 'default'
      : 'none';

  return {
    date,
    roiPercentage: toRoiPercent(percentage),
    source,
    setting: mapRoiRow(termResult.rows[0] || defaultResult.rows[0] || null),
  };
}

/**
 * Get or create revenue credit settings for investor.
 * @param {string} investorId
 * @returns {Promise<object>}
 */
export async function getCreditSettings(investorId) {
  await getInvestorOrThrow(investorId);

  const existing = await query(
    `SELECT ${SETTINGS_COLUMNS}
     FROM revenue_credit_settings
     WHERE investor_id = $1
     LIMIT 1`,
    [investorId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await query(
    `INSERT INTO revenue_credit_settings (investor_id)
     VALUES ($1)
     RETURNING ${SETTINGS_COLUMNS}`,
    [investorId]
  );

  return created.rows[0];
}

/**
 * Update credit frequency, withdrawal frequency, pause/resume.
 * :id in route is investor_id (PK of revenue_credit_settings).
 *
 * @param {string} investorId
 * @param {object} updates
 * @param {string} adminId
 * @returns {Promise<object>}
 */
export async function updateCreditSettings(investorId, updates, adminId) {
  await getInvestorOrThrow(investorId);
  await getCreditSettings(investorId);

  const sets = [];
  const params = [investorId];
  let i = 2;

  if (updates.credit_frequency !== undefined) {
    const freq = String(updates.credit_frequency).toLowerCase();
    if (!['daily', 'weekly', 'monthly'].includes(freq)) {
      throw new RevenueError(
        'credit_frequency must be daily, weekly, or monthly',
        'VALIDATION_ERROR',
        400
      );
    }
    sets.push(`credit_frequency = $${i}`);
    params.push(freq);
    i += 1;
  }

  if (updates.withdrawal_frequency !== undefined) {
    const wf = Math.round(Number(updates.withdrawal_frequency));
    if (!Number.isFinite(wf) || wf < 0) {
      throw new RevenueError(
        'withdrawal_frequency must be a non-negative integer',
        'VALIDATION_ERROR',
        400
      );
    }
    sets.push(`withdrawal_frequency = $${i}`);
    params.push(wf);
    i += 1;
  }

  if (updates.credit_time_hour !== undefined) {
    const hour = Math.round(Number(updates.credit_time_hour));
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      throw new RevenueError(
        'credit_time_hour must be 0-23',
        'VALIDATION_ERROR',
        400
      );
    }
    sets.push(`credit_time_hour = $${i}`);
    params.push(hour);
    i += 1;
  }

  if (updates.credit_time_minute !== undefined) {
    const minute = Math.round(Number(updates.credit_time_minute));
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) {
      throw new RevenueError(
        'credit_time_minute must be 0-59',
        'VALIDATION_ERROR',
        400
      );
    }
    sets.push(`credit_time_minute = $${i}`);
    params.push(minute);
    i += 1;
  }

  if (updates.is_paused !== undefined) {
    const paused =
      updates.is_paused === true ||
      updates.is_paused === 'true' ||
      updates.is_paused === 1 ||
      updates.is_paused === '1';

    sets.push(`is_paused = $${i}`);
    params.push(paused);
    i += 1;

    if (paused) {
      sets.push(`paused_by = $${i}`);
      params.push(adminId);
      i += 1;
      sets.push(`paused_at = NOW()`);
    } else {
      sets.push(`paused_by = NULL`);
      sets.push(`paused_at = NULL`);
    }
  }

  if (sets.length === 0) {
    throw new RevenueError(
      'No valid settings fields to update',
      'VALIDATION_ERROR',
      400
    );
  }

  sets.push(`updated_at = NOW()`);

  const result = await query(
    `UPDATE revenue_credit_settings
     SET ${sets.join(', ')}
     WHERE investor_id = $1
     RETURNING ${SETTINGS_COLUMNS}`,
    params
  );

  logger.info('Revenue credit settings updated', {
    investorId,
    adminId,
    updates,
  });

  return result.rows[0];
}
