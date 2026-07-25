import { query, pool } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { sendEmail } from '../services/email.service.js';
import { createNotification } from '../services/notification.service.js';
import {
  logAction,
  buildActionDescription,
  AUDIT_ENTITY_TYPES,
} from '../services/audit.service.js';

const WITHDRAWAL_COLUMNS = `
  wr.id,
  wr.transaction_id,
  wr.investor_id,
  wr.amount,
  wr.account_type,
  wr.transfer_mode,
  wr.status,
  wr.admin_id,
  wr.admin_remark,
  wr.payment_date,
  wr.payment_utr,
  wr.auto_cancelled_reason,
  wr.is_deleted,
  wr.created_at,
  wr.updated_at
`;

const REVIEWABLE = Object.freeze(['submitted']);
const APPROVABLE = Object.freeze(['submitted', 'under_review']);
const REJECTABLE = Object.freeze(['submitted', 'under_review', 'approved']);
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class WithdrawalAdminError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} [status]
   */
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'WithdrawalAdminError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

/**
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context
 */
function handleError(res, error, context) {
  if (error instanceof WithdrawalAdminError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      error: error.code,
    });
  }

  logger.error(`[AdminWithdrawal] ${context}: ${error.message}`, { error });
  return res.status(500).json({
    success: false,
    message: 'Withdrawal management request failed',
    error: 'INTERNAL_ERROR',
  });
}

/**
 * @param {import('express').Request} req
 * @param {string} action
 * @param {string | null} entityId
 * @param {object | null} oldValue
 * @param {object | null} newValue
 */
async function audit(req, action, entityId, oldValue, newValue) {
  await logAction(
    req.user.userId,
    action,
    AUDIT_ENTITY_TYPES.WITHDRAWAL,
    entityId,
    oldValue,
    newValue,
    req.ipAddress || null
  );
}

/**
 * @param {string} investorId
 * @returns {Promise<object>}
 */
