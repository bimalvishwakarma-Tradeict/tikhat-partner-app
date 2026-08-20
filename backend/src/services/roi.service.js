import { pool } from '../db/connection.js';
import { logger } from '../utils/logger.js';

const TIMEZONE = 'Asia/Kolkata';

/**
 * Number of days in a calendar month.
 * @param {number} year
 * @param {number} month - 1-12
 * @returns {number}
 */
export const getDaysInMonth = (year, month) =>
  new Date(year, month, 0).getDate();

/**
 * Parse a date into IST calendar parts.
 * @param {Date | string} date
 * @returns {{ year: number, month: number, day: number, dateStr: string }}
 */
export const getISTDateParts = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));

  return {
    year,
    month,
    day,
    dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
};

/**
 * Normalize ROI % with parseFloat (never parseInt). Keeps 2 decimal places.
 * @param {unknown} value
 * @returns {number}
 */
export const toRoiPercent = (value) => {
  const roi = parseFloat(String(value));
  if (!Number.isFinite(roi) || roi <= 0) {
    return 0;
  }
  return parseFloat(roi.toFixed(2));
};

/**
 * Full-month revenue for a capital balance.
 * Monthly amount = Math.round(capital * roiPercent / 100)
 * ROI % supports 2 decimal places (e.g. 4.50); money result stays whole rupees.
 *
 * @param {number} capital
 * @param {number} roiPercent
 * @param {number} [_daysInMonth] - accepted for API compatibility
 * @returns {number}
 */
export const calculateMonthlyAmount = (capital, roiPercent, _daysInMonth) => {
  const cap = Math.round(Number(capital) || 0);
  const roi = parseFloat(roiPercent);

  if (cap <= 0 || !Number.isFinite(roi) || roi <= 0) {
    return 0;
  }

  return Math.round((cap * roi) / 100);
};

/**
 * Pro-rated first-month revenue from startDay through month end (inclusive).
 * Remaining days = daysInMonth - startDay + 1
 *
 * @param {number} capital
 * @param {number} roiPercent
 * @param {number} startDay - 1-based day of month investment starts
 * @param {number} daysInMonth
 * @returns {number}
 */
export const calculateProRatedAmount = (
  capital,
  roiPercent,
  startDay,
  daysInMonth
) => {
  const start = Math.round(Number(startDay) || 0);
  const days = Math.round(Number(daysInMonth) || 0);

  if (start < 1 || days < 1 || start > days) {
    return 0;
  }

  const monthly = calculateMonthlyAmount(capital, roiPercent, days);
  if (monthly <= 0) {
    return 0;
  }

  const remainingDays = days - start + 1;
  return Math.round((monthly / days) * remainingDays);
};

/**
 * Daily average for a capital/ROI pair in a given month length.
 * @param {number} capital
 * @param {number} roiPercent
 * @param {number} daysInMonth
 * @returns {number}
 */
export const calculateDailyAverage = (capital, roiPercent, daysInMonth) => {
  const days = Math.round(Number(daysInMonth) || 0);
  if (days <= 0) {
    return 0;
  }

  const monthly = calculateMonthlyAmount(capital, roiPercent, days);
  return Math.round(monthly / days);
};

/**
 * 90%–110% daily range around daily average.
 * @param {number} dailyAverage
 * @returns {{ min: number, max: number }}
 */
export const getDailyRange = (dailyAverage) => {
  const avg = Math.round(Number(dailyAverage) || 0);
  return {
    min: Math.round(avg * 0.9),
    max: Math.round(avg * 1.1),
  };
};

/**
 * Random integer inclusive between min and max.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const randomIntInclusive = (min, max) => {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
};

/**
 * Generate daily credit amounts for remaining days in a month.
 * Non-last days: random within 90–110% of daily average.
 * Last day: monthlyTotal - creditedSoFar - sum(previous generated) (may be outside range).
 * Sum of returned amounts + creditedSoFar === monthlyTotal (when no pauses).
 *
 * @param {number} monthlyTotal
 * @param {number} daysInMonth
 * @param {number} [creditedSoFar=0]
 * @param {number} [remainingDays]
 * @returns {number[]}
 */
