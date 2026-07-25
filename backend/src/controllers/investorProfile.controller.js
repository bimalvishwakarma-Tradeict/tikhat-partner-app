import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import {
  generateTransactionId,
  TRANSACTION_TYPES,
} from '../services/transaction.service.js';
import { createNotification } from '../services/notification.service.js';
import { sendEmail } from '../services/email.service.js';
import {
  uploadFile,
  FILE_CATEGORIES,
} from '../services/storage.service.js';
import {
  assertInvestorCanEditProfileField,
} from './userManagement.controller.js';
import { requestEmailChange as requestEmailChangeService } from '../services/auth.service.js';
import { AuthError } from '../services/auth.service.js';
import {
  normalizeMobile,
  getActiveAdmins,
} from '../models/user.model.js';
import {
  isValidFullName,
  isValidIndianMobile,
  isValidPAN,
  isValidAadhar,
} from '../utils/validators.js';
import { formatDate } from '../utils/formatDate.js';
import {
  toInvestorSafeProfile,
  toInvestorSafeUpdateRequest,
} from '../utils/maskSensitive.js';

const PROFILE_SUCCESS_MESSAGE =
  'Your details will be updated within 24-48 hours after admin approval. Thank you for your request.';

const UPDATABLE_FIELDS = Object.freeze([
  'full_name',
  'date_of_birth',
  'address',
  'pan_number',
  'aadhar_number',
  'bank_account_number',
  'bank_ifsc',
  'bank_account_name',
  'bank_name',
  'upi_id',
]);

const PROFILE_COLUMNS = `
  id,
  full_name,
  email,
  mobile,
  profile_photo_url,
  date_of_birth,
  address,
  pan_number,
  pan_front_url,
  pan_back_url,
  aadhar_number,
  aadhar_front_url,
  aadhar_back_url,
  bank_account_number,
  bank_ifsc,
  bank_account_name,
  bank_name,
  upi_id,
  status,
  kyc_status,
  joining_date,
  banner_dismissed,
  is_deleted,
  created_at,
  updated_at
`;

/**
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context
 */
function handleError(res, error, context) {
  if (error instanceof AuthError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      error: error.code,
    });
  }

  if (error?.code === 'VALIDATION_ERROR' || error?.status === 400) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Validation failed',
      error: 'VALIDATION_ERROR',
    });
  }

  if (error?.code === 'KYC_FIELD_LOCKED') {
    return res.status(403).json({
      success: false,
      message: error.message,
      error: 'KYC_FIELD_LOCKED',
    });
  }

  logger.error(`[InvestorProfile] ${context}: ${error.message}`, { error });
  return res.status(500).json({
    success: false,
    message: 'Profile request failed',
    error: 'INTERNAL_ERROR',
  });
}

/**
 * @param {string} investorId
 * @returns {Promise<object>}
 */
