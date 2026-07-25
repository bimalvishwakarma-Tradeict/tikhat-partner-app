import { getISTYear } from './formatDate.js';

/** @type {Map<string, number>} */
const counters = new Map();

export const TXN_TYPES = Object.freeze({
  CAP_DEP: 'CAP-DEP',
  CAP_WDR: 'CAP-WDR',
  REV_CR: 'REV-CR',
  REV_WDR: 'REV-WDR',
  ADM: 'ADM',
  SUP: 'SUP',
  PRF: 'PRF',
});

const VALID_TYPES = new Set(Object.values(TXN_TYPES));

/**
 * Generate transaction ID: TKT-{TYPE}-YYYY-XXXXX
 * Counter increments per type per IST year (resets each year).
 * @param {string} type - e.g. 'CAP-DEP', 'ADM', 'SUP'
 * @returns {string}
 */
export function generateTxnId(type) {
  const normalized = String(type || '').toUpperCase();

  if (!VALID_TYPES.has(normalized)) {
    throw new Error(`Invalid transaction type: ${type}`);
  }

  const year = getISTYear();
  const key = `${normalized}-${year}`;
  const next = (counters.get(key) || 0) + 1;
  counters.set(key, next);

  const sequence = String(next).padStart(5, '0');
  return `TKT-${normalized}-${year}-${sequence}`;
}

/**
 * Reset in-memory counters (for testing).
 */
export function resetTxnIdCounters() {
  counters.clear();
}

/**
 * Peek next sequence for a type/year without incrementing.
 * @param {string} type
 * @param {number} [year]
 * @returns {number}
 */
export function peekTxnIdCounter(type, year = getISTYear()) {
  const key = `${String(type).toUpperCase()}-${year}`;
  return (counters.get(key) || 0) + 1;
}
