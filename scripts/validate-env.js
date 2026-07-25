#!/usr/bin/env node
/**
 * Validate required backend environment variables.
 *
 * Usage:
 *   node scripts/validate-env.js
 *   node scripts/validate-env.js --env-file backend/.env
 *
 * Also imported by backend/server.js on startup.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** Always required (dev + production). */
const REQUIRED_ENV_VARS = Object.freeze([
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'RESEND_API_KEY',
  'FRONTEND_URL',
  'UPLOAD_PATH',
  'BACKUP_PATH',
  'LOG_PATH',
]);

/** Required when NODE_ENV=production (backup encryption always). */
const PRODUCTION_ALWAYS = Object.freeze(['BACKUP_ENCRYPTION_KEY']);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isSet(value) {
  return value != null && String(value).trim() !== '';
}

/**
 * Minimal .env loader (no dotenv dependency at repo root).
 * @param {string} filePath
 */
function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Google Drive: service account path OR legacy OAuth trio (+ folder id).
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function getMissingDriveVars(env) {
  const missing = [];
  const hasServiceAccount =
    isSet(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH) ||
    isSet(env.GOOGLE_APPLICATION_CREDENTIALS);
  const hasOauth =
    isSet(env.GOOGLE_DRIVE_CLIENT_ID) &&
    isSet(env.GOOGLE_DRIVE_CLIENT_SECRET) &&
    isSet(env.GOOGLE_DRIVE_REFRESH_TOKEN);

  if (!hasServiceAccount && !hasOauth) {
    missing.push(
      'GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH (or GOOGLE_DRIVE_CLIENT_ID + SECRET + REFRESH_TOKEN)'
    );
  }

  if (!isSet(env.GOOGLE_DRIVE_FOLDER_ID)) {
    missing.push('GOOGLE_DRIVE_FOLDER_ID');
  }

  return missing;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function getMissingEnvVars(env = process.env) {
  const missing = [];

  for (const name of REQUIRED_ENV_VARS) {
    if (!isSet(env[name])) {
      missing.push(name);
    }
  }

  const nodeEnv = String(env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  if (nodeEnv === 'production') {
    for (const name of PRODUCTION_ALWAYS) {
      if (!isSet(env[name])) {
        missing.push(name);
      }
    }
    missing.push(...getMissingDriveVars(env));
  }

  return missing;
}

/**
 * Validate env. Prints clear errors and exits process when invalid (CLI / startup).
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ exit?: boolean }} [options]
 * @returns {boolean} true when valid
 */
function validateEnv(env = process.env, options = {}) {
  const { exit = true } = options;
  const missing = getMissingEnvVars(env);

  if (missing.length === 0) {
    return true;
  }

  console.error('[validate-env] Missing required environment variable(s):');
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error(
    '[validate-env] Set the variable(s) in backend/.env and restart. Server cannot start until they are present.'
  );

  if (exit) {
    process.exit(1);
  }

  return false;
}

function resolveEnvFilePath() {
  const flagIndex = process.argv.indexOf('--env-file');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return path.resolve(process.argv[flagIndex + 1]);
  }
  return path.join(REPO_ROOT, 'backend', '.env');
}

if (require.main === module) {
  const envPath = resolveEnvFilePath();
  if (!fs.existsSync(envPath)) {
    console.error(`[validate-env] Env file not found: ${envPath}`);
    process.exit(1);
  }
  loadEnvFile(envPath);
  validateEnv(process.env, { exit: true });
  console.log('[validate-env] All required environment variables are set.');
}

module.exports = {
  REQUIRED_ENV_VARS,
  PRODUCTION_ALWAYS,
  getMissingEnvVars,
  validateEnv,
};
