import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import archiver from 'archiver';
import { logger } from '../utils/logger.js';
import { getISTParts } from '../utils/formatDate.js';
import { query } from '../db/connection.js';
import { sendEmail } from './email.service.js';
import {
  uploadBackupToDrive,
  isGdriveConfigured,
} from './gdrive.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RETENTION_DAYS = 30;
const BACKUP_PREFIX = 'tikhat_backup_';

/** @type {((opts: object) => Promise<object>) | null} */
let backupRunnerOverride = null;

/**
 * Override performBackup for tests. Pass null to clear.
 * @param {((opts: object) => Promise<object>) | null} fn
 */
export function setBackupRunnerOverride(fn) {
  backupRunnerOverride = fn;
}

/**
 * Absolute backups directory (BACKEND_ROOT/backups or BACKUP_PATH).
 * @returns {string}
 */
export function getBackupDirectory() {
  const configured = process.env.BACKUP_PATH || './backups';
  if (path.isAbsolute(configured)) {
    return configured;
  }
  return path.resolve(path.join(__dirname, '../..'), configured);
}

/**
 * @returns {{ host: string, port: string, user: string, password: string, database: string }}
 */
export function parseDatabaseUrl(url = process.env.DATABASE_URL) {
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port || '5432',
    user: decodeURIComponent(parsed.username || 'postgres'),
    password: decodeURIComponent(parsed.password || ''),
    database: decodeURIComponent((parsed.pathname || '/').replace(/^\//, '')),
  };
}

/**
 * @param {Date} [date]
 * @returns {string} tikhat_backup_YYYY-MM-DD_HH-mm.tar.gz
 */
export function buildBackupFileName(date = new Date()) {
  const parts = getISTParts(date);
  const yyyy = String(parts.year);
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  let hour = parts.hour;
  if (parts.dayPeriod === 'PM' && hour !== 12) {
    hour += 12;
  }
  if (parts.dayPeriod === 'AM' && hour === 12) {
    hour = 0;
  }
  const HH = String(hour).padStart(2, '0');
  const min = String(parts.minute).padStart(2, '0');
  return `${BACKUP_PREFIX}${yyyy}-${mm}-${dd}_${HH}-${min}.tar.gz`;
}

/**
 * @param {Date} [date]
 * @returns {string} YYYY-MM-DD in IST
 */
function istDateKey(date = new Date()) {
  const parts = getISTParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Ensure backup directory exists.
 * @returns {Promise<string>}
 */
export async function ensureBackupDirectory() {
  const dir = getBackupDirectory();
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * True if a local backup for today's IST date already exists.
 * @returns {Promise<string | null>} existing file path or null
 */
export async function findTodaysBackup() {
  const dir = await ensureBackupDirectory();
  const prefix = `${BACKUP_PREFIX}${istDateKey()}_`;
  const entries = await fsp.readdir(dir);
  const match = entries.find(
    (name) => name.startsWith(prefix) && name.endsWith('.tar.gz')
  );
  return match ? path.join(dir, match) : null;
}

/**
 * Derive 32-byte AES key from BACKUP_ENCRYPTION_KEY.
 * @returns {Buffer | null}
 */
function getEncryptionKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw || !String(raw).trim()) {
    return null;
  }
  return crypto.createHash('sha256').update(String(raw)).digest();
}

/**
 * Encrypt a file with AES-256-GCM. Output: iv(12) + tag(16) + ciphertext.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {Buffer} key
 */
async function encryptFile(inputPath, outputPath, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const input = createReadStream(inputPath);
  const output = createWriteStream(outputPath);

  output.write(iv);
  await pipeline(input, cipher, output);

  const tag = cipher.getAuthTag();
  await fsp.appendFile(outputPath, tag);
}

/**
 * Decrypt AES-256-GCM file produced by encryptFile.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {Buffer} key
 */
export async function decryptBackupPayload(inputPath, outputPath, key) {
  const data = await fsp.readFile(inputPath);
  if (data.length < 28) {
    throw new Error('Encrypted backup payload is too small');
  }
  const iv = data.subarray(0, 12);
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(12, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  await fsp.writeFile(outputPath, plain);
}

/**
 * Run a command; resolve on exit 0, reject otherwise.
 * @param {string} command
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, cwd?: string }} [options]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env || process.env,
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} exited with code ${code}: ${stderr || stdout || 'no output'}`
          )
        );
      }
    });
  });
}

/**
 * Run pg_dump writing custom-format dump to dumpPath.
 * Supports local pg_dump binary or Docker exec fallback.
 * @param {string} dumpPath
 */
export async function runPgDump(dumpPath) {
  const db = parseDatabaseUrl();
  const env = {
    ...process.env,
    PGPASSWORD: db.password,
  };

  const pgDumpBin = process.env.PG_DUMP_PATH || 'pg_dump';
  const dockerContainer =
    process.env.PG_DUMP_DOCKER_CONTAINER ||
    process.env.POSTGRES_DOCKER_CONTAINER ||
    '';

  try {
    await runCommand(
      pgDumpBin,
      [
        '-h',
        db.host,
        '-p',
        db.port,
        '-U',
        db.user,
        '-d',
        db.database,
        '-Fc',
        '-f',
        dumpPath,
      ],
      { env }
    );
    return { method: 'pg_dump', dumpPath };
  } catch (err) {
    const missing =
      err.code === 'ENOENT' ||
      /ENOENT|not recognized|not found/i.test(String(err.message));

    if (!missing && !dockerContainer) {
      throw err;
    }

    const container = dockerContainer || 'tikhat-db';
    logger.warn(
      `[Backup] Local pg_dump unavailable (${err.message}); using docker exec ${container}`
    );

    // Dump inside container then copy out
    const remotePath = `/tmp/${path.basename(dumpPath)}`;
    await runCommand(
      'docker',
      [
        'exec',
        '-e',
        `PGPASSWORD=${db.password}`,
        container,
        'pg_dump',
        '-U',
        db.user,
        '-d',
        db.database,
        '-Fc',
        '-f',
        remotePath,
      ],
      { env: process.env }
    );

    await runCommand(
      'docker',
      ['cp', `${container}:${remotePath}`, dumpPath],
      { env: process.env }
    );

    await runCommand(
      'docker',
      ['exec', container, 'rm', '-f', remotePath],
      { env: process.env }
    ).catch(() => {});

    return { method: 'docker', dumpPath };
  }
}

/**
 * Compress dump (or encrypted dump) into .tar.gz archive.
 * @param {string} archivePath
 * @param {{ dumpPath: string, encryptedPath?: string | null, metaPath: string }} files
 */
async function createTarGz(archivePath, files) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(archivePath);
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);

    if (files.encryptedPath && fs.existsSync(files.encryptedPath)) {
      archive.file(files.encryptedPath, {
        name: path.basename(files.encryptedPath),
      });
    } else {
      archive.file(files.dumpPath, { name: path.basename(files.dumpPath) });
    }

    archive.file(files.metaPath, { name: 'backup-meta.json' });
    archive.finalize();
  });
}