async function getInvestorOrThrow(investorId) {
  const result = await query(
    `SELECT ${PROFILE_COLUMNS}
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [investorId]
  );

  const user = result.rows[0];
  if (!user || user.is_deleted) {
    const err = new Error('Investor not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }

  return user;
}

/**
 * @param {string} investorId
 * @param {string} fieldName
 * @param {string | null} oldValue
 * @param {string} newValue
 * @returns {Promise<object>}
 */
async function createProfileUpdateRequest(
  investorId,
  fieldName,
  oldValue,
  newValue
) {
  const pending = await query(
    `SELECT id
     FROM profile_update_requests
     WHERE investor_id = $1
       AND field_name = $2
       AND status = 'pending'
     LIMIT 1`,
    [investorId, fieldName]
  );

  if (pending.rowCount > 0) {
    const err = new Error(
      `A pending update request already exists for ${fieldName}`
    );
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  const requestId = await generateTransactionId(TRANSACTION_TYPES.PRF);

  const insert = await query(
    `INSERT INTO profile_update_requests (
       id,
       investor_id,
       field_name,
       old_value,
       new_value,
       status
     ) VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id, investor_id, field_name, old_value, new_value, status, created_at`,
    [
      requestId,
      investorId,
      fieldName,
      oldValue == null ? null : String(oldValue),
      String(newValue),
    ]
  );

  return insert.rows[0];
}

/**
 * GET /api/v1/investor/profile
 */
export async function getMyProfile(req, res) {
  try {
    const user = await getInvestorOrThrow(req.user.userId);

    const [pendingCount, kycLocks] = await Promise.all([
      query(
        `SELECT COUNT(*)::INTEGER AS c
         FROM profile_update_requests
         WHERE investor_id = $1 AND status = 'pending'`,
        [user.id]
      ),
      query(
        `SELECT field_name, status
         FROM kyc_field_approvals
         WHERE investor_id = $1
           AND field_name IN ('pan_number', 'aadhar_number')`,
        [user.id]
      ),
    ]);

    const locked = {};
    for (const row of kycLocks.rows) {
      locked[row.field_name] = row.status === 'approved';
    }

    return res.status(200).json({
      success: true,
      message: 'Profile retrieved',
      data: {
        profile: toInvestorSafeProfile({
          ...user,
          joining_date_formatted: user.joining_date
            ? formatDate(user.joining_date)
            : null,
          pan_locked: locked.pan_number === true,
          aadhar_locked: locked.aadhar_number === true,
        }),
        pending_update_count: pendingCount.rows[0]?.c || 0,
      },
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message,
        error: 'NOT_FOUND',
      });
    }
    return handleError(res, error, 'getMyProfile');
  }
}

/**
 * PATCH /api/v1/investor/profile
 * Body: one or more updatable fields
 */
export async function submitProfileUpdates(req, res) {
  try {
    const user = await getInvestorOrThrow(req.user.userId);
    if (user.status === 'self_deactivated') {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated',
        error: 'AUTH_FORBIDDEN',
      });
    }

    const body = req.body || {};
    const created = [];

    for (const field of UPDATABLE_FIELDS) {
      if (body[field] === undefined) {
        continue;
      }

      let newValue = body[field];
      if (newValue == null || String(newValue).trim() === '') {
        continue;
      }

      newValue = String(newValue).trim();
      const oldValue =
        user[field] == null ? null : String(user[field]);

      if (oldValue === newValue) {
        continue;
      }

      await assertInvestorCanEditProfileField(user.id, field);

      if (field === 'full_name' && !isValidFullName(newValue)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid full_name',
          error: 'VALIDATION_ERROR',
        });
      }
      if (field === 'pan_number') {
        if (!isValidPAN(newValue)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid PAN format',
            error: 'VALIDATION_ERROR',
          });
        }
        newValue = newValue.toUpperCase();
        const dup = await query(
          `SELECT id FROM users WHERE pan_number = $1 AND id <> $2 LIMIT 1`,
          [newValue, user.id]
        );
        if (dup.rowCount > 0) {
          return res.status(409).json({
            success: false,
            message: 'PAN is already registered',
            error: 'CONFLICT',
          });
        }
      }
      if (field === 'aadhar_number') {
        if (!isValidAadhar(newValue)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid Aadhar number',
            error: 'VALIDATION_ERROR',
          });
        }
        newValue = newValue.replace(/\s/g, '');
        const dup = await query(
          `SELECT id FROM users WHERE aadhar_number = $1 AND id <> $2 LIMIT 1`,
          [newValue, user.id]
        );
        if (dup.rowCount > 0) {
          return res.status(409).json({
            success: false,
            message: 'Aadhar is already registered',
            error: 'CONFLICT',
          });
        }
      }
      if (field === 'date_of_birth') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newValue)) {
          return res.status(400).json({
            success: false,
            message: 'date_of_birth must be YYYY-MM-DD',
            error: 'VALIDATION_ERROR',
          });
        }
      }
      if (field === 'bank_ifsc') {
        newValue = newValue.toUpperCase();
      }

      const request = await createProfileUpdateRequest(
        user.id,
        field,
        oldValue,
        newValue
      );
      created.push(request);
    }

    if (created.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No profile field changes provided',
        error: 'VALIDATION_ERROR',
      });
    }

    await createNotification(
      user.id,
      'Profile update submitted',
      `Your profile update request (${created.length} field(s)) is pending admin approval.`,
      'request',
      created[0].id,
      'profile_update'
    );

    const admins = await getActiveAdmins();
    await Promise.allSettled(
      admins.map((admin) =>
        sendEmail(admin.email, 'custom-notification', {
          investorName: admin.full_name,
          subjectTitle: 'Profile update pending',
          body: `Tikhat Partner ${user.full_name} submitted ${created.length} profile field update(s).\n\nPlease review in User Management.`,
          referenceId: created[0].id,
          recipientType: 'admin',
        })
      )
    );

    return res.status(200).json({
      success: true,
      message: PROFILE_SUCCESS_MESSAGE,
      data: {
        requests: created,
        count: created.length,
      },
    });
  } catch (error) {
    return handleError(res, error, 'submitProfileUpdates');
  }
}

/**
 * POST /api/v1/investor/profile/photo
 * multipart field: photo
 */
export async function uploadProfilePhoto(req, res) {
  try {
    const user = await getInvestorOrThrow(req.user.userId);
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'photo file is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const record = await uploadFile(file, FILE_CATEGORIES.PROFILE_PHOTO, {
      ownerId: user.id,
      ownerType: 'investor',
    });

    await query(
      `UPDATE users
       SET profile_photo_url = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [record.id, user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Profile photo updated',
      data: {
        file_id: record.id,
        profile_photo_url: record.id,
        file_name: record.original_name || null,
        file_type: record.mime_type || null,
      },
    });
  } catch (error) {
    return handleError(res, error, 'uploadProfilePhoto');
  }
}

