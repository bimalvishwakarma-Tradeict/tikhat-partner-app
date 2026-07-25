import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger.js';
import { AuthError } from '../services/auth.service.js';
import { sendEmail } from '../services/email.service.js';
import {
  logAction,
  buildActionDescription,
  AUDIT_ENTITY_TYPES,
} from '../services/audit.service.js';
import {
  loginAdmin,
  verifyAdminLoginOtp,
  resendAdminLoginOtp,
  logoutAdminSession,
  refreshAdminAccessToken,
  findAdminById,
  isAdminEmailTaken,
  createAdmin,
  listAdmins,
  updateAdminStatus,
  softDeleteAdmin,
  updateAdminPassword,
  getAdminPasswordHash,
  isSoftDeletedEmail,
} from '../models/admin.model.js';
import { normalizeMobile } from '../models/user.model.js';
import { isValidFullName, isValidIndianMobile } from '../utils/validators.js';

const BCRYPT_ROUNDS = 12;

/**
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context
 */
function handleAdminError(res, error, context) {
  if (error instanceof AuthError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      error: error.code,
    });
  }

  logger.error(`[Admin] ${context}: ${error.message}`, { error });
  return res.status(500).json({
    success: false,
    message: 'Admin request failed',
    error: 'INTERNAL_ERROR',
  });
}

function assertStrongPassword(password) {
  const value = String(password || '');
  if (
    value.length < 8 ||
    !/[A-Z]/.test(value) ||
    !/[a-z]/.test(value) ||
    !/[0-9]/.test(value)
  ) {
    throw new AuthError(
      'Password must be at least 8 characters and include uppercase, lowercase, and a number',
      'VALIDATION_ERROR',
      400
    );
  }
}

/**
 * POST /api/v1/auth/admin/login
 */
export async function adminLogin(req, res) {
  try {
    const { email, password, device_type } = req.body;
    const result = await loginAdmin(email, password, device_type);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        email: result.email,
        device_type: result.deviceType,
        expires_in_minutes: result.expiresInMinutes,
      },
    });
  } catch (error) {
    return handleAdminError(res, error, 'adminLogin');
  }
}

/**
 * POST /api/v1/auth/admin/verify-otp
 */
export async function adminVerifyOtp(req, res) {
  try {
    const { email, otp, device_type } = req.body;
    const result = await verifyAdminLoginOtp(email, otp, device_type);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        sessionId: result.sessionId,
        user: result.user,
      },
    });
  } catch (error) {
    return handleAdminError(res, error, 'adminVerifyOtp');
  }
}

/**
 * POST /api/v1/auth/admin/resend-otp
 */
export async function adminResendOtp(req, res) {
  try {
    const { email } = req.body;
    const result = await resendAdminLoginOtp(email);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        email: result.email,
        expires_in_minutes: result.expiresInMinutes,
      },
    });
  } catch (error) {
    return handleAdminError(res, error, 'adminResendOtp');
  }
}

/**
 * POST /api/v1/auth/admin/logout
 */
export async function adminLogout(req, res) {
  try {
    await logoutAdminSession(req.user.sessionId, req.user.userId);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    return handleAdminError(res, error, 'adminLogout');
  }
}

/**
 * POST /api/v1/auth/admin/refresh
 */
export async function adminRefreshToken(req, res) {
  try {
    const { refreshToken } = req.body;
    const result = await refreshAdminAccessToken(refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        sessionId: result.sessionId,
      },
    });
  } catch (error) {
    return handleAdminError(res, error, 'adminRefreshToken');
  }
}

/**
 * POST /api/v1/admin/admins — Super Admin only
 */
export async function createAdminAccount(req, res) {
  try {
    const name = req.body.name || req.body.full_name;
    const { email, password, mobile, role } = req.body;

    if (!isValidFullName(name)) {
      throw new AuthError(
        'Full name must be at least 3 characters and contain only alphabets and spaces',
        'VALIDATION_ERROR',
        400
      );
    }

    assertStrongPassword(password);

    if (mobile && !isValidIndianMobile(mobile)) {
      throw new AuthError(
        'Mobile must be a valid 10-digit Indian number',
        'VALIDATION_ERROR',
        400
      );
    }

    if (await isAdminEmailTaken(email)) {
      throw new AuthError('Email is already registered', 'USER_EMAIL_EXISTS', 409);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const admin = await createAdmin({
      fullName: name,
      email,
      passwordHash,
      mobile: mobile ? normalizeMobile(mobile) : null,
      role: role || 'admin',
      createdBy: req.user.userId,
    });

    try {
      await sendEmail(admin.email, 'custom-notification', {
        investorName: admin.full_name,
        subjectTitle: 'Welcome to Tikhat Partner Admin',
        body: `Your admin account has been created.\n\nEmail: ${admin.email}\nRole: ${admin.role}\n\nLogin at the admin portal with your email and the password provided by Super Admin. You will receive an OTP to complete login.`,
        referenceId: admin.id,
        recipientType: 'admin',
      });
    } catch (emailError) {
      logger.error(`[Admin] Welcome email failed: ${emailError.message}`, {
        error: emailError,
        adminId: admin.id,
      });
    }

    await logAction(
      req.user.userId,
      buildActionDescription('Created', `admin account for ${admin.full_name}`),
      AUDIT_ENTITY_TYPES.ADMIN,
      admin.id,
      null,
      {
        email: admin.email,
        role: admin.role,
        full_name: admin.full_name,
      },
      req.ipAddress || null
    );

    return res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: { admin },
    });
  } catch (error) {
    return handleAdminError(res, error, 'createAdminAccount');
  }
}

