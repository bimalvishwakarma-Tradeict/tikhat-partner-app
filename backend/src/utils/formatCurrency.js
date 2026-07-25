import { formatIndianNumber } from './indianNumber.js';

/**
 * Format amount as Indian currency (₹1,00,000).
 * Whole numbers only — rounds with Math.round().
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  const value = Math.round(Number(amount) || 0);
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${formatIndianNumber(Math.abs(value))}`;
}
