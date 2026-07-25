import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { pool } from '../db/connection.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_PATH || path.join(__dirname, '../../uploads')
);

const PROFILE_PHOTO_MAX_PX = 800;

export const FILE_CATEGORIES = Object.freeze({
  KYC_PAN_FRONT: 'kyc-pan-front',
  KYC_PAN_BACK: 'kyc-pan-back',
  KYC_AADHAR_FRONT: 'kyc-aadhar-front',
  KYC_AADHAR_BACK: 'kyc-aadhar-back',
  PROFILE_PHOTO: 'profile-photo',
  PAYMENT_SCREENSHOT: 'payment-screenshot',
  SUPPORT_ATTACHMENT: 'support-attachment',
});

const CATEGORY_FOLDERS = Object.freeze({
  [FILE_CATEGORIES.KYC_PAN_FRONT]: path.join('kyc', 'pan', 'front'),
  [FILE_CATEGORIES.KYC_PAN_BACK]: path.join('kyc', 'pan', 'back'),
  [FILE_CATEGORIES.KYC_AADHAR_FRONT]: path.join('kyc', 'aadhar', 'front'),
  [FILE_CATEGORIES.KYC_AADHAR_BACK]: path.join('kyc', 'aadhar', 'back'),
  [FILE_CATEGORIES.PROFILE_PHOTO]: 'profile-photos',
  [FILE_CATEGORIES.PAYMENT_SCREENSHOT]: 'payment-screenshots',
  [FILE_CATEGORIES.SUPPORT_ATTACHMENT]: 'support-attachments',
});

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

ensureDir(UPLOAD_ROOT);
Object.values(CATEGORY_FOLDERS).forEach((subdir) => {
  ensureDir(path.join(UPLOAD_ROOT, subdir));
});

let filesTableReady = false;

/**
 * Ensure files metadata table exists (no dedicated migration in Phase 2).
 */