/**
 * GET /api/v1/admin/admins — Super Admin only
 */
export async function listAdminAccounts(req, res) {
  try {
    const admins = await listAdmins();

    return res.status(200).json({
      success: true,
      message: 'Admins retrieved successfully',
      data: { admins },
    });
  } catch (error) {
    return handleAdminError(res, error, 'listAdminAccounts');
  }
}

/**
 * PATCH /api/v1/admin/admins/:id/suspend
 */
export async function suspendAdminAccount(req, res) {
  try {
    const { id } = req.params;

    if (id === req.user.userId) {
      throw new AuthError('Cannot suspend your own account', 'AUTH_FORBIDDEN', 403);
    }

    const before = await findAdminById(id);
    if (!before || isSoftDeletedEmail(before.email)) {
      throw new AuthError('Admin not found', 'NOT_FOUND', 404);
    }

    const admin = await updateAdminStatus(id, 'suspended');

    await logAction(
      req.user.userId,
      buildActionDescription('Suspended', `admin ${admin.full_name}`),
      AUDIT_ENTITY_TYPES.ADMIN,
      admin.id,
      { status: before.status },
      { status: admin.status },
      req.ipAddress || null
    );

    return res.status(200).json({
      success: true,
      message: 'Admin suspended successfully',
      data: { admin },
    });
  } catch (error) {
    return handleAdminError(res, error, 'suspendAdminAccount');
  }
}

/**
 * PATCH /api/v1/admin/admins/:id/unsuspend
 */
export async function unsuspendAdminAccount(req, res) {
  try {
    const { id } = req.params;

    const before = await findAdminById(id);
    if (!before || isSoftDeletedEmail(before.email)) {
      throw new AuthError('Admin not found', 'NOT_FOUND', 404);
    }

    const admin = await updateAdminStatus(id, 'active');

    await logAction(
      req.user.userId,
      buildActionDescription('Unsuspended', `admin ${admin.full_name}`),
      AUDIT_ENTITY_TYPES.ADMIN,
      admin.id,
      { status: before.status },
      { status: admin.status },
      req.ipAddress || null
    );

    return res.status(200).json({
      success: true,
      message: 'Admin unsuspended successfully',
      data: { admin },
    });
  } catch (error) {
    return handleAdminError(res, error, 'unsuspendAdminAccount');
  }
}

/**
 * DELETE /api/v1/admin/admins/:id — soft delete
 */
export async function deleteAdminAccount(req, res) {
  try {
    const { id } = req.params;

    if (id === req.user.userId) {
      throw new AuthError('Cannot delete your own account', 'AUTH_FORBIDDEN', 403);
    }

    const before = await findAdminById(id);
    if (!before || isSoftDeletedEmail(before.email)) {
      throw new AuthError('Admin not found', 'NOT_FOUND', 404);
    }

    const admin = await softDeleteAdmin(id);

    await logAction(
      req.user.userId,
      buildActionDescription('Deleted', `admin ${before.full_name}`),
      AUDIT_ENTITY_TYPES.ADMIN,
      admin.id,
      { email: before.email, status: before.status, role: before.role },
      { email: admin.email, status: admin.status },
      req.ipAddress || null
    );

    return res.status(200).json({
      success: true,
      message: 'Admin deleted successfully',
      data: { admin },
    });
  } catch (error) {
    return handleAdminError(res, error, 'deleteAdminAccount');
  }
}

/**
 * PATCH /api/v1/admin/profile/password
 */
export async function changeOwnPassword(req, res) {
  try {
    const { current_password, new_password } = req.body;

    assertStrongPassword(new_password);

    const hash = await getAdminPasswordHash(req.user.userId);
    if (!hash) {
      throw new AuthError('Admin not found', 'NOT_FOUND', 404);
    }

    const currentOk = await bcrypt.compare(String(current_password), hash);
    if (!currentOk) {
      throw new AuthError(
        'Current password is incorrect',
        'AUTH_INVALID_CREDENTIALS',
        401
      );
    }

    const newHash = await bcrypt.hash(String(new_password), BCRYPT_ROUNDS);
    const admin = await updateAdminPassword(req.user.userId, newHash);

    await logAction(
      req.user.userId,
      buildActionDescription('Changed', 'own password'),
      AUDIT_ENTITY_TYPES.ADMIN,
      admin.id,
      null,
      { password_changed: true },
      req.ipAddress || null
    );

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    return handleAdminError(res, error, 'changeOwnPassword');
  }
}
