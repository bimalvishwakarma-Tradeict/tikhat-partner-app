import crypto from 'crypto';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from './email.service.js';
import {
  logAction,
  buildActionDescription,
  AUDIT_ENTITY_TYPES,
} from './audit.service.js';

const SUSPICIOUS_IP_THRESHOLD = 3;
const SUSPICIOUS_IP_WINDOW_HOURS = 24;
const CONCURRENT_EDIT_TTL_MS = 60 * 1000;

let schemaReady = false;

/**
 * Ensure sessions.is_active + registration_ip_logs exist.
 */
export async function ensureSessionSchema() {
  if (schemaReady) {
    return;
  }

  await query(`
    ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS registration_ip_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ip_address VARCHAR(45) NOT NULL,
      user_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_registration_ip_logs_ip_created
    ON registration_ip_logs (ip_address, created_at)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id UUID,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      reference_id VARCHAR(100),
      reference_type VARCHAR(50),
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_id
    ON admin_notifications (admin_id)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read
    ON admin_notifications (is_read)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_sessions_is_active
    ON sessions (is_active)
  `);

  schemaReady = true;
}

const SESSION_COLUMNS = `
  id,
  user_id,
  user_type,
  device_type,
  token_hash,
  expires_at,
  is_active,
  created_at,
  updated_at
`;

/**
 * Invalidate all active sessions for a user+device (same device type replacement).
 *
 * @param {string} userId
 * @param {'investor' | 'admin'} userType
 * @param {'mobile' | 'web'} deviceType
 * @returns {Promise<number>}
 */
export async function invalidateDeviceSessions(userId, userType, deviceType) {
  await ensureSessionSchema();

  const result = await query(
    `UPDATE sessions
     SET is_active = FALSE,
         updated_at = NOW()
     WHERE user_id = $1
       AND user_type = $2
       AND device_type = $3
       AND is_active = TRUE
     RETURNING id`,
    [userId, userType, deviceType]
  );

  return result.rowCount;
}

/**
 * Create a new active session (invalidates prior same-device session).
 *
 * @param {object} params
 * @param {string} [params.sessionId]
 * @param {string} params.userId
 * @param {'investor' | 'admin'} params.userType
 * @param {'mobile' | 'web'} params.deviceType
 * @param {string} params.tokenHash
 * @param {Date | string} params.expiresAt
 * @returns {Promise<object>}
 */
export async function createSession({
  sessionId = crypto.randomUUID(),
  userId,
  userType,
  deviceType,
  tokenHash,
  expiresAt,
}) {
  await ensureSessionSchema();

  await invalidateDeviceSessions(userId, userType, deviceType);

  const result = await query(
    `INSERT INTO sessions (
       id,
       user_id,
       user_type,
       device_type,
       token_hash,
       expires_at,
       is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING ${SESSION_COLUMNS}`,
    [
      sessionId,
      userId,
      userType,
      deviceType,
      tokenHash,
      expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
    ]
  );

  return result.rows[0];
}

/**
 * Soft-invalidate a session by id.
 *
 * @param {string} sessionId
 * @param {string} [userId]
 * @param {'investor' | 'admin'} [userType]
 * @returns {Promise<object | null>}
 */
export async function invalidateSession(sessionId, userId = null, userType = null) {
  await ensureSessionSchema();

  const clauses = ['id = $1', 'is_active = TRUE'];
  const params = [sessionId];
  let i = 2;

  if (userId) {
    clauses.push(`user_id = $${i}`);
    params.push(userId);
    i += 1;
  }

  if (userType) {
    clauses.push(`user_type = $${i}`);
    params.push(userType);
  }

  const result = await query(
    `UPDATE sessions
     SET is_active = FALSE,
         updated_at = NOW()
     WHERE ${clauses.join(' AND ')}
     RETURNING ${SESSION_COLUMNS}`,
    params
  );

  return result.rows[0] || null;
}

/**
 * @param {string} sessionId
 * @returns {Promise<object | null>}
 */
export async function getSessionById(sessionId) {
  await ensureSessionSchema();

  const result = await query(
    `SELECT ${SESSION_COLUMNS}
     FROM sessions
     WHERE id = $1
     LIMIT 1`,
    [sessionId]
  );

  return result.rows[0] || null;
}

