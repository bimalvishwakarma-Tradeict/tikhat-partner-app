import { Router } from 'express';
import {
  loginLimiter,
  otpLimiter,
  refreshLimiter,
  passwordChangeLimiter,
} from '../middleware/rateLimit.middleware.js';
import {
  validate,
  sanitizeText,
  body,
  param,
} from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  requireAdmin,
  requireSuperAdmin,
} from '../middleware/role.middleware.js';
import {
  isValidEmail,
  isValidFullName,
  isValidIndianMobile,
} from '../utils/validators.js';
import {
  adminLogin,
  adminVerifyOtp,
  adminResendOtp,
  adminLogout,
  adminRefreshToken,
  createAdminAccount,
  listAdminAccounts,
  suspendAdminAccount,
  unsuspendAdminAccount,
  deleteAdminAccount,
  changeOwnPassword,
} from '../controllers/admin.controller.js';

/** Mounted at /api/v1/auth/admin */
export const adminAuthRouter = Router();

/** Mounted at /api/v1/admin */
export const adminManagementRouter = Router();

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

const passwordStrength = [
  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain a lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number'),
];

adminAuthRouter.post(
  '/login',
  loginLimiter,
  [
    ...emailValidator,
    body('password')
      .exists({ checkFalsy: true })
      .withMessage('Password is required')
      .isString(),
    deviceTypeValidator,
  ],
  validate,
  adminLogin
);

adminAuthRouter.post(
  '/verify-otp',
  loginLimiter,
  [
    ...emailValidator,
    body('otp')
      .exists({ checkFalsy: true })
      .withMessage('OTP is required')
      .matches(/^\d{6}$/)
      .withMessage('OTP must be a 6-digit number'),
    deviceTypeValidator,
  ],
  validate,
  adminVerifyOtp
);

adminAuthRouter.post(
  '/resend-otp',
  otpLimiter,
  emailValidator,
  validate,
  adminResendOtp
);

adminAuthRouter.post('/logout', authenticate, requireAdmin, adminLogout);

adminAuthRouter.post(
  '/refresh',
  refreshLimiter,
  [
    body('refreshToken')
      .exists({ checkFalsy: true })
      .withMessage('refreshToken is required')
      .isString(),
  ],
  validate,
  adminRefreshToken
);

adminManagementRouter.use(authenticate, requireAdmin);

adminManagementRouter.patch(
  '/profile/password',
  passwordChangeLimiter,
  [
    body('current_password')
      .exists({ checkFalsy: true })
      .withMessage('current_password is required')
      .isString(),
    body('new_password')
      .exists({ checkFalsy: true })
      .withMessage('new_password is required')
      .isString()
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/)
      .withMessage('Password must contain an uppercase letter')
      .matches(/[a-z]/)
      .withMessage('Password must contain a lowercase letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain a number'),
  ],
  validate,
  changeOwnPassword
);

adminManagementRouter.post(
  '/admins',
  requireSuperAdmin,
  [
    sanitizeText('name'),
    sanitizeText('full_name'),
    body('name')
      .optional()
      .custom((value, { req }) => {
        const name = value || req.body.full_name;
        if (!isValidFullName(name)) {
          throw new Error(
            'Name must be at least 3 characters and contain only alphabets and spaces'
          );
        }
        return true;
      }),
    body('full_name')
      .optional()
      .custom((value, { req }) => {
        if (!req.body.name && !isValidFullName(value)) {
          throw new Error(
            'Name must be at least 3 characters and contain only alphabets and spaces'
          );
        }
        return true;
      }),
    body().custom((_, { req }) => {
      if (!req.body.name && !req.body.full_name) {
        throw new Error('name is required');
      }
      return true;
    }),
    ...emailValidator,
    ...passwordStrength,
    sanitizeText('mobile'),
    body('mobile')
      .optional({ checkFalsy: true })
      .custom((value) => {
        if (value && !isValidIndianMobile(value)) {
          throw new Error('Mobile must be a valid 10-digit Indian number');
        }
        return true;
      }),
    body('role')
      .optional()
      .isIn(['admin', 'super_admin'])
      .withMessage('role must be admin or super_admin'),
  ],
  validate,
  createAdminAccount
);

adminManagementRouter.get('/admins', requireSuperAdmin, listAdminAccounts);

adminManagementRouter.patch(
  '/admins/:id/suspend',
  requireSuperAdmin,
  [param('id').isUUID().withMessage('Invalid admin id')],
  validate,
  suspendAdminAccount
);

adminManagementRouter.patch(
  '/admins/:id/unsuspend',
  requireSuperAdmin,
  [param('id').isUUID().withMessage('Invalid admin id')],
  validate,
  unsuspendAdminAccount
);

adminManagementRouter.delete(
  '/admins/:id',
  requireSuperAdmin,
  [param('id').isUUID().withMessage('Invalid admin id')],
  validate,
  deleteAdminAccount
);

export default adminManagementRouter;