export const calculateDailyAmounts = (
  monthlyTotal,
  daysInMonth,
  creditedSoFar = 0,
  remainingDays = daysInMonth
) => {
  const total = Math.round(Number(monthlyTotal) || 0);
  const days = Math.round(Number(daysInMonth) || 0);
  const alreadyCredited = Math.round(Number(creditedSoFar) || 0);
  const remaining = Math.round(Number(remainingDays) || 0);

  if (total <= 0 || days <= 0 || remaining <= 0) {
    return Array.from({ length: Math.max(remaining, 0) }, () => 0);
  }

  const dailyAverage = Math.round(total / days);
  const { min, max } = getDailyRange(dailyAverage);
  const amounts = [];
  let running = alreadyCredited;

  for (let i = 0; i < remaining; i += 1) {
    const isLast = i === remaining - 1;

    if (isLast) {
      const lastDay = total - running;
      amounts.push(Math.max(0, lastDay));
      break;
    }

    const leftForLaterDays = remaining - i - 1;
    const maxAllowed = total - running - leftForLaterDays * min;
    const minAllowed = Math.max(0, total - running - leftForLaterDays * max);

    let low = Math.max(min, minAllowed);
    let high = Math.min(max, maxAllowed);

    if (low > high) {
      low = high;
    }

    const amount = randomIntInclusive(low, high);
    amounts.push(amount);
    running += amount;
  }

  return amounts;
};

/**
 * Expected revenue for capital segments within a month.
 * Each segment: { capital, roiPercent, startDay, endDay }
 *
 * @param {Array<{ capital: number, roiPercent: number, startDay: number, endDay: number }>} segments
 * @param {number} daysInMonth
 * @returns {number}
 */
export const calculateSegmentedMonthTotal = (segments, daysInMonth) => {
  const days = Math.round(Number(daysInMonth) || 0);
  if (!Array.isArray(segments) || days <= 0) {
    return 0;
  }

  let total = 0;

  for (const segment of segments) {
    const startDay = Math.round(Number(segment.startDay) || 0);
    const endDay = Math.round(Number(segment.endDay) || 0);
    if (startDay < 1 || endDay < startDay || endDay > days) {
      continue;
    }

    const segmentDays = endDay - startDay + 1;
    const dailyAvg = calculateDailyAverage(
      segment.capital,
      segment.roiPercent,
      days
    );
    total += dailyAvg * segmentDays;
  }

  return Math.round(total);
};

/**
 * Active ROI % for investor on a date (term overrides default).
 * @param {string} investorId
 * @param {Date | string} date
 * @returns {Promise<number>}
 */
export const getActiveROI = async (investorId, date) => {
  try {
    const { dateStr } = getISTDateParts(date);

    const termResult = await pool.query(
      `
      SELECT roi_percentage
      FROM roi_settings
      WHERE investor_id = $1
        AND type = 'term'
        AND is_active = TRUE
        AND start_date <= $2::date
        AND end_date >= $2::date
      ORDER BY start_date DESC
      LIMIT 1
    `,
      [investorId, dateStr]
    );

    if (termResult.rows.length > 0) {
      return toRoiPercent(termResult.rows[0].roi_percentage);
    }

    const defaultResult = await pool.query(
      `
      SELECT roi_percentage
      FROM roi_settings
      WHERE investor_id = $1
        AND type = 'default'
        AND is_active = TRUE
      LIMIT 1
    `,
      [investorId]
    );

    if (defaultResult.rows.length === 0) {
      return 0;
    }

    return toRoiPercent(defaultResult.rows[0].roi_percentage);
  } catch (error) {
    logger.error(`[ROIService] getActiveROI error: ${error.message}`, {
      investorId,
      date,
      error,
    });
    throw error;
  }
};