/**
 * Delete local backups older than retention days (IST calendar age by mtime).
 * @param {number} [retentionDays]
 * @returns {Promise<{ deleted: string[], kept: number }>}
 */
export async function deleteOldBackups(retentionDays = RETENTION_DAYS) {
  const dir = await ensureBackupDirectory();
  const entries = await fsp.readdir(dir);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const deleted = [];
  let kept = 0;

  for (const name of entries) {
    if (!name.startsWith(BACKUP_PREFIX) || !name.endsWith('.tar.gz')) {
      continue;
    }
    const full = path.join(dir, name);
    const stat = await fsp.stat(full);
    if (stat.mtimeMs < cutoff) {
      await fsp.unlink(full);
      deleted.push(name);
      logger.info('[Backup] Deleted old backup', { name });
    } else {
      kept += 1;
    }
  }

  return { deleted, kept };
}

/**
 * Alert Super Admins (and active admins as fallback) about backup issues.
 * @param {string} title
 * @param {string} body
 */
async function alertAdmins(title, body) {
  try {
    const result = await query(
      `SELECT id, full_name, email, role
       FROM admins
       WHERE status = 'active'
         AND role IN ('super_admin', 'admin')
       ORDER BY
         CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END,
         created_at ASC`
    );

    await Promise.all(
      result.rows.map((admin) =>
        sendEmail(admin.email, 'custom-notification', {
          investorName: admin.full_name || 'Admin',
          subjectTitle: title,
          body,
          recipientType: 'admin',
        }).catch((emailErr) => {
          logger.error(
            `[Backup] Admin alert email failed: ${emailErr.message}`,
            { error: emailErr }
          );
        })
      )
    );
  } catch (err) {
    logger.error(`[Backup] alertAdmins failed: ${err.message}`, { error: err });
  }
}

