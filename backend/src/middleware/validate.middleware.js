import { validationResult, body, param, query } from 'express-validator';

/**
 * Strip HTML tags from a string value.
 * @param {string} value
 * @returns {string}
 */
export const stripHtml = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/<[^>]*>/g, '').trim();
};

/**
 * Run express-validator result check.
 * Returns 400 with details if validation failed.
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: 'VALIDATION_ERROR',
      details: errors.array().map((err) => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value,
      })),
    });
  }

  return next();
};

/**
 * Helper: sanitize a body text field (strip HTML).
 */
export const sanitizeText = (field) =>
  body(field).customSanitizer((value) => stripHtml(value));

/**
 * Re-export commonly used express-validator builders for route files.
 */
export { body, param, query };