/**
 * Whether daily revenue credit is paused for investor on a date.
 * @param {string} investorId
 * @returns {Promise<boolean>}
 */
export const isRevenuePaused = async (investorId) => {
  const userResult = await pool.query(
    `
    SELECT status, is_deleted
    FROM users
    WHERE id = $1
  `,
    [investorId]
  );

  if (userResult.rows.length === 0) {
    return true;
  }

  const user = userResult.rows[0];
  if (
    user.is_deleted ||
    ['pending', 'paused', 'deleted', 'self_deactivated'].includes(user.status)
  ) {
    return true;
  }

  const settingsResult = await pool.query(
    `
    SELECT is_paused
    FROM revenue_credit_settings
    WHERE investor_id = $1
  `,
    [investorId]
  );

  if (settingsResult.rows.length > 0 && settingsResult.rows[0].is_paused) {
    return true;
  }

  return false;
};

/**
 * Capital balance after all approved movements with effective_date < date
 * (changes on day X apply from day X+1).
 * Used by daily cron / regular revenue — do not change this semantics.
 * @param {string} investorId
 * @param {string} dateStr - YYYY-MM-DD (IST)
 * @returns {Promise<number>}
 */
export const getCapitalBalanceAsOf = async (investorId, dateStr) => {
  const result = await pool.query(
    `
    SELECT
      COALESCE(SUM(
        CASE
          WHEN type IN ('deposit', 'admin_credit') THEN amount
          WHEN type IN ('withdrawal', 'admin_debit') THEN -amount
          ELSE 0
        END
      ), 0)::INTEGER AS balance
    FROM capital_transactions
    WHERE investor_id = $1
      AND is_deleted = FALSE
      AND status IN ('approved', 'completed')
      AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $2::date
  `,
    [investorId, dateStr]
  );

  return Math.max(0, Math.round(Number(result.rows[0].balance) || 0));
};

/**
 * Capital balance on a specific date for backdate calculations.
 * Includes all approved deposits/withdrawals with transfer_date <= date.
 * (Falls back to payment_date / created_at when transfer_date is null.)
 *
 * @param {string} investorId
 * @param {Date | string} date
 * @param {{ client?: import('pg').PoolClient }} [options]
 * @returns {Promise<number>}
 */
export const getCapitalBalanceOnDate = async (
  investorId,
  date,
  options = {}
) => {
  const dateStr =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : getISTDateParts(date).dateStr;
  const executor = options.client || pool;

  const result = await executor.query(
    `
    SELECT
      COALESCE(SUM(
        CASE
          WHEN type IN ('deposit', 'admin_credit') THEN amount
          WHEN type IN ('withdrawal', 'admin_debit') THEN -amount
          ELSE 0
        END
      ), 0)::INTEGER AS balance
    FROM capital_transactions
    WHERE investor_id = $1
      AND is_deleted = FALSE
      AND status IN ('approved', 'completed')
      AND COALESCE(
            transfer_date,
            payment_date,
            (created_at AT TIME ZONE 'Asia/Kolkata')::date
          ) <= $2::date
  `,
    [investorId, dateStr]
  );

  return Math.max(0, Math.round(Number(result.rows[0].balance) || 0));
};

/**
 * Enumerate inclusive YYYY-MM-DD dates (IST calendar arithmetic).
 * @param {string} start
 * @param {string} end
 * @returns {string[]}
 */
const enumerateDatesInclusive = (start, end) => {
  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    const { year, month, day } = getISTDateParts(`${cursor}T00:00:00+05:30`);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    const y = next.getUTCFullYear();
    const m = String(next.getUTCMonth() + 1).padStart(2, '0');
    const d = String(next.getUTCDate()).padStart(2, '0');
    cursor = `${y}-${m}-${d}`;
  }
  return dates;
};