/**
 * True when session exists, is_active, and not expired.
 *
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function isSessionActive(sessionId) {
  if (!sessionId) {
    return false;
  }

  const session = await getSessionById(sessionId);
  if (!session) {
    return false;
  }

  if (session.is_active === false) {
    return false;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await invalidateSession(sessionId);
    return false;
  }

  return true;
}

/**
 * Active sessions for a user (mobile + web can both be present).
 *
 * @param {string} userId
 * @param {'investor' | 'admin'} userType
 * @returns {Promise<object[]>}
 */
export async function getActiveSessions(userId, userType) {
  await ensureSessionSchema();

  const result = await query(
    `SELECT ${SESSION_COLUMNS}
     FROM sessions
     WHERE user_id = $1
       AND user_type = $2
       AND is_active = TRUE
       AND expires_at > NOW()
     ORDER BY device_type ASC`,
    [userId, userType]
  );

  return result.rows;
}

/**
 * @returns {Promise<object | null>}
 */
async function findSuperAdmin() {
  const result = await query(
    `SELECT id, full_name, email, role, status
     FROM admins
     WHERE role = 'super_admin'
       AND status = 'active'
       AND email NOT LIKE 'deleted.%@tikhat.invalid'
     ORDER BY created_at ASC
     LIMIT 1`
  );

  return result.rows[0] || null;
}

/**
 * Detect suspicious registration activity: 3+ accounts from same IP in 24 hours.
 * Logs IP, alerts Super Admin by email, writes admin_activity_logs.
 *
 * @param {string | null} ip
 * @param {string | null} [userId]
 * @returns {Promise<{ alerted: boolean, count: number }>}
 */