/**
 * POST /api/v1/investor/profile/documents
 * multipart fields: pan_front, pan_back, aadhar_front, aadhar_back
 */
export async function uploadKycDocuments(req, res) {
  try {
    const user = await getInvestorOrThrow(req.user.userId);
    const files = req.files || {};

    const mapping = [
      {
        field: 'pan_front',
        category: FILE_CATEGORIES.KYC_PAN_FRONT,
        column: 'pan_front_url',
      },
      {
        field: 'pan_back',
        category: FILE_CATEGORIES.KYC_PAN_BACK,
        column: 'pan_back_url',
      },
      {
        field: 'aadhar_front',
        category: FILE_CATEGORIES.KYC_AADHAR_FRONT,
        column: 'aadhar_front_url',
      },
      {
        field: 'aadhar_back',
        category: FILE_CATEGORIES.KYC_AADHAR_BACK,
        column: 'aadhar_back_url',
      },
    ];

    const uploaded = [];
    const sets = [];
    const params = [];
    let i = 1;

    for (const item of mapping) {
      const list = files[item.field];
      const file = Array.isArray(list) ? list[0] : null;
      if (!file) {
        continue;
      }

      if (item.column.startsWith('pan_')) {
        await assertInvestorCanEditProfileField(user.id, 'pan_number');
      }
      if (item.column.startsWith('aadhar_')) {
        await assertInvestorCanEditProfileField(user.id, 'aadhar_number');
      }

      const record = await uploadFile(file, item.category, {
        ownerId: user.id,
        ownerType: 'investor',
      });

      sets.push(`${item.column} = $${i}`);
      params.push(record.id);
      i += 1;
      uploaded.push({
        field: item.field,
        file_id: record.id,
        file_name: record.original_name || null,
        file_type: record.mime_type || null,
      });
    }

    if (uploaded.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'At least one KYC document is required (pan_front, pan_back, aadhar_front, aadhar_back)',
        error: 'VALIDATION_ERROR',
      });
    }

    sets.push('updated_at = NOW()');
    params.push(user.id);

    await query(
      `UPDATE users
       SET ${sets.join(', ')}
       WHERE id = $${i}`,
      params
    );

    return res.status(200).json({
      success: true,
      message: 'KYC documents uploaded',
      data: { documents: uploaded },
    });
  } catch (error) {
    return handleError(res, error, 'uploadKycDocuments');
  }
}

/**
 * POST /api/v1/investor/profile/request-email-change
 */
export async function requestEmailChange(req, res) {
  try {
    const { new_email } = req.body || {};
    const result = await requestEmailChangeService(
      req.user.userId,
      new_email
    );

    return res.status(200).json({
      success: true,
      message: result.message || PROFILE_SUCCESS_MESSAGE,
      data: { request: result.request },
    });
  } catch (error) {
    return handleError(res, error, 'requestEmailChange');
  }
}

/**
 * POST /api/v1/investor/profile/request-mobile-change
 */
