import { pool } from '../db/connection.js';
import { getISTYear } from '../utils/formatDate.js';
import { logger } from '../utils/logger.js';

export const TRANSACTION_TYPES = Object.freeze({
  CAP_DEP: 'CAP-DEP',
  CAP_WDR: 'CAP-WDR',
  REV_CR: 'REV-CR',
  REV_WDR: 'REV-WDR',
  ADM: 'ADM',
  SUP: 'SUP',
  PRF: 'PRF',
});

const VALID_TYPES = new Set(Object.values(TRANSACTION_TYPES));

/**
 * Format sequence number as 5-digit string.
 * @param {number} sequence
 * @returns {string}
 */
const formatSequence = (sequence) => String(sequence).padStart(5, '0');

/**
 * Validate and normalize transaction type.
 * @param {string} type
 * @returns {string}
 */
const normalizeType = (type) => {
  const normalized = String(type || '').toUpperCase().trim();

  if (!VALID_TYPES.has(normalized)) {
    const error = new Error(
      `Invalid transaction type: ${type}. Allowed: ${[...VALID_TYPES].join(', ')}`
    );
    error.code = 'INVALID_TRANSACTION_TYPE';
    throw error;
  }

  return normalized;
};

/**
 * Atomically allocate the next sequence for a type/year.
 * Inserts a new year row at 1 when the year rolls over.
 *
 * @param {string} type - CAP-DEP | CAP-WDR | REV-CR | REV-WDR | ADM | SUP | PRF
 * @param {{ client?: import('pg').PoolClient, year?: number }} [options]
 *   - client: optional existing DB client (joins outer transaction)
 *   - year: optional override (defaults to current IST year)
 * @returns {Promise<string>} e.g. TKT-CAP-DEP-2026-00001
 */
export const generateTransactionId = async (type, options = {}) => {
  const normalizedType = normalizeType(type);
  const year = options.year ?? getISTYear();
  const externalClient = options.client || null;

  const client = externalClient || (await pool.connect());
  const ownsConnection = !externalClient;

  try {
    if (ownsConnection) {
      await client.query('BEGIN');
    }

    // Atomic upsert: new year starts at 1; existing year increments by 1.
    const result = await client.query(
      `
      INSERT INTO transaction_id_sequences (type, year, last_sequence)
      VALUES ($1, $2, 1)
      ON CONFLICT (type, year)
      DO UPDATE SET
        last_sequence = transaction_id_sequences.last_sequence + 1,
        updated_at = NOW()
      RETURNING last_sequence, year, type
    `,
      [normalizedType, year]
    );

    if (!result.rows.length) {
      throw new Error('Failed to allocate transaction ID sequence');
    }

    const { last_sequence: sequence, year: allocatedYear, type: allocatedType } =
      result.rows[0];

    const transactionId = `TKT-${allocatedType}-${allocatedYear}-${formatSequence(sequence)}`;

    if (ownsConnection) {
      await client.query('COMMIT');
    }

    logger.info('Transaction ID generated', {
      transactionId,
      type: allocatedType,
      year: allocatedYear,
      sequence,
    });

    return transactionId;
  } catch (error) {
    if (ownsConnection) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error(
          `[TransactionService] Rollback failed: ${rollbackError.message}`,
          { error: rollbackError }
        );
      }
    }

    logger.error(
      `[TransactionService] generateTransactionId error: ${error.message}`,
      {
        type: normalizedType,
        year,
        error,
      }
    );

    throw error;
  } finally {
    if (ownsConnection) {
      client.release();
    }
  }
};

/**
 * Peek the next sequence value without incrementing (for diagnostics/tests).
 * @param {string} type
 * @param {number} [year]
 * @returns {Promise<number>}
 */
export const peekNextSequence = async (type, year = getISTYear()) => {
  const normalizedType = normalizeType(type);

  const result = await pool.query(
    `
    SELECT last_sequence
    FROM transaction_id_sequences
    WHERE type = $1 AND year = $2
  `,
    [normalizedType, year]
  );

  if (!result.rows.length) {
    return 1;
  }

  return result.rows[0].last_sequence + 1;
};