export async function detectSuspiciousIP(ip, userId = null) {
  await ensureSessionSchema();

  if (!ip || typeof ip !== 'string' || !ip.trim()) {
    return { alerted: false, count: 0 };
  }

  const normalizedIp = ip.trim();

  await query(
    `INSERT INTO registration_ip_logs (ip_address, user_id)
     VALUES ($1, $2)`,
    [normalizedIp, userId]
  );

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM registration_ip_logs
     WHERE ip_address = $1
       AND created_at >= NOW() - ($2::TEXT || ' hours')::INTERVAL`,
    [normalizedIp, String(SUSPICIOUS_IP_WINDOW_HOURS)]
  );

  const count = countResult.rows[0]?.count || 0;

  if (count < SUSPICIOUS_IP_THRESHOLD) {
    return { alerted: false, count };
  }

  // Alert only when crossing the threshold (exactly 3) to avoid spam,
  // or when count is a multiple of threshold.
  if (count !== SUSPICIOUS_IP_THRESHOLD && count % SUSPICIOUS_IP_THRESHOLD !== 0) {
    return { alerted: false, count };
  }

  const superAdmin = await findSuperAdmin();
  const alertEmail =
    superAdmin?.email || process.env.SUPER_ADMIN_EMAIL || null;

  const alertTitle = 'Suspicious registration IP alert';
  const alertBody = `Suspicious activity detected. IP address: ${normalizedIp}. Registrations in last ${SUSPICIOUS_IP_WINDOW_HOURS} hours: ${count}. Threshold: ${SUSPICIOUS_IP_THRESHOLD}. Please review recent registrations in the admin panel.`;

  try {
    await query(
      `INSERT INTO admin_notifications (
         admin_id,
         title,
         body,
         type,
         reference_id,
         reference_type
       ) VALUES ($1, $2, $3, 'system', $4, 'suspicious_ip')`,
      [superAdmin?.id || null, alertTitle, alertBody, normalizedIp]
    );
  } catch (error) {
    logger.error(
      `[Session] Suspicious IP admin notification failed: ${error.message}`,
      { error, ip: normalizedIp }
    );
  }

  if (alertEmail) {
    try {
      await sendEmail(alertEmail, 'custom-notification', {
        investorName: superAdmin?.full_name || 'Super Admin',
        subjectTitle: alertTitle,
        body: alertBody,
        referenceId: normalizedIp,
        recipientType: 'admin',
      });
    } catch (error) {
      logger.error(`[Session] Suspicious IP email failed: ${error.message}`, {
        error,
        ip: normalizedIp,
      });
    }
  }

  if (superAdmin?.id) {
    try {
      await logAction(
        superAdmin.id,
        buildActionDescription(
          'Detected',
          `suspicious IP ${normalizedIp} (${count} registrations/24h)`
        ),
        AUDIT_ENTITY_TYPES.OTHER,
        normalizedIp,
        null,
        {
          ip_address: normalizedIp,
          registrations_24h: count,
          threshold: SUSPICIOUS_IP_THRESHOLD,
          user_id: userId,
          alert: 'admin_notification_center',
        },
        normalizedIp
      );
    } catch (error) {
      logger.error(`[Session] Suspicious IP audit log failed: ${error.message}`, {
        error,
        ip: normalizedIp,
      });
    }
  }

  logger.warn('Suspicious registration IP detected', {
    ip: normalizedIp,
    count,
  });

  return { alerted: true, count };
}

/**
 * DB-backed concurrent edit tracking for admin panel.
 *
 * @param {string} entityType
 * @param {string} entityId
 * @param {string} adminId
 * @param {string} adminName
 * @returns {Promise<object[]>} other editors
 */
export async function trackConcurrentEditSession(
  entityType,
  entityId,
  adminId,
  adminName
) {
  await query(
    `INSERT INTO concurrent_edit_sessions (
       entity_type,
       entity_id,
       admin_id,
       admin_name,
       started_at,
       last_ping_at
     ) VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (entity_type, entity_id, admin_id)
     DO UPDATE SET
       admin_name = EXCLUDED.admin_name,
       last_ping_at = NOW(),
       updated_at = NOW()`,
    [entityType, entityId, adminId, adminName]
  );

  // Prune stale editors
  await query(
    `DELETE FROM concurrent_edit_sessions
     WHERE last_ping_at < NOW() - ($1::TEXT || ' milliseconds')::INTERVAL`,
    [String(CONCURRENT_EDIT_TTL_MS)]
  );

  const others = await query(
    `SELECT admin_id, admin_name, last_ping_at, started_at
     FROM concurrent_edit_sessions
     WHERE entity_type = $1
       AND entity_id = $2
       AND admin_id <> $3
       AND last_ping_at >= NOW() - ($4::TEXT || ' milliseconds')::INTERVAL
     ORDER BY started_at ASC`,
    [entityType, entityId, adminId, String(CONCURRENT_EDIT_TTL_MS)]
  );

  return others.rows.map((row) => ({
    userId: row.admin_id,
    name: row.admin_name,
    lastSeen: new Date(row.last_ping_at).getTime(),
  }));
}

/**
 * @param {string} entityType
 * @param {string} entityId
 * @param {string} adminId
 */
export async function releaseConcurrentEditSession(
  entityType,
  entityId,
  adminId
) {
  await query(
    `DELETE FROM concurrent_edit_sessions
     WHERE entity_type = $1
       AND entity_id = $2
       AND admin_id = $3`,
    [entityType, entityId, adminId]
  );
}

/**
 * @param {string} entityType
 * @param {string} entityId
 * @returns {Promise<object[]>}
 */
export async function getConcurrentEditors(entityType, entityId) {
  await query(
    `DELETE FROM concurrent_edit_sessions
     WHERE last_ping_at < NOW() - ($1::TEXT || ' milliseconds')::INTERVAL`,
    [String(CONCURRENT_EDIT_TTL_MS)]
  );

  const result = await query(
    `SELECT admin_id, admin_name, last_ping_at, started_at
     FROM concurrent_edit_sessions
     WHERE entity_type = $1
       AND entity_id = $2
     ORDER BY started_at ASC`,
    [entityType, entityId]
  );

  return result.rows.map((row) => ({
    userId: row.admin_id,
    name: row.admin_name,
    lastSeen: new Date(row.last_ping_at).getTime(),
  }));
}

export const SESSION_DEVICE_TYPES = Object.freeze({
  MOBILE: 'mobile',
  WEB: 'web',
});

export const SESSION_USER_TYPES = Object.freeze({
  INVESTOR: 'investor',
  ADMIN: 'admin',
});