/**
 * Backdate daily amounts — capital balance looked up per day via transfer_date.
 * Non-last days: 90–110% of that day's daily average.
 * Last calendar day of each month (when in range): remaining of month expected.
 * Capital 0 on a day → amount 0.
 *
 * @param {string | null} investorId
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {number | null} [roiPercentage] - fixed ROI; null = active ROI per day
 * @param {{
 *   client?: import('pg').PoolClient,
 *   capitalBoost?: number,
 *   boostFromDate?: string | null,
 *   fixedCapital?: number | null,
 * }} [options]
 * @returns {Promise<Array<{ date: string, amount: number, capitalUsed: number, roi_percentage: number }>>}
 */
export const calculateBackdateDailyAmounts = async (
  investorId,
  startDate,
  endDate,
  roiPercentage = null,
  options = {}
) => {
  const dates = enumerateDatesInclusive(startDate, endDate);
  if (dates.length === 0) {
    return [];
  }

  const boost = Math.round(Number(options.capitalBoost) || 0);
  const boostFromDate = options.boostFromDate || null;
  const fixedCapital =
    options.fixedCapital != null ? Math.round(Number(options.fixedCapital)) : null;
  const clientOpts = options.client ? { client: options.client } : {};

  /** @type {Map<string, string[]>} */
  const byMonth = new Map();
  for (const dateStr of dates) {
    const key = dateStr.slice(0, 7);
    if (!byMonth.has(key)) {
      byMonth.set(key, []);
    }
    byMonth.get(key).push(dateStr);
  }

  /** @type {Array<{ date: string, amount: number, capitalUsed: number, roi_percentage: number }>} */
  const results = [];

  for (const monthDates of byMonth.values()) {
    /** @type {Array<{ date: string, capital: number, roi: number, dailyAvg: number }>} */
    const meta = [];

    for (const dateStr of monthDates) {
      let capital;
      if (fixedCapital != null) {
        capital = fixedCapital;
      } else if (investorId) {
        capital = await getCapitalBalanceOnDate(investorId, dateStr, clientOpts);
        if (boostFromDate && dateStr >= boostFromDate && boost > 0) {
          capital = Math.round(capital + boost);
        }
      } else {
        capital = 0;
      }

      let roi;
      if (roiPercentage != null && Number.isFinite(Number(roiPercentage))) {
        roi = toRoiPercent(roiPercentage);
      } else if (investorId) {
        roi = await getActiveROI(investorId, dateStr);
      } else {
        roi = 0;
      }

      const { year, month } = getISTDateParts(`${dateStr}T00:00:00+05:30`);
      const daysInMonth = getDaysInMonth(year, month);
      const dailyAvg =
        capital <= 0 || !Number.isFinite(roi) || roi <= 0
          ? 0
          : calculateDailyAverage(capital, roi, daysInMonth);

      meta.push({ date: dateStr, capital, roi, dailyAvg });
    }

    const monthExpected = Math.round(
      meta.reduce((sum, row) => sum + row.dailyAvg, 0)
    );
    let creditedSoFar = 0;

    for (const row of meta) {
      let amount = 0;

      if (row.capital <= 0 || row.roi <= 0 || row.dailyAvg <= 0) {
        amount = 0;
      } else if (isLastDayOfMonth(`${row.date}T00:00:00+05:30`)) {
        amount = Math.max(0, monthExpected - creditedSoFar);
      } else {
        const { min, max } = getDailyRange(row.dailyAvg);
        amount = randomIntInclusive(min, max);
      }

      amount = Math.round(amount);
      creditedSoFar += amount;

      results.push({
        date: row.date,
        amount,
        capitalUsed: Math.round(row.capital),
        roi_percentage: toRoiPercent(row.roi || 0),
      });
    }
  }

  return results;
};

/**
 * Sum of non-reversed revenue credits for investor from month start up to (excluding) beforeDate.
 * @param {string} investorId
 * @param {string} monthStart - YYYY-MM-DD
 * @param {string} beforeDate - YYYY-MM-DD exclusive
 * @returns {Promise<number>}
 */
