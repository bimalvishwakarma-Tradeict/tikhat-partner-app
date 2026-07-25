import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  redactForLogs,
  sanitizeErrorForLogs,
  scrubSensitiveText,
  maskPan,
  maskAadhar,
  maskBankAccount,
} from './maskSensitive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const backendRoot = path.join(__dirname, '../..');
const configuredLogPath = process.env.LOG_PATH || './logs';
const logPath = path.isAbsolute(configuredLogPath)
  ? configuredLogPath
  : path.resolve(backendRoot, configuredLogPath);

const { combine, timestamp, printf, colorize, errors } = winston.format;

const SENSITIVE_META_KEY_RE =
  /^(password|password_hash|current_password|new_password|confirm_password|otp|refresh_token|refreshToken|access_token|accessToken|pan_number|aadhar_number|bank_account_number|secret|token)$/i;

/**
 * Mutate winston info in place so Symbol metadata is preserved.
 * Redacts passwords, PAN, Aadhar, and bank accounts from every log line.
 */
const sensitiveRedactor = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = scrubSensitiveText(info.message);
  }

  if (typeof info.stack === 'string') {
    info.stack = scrubSensitiveText(info.stack);
  }

  if (info.error) {
    info.error = sanitizeErrorForLogs(info.error);
  }

  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'timestamp' || key === 'service') {
      continue;
    }

    const value = info[key];

    if (SENSITIVE_META_KEY_RE.test(key)) {
      if (/pan/i.test(key)) {
        info[key] = maskPan(value);
      } else if (/aadhar/i.test(key)) {
        info[key] = maskAadhar(value);
      } else if (/bank_account/i.test(key)) {
        info[key] = maskBankAccount(value);
      } else {
        info[key] = '[REDACTED]';
      }
      continue;
    }

    if (typeof value === 'string') {
      info[key] = scrubSensitiveText(value);
    } else if (value && typeof value === 'object') {
      info[key] = redactForLogs(value);
    }
  }

  return info;
});

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stackString = stack ? `\n${stack}` : '';
  return `${ts} [${level}]: ${message}${metaString}${stackString}`;
});

const dailyRotateTransport = new DailyRotateFile({
  dirname: logPath,
  filename: 'tikhat-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'info',
});

const errorRotateTransport = new DailyRotateFile({
  dirname: logPath,
  filename: 'tikhat-error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
});

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    sensitiveRedactor(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  defaultMeta: { service: 'tikhat-partner-backend' },
  transports: [
    dailyRotateTransport,
    errorRotateTransport,
    new winston.transports.Console({
      format: combine(
        colorize(),
        sensitiveRedactor(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      ),
    }),
  ],
});
