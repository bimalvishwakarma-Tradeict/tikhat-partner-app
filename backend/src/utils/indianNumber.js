/**
 * Format number using Indian numbering system (12,34,567).
 * @param {number} num
 * @returns {string}
 */
export function formatIndianNumber(num) {
  const value = Math.round(Math.abs(Number(num) || 0));
  const str = String(value);

  if (str.length <= 3) {
    return str;
  }

  const lastThree = str.slice(-3);
  const remaining = str.slice(0, -3);
  const withCommas = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');

  return `${withCommas},${lastThree}`;
}

/**
 * Alias matching task acceptance name.
 * @param {number} num
 * @returns {string}
 */
export function indianNumber(num) {
  return formatIndianNumber(num);
}