export async function requestMobileChange(req, res) {
  try {
    const user = await getInvestorOrThrow(req.user.userId);
    const { new_mobile } = req.body || {};

    if (!isValidIndianMobile(new_mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Valid Indian mobile number is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const normalized = normalizeMobile(new_mobile);
    if (normalized === normalizeMobile(user.mobile || '')) {
      return res.status(400).json({
        success: false,
        message: 'New mobile must be different from current mobile',
        error: 'VALIDATION_ERROR',
      });
    }

    const request = await createProfileUpdateRequest(
      user.id,
      'mobile',
      user.mobile,
      normalized
    );

    await createNotification(
      user.id,
      'Mobile change request submitted',
      `Your request to change mobile to ${normalized} is pending admin approval (${request.id}).`,
      'request',
      request.id,
      'profile_update'
    );

    const admins = await getActiveAdmins();
    await Promise.allSettled(
      admins.map((admin) =>
        sendEmail(admin.email, 'custom-notification', {
          investorName: admin.full_name,
          subjectTitle: 'Mobile change request pending',
          body: `Tikhat Partner ${user.full_name} requested a mobile change.\n\nRequest ID: ${request.id}\nCurrent: ${user.mobile}\nNew: ${normalized}`,
          referenceId: request.id,
          recipientType: 'admin',
        })
      )
    );

    return res.status(200).json({
      success: true,
      message: PROFILE_SUCCESS_MESSAGE,
      data: { request },
    });
  } catch (error) {
    return handleError(res, error, 'requestMobileChange');
  }
}

/**
 * PATCH /api/v1/investor/profile/dismiss-banner
 */
export async function dismissBanner(req, res) {
  try {
    const result = await query(
      `UPDATE users
       SET banner_dismissed = TRUE,
           updated_at = NOW()
       WHERE id = $1
         AND is_deleted = FALSE
       RETURNING id, banner_dismissed`,
      [req.user.userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found',
        error: 'NOT_FOUND',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile completion banner dismissed',
      data: { banner_dismissed: true },
    });
  } catch (error) {
    return handleError(res, error, 'dismissBanner');
  }
}

/**
 * POST /api/v1/investor/profile/deactivate
 * Body: { confirm: true }
 */
export async function selfDeactivate(req, res) {
  try {
    const confirm = req.body?.confirm;
    if (confirm !== true && confirm !== 'true' && confirm !== 'yes') {
      return res.status(400).json({
        success: false,
        message: 'confirm must be true to deactivate your account',
        error: 'VALIDATION_ERROR',
      });
    }

    const user = await getInvestorOrThrow(req.user.userId);
    if (user.status === 'self_deactivated') {
      return res.status(400).json({
        success: false,
        message: 'Account is already deactivated',
        error: 'VALIDATION_ERROR',
      });
    }

    await query(
      `UPDATE users
       SET status = 'self_deactivated',
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    await query(
      `DELETE FROM sessions
       WHERE user_id = $1
         AND user_type = 'investor'`,
      [user.id]
    );

    await sendEmail(user.email, 'custom-notification', {
      investorName: user.full_name,
      subjectTitle: 'Account deactivated',
      body: 'Your Tikhat Partner account has been self-deactivated. Contact support if this was a mistake.',
      referenceId: user.id,
      recipientType: 'investor',
    });

    logger.info('Investor self-deactivated', { investorId: user.id });

    return res.status(200).json({
      success: true,
      message: 'Account deactivated successfully',
      data: {
        status: 'self_deactivated',
      },
    });
  } catch (error) {
    return handleError(res, error, 'selfDeactivate');
  }
}

/**
 * GET /api/v1/investor/profile/update-requests
 */
export async function listMyUpdateRequests(req, res) {
  try {
    const result = await query(
      `SELECT
         id,
         field_name,
         old_value,
         new_value,
         status,
         rejection_reason,
         created_at,
         updated_at
       FROM profile_update_requests
       WHERE investor_id = $1
       ORDER BY
         CASE status WHEN 'pending' THEN 0 ELSE 1 END,
         created_at DESC`,
      [req.user.userId]
    );

    const requests = result.rows.map(toInvestorSafeUpdateRequest);
    const pending = requests.filter((r) => r.status === 'pending');

    return res.status(200).json({
      success: true,
      message: 'Profile update requests retrieved',
      data: {
        requests,
        pending,
        pending_count: pending.length,
      },
    });
  } catch (error) {
    return handleError(res, error, 'listMyUpdateRequests');
  }
}