export const getCreditedTotalInMonth = async (
  investorId,
  monthStart,
  beforeDate
) => {
  const result = await pool.query(
    `
    SELECT COALESCE(SUM(
      CASE
        WHEN credit_type = 'manual_debit' THEN -amount
        ELSE amount
      END
    ), 0)::INTEGER AS total
    FROM revenue_credits
    WHERE investor_id = $1
      AND is_deleted = FALSE
      AND is_reversed = FALSE
      AND credit_date >= $2::date
      AND credit_date < $3::date
  `,
    [investorId, monthStart, beforeDate]
  );

  return Math.round(Number(result.rows[0].total) || 0);
};

/**
 * Build capital segments for a month (capital changes apply from next day).
 * @param {string} investorId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<Array<{ capital: number, roiPercent: number, startDay: number, endDay: number }>>}
 */
export const buildMonthSegments = async (investorId, year, month) => {
  const daysInMonth = getDaysInMonth(year, month);
  const segments = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const capital = await getCapitalBalanceAsOf(investorId, dateStr);
    const roiPercent = await getActiveROI(investorId, dateStr);

    const last = segments[segments.length - 1];
    if (
      last &&
      last.capital === capital &&
      last.roiPercent === roiPercent
    ) {
      last.endDay = day;
    } else {
      segments.push({
        capital,
        roiPercent,
        startDay: day,
        endDay: day,
      });
    }
  }

  return segments;
};

/**
 * Scheduled revenue credit amount for a specific IST date.
 * Paused / zero capital → 0.
 * Last day of month → remaining monthly expected after prior credits.
 * Other days → random within 90–110% of that day's daily average.
 * Ensures monthly_revenue_tracking row exists (new month → fresh record).
 *
 * @param {string} investorId
 * @param {Date | string} date
 * @returns {Promise<number>}
 */
export const getDailyAmount = async (investorId, date) => {
  try {
    if (await isRevenuePaused(investorId)) {
      return 0;
    }

    const { year, month, day, dateStr } = getISTDateParts(date);
    const daysInMonth = getDaysInMonth(year, month);
    const capital = await getCapitalBalanceAsOf(investorId, dateStr);

    if (capital <= 0) {
      return 0;
    }

    const roiPercent = await getActiveROI(investorId, dateStr);
    if (roiPercent <= 0) {
      return 0;
    }

    // Ensure tracking row exists for this month (creates on month change)
    await getMonthlyTracking(investorId, year, month);

    if (!isLastDayOfMonth(date)) {
      const dailyAverage = calculateDailyAverage(
        capital,
        roiPercent,
        daysInMonth
      );
      const { min, max } = getDailyRange(dailyAverage);
      return randomIntInclusive(min, max);
    }

    // Last day: remaining = monthly expected − credited so far (any amount)
    const expectedTotal = await getMonthlyExpected(investorId, year, month);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const creditedSoFar = await getCreditedTotalInMonth(
      investorId,
      monthStart,
      dateStr
    );

    return Math.max(0, Math.round(expectedTotal) - Math.round(creditedSoFar));
  } catch (error) {
    logger.error(`[ROIService] getDailyAmount error: ${error.message}`, {
      investorId,
      date,
      error,
    });
    throw error;
  }
};

const TRACKING_COLUMNS = `
  id,
  investor_id,
  year,
  month,
  expected_total,
  credited_total,
  days_credited,
  days_paused,
  days_remaining,
  status,
  created_at,
  updated_at
`;

/**
 * Whether the given date is the last calendar day of its month (IST).
 * @param {Date | string} date
 * @returns {boolean}
 */
export const isLastDayOfMonth = (date) => {
  const { year, month, day } = getISTDateParts(date);
  return day === getDaysInMonth(year, month);
};

