import { formatIndianNumber } from './indianNumber';

/**
 * Format amount as Indian currency (₹1,00,000).
 * Whole numbers only — rounds with Math.round().
 */
export function formatCurrency(amount: number): string {
  const value = Math.round(Number(amount) || 0);
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${formatIndianNumber(Math.abs(value))}`;
}
