import { Router } from 'express';
import {
  registrationLimiter,
  loginLimiter,
  otpLimiter,
  refreshLimiter,
  passwordChangeLimiter,
} from '../middleware/rateLimit.middleware.js';
import {
  validate,
  sanitizeText,
  body,
} from '../middleware/validate.middleware.js';
import {
  authenticate,
  trackRegistrationIp,
} from '../middleware/auth.middleware.js';
import {
  isValidEmail,
  isValidFullName,
  isValidIndianMobile,
} from '../utils/validators.js';
import {
  register,
  login,
  verifyOtp,
  resendOtp,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  listSessions,
} from '../controllers/auth.controller.js';

const router = Router();

const registerValidators = [
  sanitizeText('full_name'),
  body('full_name')
    .exists({ checkFalsy: true })
    .withMessage('Full name is required')
    .custom((value) => {
      if (!isValidFullName(value)) {
        throw new Error(
          'Full name must be at least 3 characters and contain only alphabets and spaces'
        );
      }
      return true;
    }),

  sanitizeText('email'),
  body('email')
    .exists({ checkFalsy: true })
    .withMessage('Email is required')
    .custom((value) => {
      if (!isValidEmail(value)) {
        throw new Error('Valid email address is required');
      }
      return true;
    }),

  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .isString()
    .withMessage('Password must be a string')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain a lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number'),

  sanitizeText('mobile'),
  body('mobile')
    .exists({ checkFalsy: true })
    .withMessage('Mobile number is required')
    .custom((value) => {
      if (!isValidIndianMobile(value)) {
        throw new Error('Mobile must be a valid 10-digit Indian number');
      }
      return true;
    }),
];

const emailValidator = [
  sanitizeText('email'),
  body('email')
    .exists({ checkFalsy: true })
    .withMessage('Email is required')
    .custom((value) => {
      if (!isValidEmail(value)) {
        throw new Error('Valid email address is required');
      }
      return true;
    }),
];

const deviceTypeValidator = body('device_type')
  .exists({ checkFalsy: true })
  .withMessage('device_type is required')
  .isIn(['mobile', 'web'])
  .withMessage('device_type must be mobile or web');

const loginValidators = [
  ...emailValidator,
  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .isString()
    .withMessage('Password must be a string'),
  deviceTypeValidator,
];

const verifyOtpValidators = [
  ...emailValidator,
  body('otp')
    .exists({ checkFalsy: true })
    .withMessage('OTP is required')
    .isString()
    .withMessage('OTP must be a string')
    .matches(/^\d{6}$/)
    .withMessage('OTP must be a 6-digit number'),
  deviceTypeValidator,
];

const refreshValidators = [
  body('refreshToken')
    .exists({ checkFalsy: true })
    .withMessage('refreshToken is required')
    .isString()
    .withMessage('refreshToken must be a string'),
];

router.post(
  '/register',
  registrationLimiter,
  registerValidators,
  validate,
  trackRegistrationIp,
  register
);

router.post('/login', loginLimiter, loginValidators, validate, login);

router.post(
  '/verify-otp',
  loginLimiter,
  verifyOtpValidators,
  validate,
  verifyOtp
);

router.post(
  '/resend-otp',
  otpLimiter,
  emailValidator,
  validate,
  resendOtp
);

router.post('/logout', authenticate, logout);

router.post('/refresh', refreshLimiter, refreshValidators, validate, refreshToken);

const passwordValidators = [
  body('new_password')
    .exists({ checkFalsy: true })
    .withMessage('new_password is required')
    .isString()
    .withMessage('new_password must be a string')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain a lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number'),
];

const resetPasswordValidators = [
  ...emailValidator,
  body('otp')
    .exists({ checkFalsy: true })
    .withMessage('OTP is required')
    .isString()
    .withMessage('OTP must be a string')
    .matches(/^\d{6}$/)
    .withMessage('OTP must be a 6-digit number'),
  ...passwordValidators,
];

router.post(
  '/forgot-password',
  otpLimiter,
  emailValidator,
  validate,
  forgotPassword
);

router.post(
  '/reset-password',
  otpLimiter,
  resetPasswordValidators,
  validate,
  resetPassword
);

const changePasswordValidators = [
  body('current_password')
    .exists({ checkFalsy: true })
    .withMessage('current_password is required')
    .isString()
    .withMessage('current_password must be a string'),
  ...passwordValidators,
];

router.patch(
  '/change-password',
  authenticate,
  passwordChangeLimiter,
  changePasswordValidators,
  validate,
  changePassword
);

router.get('/sessions', authenticate, listSessions);

export default router;
