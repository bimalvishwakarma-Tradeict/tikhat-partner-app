import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import {
  isSessionActive,
  detectSuspiciousIP,
} from '../services/session.service.js';

/**
 * Extract client IP from request (supports proxies via X-Forwarded-For).
 * @param {import('express').Request} req
 * @returns {string | null}
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }

  if (typeof req.ip === 'string' && req.ip) {
    return req.ip;
  }

  return null;
}

/**
 * Attach client IP to the request for audit logging.
 * @param {import('express').Request} req
 */
function attachRequestIp(req) {
  req.ipAddress = getClientIp(req);
}

/**
 * Verify JWT access token and attach user to req.user.
 * Expects: Authorization: Bearer <token>
 * Payload: { userId, role, sessionId, iat, exp }
 * Also attaches req.ipAddress for admin audit trails.
 * Investor tokens must map to an active DB session (logout invalidates).
 */
export const authenticate = async (req, res, next) => {
  try {
    attachRequestIp(req);

    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'AUTH_UNAUTHORIZED',
      });
    }

    const token = header.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'AUTH_UNAUTHORIZED',
      });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload.userId || !payload.role || !payload.sessionId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload',
        error: 'AUTH_UNAUTHORIZED',
      });
    }

    if (
      payload.role === 'investor' ||
      payload.role === 'admin' ||
      payload.role === 'super_admin'
    ) {
      const active = await isSessionActive(payload.sessionId);
      if (!active) {
        return res.status(401).json({
          success: false,
          message: 'Session expired or invalidated',
          error: 'AUTH_UNAUTHORIZED',
        });
      }
    }

    req.user = {
      userId: payload.userId,
      role: payload.role,
      sessionId: payload.sessionId,
      name: payload.name || null,
    };

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        error: 'AUTH_UNAUTHORIZED',
      });
    }

    logger.warn('[Auth] Invalid token', { message: error.message });

    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: 'AUTH_UNAUTHORIZED',
    });
  }
};

/**
 * Optional auth — attaches user if token present, otherwise continues.
 * Always attaches req.ipAddress when possible.
 */
export const optionalAuthenticate = (req, res, next) => {
  attachRequestIp(req);

  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }

  return authenticate(req, res, next);
};

/**
 * After a successful registration (HTTP 201), log IP and detect
 * suspicious multi-account activity without changing registration logic.
 */
export const trackRegistrationIp = (req, res, next) => {
  attachRequestIp(req);

  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode === 201 && body?.success === true) {
      const ip = req.ipAddress || getClientIp(req);
      detectSuspiciousIP(ip).catch((error) => {
        logger.error(
          `[Auth] detectSuspiciousIP failed: ${error.message}`,
          { error, ip }
        );
      });
    }

    return originalJson(body);
  };

  return next();
};
