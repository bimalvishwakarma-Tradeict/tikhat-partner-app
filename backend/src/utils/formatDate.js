const TIMEZONE = 'Asia/Kolkata';
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Get date parts in IST timezone.
 * @param {Date | string | number} date
 * @returns {{ day: number, month: number, year: number, hour: number, minute: number, dayPeriod: string }}
 */
function getISTParts(date) {
  const d = date instanceof Date ? date : new Date(date);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);

  const get = (type) => parts.find((p) => p.type === type)?.value;

  return {
    day: Number(get('day')),
    month: Number(get('month')),
    year: Number(get('year')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    dayPeriod: (get('dayPeriod') || 'AM').toUpperCase(),
  };
}

/**
 * Format date as DD MMM YYYY in IST (e.g., 15 Jul 2024).
 * @param {Date | string | number} date
 * @returns {string}
 */
export function formatDate(date) {
  const { day, month, year } = getISTParts(date);
  const dayStr = String(day).padStart(2, '0');
  return `${dayStr} ${MONTHS[month - 1]} ${year}`;
}

/**
 * Format time as h:mm AM/PM in IST (e.g., 6:00 PM).
 * @param {Date | string | number} date
 * @returns {string}
 */
export function formatTime(date) {
  const { hour, minute, dayPeriod } = getISTParts(date);
  const minuteStr = String(minute).padStart(2, '0');
  return `${hour}:${minuteStr} ${dayPeriod}`;
}

/**
 * Current calendar year in IST.
 * @returns {number}
 */
export function getISTYear() {
  return getISTParts(new Date()).year;
}

export { getISTParts, TIMEZONE };
