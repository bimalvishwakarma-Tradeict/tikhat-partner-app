import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_PATH || path.join(__dirname, '../../uploads')
);

const ALLOWED_MIMES = Object.freeze([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

const ALLOWED_EXTENSIONS = Object.freeze(['.jpg', '.jpeg', '.png', '.pdf']);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const KYC_UPLOAD_FIELDS = Object.freeze([
  { name: 'pan_front', maxCount: 1 },
  { name: 'pan_back', maxCount: 1 },
  { name: 'aadhar_front', maxCount: 1 },
  { name: 'aadhar_back', maxCount: 1 },
  { name: 'profile_photo', maxCount: 1 },
]);

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

ensureDir(UPLOAD_ROOT);
ensureDir(path.join(UPLOAD_ROOT, 'kyc', 'pan', 'front'));
ensureDir(path.join(UPLOAD_ROOT, 'kyc', 'pan', 'back'));
ensureDir(path.join(UPLOAD_ROOT, 'kyc', 'aadhar', 'front'));
ensureDir(path.join(UPLOAD_ROOT, 'kyc', 'aadhar', 'back'));
ensureDir(path.join(UPLOAD_ROOT, 'profile-photos'));
ensureDir(path.join(UPLOAD_ROOT, 'payment-screenshots'));
ensureDir(path.join(UPLOAD_ROOT, 'support-attachments'));
ensureDir(path.join(UPLOAD_ROOT, 'tmp'));

/**
 * Normalize MIME from React Native / browsers (image/jpg → image/jpeg).
 * @param {string | undefined} mime
 * @returns {string}
 */
const normalizeMime = (mime) => {
  const value = String(mime || '')
    .toLowerCase()
    .trim();
  if (value === 'image/jpg') {
    return 'image/jpeg';
  }
  return value;
};

/**
 * Create multer instance for a subdirectory under uploads/.
 * @param {string} subdir - e.g. 'profile-photos', 'payment-screenshots'
 */
export const createUploader = (subdir = '') => {
  const destination = subdir
    ? path.join(UPLOAD_ROOT, subdir)
    : UPLOAD_ROOT;

  ensureDir(destination);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      let ext = path.extname(file.originalname || '').toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        const mime = normalizeMime(file.mimetype);
        if (mime === 'image/jpeg') ext = '.jpg';
        else if (mime === 'image/png') ext = '.png';
        else if (mime === 'application/pdf') ext = '.pdf';
        else ext = '.bin';
      }
      const uniqueName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      cb(null, uniqueName);
    },
  });

  const fileFilter = (req, file, cb) => {
    const mime = normalizeMime(file.mimetype);
    // Mutate so downstream storage.service sees a canonical MIME
    file.mimetype = mime || file.mimetype;

    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      if (mime === 'image/jpeg') ext = '.jpg';
      else if (mime === 'image/png') ext = '.png';
      else if (mime === 'application/pdf') ext = '.pdf';
    }

    const mimeAllowed =
      ALLOWED_MIMES.includes(mime) || ALLOWED_MIMES.includes(file.mimetype);
    const extAllowed = ALLOWED_EXTENSIONS.includes(ext);

    // Accept when MIME is allowed; extension may be missing on mobile pickers
    if (
      mimeAllowed ||
      (extAllowed && (!mime || mime === 'application/octet-stream'))
    ) {
      if (!path.extname(file.originalname || '') && ext) {
        file.originalname = `${file.originalname || 'upload'}${ext}`;
      }
      cb(null, true);
    } else {
      cb(new Error('FILE_TYPE_NOT_ALLOWED'), false);
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE },
  });
};

export const upload = createUploader();

export const uploadProfilePhoto = createUploader('profile-photos');
export const uploadPaymentScreenshot = createUploader('payment-screenshots');
export const uploadSupportAttachment = createUploader('support-attachments');
export const uploadPanFront = createUploader(path.join('kyc', 'pan', 'front'));
export const uploadPanBack = createUploader(path.join('kyc', 'pan', 'back'));
export const uploadAadharFront = createUploader(path.join('kyc', 'aadhar', 'front'));
export const uploadAadharBack = createUploader(path.join('kyc', 'aadhar', 'back'));

/** Temp disk storage + multi-field KYC document upload (fields, not single). */
export const uploadKycDocumentsMw = createUploader('tmp').fields([
  ...KYC_UPLOAD_FIELDS,
]);

/**
 * Express error handler for multer / upload errors.
 */
export const handleUploadError = (err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 5MB limit',
        error: 'FILE_TOO_LARGE',
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message,
      error: 'FILE_UPLOAD_ERROR',
    });
  }

  if (err.message === 'FILE_TYPE_NOT_ALLOWED') {
    return res.status(400).json({
      success: false,
      message: 'File type not allowed. Only JPG, PNG, and PDF are accepted',
      error: 'FILE_TYPE_NOT_ALLOWED',
    });
  }

  return next(err);
};

export { ALLOWED_MIMES, MAX_FILE_SIZE, UPLOAD_ROOT, KYC_UPLOAD_FIELDS };
