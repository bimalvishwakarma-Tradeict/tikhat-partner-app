import { TIMEZONE } from '../constants';

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
] as const;

type ISTParts = {
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
  dayPeriod: string;
};

function getISTParts(date: Date | string | number): ISTParts {
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

  const get = (type: Intl.DateTimeFormatPartTypes): string | undefined =>
    parts.find((p) => p.type === type)?.value;

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
 */
export function formatDate(date: Date | string | number): string {
  const { day, month, year } = getISTParts(date);
  const dayStr = String(day).padStart(2, '0');
  return `${dayStr} ${MONTHS[month - 1]} ${year}`;
}

/**
 * Format time as h:mm AM/PM in IST (e.g., 6:00 PM).
 */
export function formatTime(date: Date | string | number): string {
  const { hour, minute, dayPeriod } = getISTParts(date);
  const minuteStr = String(minute).padStart(2, '0');
  return `${hour}:${minuteStr} ${dayPeriod}`;
}

export { getISTParts };
