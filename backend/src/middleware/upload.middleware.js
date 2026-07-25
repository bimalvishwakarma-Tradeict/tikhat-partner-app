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
  'image/png',
  'application/pdf',
]);

const ALLOWED_EXTENSIONS = Object.freeze(['.jpg', '.jpeg', '.png', '.pdf']);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

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
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      cb(null, uniqueName);
    },
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeAllowed = ALLOWED_MIMES.includes(file.mimetype);
    const extAllowed = ALLOWED_EXTENSIONS.includes(ext);

    if (mimeAllowed && extAllowed) {
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

export { ALLOWED_MIMES, MAX_FILE_SIZE, UPLOAD_ROOT };