/**
 * Expected monthly ROI total (segmented; pro-rates mid-month capital / join).
 * @param {string} investorId
 * @param {number} year
 * @param {number} month - 1-12
 * @returns {Promise<number>}
 */
export const getMonthlyExpected = async (investorId, year, month) => {
  const y = Math.round(Number(year));
  const m = Math.round(Number(month));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return 0;
  }

  const daysInMonth = getDaysInMonth(y, m);
  const segments = await buildMonthSegments(investorId, y, m);
  return calculateSegmentedMonthTotal(segments, daysInMonth);
};

/**
 * Get or create monthly_revenue_tracking for investor/year/month.
 * New month automatically starts a fresh record at 0 credited.
 *
 * @param {string} investorId
 * @param {number} year
 * @param {number} month
 * @param {{ client?: import('pg').PoolClient }} [options]
 * @returns {Promise<object>}
 */
export const getMonthlyTracking = async (
  investorId,
  year,
  month,
  options = {}
) => {
  const y = Math.round(Number(year));
  const m = Math.round(Number(month));
  const executor = options.client || pool;
  const daysInMonth = getDaysInMonth(y, m);

  const existing = await executor.query(
    `SELECT ${TRACKING_COLUMNS}
     FROM monthly_revenue_tracking
     WHERE investor_id = $1
       AND year = $2
       AND month = $3
     LIMIT 1`,
    [investorId, y, m]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const expectedTotal = await getMonthlyExpected(investorId, y, m);

  const created = await executor.query(
    `INSERT INTO monthly_revenue_tracking (
       investor_id,
       year,
       month,
       expected_total,
       credited_total,
       days_credited,
       days_paused,
       days_remaining,
       status
     ) VALUES ($1, $2, $3, $4, 0, 0, 0, $5, 'in_progress')
     ON CONFLICT (investor_id, year, month)
     DO UPDATE SET updated_at = monthly_revenue_tracking.updated_at
     RETURNING ${TRACKING_COLUMNS}`,
    [investorId, y, m, Math.round(expectedTotal), daysInMonth]
  );

  return created.rows[0];
};

/**
 * Apply a daily credit to monthly tracking (credited_total, days_credited).
 *
 * @param {string} investorId
 * @param {number} year
 * @param {number} month
 * @param {number} amount
 * @param {{ client?: import('pg').PoolClient, asOfDate?: Date | string }} [options]
 * @returns {Promise<object>}
 */
export const updateMonthlyTracking = async (
  investorId,
  year,
  month,
  amount,
  options = {}
) => {
  const y = Math.round(Number(year));
  const m = Math.round(Number(month));
  const creditAmount = Math.round(Number(amount) || 0);
  const executor = options.client || pool;
  const daysInMonth = getDaysInMonth(y, m);

  await getMonthlyTracking(investorId, y, m, { client: options.client });

  const expectedTotal = await getMonthlyExpected(investorId, y, m);
  const asOf = options.asOfDate
    ? getISTDateParts(options.asOfDate)
    : { year: y, month: m, day: daysInMonth };
  const day = asOf.year === y && asOf.month === m ? asOf.day : daysInMonth;
  const daysRemaining = Math.max(0, daysInMonth - day);
  const status = isLastDayOfMonth(
    options.asOfDate ||
      `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  )
    ? 'completed'
    : 'in_progress';

  const result = await executor.query(
    `UPDATE monthly_revenue_tracking
     SET expected_total = GREATEST(expected_total, $4),
         credited_total = credited_total + $5,
         days_credited = days_credited + 1,
         days_remaining = $6,
         status = $7,
         updated_at = NOW()
     WHERE investor_id = $1
       AND year = $2
       AND month = $3
     RETURNING ${TRACKING_COLUMNS}`,
    [
      investorId,
      y,
      m,
      Math.round(expectedTotal),
      creditAmount,
      daysRemaining,
      status,
    ]
  );

  return result.rows[0];
};
