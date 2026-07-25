import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger.js';
import {
  isEmailTaken,
  createInvestor,
  getActiveAdmins,
  normalizeMobile,
} from '../models/user.model.js';
import { sendEmail } from '../services/email.service.js';
import { createNotification } from '../services/notification.service.js';
import {
  AuthError,
  loginInvestor,
  verifyLoginOtp,
  resendLoginOtp,
  logoutSession,
  refreshAccessToken,
  forgotPassword as forgotPasswordService,
  resetPassword as resetPasswordService,
  requestEmailChange as requestEmailChangeService,
  changeInvestorPassword,
  listInvestorSessions,
} from '../services/auth.service.js';

const BCRYPT_ROUNDS = 12;

/**
 * Queue confirmation + admin alert emails (non-blocking delivery).
 * @param {object} user
 */
async function sendRegistrationEmails(user) {
  await sendEmail(user.email, 'custom-notification', {
    investorName: user.full_name,
    subjectTitle: 'Registration received',
    body:
      'Thank you for registering as a Tikhat Partner. Your account is pending admin approval. You will receive another email once your registration is reviewed.',
    referenceId: user.id,
    recipientType: 'investor',
  });

  const admins = await getActiveAdmins();

  await Promise.allSettled(
    admins.map((admin) =>
      sendEmail(admin.email, 'custom-notification', {
        investorName: admin.full_name,
        subjectTitle: 'New Tikhat Partner registration',
        body: `A new registration requires review.\n\nName: ${user.full_name}\nEmail: ${user.email}\nMobile: ${user.mobile}\n\nPlease review and approve or reject in the admin panel.`,
        referenceId: user.id,
        recipientType: 'admin',
      })
    )
  );
}

/**
 * Map AuthError / unexpected errors to HTTP responses.
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context
 */
function handleAuthError(res, error, context) {
  if (error instanceof AuthError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      error: error.code,
    });
  }

  logger.error(`[Auth] ${context}: ${error.message}`, { error });
  return res.status(500).json({
    success: false,
    message: 'Authentication request failed',
    error: 'INTERNAL_ERROR',
  });
}

/**
 * POST /api/v1/auth/register
 * Body: full_name, email, password, mobile
 */
export async function register(req, res) {
  try {
    const { full_name, email, password, mobile } = req.body;

    if (await isEmailTaken(email)) {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered',
        error: 'USER_EMAIL_EXISTS',
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await createInvestor({
      fullName: full_name,
      email,
      passwordHash,
      mobile: normalizeMobile(mobile),
    });

    await createNotification(
      user.id,
      'New registration pending approval',
      `${user.full_name} (${user.email}) has registered and is awaiting admin approval.`,
      'request',
      user.id,
      'registration'
    );

    try {
      await sendRegistrationEmails(user);
    } catch (emailError) {
      logger.error(
        `[Auth] Registration email queue failed: ${emailError.message}`,
        { error: emailError, userId: user.id }
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please wait for admin approval.',
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered',
        error: 'USER_EMAIL_EXISTS',
      });
    }

    logger.error(`[Auth] register: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * POST /api/v1/auth/login
 * Body: email, password, device_type
 */
export async function login(req, res) {
  try {
    const { email, password, device_type } = req.body;
    const result = await loginInvestor(email, password, device_type);

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
    return handleAuthError(res, error, 'login');
  }
}

/**
 * POST /api/v1/auth/verify-otp
 * Body: email, otp, device_type
 */
export async function verifyOtp(req, res) {
  try {
    const { email, otp, device_type } = req.body;
    const result = await verifyLoginOtp(email, otp, device_type);

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
    return handleAuthError(res, error, 'verifyOtp');
  }
}

/**
 * POST /api/v1/auth/resend-otp
 * Body: email
 */
export async function resendOtp(req, res) {
  try {
    const { email } = req.body;
    const result = await resendLoginOtp(email);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        email: result.email,
        expires_in_minutes: result.expiresInMinutes,
      },
    });
  } catch (error) {
    return handleAuthError(res, error, 'resendOtp');
  }
}

/**
 * POST /api/v1/auth/logout
 * Requires Bearer access token
 */
export async function logout(req, res) {
  try {
    await logoutSession(req.user.sessionId, req.user.userId);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    return handleAuthError(res, error, 'logout');
  }
}

/**
 * POST /api/v1/auth/refresh
 * Body: refreshToken
 */
export async function refreshToken(req, res) {
  try {
    const { refreshToken: token } = req.body;
    const result = await refreshAccessToken(token);

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
    return handleAuthError(res, error, 'refreshToken');
  }
}

/**
 * POST /api/v1/auth/forgot-password
 * Body: email
 */
export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const result = await forgotPasswordService(email);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        email: result.email,
        expires_in_minutes: result.expiresInMinutes,
      },
    });
  } catch (error) {
    return handleAuthError(res, error, 'forgotPassword');
  }
}

/**
 * POST /api/v1/auth/reset-password
 * Body: email, otp, new_password
 */
export async function resetPassword(req, res) {
  try {
    const { email, otp, new_password } = req.body;
    const result = await resetPasswordService(email, otp, new_password);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        email: result.email,
        status: result.status,
      },
    });
  } catch (error) {
    return handleAuthError(res, error, 'resetPassword');
  }
}

/**
 * PATCH /api/v1/auth/change-password
 * Body: current_password, new_password
 */
export async function changePassword(req, res) {
  try {
    const { current_password, new_password } = req.body;
    const result = await changeInvestorPassword(
      req.user.userId,
      current_password,
      new_password
    );

    return res.status(200).json({
      success: true,
      message: result.message,
      data: { password_changed: true },
    });
  } catch (error) {
    return handleAuthError(res, error, 'changePassword');
  }
}

/**
 * GET /api/v1/auth/sessions
 */
export async function listSessions(req, res) {
  try {
    const sessions = await listInvestorSessions(
      req.user.userId,
      req.user.sessionId
    );

    return res.status(200).json({
      success: true,
      message: 'Active sessions retrieved',
      data: { sessions },
    });
  } catch (error) {
    return handleAuthError(res, error, 'listSessions');
  }
}

/**
 * POST /api/v1/investor/profile/request-email-change
 * Body: new_email
 * Requires investor auth
 */
export async function requestEmailChange(req, res) {
  try {
    const { new_email } = req.body;
    const result = await requestEmailChangeService(req.user.userId, new_email);

    return res.status(201).json({
      success: true,
      message: result.message,
      data: {
        request: result.request,
      },
    });
  } catch (error) {
    return handleAuthError(res, error, 'requestEmailChange');
  }
}
