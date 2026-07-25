/**
 * Sensitive-data masking / redaction helpers (Task 26.3).
 */

const SENSITIVE_KEY_RE =
  /^(password|password_hash|current_password|new_password|confirm_password|otp|refresh_token|refreshToken|access_token|accessToken|pan_number|aadhar_number|bank_account_number|secret|token)$/i;

const PAN_IN_TEXT_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi;
const AADHAR_IN_TEXT_RE = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;

/**
 * Mask bank account to last 4 digits only.
 * @param {unknown} value
 * @returns {string | null}
 */
export function maskBankAccount(value) {
  if (value == null || value === '') {
    return value == null ? null : '';
  }
  const digits = String(value).replace(/\s+/g, '');
  if (digits.length <= 4) {
    return `XXXX${digits}`;
  }
  return `${'X'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

/**
 * Mask PAN for logs (never full value).
 * @param {unknown} value
 * @returns {string | null}
 */
export function maskPan(value) {
  if (value == null || value === '') {
    return value == null ? null : '';
  }
  const raw = String(value).trim().toUpperCase();
  if (raw.length < 4) {
    return 'XXXX';
  }
  return `${raw.slice(0, 2)}XXXXXX${raw.slice(-2)}`;
}

/**
 * Mask Aadhar for logs (never full value).
 * @param {unknown} value
 * @returns {string | null}
 */
export function maskAadhar(value) {
  if (value == null || value === '') {
    return value == null ? null : '';
  }
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 4) {
    return 'XXXX';
  }
  return `XXXX-XXXX-${digits.slice(-4)}`;
}

/**
 * Strip PAN/Aadhar-looking substrings from free text (log messages / PG detail).
 * @param {unknown} text
 * @returns {string}
 */
export function scrubSensitiveText(text) {
  if (text == null) {
    return '';
  }
  return String(text)
    .replace(PAN_IN_TEXT_RE, '[REDACTED_PAN]')
    .replace(AADHAR_IN_TEXT_RE, '[REDACTED_AADHAR]')
    .replace(/password[^,\s]*/gi, 'password=[REDACTED]');
}

/**
 * Deep-redact sensitive keys for logging.
 * @param {unknown} input
 * @param {number} [depth]
 * @returns {unknown}
 */
export function redactForLogs(input, depth = 0) {
  if (input == null || depth > 6) {
    return input;
  }

  if (typeof input === 'string') {
    return scrubSensitiveText(input);
  }

  if (typeof input !== 'object') {
    return input;
  }

  if (input instanceof Error) {
    return sanitizeErrorForLogs(input);
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactForLogs(item, depth + 1));
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      if (/pan/i.test(key)) {
        out[key] = maskPan(value);
      } else if (/aadhar/i.test(key)) {
        out[key] = maskAadhar(value);
      } else if (/bank_account/i.test(key)) {
        out[key] = maskBankAccount(value);
      } else {
        out[key] = '[REDACTED]';
      }
      continue;
    }
    out[key] = redactForLogs(value, depth + 1);
  }
  return out;
}

/**
 * Safe error shape for logs (no PG detail leak of unique constraint values).
 * @param {unknown} error
 * @returns {Record<string, unknown>}
 */
export function sanitizeErrorForLogs(error) {
  if (!error || typeof error !== 'object') {
    return { message: scrubSensitiveText(error) };
  }

  const err = /** @type {Record<string, unknown>} */ (error);
  return {
    name: err.name || 'Error',
    message: scrubSensitiveText(err.message),
    code: err.code || undefined,
    status: err.status || undefined,
    // Intentionally omit detail / hint / where / stack from structured meta
  };
}

/**
 * Investor-facing profile: mask bank account; keep owner's PAN/Aadhar.
 * @param {Record<string, unknown>} profile
 * @returns {Record<string, unknown>}
 */
export function toInvestorSafeProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return profile;
  }
  const safe = { ...profile };
  if ('bank_account_number' in safe) {
    safe.bank_account_number = maskBankAccount(safe.bank_account_number);
  }
  if ('password_hash' in safe) {
    delete safe.password_hash;
  }
  if ('password' in safe) {
    delete safe.password;
  }
  return safe;
}

/**
 * Mask bank values inside profile update request history for investors.
 * @param {object} row
 * @returns {object}
 */
export function toInvestorSafeUpdateRequest(row) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  if (row.field_name !== 'bank_account_number') {
    return row;
  }
  return {
    ...row,
    old_value: maskBankAccount(row.old_value),
    new_value: maskBankAccount(row.new_value),
  };
}

/**
 * Public file metadata — never expose filesystem paths.
 * @param {object} file
 * @param {{ downloadUrl?: string | null }} [opts]
 * @returns {object}
 */
export function toPublicFileRef(file, opts = {}) {
  if (!file) {
    return null;
  }
  return {
    file_id: file.id || file.file_id || null,
    file_name: file.original_name || file.file_name || file.name || null,
    file_type: file.mime_type || file.file_type || file.type || null,
    file_size: file.size || file.file_size || null,
    download_url: opts.downloadUrl ?? file.download_url ?? null,
    created_at: file.created_at || null,
  };
}

/**
 * Strip payment_screenshot_url path from investor capital txn rows.
 * @param {object} row
 * @returns {object}
 */
export function toInvestorSafeCapitalTxn(row) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  const {
    payment_screenshot_url: _path,
    password_hash: _ph,
    ...rest
  } = row;
  return {
    ...rest,
    has_payment_screenshot: Boolean(_path),
  };
}