/**
 * Full backup pipeline: pg_dump → encrypt → tar.gz → cleanup old → Drive upload.
 *
 * @param {{
 *   trigger?: 'manual' | 'cron',
 *   skipIfTodayExists?: boolean,
 *   skipDriveUpload?: boolean,
 * }} [options]
 * @returns {Promise<object>}
 */
export async function performBackup(options = {}) {
  if (backupRunnerOverride) {
    return backupRunnerOverride(options);
  }

  const trigger = options.trigger || 'manual';
  const skipIfTodayExists = Boolean(options.skipIfTodayExists);
  const skipDriveUpload = Boolean(options.skipDriveUpload);
  const startedAt = new Date();

  if (skipIfTodayExists) {
    const existing = await findTodaysBackup();
    if (existing) {
      const stat = await fsp.stat(existing);
      logger.info('[Backup] Skipping — backup already exists for today', {
        existing,
      });
      return {
        success: true,
        skipped: true,
        trigger,
        fileName: path.basename(existing),
        localPath: existing,
        fileSize: stat.size,
        driveUrl: null,
        timestamp: startedAt.toISOString(),
        message: 'Backup already exists for today',
      };
    }
  }

  const backupDir = await ensureBackupDirectory();
  const fileName = buildBackupFileName(startedAt);
  const archivePath = path.join(backupDir, fileName);
  const workDir = await fsp.mkdtemp(path.join(backupDir, '.work-'));

  let driveUrl = null;
  let driveFolderPath = null;
  let driveError = null;
  let encrypted = false;

  try {
    const dumpPath = path.join(workDir, 'database.dump');
    await runPgDump(dumpPath);

    const key = getEncryptionKey();
    let encryptedPath = null;
    if (key) {
      encryptedPath = path.join(workDir, 'database.dump.enc');
      await encryptFile(dumpPath, encryptedPath, key);
      encrypted = true;
    } else {
      logger.warn(
        '[Backup] BACKUP_ENCRYPTION_KEY not set — archive will contain unencrypted dump'
      );
    }

    const metaPath = path.join(workDir, 'backup-meta.json');
    const ist = getISTParts(startedAt);
    await fsp.writeFile(
      metaPath,
      JSON.stringify(
        {
          createdAt: startedAt.toISOString(),
          trigger,
          encrypted,
          database: parseDatabaseUrl().database,
          fileName,
          retentionDays: RETENTION_DAYS,
        },
        null,
        2
      ),
      'utf8'
    );

    await createTarGz(archivePath, {
      dumpPath,
      encryptedPath,
      metaPath,
    });

    const stat = await fsp.stat(archivePath);
    const cleanup = await deleteOldBackups(RETENTION_DAYS);

    if (!skipDriveUpload) {
      try {
        if (!isGdriveConfigured()) {
          throw new Error(
            'Google Drive credentials not configured'
          );
        }
        const upload = await uploadBackupToDrive(archivePath, {
          year: ist.year,
          month: ist.month,
          day: ist.day,
        });
        driveUrl = upload.webViewLink;
        driveFolderPath = upload.folderPath;
      } catch (uploadErr) {
        driveError = uploadErr.message || String(uploadErr);
        logger.error(`[Backup] Google Drive upload failed: ${driveError}`, {
          error: uploadErr,
        });
        await alertAdmins(
          'Google Drive backup upload failed',
          `Local backup succeeded (${fileName}) but Google Drive upload failed: ${driveError}`
        );
      }
    }

    logger.info('[Backup] Completed', {
      fileName,
      fileSize: stat.size,
      encrypted,
      driveUrl,
      deletedOld: cleanup.deleted.length,
      trigger,
    });

    return {
      success: true,
      skipped: false,
      trigger,
      fileName,
      localPath: archivePath,
      fileSize: stat.size,
      driveUrl,
      driveFolderPath,
      driveError,
      encrypted,
      timestamp: startedAt.toISOString(),
      deletedOldCount: cleanup.deleted.length,
      deletedOld: cleanup.deleted,
    };
  } catch (error) {
    logger.error(`[Backup] Failed: ${error.message}`, { error, trigger });

    if (fs.existsSync(archivePath)) {
      await fsp.unlink(archivePath).catch(() => {});
    }

    await alertAdmins(
      'Database backup failed',
      `The ${trigger} database backup failed: ${error.message}`
    );

    throw error;
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export const BACKUP_CONSTANTS = Object.freeze({
  RETENTION_DAYS,
  BACKUP_PREFIX,
});