export const ensureFilesTable = async () => {
  if (filesTableReady) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID NOT NULL,
      owner_type VARCHAR(20) NOT NULL DEFAULT 'investor',
      category VARCHAR(50) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      file_url TEXT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      size INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_files_owner_type CHECK (owner_type IN ('investor', 'admin')),
      CONSTRAINT chk_files_size CHECK (size > 0)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_files_owner_id ON files (owner_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_files_category ON files (category)
  `);

  filesTableReady = true;
};

const normalizeCategory = (category) => {
  const normalized = String(category || '').toLowerCase().trim();
  if (!CATEGORY_FOLDERS[normalized]) {
    const error = new Error(`Invalid file category: ${category}`);
    error.code = 'VALIDATION_ERROR';
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};

const getExtension = (originalName, mimeType) => {
  const fromName = path.extname(originalName || '').toLowerCase();
  if (ALLOWED_EXTENSIONS.has(fromName)) {
    return fromName === '.jpeg' ? '.jpg' : fromName;
  }

  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'application/pdf') return '.pdf';

  const error = new Error('File type not allowed');
  error.code = 'FILE_TYPE_NOT_ALLOWED';
  error.statusCode = 400;
  throw error;
};

const generateStoredName = (ext) => `${Date.now()}-${crypto.randomUUID()}${ext}`;

const resolveAbsolutePath = (relativeUrl) => {
  const relative = relativeUrl.replace(/^\/+/, '').replace(/^uploads\//, '');
  return path.join(UPLOAD_ROOT, relative);
};

/**
 * Compress profile photo to max 800x800 (keeps aspect ratio).
 * @param {Buffer} inputBuffer
 * @param {string} mimeType
 * @returns {Promise<{ buffer: Buffer, mimeType: string, ext: string }>}
 */
const compressProfilePhoto = async (inputBuffer, mimeType) => {
  const pipeline = sharp(inputBuffer)
    .rotate()
    .resize(PROFILE_PHOTO_MAX_PX, PROFILE_PHOTO_MAX_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    });

  if (mimeType === 'image/png') {
    const buffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    return { buffer, mimeType: 'image/png', ext: '.png' };
  }

  const buffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
  return { buffer, mimeType: 'image/jpeg', ext: '.jpg' };
};

const readFileInput = async (file) => {
  if (!file) {
    const error = new Error('File is required');
    error.code = 'VALIDATION_ERROR';
    error.statusCode = 400;
    throw error;
  }

  if (Buffer.isBuffer(file.buffer)) {
    return {
      buffer: file.buffer,
      originalName: file.originalname || file.originalName || 'upload',
      mimeType: file.mimetype || file.mimeType || 'application/octet-stream',
      tempPath: null,
    };
  }

  if (file.path && fs.existsSync(file.path)) {
    return {
      buffer: fs.readFileSync(file.path),
      originalName: file.originalname || file.originalName || path.basename(file.path),
      mimeType: file.mimetype || file.mimeType || 'application/octet-stream',
      tempPath: file.path,
    };
  }

  const error = new Error('Invalid file input');
  error.code = 'VALIDATION_ERROR';
  error.statusCode = 400;
  throw error;
};

/**
 * Upload a file to the correct category folder and save metadata.
 *
 * @param {object} file - Multer file or { buffer, originalname, mimetype }
 * @param {string} category - One of FILE_CATEGORIES
 * @param {{ ownerId: string, ownerType?: 'investor' | 'admin' }} [options]
 * @returns {Promise<object>} File DB record
 */
export const uploadFile = async (file, category, options = {}) => {
  await ensureFilesTable();

  const { ownerId, ownerType = 'investor' } = options;
  if (!ownerId) {
    const error = new Error('ownerId is required');
    error.code = 'VALIDATION_ERROR';
    error.statusCode = 400;
    throw error;
  }

  const normalizedCategory = normalizeCategory(category);
  const input = await readFileInput(file);

  if (!ALLOWED_MIMES.has(input.mimeType)) {
    const error = new Error('File type not allowed');
    error.code = 'FILE_TYPE_NOT_ALLOWED';
    error.statusCode = 400;
    throw error;
  }

  const folder = CATEGORY_FOLDERS[normalizedCategory];
  const absoluteDir = path.join(UPLOAD_ROOT, folder);
  ensureDir(absoluteDir);

  let outputBuffer = input.buffer;
  let mimeType = input.mimeType;
  let ext = getExtension(input.originalName, input.mimeType);

  if (normalizedCategory === FILE_CATEGORIES.PROFILE_PHOTO) {
    if (!mimeType.startsWith('image/')) {
      const error = new Error('Profile photo must be an image');
      error.code = 'FILE_TYPE_NOT_ALLOWED';
      error.statusCode = 400;
      throw error;
    }

    const compressed = await compressProfilePhoto(input.buffer, mimeType);
    outputBuffer = compressed.buffer;
    mimeType = compressed.mimeType;
    ext = compressed.ext;
  }

  const storedName = generateStoredName(ext);
  const absolutePath = path.join(absoluteDir, storedName);
  const relativeUrl = path.join(folder, storedName).split(path.sep).join('/');

  fs.writeFileSync(absolutePath, outputBuffer);

  // Remove multer temp file if it was written to a different path
  if (input.tempPath && path.resolve(input.tempPath) !== path.resolve(absolutePath)) {
    try {
      fs.unlinkSync(input.tempPath);
    } catch {
      // ignore cleanup errors
    }
  }

  const size = outputBuffer.length;

  const result = await pool.query(
    `
    INSERT INTO files (
      owner_id, owner_type, category, original_name, stored_name, file_url, mime_type, size
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      id, owner_id, owner_type, category, original_name, stored_name,
      file_url, mime_type, size, created_at, updated_at
  `,
    [
      ownerId,
      ownerType,
      normalizedCategory,
      input.originalName,
      storedName,
      relativeUrl,
      mimeType,
      size,
    ]
  );

  const record = result.rows[0];

  logger.info('File uploaded', {
    fileId: record.id,
    category: normalizedCategory,
    ownerId,
    size,
    storedName,
  });

  return record;
};

/**
 * Return a readable stream for a file after ownership check.
 * Investor may only access own files.
 *
 * @param {string} fileId
 * @param {string} userId
 * @returns {Promise<{ stream: import('fs').ReadStream, file: object }>}
 */
export const getFileStream = async (fileId, userId) => {
  await ensureFilesTable();

  const result = await pool.query(
    `
    SELECT
      id, owner_id, owner_type, category, original_name, stored_name,
      file_url, mime_type, size, created_at, updated_at
    FROM files
    WHERE id = $1
  `,
    [fileId]
  );

  if (result.rows.length === 0) {
    const error = new Error('File not found');
    error.code = 'NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const file = result.rows[0];

  if (String(file.owner_id) !== String(userId)) {
    const error = new Error('Access denied');
    error.code = 'AUTH_FORBIDDEN';
    error.statusCode = 403;
    throw error;
  }

  const absolutePath = resolveAbsolutePath(file.file_url);

  if (!fs.existsSync(absolutePath)) {
    const error = new Error('File missing on disk');
    error.code = 'NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  return {
    stream: createReadStream(absolutePath),
    file,
  };
};

/**
 * Delete file from disk and remove DB record.
 * @param {string} fileId
 * @returns {Promise<boolean>}
 */
export const deleteFile = async (fileId) => {
  await ensureFilesTable();

  const result = await pool.query(
    `
    SELECT id, file_url, stored_name
    FROM files
    WHERE id = $1
  `,
    [fileId]
  );

  if (result.rows.length === 0) {
    const error = new Error('File not found');
    error.code = 'NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const file = result.rows[0];
  const absolutePath = resolveAbsolutePath(file.file_url);

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }

  await pool.query(`DELETE FROM files WHERE id = $1`, [fileId]);

  logger.info('File deleted', {
    fileId,
    storedName: file.stored_name,
  });

  return true;
};

/**
 * Fetch file metadata by id (no auth).
 * @param {string} fileId
 * @returns {Promise<object|null>}
 */
export const getFileById = async (fileId) => {
  await ensureFilesTable();

  const result = await pool.query(
    `
    SELECT
      id, owner_id, owner_type, category, original_name, stored_name,
      file_url, mime_type, size, created_at, updated_at
    FROM files
    WHERE id = $1
  `,
    [fileId]
  );

  return result.rows[0] || null;
};

export { UPLOAD_ROOT, CATEGORY_FOLDERS };