async function getInvestorOrThrow(investorId) {
  const result = await query(
    `SELECT id, full_name, email, status, is_deleted
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [investorId]
  );
  if (!result.rows[0] || result.rows[0].is_deleted) {
    throw new WithdrawalAdminError('Investor not found', 'USER_NOT_FOUND', 404);
  }
  return result.rows[0];
}

/**
 * @param {object} investor
 * @param {object} data
 */
async function notifyInvestor(investor, data) {
  await createNotification(
    investor.id,
    data.title,
    data.body,
    'transaction',
    data.referenceId || null,
    data.referenceType || 'withdrawal'
  ).catch((error) => {
    logger.warn(`[AdminWithdrawal] notification failed: ${error.message}`);
  });

  await sendEmail(investor.email, data.emailTemplate || 'withdrawal', {
    investorName: investor.full_name,
    ...data.emailData,
  }).catch((error) => {
    logger.warn(`[AdminWithdrawal] email failed: ${error.message}`);
  });
}

/**
 * Lock a withdrawal row for update; returns current row or throws.
 * @param {import('pg').PoolClient} client
 * @param {string} id
 * @returns {Promise<object>}
 */
async function lockWithdrawal(client, id) {
  const result = await client.query(
    `SELECT ${WITHDRAWAL_COLUMNS}
     FROM capital_withdrawal_requests wr
     WHERE wr.id = $1
       AND wr.is_deleted = FALSE
     FOR UPDATE`,
    [id]
  );
  if (!result.rows[0]) {
    throw new WithdrawalAdminError(
      'Withdrawal request not found',
      'USER_NOT_FOUND',
      404
    );
  }
  return result.rows[0];
}

/**
 * GET /api/v1/admin/withdrawals
 * Query: status, account_type, start_date, end_date, page, limit
 */
export async function listWithdrawals(req, res) {
  try {
    const page = toPositiveInt(req.query.page, DEFAULT_PAGE);
    let limit = toPositiveInt(req.query.limit, DEFAULT_LIMIT);
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    const offset = (page - 1) * limit;

    const where = ['wr.is_deleted = FALSE'];
    const params = [];
    let i = 1;

    if (req.query.status) {
      where.push(`wr.status = $${i}`);
      params.push(String(req.query.status).toLowerCase());
      i += 1;
    }
    if (req.query.account_type) {
      where.push(`wr.account_type = $${i}`);
      params.push(String(req.query.account_type).toLowerCase());
      i += 1;
    }
    if (req.query.start_date) {
      where.push(`(wr.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $${i}::date`);
      params.push(String(req.query.start_date));
      i += 1;
    }
    if (req.query.end_date) {
      where.push(`(wr.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $${i}::date`);
      params.push(String(req.query.end_date));
      i += 1;
    }

    const whereSql = where.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM capital_withdrawal_requests wr
       WHERE ${whereSql}`,
      params
    );

    const listResult = await query(
      `SELECT ${WITHDRAWAL_COLUMNS},
              u.full_name AS investor_name,
              u.email AS investor_email
       FROM capital_withdrawal_requests wr
       INNER JOIN users u ON u.id = wr.investor_id
       WHERE ${whereSql}
       ORDER BY wr.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    );

    const total = countResult.rows[0]?.total || 0;

    return res.status(200).json({
      success: true,
      message: 'Withdrawal requests retrieved',
      data: {
        withdrawals: listResult.rows,
        meta: {
          total,
          page,
          limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'listWithdrawals');
  }
}

/**
 * GET /api/v1/admin/withdrawals/pending
 */
export async function listPendingWithdrawals(req, res) {
  try {
    req.query.status = undefined;
    const page = toPositiveInt(req.query.page, DEFAULT_PAGE);
    let limit = toPositiveInt(req.query.limit, DEFAULT_LIMIT);
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    const offset = (page - 1) * limit;

    const where = [
      'wr.is_deleted = FALSE',
      `wr.status IN ('submitted', 'under_review')`,
    ];
    const params = [];
    let i = 1;

    if (req.query.account_type) {
      where.push(`wr.account_type = $${i}`);
      params.push(String(req.query.account_type).toLowerCase());
      i += 1;
    }

    const whereSql = where.join(' AND ');
    const countResult = await query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM capital_withdrawal_requests wr
       WHERE ${whereSql}`,
      params
    );
    const listResult = await query(
      `SELECT ${WITHDRAWAL_COLUMNS},
              u.full_name AS investor_name,
              u.email AS investor_email
       FROM capital_withdrawal_requests wr
       INNER JOIN users u ON u.id = wr.investor_id
       WHERE ${whereSql}
       ORDER BY wr.created_at ASC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    );

    const total = countResult.rows[0]?.total || 0;

    return res.status(200).json({
      success: true,
      message: 'Pending withdrawal requests retrieved',
      data: {
        withdrawals: listResult.rows,
        meta: {
          total,
          page,
          limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'listPendingWithdrawals');
  }
}

/**
 * PATCH /api/v1/admin/withdrawals/:id/review
 */
export async function reviewWithdrawal(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await lockWithdrawal(client, req.params.id);

    if (!REVIEWABLE.includes(before.status) && before.status !== 'submitted') {
      // Allow submitted → under_review; also idempotent if already under_review from submitted
      if (before.status !== 'submitted') {
        throw new WithdrawalAdminError(
          'Only submitted withdrawals can move to under review',
          'VALIDATION_ERROR',
          400
        );
      }
    }

    if (before.status === 'under_review') {
      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: 'Withdrawal already under review',
        data: before,
      });
    }

    if (before.status !== 'submitted') {
      throw new WithdrawalAdminError(
        'Only submitted withdrawals can move to under review',
        'VALIDATION_ERROR',
        400
      );
    }

    const result = await client.query(
      `UPDATE capital_withdrawal_requests
       SET status = 'under_review',
           admin_id = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, transaction_id, investor_id, amount, account_type,
                 transfer_mode, status, admin_id, admin_remark,
                 payment_date, payment_utr, created_at, updated_at`,
      [req.params.id, req.user.userId]
    );
    await client.query('COMMIT');

    const after = result.rows[0];
    const investor = await getInvestorOrThrow(after.investor_id);

    await audit(
      req,
      buildActionDescription('Reviewed', 'withdrawal', after.amount),
      after.id,
      before,
      after
    );

    await notifyInvestor(investor, {
      title: 'Withdrawal under review',
      body: `Your withdrawal ${after.transaction_id} of ${formatCurrency(after.amount)} is under review.`,
      emailTemplate: 'withdrawal',
      emailData: {
        amount: formatCurrency(after.amount),
        transferMode: after.transfer_mode === 'upi' ? 'UPI' : 'Bank Transfer',
        status: 'Under Review',
        transactionId: after.transaction_id,
        withdrawalType:
          after.account_type === 'revenue'
            ? 'Revenue Withdrawal'
            : 'Capital Withdrawal',
      },
      referenceId: after.transaction_id,
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal moved to under review',
      data: after,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleError(res, error, 'reviewWithdrawal');
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/admin/withdrawals/:id/approve
 * Double-processing safe via SELECT FOR UPDATE.
 */
export async function approveWithdrawal(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await lockWithdrawal(client, req.params.id);

    if (!APPROVABLE.includes(before.status)) {
      throw new WithdrawalAdminError(
        'Only submitted or under review withdrawals can be approved',
        'VALIDATION_ERROR',
        400
      );
    }

    const adminRemark = req.body?.admin_remark
      ? String(req.body.admin_remark).trim()
      : null;

    const result = await client.query(
      `UPDATE capital_withdrawal_requests
       SET status = 'approved',
           admin_id = $2,
           admin_remark = COALESCE($3, admin_remark),
           updated_at = NOW()
       WHERE id = $1
         AND status = ANY($4::TEXT[])
       RETURNING id, transaction_id, investor_id, amount, account_type,
                 transfer_mode, status, admin_id, admin_remark,
                 payment_date, payment_utr, created_at, updated_at`,
      [req.params.id, req.user.userId, adminRemark, [...APPROVABLE]]
    );

    if (!result.rows[0]) {
      throw new WithdrawalAdminError(
        'Withdrawal was already processed by another admin',
        'VALIDATION_ERROR',
        409
      );
    }

    await client.query('COMMIT');
    const after = result.rows[0];
    const investor = await getInvestorOrThrow(after.investor_id);

    await audit(
      req,
      buildActionDescription('Approved', 'withdrawal', after.amount),
      after.id,
      before,
      after
    );

    await notifyInvestor(investor, {
      title: 'Withdrawal approved',
      body: `Your withdrawal of ${formatCurrency(after.amount)} (${after.transaction_id}) has been approved.`,
      emailTemplate: 'withdrawal',
      emailData: {
        amount: formatCurrency(after.amount),
        transferMode: after.transfer_mode === 'upi' ? 'UPI' : 'Bank Transfer',
        status: 'Approved',
        transactionId: after.transaction_id,
        withdrawalType:
          after.account_type === 'revenue'
            ? 'Revenue Withdrawal'
            : 'Capital Withdrawal',
      },
      referenceId: after.transaction_id,
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal approved',
      data: after,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleError(res, error, 'approveWithdrawal');
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/admin/withdrawals/:id/process
 */
export async function processWithdrawal(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await lockWithdrawal(client, req.params.id);

    if (before.status !== 'approved') {
      throw new WithdrawalAdminError(
        'Only approved withdrawals can be marked as processed',
        'VALIDATION_ERROR',
        400
      );
    }

    const result = await client.query(
      `UPDATE capital_withdrawal_requests
       SET status = 'processed',
           admin_id = $2,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'approved'
       RETURNING id, transaction_id, investor_id, amount, account_type,
                 transfer_mode, status, admin_id, admin_remark,
                 payment_date, payment_utr, created_at, updated_at`,
      [req.params.id, req.user.userId]
    );

    if (!result.rows[0]) {
      throw new WithdrawalAdminError(
        'Withdrawal was already processed by another admin',
        'VALIDATION_ERROR',
        409
      );
    }

    await client.query('COMMIT');
    const after = result.rows[0];
    const investor = await getInvestorOrThrow(after.investor_id);

    await audit(
      req,
      buildActionDescription('Processed', 'withdrawal', after.amount),
      after.id,
      before,
      after
    );

    await notifyInvestor(investor, {
      title: 'Withdrawal processing',
      body: `Your withdrawal ${after.transaction_id} is being processed. Transfer has been initiated.`,
      emailTemplate: 'withdrawal',
      emailData: {
        amount: formatCurrency(after.amount),
        transferMode: after.transfer_mode === 'upi' ? 'UPI' : 'Bank Transfer',
        status: 'Processed',
        transactionId: after.transaction_id,
        withdrawalType:
          after.account_type === 'revenue'
            ? 'Revenue Withdrawal'
            : 'Capital Withdrawal',
      },
      referenceId: after.transaction_id,
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal marked as processed',
      data: after,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleError(res, error, 'processWithdrawal');
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/admin/withdrawals/:id/complete
 * Body: payment_date?, payment_utr? (both optional)
 */
export async function completeWithdrawal(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await lockWithdrawal(client, req.params.id);

    if (before.status !== 'processed' && before.status !== 'approved') {
      throw new WithdrawalAdminError(
        'Only processed or approved withdrawals can be completed',
        'VALIDATION_ERROR',
        400
      );
    }

    const paymentDate = req.body?.payment_date
      ? String(req.body.payment_date).trim()
      : null;
    const paymentUtr = req.body?.payment_utr
      ? String(req.body.payment_utr).trim().toUpperCase()
      : null;

    const result = await client.query(
      `UPDATE capital_withdrawal_requests
       SET status = 'completed',
           admin_id = $2,
           payment_date = COALESCE($3::DATE, payment_date),
           payment_utr = COALESCE($4, payment_utr),
           updated_at = NOW()
       WHERE id = $1
         AND status = ANY($5::TEXT[])
       RETURNING id, transaction_id, investor_id, amount, account_type,
                 transfer_mode, status, admin_id, admin_remark,
                 payment_date, payment_utr, created_at, updated_at`,
      [
        req.params.id,
        req.user.userId,
        paymentDate,
        paymentUtr,
        ['processed', 'approved'],
      ]
    );

    if (!result.rows[0]) {
      throw new WithdrawalAdminError(
        'Withdrawal was already completed by another admin',
        'VALIDATION_ERROR',
        409
      );
    }

    await client.query('COMMIT');
    const after = result.rows[0];
    const investor = await getInvestorOrThrow(after.investor_id);

    await audit(
      req,
      buildActionDescription('Completed', 'withdrawal', after.amount),
      after.id,
      before,
      after
    );

    await notifyInvestor(investor, {
      title: 'Withdrawal completed',
      body: `Your withdrawal ${after.transaction_id} of ${formatCurrency(after.amount)} has been completed.${after.payment_utr ? ` UTR: ${after.payment_utr}.` : ''}`,
      emailTemplate: 'withdrawal',
      emailData: {
        amount: formatCurrency(after.amount),
        transferMode: after.transfer_mode === 'upi' ? 'UPI' : 'Bank Transfer',
        status: 'Completed',
        transactionId: after.transaction_id,
        withdrawalType:
          after.account_type === 'revenue'
            ? 'Revenue Withdrawal'
            : 'Capital Withdrawal',
        utr: after.payment_utr || undefined,
      },
      referenceId: after.transaction_id,
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal completed',
      data: after,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleError(res, error, 'completeWithdrawal');
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/admin/withdrawals/:id/reject
 * Body: remark (required) — amount restored by status change
 */
export async function rejectWithdrawal(req, res) {
  const client = await pool.connect();
  try {
    const remark = req.body?.remark
      ? String(req.body.remark).trim()
      : req.body?.admin_remark
        ? String(req.body.admin_remark).trim()
        : '';
    if (!remark) {
      throw new WithdrawalAdminError(
        'Rejection remark is required',
        'VALIDATION_ERROR',
        400
      );
    }

    await client.query('BEGIN');
    const before = await lockWithdrawal(client, req.params.id);

    if (!REJECTABLE.includes(before.status)) {
      throw new WithdrawalAdminError(
        'Withdrawal cannot be rejected in its current status',
        'VALIDATION_ERROR',
        400
      );
    }

    const result = await client.query(
      `UPDATE capital_withdrawal_requests
       SET status = 'rejected',
           admin_id = $2,
           admin_remark = $3,
           updated_at = NOW()
       WHERE id = $1
         AND status = ANY($4::TEXT[])
       RETURNING id, transaction_id, investor_id, amount, account_type,
                 transfer_mode, status, admin_id, admin_remark,
                 payment_date, payment_utr, created_at, updated_at`,
      [req.params.id, req.user.userId, remark, [...REJECTABLE]]
    );

    if (!result.rows[0]) {
      throw new WithdrawalAdminError(
        'Withdrawal was already processed by another admin',
        'VALIDATION_ERROR',
        409
      );
    }

    await client.query('COMMIT');
    const after = result.rows[0];
    const investor = await getInvestorOrThrow(after.investor_id);

    await audit(
      req,
      buildActionDescription('Rejected', 'withdrawal', after.amount),
      after.id,
      before,
      after
    );

    await notifyInvestor(investor, {
      title: 'Withdrawal rejected',
      body: `Your withdrawal ${after.transaction_id} of ${formatCurrency(after.amount)} was rejected. Amount has been restored. Reason: ${remark}`,
      emailTemplate: 'rejection',
      emailData: {
        actionLabel: 'Withdrawal',
        reason: remark,
        amount: formatCurrency(after.amount),
        transactionId: after.transaction_id,
      },
      referenceId: after.transaction_id,
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal rejected. Amount restored to balance.',
      data: after,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleError(res, error, 'rejectWithdrawal');
  } finally {
    client.release();
  }
}

/**
 * POST /api/v1/admin/withdrawals/bulk-approve
 * Body: { ids: string[] }
 */
export async function bulkApproveWithdrawals(req, res) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) {
      throw new WithdrawalAdminError(
        'ids array is required',
        'VALIDATION_ERROR',
        400
      );
    }

    const approved = [];
    const failed = [];

    for (const id of ids) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const before = await lockWithdrawal(client, String(id));

        if (!APPROVABLE.includes(before.status)) {
          throw new WithdrawalAdminError(
            'Only submitted or under review withdrawals can be approved',
            'VALIDATION_ERROR',
            400
          );
        }

        const result = await client.query(
          `UPDATE capital_withdrawal_requests
           SET status = 'approved',
               admin_id = $2,
               updated_at = NOW()
           WHERE id = $1
             AND status = ANY($3::TEXT[])
           RETURNING id, transaction_id, investor_id, amount, account_type,
                     transfer_mode, status, admin_id, created_at, updated_at`,
          [id, req.user.userId, [...APPROVABLE]]
        );

        if (!result.rows[0]) {
          throw new WithdrawalAdminError(
            'Already processed',
            'VALIDATION_ERROR',
            409
          );
        }

        await client.query('COMMIT');
        const after = result.rows[0];

        await audit(
          req,
          buildActionDescription('Approved', 'withdrawal', after.amount),
          after.id,
          before,
          after
        );

        const investor = await getInvestorOrThrow(after.investor_id);
        await notifyInvestor(investor, {
          title: 'Withdrawal approved',
          body: `Your withdrawal of ${formatCurrency(after.amount)} (${after.transaction_id}) has been approved.`,
          emailTemplate: 'withdrawal',
          emailData: {
            amount: formatCurrency(after.amount),
            transferMode:
              after.transfer_mode === 'upi' ? 'UPI' : 'Bank Transfer',
            status: 'Approved',
            transactionId: after.transaction_id,
            withdrawalType:
              after.account_type === 'revenue'
                ? 'Revenue Withdrawal'
                : 'Capital Withdrawal',
          },
          referenceId: after.transaction_id,
        });

        approved.push(after);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        failed.push({
          id,
          message: error.message,
          error: error.code || 'INTERNAL_ERROR',
        });
      } finally {
        client.release();
      }
    }

    return res.status(200).json({
      success: true,
      message: `Bulk approve completed: ${approved.length} approved, ${failed.length} failed`,
      data: { approved, failed },
    });
  } catch (error) {
    return handleError(res, error, 'bulkApproveWithdrawals');
  }
}
