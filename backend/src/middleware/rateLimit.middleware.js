import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV === 'development';

const rateLimitHandler = (req, res) => {
  return res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    error: 'RATE_LIMIT_EXCEEDED',
  });
};

/**
 * Task 26.4 — Rate limiting & spam prevention (verified configuration).
 *
 * Limits enforced here (production only; development is skipped):
 * - Login: 10 / 15 min per IP
 * - OTP request: 3 / 15 min per email
 * - Registration: 5 / hour per IP
 * - General API: 100 / 15 min per IP (applied in app.js)
 *
 * Related controls verified elsewhere (do not change business logic):
 * - File upload max 5MB → upload.middleware.js (MAX_FILE_SIZE + FILE_TOO_LARGE)
 * - Duplicate UTR global → capital.model.js isUtrTaken()
 * - Duplicate PAN/Aadhar system-wide → investorProfile / userManagement / backdate controllers
 * - Deleted email blocked from re-registration → user.model.js isEmailTaken() via findUserByEmail
 */

/** Verified mirror of upload.middleware.js MAX_FILE_SIZE (5MB). */
export const FILE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Login: 10 attempts / 15 minutes per IP */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 10,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * OTP request: 3 attempts / 15 minutes per email.
 * Falls back to IP when email is missing from the body.
 * validate:false — custom keyGenerator is intentional (email-based, not IP).
 */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 3,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    return email ? `otp:${email}` : `otp-ip:${req.ip}`;
  },
  validate: false,
});

/** Registration: 5 attempts / 1 hour per IP */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 10000 : 5,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** General API: 100 requests / 15 minutes per IP */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 100,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** Token refresh: 30 / 15 minutes */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 30,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** Password change: 10 / 15 minutes */
export const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 10,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** Financial mutations (deposit/withdraw/debit): 30 / 15 minutes */
export const financialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 30,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** File upload endpoints: 20 / 15 minutes */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 20,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** High-impact admin mutations: 60 / 15 minutes */
export const adminMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 60,
  skip: () => isDev,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
