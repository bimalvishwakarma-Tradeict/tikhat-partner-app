/**
 * Concurrent edit detection for investor records (DB-backed).
 * Tracks active editors; attaches other editors to req.otherEditors.
 *
 * Usage:
 *   router.get('/investors/:investorId/edit', authenticate, requireAdmin, trackConcurrentEdit, handler)
 *   router.delete('/investors/:investorId/edit', authenticate, requireAdmin, releaseConcurrentEdit, handler)
 */

import {
  trackConcurrentEditSession,
  releaseConcurrentEditSession,
  getConcurrentEditors,
} from '../services/session.service.js';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

const ENTITY_TYPE = 'investor';

const getInvestorId = (req) =>
  req.params.investorId || req.params.id || req.body?.investorId;

/**
 * Register current user as an active editor and list other editors.
 * Sets req.otherEditors = [{ userId, name, lastSeen }]
 */
export const trackConcurrentEdit = async (req, res, next) => {
  const investorId = getInvestorId(req);

  if (!investorId) {
    return res.status(400).json({
      success: false,
      message: 'Investor ID is required for concurrent edit tracking',
      error: 'VALIDATION_ERROR',
    });
  }

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      error: 'AUTH_UNAUTHORIZED',
    });
  }

  try {
    const otherEditors = await trackConcurrentEditSession(
      ENTITY_TYPE,
      investorId,
      req.user.userId,
      req.user.name || req.user.userId
    );

    req.otherEditors = otherEditors;
    req.investorEditId = investorId;
    return next();
  } catch (error) {
    logger.error(`[Concurrent] track failed: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to track concurrent edit session',
      error: 'INTERNAL_ERROR',
    });
  }
};

/**
 * Remove current user from active editors for the investor record.
 */
export const releaseConcurrentEdit = async (req, res, next) => {
  const investorId = getInvestorId(req);

  if (investorId && req.user) {
    try {
      await releaseConcurrentEditSession(
        ENTITY_TYPE,
        investorId,
        req.user.userId
      );
    } catch (error) {
      logger.error(`[Concurrent] release failed: ${error.message}`, { error });
    }
  }

  return next();
};

/**
 * Clear all tracked editors (for testing).
 */
export const clearConcurrentEditors = async () => {
  await query(`DELETE FROM concurrent_edit_sessions`);
};

/**
 * Get current editors for an investor (for testing / debugging).
 * @param {string} investorId
 */
export const getActiveEditors = async (investorId) => {
  return getConcurrentEditors(ENTITY_TYPE, investorId);
};
