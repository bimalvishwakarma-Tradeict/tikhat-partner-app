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
import {
  generateTransactionId,
  TRANSACTION_TYPES,
} from '../services/transaction.service.js';
import {
  CapitalError,
  normalizeAmount,
  getCapitalBalance,
  getRevenueBalance,
} from '../models/capital.model.js';

const DEPOSIT_PENDING = Object.freeze(['submitted', 'under_review']);
const WITHDRAW_APPROVABLE = Object.freeze(['submitted', 'under_review']);
const LOCK_AUTO_CANCEL_STATUSES = Object.freeze(['submitted', 'under_review']);

const DEPOSIT_COLUMNS = `
  id, transaction_id, investor_id, type, amount, original_requested_amount,
  status, utr_number, payment_screenshot_url, transfer_date, remark,
  admin_id, admin_remark, is_deleted, transfer_mode, payment_date, payment_utr,
  created_at, updated_at
`;

const WITHDRAWAL_COLUMNS = `
  id, transaction_id, investor_id, amount, account_type, transfer_mode,
  status, admin_id, admin_remark, payment_date, payment_utr,
  auto_cancelled_reason, is_deleted, created_at, updated_at
`;

let undoSchemaReady = false;

/**
 * Undo stack for reversible capital admin actions.
 */
async function ensureUndoSchema() {
  if (undoSchemaReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS capital_undo_stack (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      investor_id UUID NOT NULL,
      admin_id UUID NOT NULL,
      action_type VARCHAR(50) NOT NULL,
      entity_type VARCHAR(30) NOT NULL,
      entity_id UUID,
      snapshot JSONB NOT NULL,
      is_undone BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_capital_undo_stack_investor
    ON capital_undo_stack (investor_id, created_at DESC)
  `);

  undoSchemaReady = true;
}

/**
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} context
 */
function handleError(res, error, context) {
  if (error instanceof CapitalError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      error: error.code,
    });
  }

  logger.error(`[AdminCapital] ${context}: ${error.message}`, { error });
  return res.status(500).json({
    success: false,
    message: 'Capital management request failed',
    error: 'INTERNAL_ERROR',
  });
}

/**
 * @param {string} investorId
 * @returns {Promise<object>}
 */
async function getInvestorOrThrow(investorId) {
  const result = await query(
    `SELECT id, full_name, email, mobile, status, kyc_status, is_deleted, created_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [investorId]
  );

  if (!result.rows[0] || result.rows[0].is_deleted) {
    throw new CapitalError('Investor not found', 'USER_NOT_FOUND', 404);
  }

  return result.rows[0];
}

/**
 * @param {object} params
 */
async function pushUndo({
  investorId,
  adminId,
  actionType,
  entityType,
  entityId,
  snapshot,
}) {
  await ensureUndoSchema();
  await query(
    `INSERT INTO capital_undo_stack (
       investor_id, admin_id, action_type, entity_type, entity_id, snapshot
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      investorId,
      adminId,
      actionType,
      entityType,
      entityId || null,
      JSON.stringify(snapshot),
    ]
  );
}

/**
 * @param {object} investor
 * @param {object} data
 */
async function notifyInvestorCapital(investor, data) {
  const {
    title,
    body,
    emailTemplate = 'capital-transaction',
    emailData = {},
    referenceId,
    referenceType = 'capital',
  } = data;

  try {
    await createNotification(
      investor.id,
      title,
      body,
      'transaction',
      referenceId || null,
      referenceType
    );
  } catch (error) {
    logger.warn(`[AdminCapital] Notification failed: ${error.message}`);
  }

  try {
    await sendEmail(investor.email, emailTemplate, {
      investorName: investor.full_name,
      recipientType: 'investor',
      referenceId: referenceId || investor.id,
      ...emailData,
    });
  } catch (error) {
    logger.warn(`[AdminCapital] Email failed: ${error.message}`);
  }
}

/**
 * @param {import('express').Request} req
 * @param {string} action
 * @param {string} entityId
 * @param {object | null} oldValue
 * @param {object | null} newValue
 */
async function audit(req, action, entityId, oldValue, newValue) {
  await logAction(
    req.user.userId,
    action,
    AUDIT_ENTITY_TYPES.CAPITAL,
    entityId,
    oldValue,
    newValue,
    req.ipAddress || null
  );
}

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toWholeInt(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return n;
}

const CAPITAL_AUM_STATUSES = Object.freeze(['approved', 'completed']);
const CAPITAL_WDR_DONE = Object.freeze(['approved', 'processed', 'completed']);

/**
 * GET /api/v1/admin/capital/dashboard
 */
export async function getCapitalDashboard(req, res) {
  try {
    const [aumResult, pendingDep, pendingWdr, recentTx, recentWdr] =
      await Promise.all([
        query(
          `SELECT COALESCE(SUM(
             CASE
               WHEN type IN ('deposit', 'admin_credit') THEN amount
               WHEN type = 'admin_debit' THEN -amount
               WHEN type = 'withdrawal' THEN -amount
               ELSE 0
             END
           ), 0)::INTEGER AS net
           FROM capital_transactions
           WHERE is_deleted = FALSE
             AND status = ANY($1::TEXT[])`,
          [[...CAPITAL_AUM_STATUSES]]
        ),
        query(
          `SELECT
             COUNT(*)::INTEGER AS count,
             COALESCE(SUM(amount), 0)::INTEGER AS amount
           FROM capital_transactions
           WHERE is_deleted = FALSE
             AND type = 'deposit'
             AND status = ANY($1::TEXT[])`,
          [[...DEPOSIT_PENDING]]
        ),
        query(
          `SELECT
             COUNT(*)::INTEGER AS count,
             COALESCE(SUM(amount), 0)::INTEGER AS amount
           FROM capital_withdrawal_requests
           WHERE is_deleted = FALSE
             AND status = ANY($1::TEXT[])`,
          [[...WITHDRAW_APPROVABLE]]
        ),
        query(
          `SELECT
             ct.id,
             ct.transaction_id,
             ct.investor_id,
             u.full_name AS investor_name,
             ct.type,
             ct.amount,
             ct.status,
             ct.created_at,
             'capital_transaction' AS activity_source
           FROM capital_transactions ct
           INNER JOIN users u ON u.id = ct.investor_id
           WHERE ct.is_deleted = FALSE
           ORDER BY ct.created_at DESC
           LIMIT 10`
        ),
        query(
          `SELECT
             wr.id,
             wr.transaction_id,
             wr.investor_id,
             u.full_name AS investor_name,
             'withdrawal' AS type,
             wr.amount,
             wr.status,
             wr.created_at,
             'withdrawal_request' AS activity_source,
             wr.account_type
           FROM capital_withdrawal_requests wr
           INNER JOIN users u ON u.id = wr.investor_id
           WHERE wr.is_deleted = FALSE
           ORDER BY wr.created_at DESC
           LIMIT 10`
        ),
      ]);

    const wdrDeducted = await query(
      `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
       FROM capital_withdrawal_requests
       WHERE account_type = 'capital'
         AND is_deleted = FALSE
         AND status = ANY($1::TEXT[])`,
      [[...CAPITAL_WDR_DONE]]
    );

    const totalCapital = Math.max(
      0,
      toWholeInt(aumResult.rows[0]?.net) -
        toWholeInt(wdrDeducted.rows[0]?.deducted)
    );

    const pendingDeposits = {
      count: toWholeInt(pendingDep.rows[0]?.count),
      amount: toWholeInt(pendingDep.rows[0]?.amount),
      amount_formatted: formatCurrency(toWholeInt(pendingDep.rows[0]?.amount)),
    };

    const pendingWithdrawals = {
      count: toWholeInt(pendingWdr.rows[0]?.count),
      amount: toWholeInt(pendingWdr.rows[0]?.amount),
      amount_formatted: formatCurrency(toWholeInt(pendingWdr.rows[0]?.amount)),
    };

    const recent = [...recentTx.rows, ...recentWdr.rows]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 10)
      .map((row) => ({
        ...row,
        amount_formatted: formatCurrency(toWholeInt(row.amount)),
      }));

    return res.status(200).json({
      success: true,
      message: 'Capital management dashboard retrieved',
      data: {
        total_capital_under_management: totalCapital,
        total_capital_under_management_formatted: formatCurrency(totalCapital),
        pending_deposits: pendingDeposits,
        pending_withdrawals: pendingWithdrawals,
        recent_activity: recent,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getCapitalDashboard');
  }
}

/**
 * GET /api/v1/admin/capital/investors
 * Query: search, page, limit, sort=capital_desc|capital_asc|name|created_at
 */
export async function listInvestors(req, res) {
  try {
    const page = toPositiveInt(req.query.page, 1);
    let limit = toPositiveInt(req.query.limit, 20);
    if (limit > 100) limit = 100;
    const offset = (page - 1) * limit;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const sort = String(req.query.sort || 'created_at').toLowerCase();

    const params = [];
    let where = `u.is_deleted = FALSE AND u.status NOT IN ('deleted')`;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    const countResult = await query(
      `SELECT COUNT(*)::INTEGER AS total FROM users u WHERE ${where}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    let orderSql = 'u.created_at DESC';
    if (sort === 'name' || sort === 'name_asc') {
      orderSql = 'u.full_name ASC';
    } else if (sort === 'name_desc') {
      orderSql = 'u.full_name DESC';
    } else if (sort === 'capital_desc' || sort === 'capital_asc') {
      orderSql =
        sort === 'capital_desc'
          ? 'capital_balance DESC NULLS LAST, u.full_name ASC'
          : 'capital_balance ASC NULLS LAST, u.full_name ASC';
    }

    const listParams = [...params, limit, offset];
    const limitIdx = listParams.length - 1;
    const offsetIdx = listParams.length;

    const listResult = await query(
      `WITH capital AS (
         SELECT
           investor_id,
           COALESCE(SUM(
             CASE
               WHEN type IN ('deposit', 'admin_credit') THEN amount
               WHEN type = 'admin_debit' THEN -amount
               WHEN type = 'withdrawal' THEN -amount
               ELSE 0
             END
           ), 0)::INTEGER AS tx_net
         FROM capital_transactions
         WHERE is_deleted = FALSE
           AND status = ANY($${offsetIdx + 1}::TEXT[])
         GROUP BY investor_id
       ),
       wdr AS (
         SELECT
           investor_id,
           COALESCE(SUM(amount), 0)::INTEGER AS deducted
         FROM capital_withdrawal_requests
         WHERE account_type = 'capital'
           AND is_deleted = FALSE
           AND status = ANY($${offsetIdx + 2}::TEXT[])
         GROUP BY investor_id
       )
       SELECT
         u.id,
         u.full_name,
         u.email,
         u.mobile,
         u.status,
         u.kyc_status,
         u.created_at,
         COALESCE(cls.is_locked, FALSE) AS is_locked,
         GREATEST(COALESCE(c.tx_net, 0) - COALESCE(w.deducted, 0), 0)::INTEGER
           AS capital_balance
       FROM users u
       LEFT JOIN capital_lock_status cls ON cls.investor_id = u.id
       LEFT JOIN capital c ON c.investor_id = u.id
       LEFT JOIN wdr w ON w.investor_id = u.id
       WHERE ${where}
       ORDER BY ${orderSql}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...listParams, [...CAPITAL_AUM_STATUSES], [...CAPITAL_WDR_DONE]]
    );

    const investors = [];
    for (const row of listResult.rows) {
      const capital = await getCapitalBalance(row.id);
      const revenueBalance = await getRevenueBalance(row.id);
      investors.push({
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        mobile: row.mobile,
        status: row.status,
        kyc_status: row.kyc_status,
        created_at: row.created_at,
        is_locked: row.is_locked,
        capitalBalance: capital.capitalBalance,
        capitalBalanceFormatted: formatCurrency(capital.capitalBalance),
        revenueBalance,
        revenueBalanceFormatted: formatCurrency(revenueBalance),
        pendingWithdrawalAmount: capital.pendingWithdrawalAmount,
        statusLabel: capital.statusLabel,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Investors capital summary retrieved',
      data: {
        investors,
        meta: {
          total,
          page,
          limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
          sort,
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'listInvestors');
  }
}

/**
 * GET /api/v1/admin/capital/investor/:id
 */
export async function getInvestorCapital(req, res) {
  try {
    const investor = await getInvestorOrThrow(req.params.id);
    const capital = await getCapitalBalance(investor.id);
    const revenueBalance = await getRevenueBalance(investor.id);

    const deposits = await query(
      `SELECT ${DEPOSIT_COLUMNS}
       FROM capital_transactions
       WHERE investor_id = $1 AND is_deleted = FALSE
       ORDER BY created_at DESC
       LIMIT 100`,
      [investor.id]
    );

    const withdrawals = await query(
      `SELECT ${WITHDRAWAL_COLUMNS}
       FROM capital_withdrawal_requests
       WHERE investor_id = $1 AND is_deleted = FALSE
       ORDER BY created_at DESC
       LIMIT 100`,
      [investor.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Investor capital details retrieved',
      data: {
        investor: {
          id: investor.id,
          full_name: investor.full_name,
          email: investor.email,
          mobile: investor.mobile,
          status: investor.status,
          kyc_status: investor.kyc_status,
        },
        capitalBalance: capital.capitalBalance,
        capitalBalanceFormatted: formatCurrency(capital.capitalBalance),
        revenueBalance,
        revenueBalanceFormatted: formatCurrency(revenueBalance),
        pendingWithdrawalAmount: capital.pendingWithdrawalAmount,
        isLocked: capital.isLocked,
        statusLabel: capital.statusLabel,
        transactions: deposits.rows,
        withdrawals: withdrawals.rows,
      },
    });
  } catch (error) {
    return handleError(res, error, 'getInvestorCapital');
  }
}

/**
 * GET /api/v1/admin/capital/investor/:id/full
 * Complete capital history (no row cap).
 */
export async function getInvestorCapitalFull(req, res) {
  try {
    const investor = await getInvestorOrThrow(req.params.id);
    const capital = await getCapitalBalance(investor.id);
    const revenueBalance = await getRevenueBalance(investor.id);

    const [transactions, withdrawals] = await Promise.all([
      query(
        `SELECT ${DEPOSIT_COLUMNS}
         FROM capital_transactions
         WHERE investor_id = $1 AND is_deleted = FALSE
         ORDER BY created_at DESC`,
        [investor.id]
      ),
      query(
        `SELECT ${WITHDRAWAL_COLUMNS}
         FROM capital_withdrawal_requests
         WHERE investor_id = $1 AND is_deleted = FALSE
         ORDER BY created_at DESC`,
        [investor.id]
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Complete investor capital history retrieved',
      data: {
        investor: {
          id: investor.id,
          full_name: investor.full_name,
          email: investor.email,
          mobile: investor.mobile,
          status: investor.status,
          kyc_status: investor.kyc_status,
        },
        capitalBalance: capital.capitalBalance,
        capitalBalanceFormatted: formatCurrency(capital.capitalBalance),
        revenueBalance,
        revenueBalanceFormatted: formatCurrency(revenueBalance),
        pendingWithdrawalAmount: capital.pendingWithdrawalAmount,
        isLocked: capital.isLocked,
        statusLabel: capital.statusLabel,
        transactions: transactions.rows,
        withdrawals: withdrawals.rows,
        meta: {
          transaction_count: transactions.rows.length,
          withdrawal_count: withdrawals.rows.length,
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'getInvestorCapitalFull');
  }
}

/**
 * GET /api/v1/admin/capital/requests
 * Query: type=deposit|withdrawal, status, page, limit
 */
export async function listRequests(req, res) {
  try {
    const page = toPositiveInt(req.query.page, 1);
    let limit = toPositiveInt(req.query.limit, 20);
    if (limit > 100) limit = 100;
    const offset = (page - 1) * limit;
    const type = req.query.type ? String(req.query.type).toLowerCase() : null;
    const status = req.query.status ? String(req.query.status).toLowerCase() : null;

    const includeDeposits = !type || type === 'deposit';
    const includeWithdrawals = !type || type === 'withdrawal';

    const requests = [];

    if (includeDeposits) {
      const params = [];
      let where = `ct.type = 'deposit' AND ct.is_deleted = FALSE`;
      if (status) {
        params.push(status);
        where += ` AND ct.status = $${params.length}`;
      } else {
        where += ` AND ct.status IN ('submitted', 'under_review')`;
      }

      const result = await query(
        `SELECT
           ct.id,
           ct.transaction_id,
           ct.investor_id,
           u.full_name AS investor_name,
           u.email AS investor_email,
           'deposit' AS request_type,
           ct.amount,
           ct.original_requested_amount,
           ct.status,
           ct.utr_number,
           ct.transfer_date,
           ct.remark,
           ct.created_at
         FROM capital_transactions ct
         JOIN users u ON u.id = ct.investor_id
         WHERE ${where}
         ORDER BY ct.created_at ASC`,
        params
      );
      requests.push(...result.rows);
    }

    if (includeWithdrawals) {
      const params = [];
      let where = `wr.is_deleted = FALSE`;
      if (status) {
        params.push(status);
        where += ` AND wr.status = $${params.length}`;
      } else {
        where += ` AND wr.status IN ('submitted', 'under_review', 'approved', 'processed')`;
      }

      const result = await query(
        `SELECT
           wr.id,
           wr.transaction_id,
           wr.investor_id,
           u.full_name AS investor_name,
           u.email AS investor_email,
           'withdrawal' AS request_type,
           wr.amount,
           wr.account_type,
           wr.transfer_mode,
           wr.status,
           wr.created_at
         FROM capital_withdrawal_requests wr
         JOIN users u ON u.id = wr.investor_id
         WHERE ${where}
         ORDER BY wr.created_at ASC`,
        params
      );
      requests.push(...result.rows);
    }

    requests.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const total = requests.length;
    const pageRows = requests.slice(offset, offset + limit);

    return res.status(200).json({
      success: true,
      message: 'Pending capital requests retrieved',
      data: {
        requests: pageRows,
        meta: {
          total,
          page,
          limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'listRequests');
  }
}

/**
 * PATCH /api/v1/admin/capital/deposit/:id/approve
 * Body: amount? (optional modification), admin_remark?
 */
export async function approveDeposit(req, res) {
  try {
    const depositId = req.params.id;
    const existing = await query(
      `SELECT ${DEPOSIT_COLUMNS}
       FROM capital_transactions
       WHERE id = $1 AND type = 'deposit' AND is_deleted = FALSE
       LIMIT 1`,
      [depositId]
    );

    const deposit = existing.rows[0];
    if (!deposit) {
      throw new CapitalError('Deposit request not found', 'USER_NOT_FOUND', 404);
    }
    if (!DEPOSIT_PENDING.includes(deposit.status)) {
      throw new CapitalError(
        'Only submitted or under review deposits can be approved',
        'VALIDATION_ERROR',
        400
      );
    }

    const originalAmount =
      deposit.original_requested_amount || deposit.amount;
    let approvedAmount = deposit.amount;
    if (req.body.amount !== undefined && req.body.amount !== null) {
      approvedAmount = normalizeAmount(req.body.amount);
      if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
        throw new CapitalError('Invalid approval amount', 'VALIDATION_ERROR', 400);
      }
    }

    const adminRemark = req.body.admin_remark
      ? String(req.body.admin_remark).trim()
      : null;

    const result = await query(
      `UPDATE capital_transactions
       SET amount = $2,
           original_requested_amount = COALESCE(original_requested_amount, amount),
           status = 'approved',
           admin_id = $3,
           admin_remark = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${DEPOSIT_COLUMNS}`,
      [depositId, approvedAmount, req.user.userId, adminRemark]
    );

    const updated = result.rows[0];
    const investor = await getInvestorOrThrow(updated.investor_id);

    await pushUndo({
      investorId: investor.id,
      adminId: req.user.userId,
      actionType: 'deposit_approve',
      entityType: 'deposit',
      entityId: updated.id,
      snapshot: { before: deposit, after: updated },
    });

    await audit(
      req,
      buildActionDescription('Approved', 'capital deposit', approvedAmount),
      updated.id,
      deposit,
      updated
    );

    await notifyInvestorCapital(investor, {
      title: 'Capital deposit approved',
      body: `Your capital deposit of ${formatCurrency(approvedAmount)} has been approved. Transaction ID: ${updated.transaction_id}.`,
      emailTemplate: 'capital-transaction',
      emailData: {
        amount: formatCurrency(approvedAmount),
        transactionType: 'Capital Deposit',
        status: 'Approved',
        transactionId: updated.transaction_id,
        message: `Your capital deposit has been approved${
          approvedAmount !== originalAmount
            ? ` (requested ${formatCurrency(originalAmount)}, approved ${formatCurrency(approvedAmount)})`
            : ''
        }.`,
      },
      referenceId: updated.transaction_id,
      referenceType: 'capital_deposit',
    });

    return res.status(200).json({
      success: true,
      message: 'Deposit approved and capital credited',
      data: {
        ...updated,
        original_requested_amount: updated.original_requested_amount,
        amount: updated.amount,
      },
    });
  } catch (error) {
    return handleError(res, error, 'approveDeposit');
  }
}

/**
 * PATCH /api/v1/admin/capital/deposit/:id/reject
 * Body: reason (required)
 */
export async function rejectDeposit(req, res) {
  try {
    const reason = req.body.reason ? String(req.body.reason).trim() : '';
    if (!reason) {
      throw new CapitalError('Rejection reason is required', 'VALIDATION_ERROR', 400);
    }

    const existing = await query(
      `SELECT ${DEPOSIT_COLUMNS}
       FROM capital_transactions
       WHERE id = $1 AND type = 'deposit' AND is_deleted = FALSE
       LIMIT 1`,
      [req.params.id]
    );
    const deposit = existing.rows[0];
    if (!deposit) {
      throw new CapitalError('Deposit request not found', 'USER_NOT_FOUND', 404);
    }
    if (!DEPOSIT_PENDING.includes(deposit.status)) {
      throw new CapitalError(
        'Only submitted or under review deposits can be rejected',
        'VALIDATION_ERROR',
        400
      );
    }

    const result = await query(
      `UPDATE capital_transactions
       SET status = 'rejected',
           admin_id = $2,
           admin_remark = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${DEPOSIT_COLUMNS}`,
      [req.params.id, req.user.userId, reason]
    );
    const updated = result.rows[0];
    const investor = await getInvestorOrThrow(updated.investor_id);

    await pushUndo({
      investorId: investor.id,
      adminId: req.user.userId,
      actionType: 'deposit_reject',
      entityType: 'deposit',
      entityId: updated.id,
      snapshot: { before: deposit, after: updated },
    });

    await audit(
      req,
      buildActionDescription('Rejected', 'capital deposit', deposit.amount),
      updated.id,
      deposit,
      updated
    );

    await notifyInvestorCapital(investor, {
      title: 'Capital deposit rejected',
      body: `Your capital deposit request ${updated.transaction_id} was rejected. Reason: ${reason}`,
      emailTemplate: 'rejection',
      emailData: {
        actionLabel: 'Capital deposit',
        reason,
        transactionId: updated.transaction_id,
        amount: formatCurrency(updated.amount),
      },
      referenceId: updated.transaction_id,
      referenceType: 'capital_deposit',
    });

    return res.status(200).json({
      success: true,
      message: 'Deposit rejected',
      data: updated,
    });
  } catch (error) {
    return handleError(res, error, 'rejectDeposit');
  }
}

/**
 * Lock withdrawal row and approve atomically (SELECT FOR UPDATE).
 * @param {string} withdrawalId
 * @param {string} adminId
 * @param {object} [extras]
 */
async function approveWithdrawalById(withdrawalId, adminId, extras = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT ${WITHDRAWAL_COLUMNS}
       FROM capital_withdrawal_requests
       WHERE id = $1 AND is_deleted = FALSE
       LIMIT 1
       FOR UPDATE`,
      [withdrawalId]
    );
    const row = existing.rows[0];
    if (!row) {
      throw new CapitalError(
        'Withdrawal request not found',
        'USER_NOT_FOUND',
        404
      );
    }
    if (!WITHDRAW_APPROVABLE.includes(row.status)) {
      throw new CapitalError(
        'Only submitted or under review withdrawals can be approved',
        'VALIDATION_ERROR',
        400
      );
    }

    const paymentDate = extras.payment_date || null;
    const paymentUtr = extras.payment_utr
      ? String(extras.payment_utr).trim().toUpperCase()
      : null;
    const adminRemark = extras.admin_remark
      ? String(extras.admin_remark).trim()
      : null;

    const result = await client.query(
      `UPDATE capital_withdrawal_requests
       SET status = 'approved',
           admin_id = $2,
           admin_remark = COALESCE($3, admin_remark),
           payment_date = COALESCE($4::DATE, payment_date),
           payment_utr = COALESCE($5, payment_utr),
           updated_at = NOW()
       WHERE id = $1
         AND status = ANY($6::TEXT[])
       RETURNING ${WITHDRAWAL_COLUMNS}`,
      [
        withdrawalId,
        adminId,
        adminRemark,
        paymentDate,
        paymentUtr,
        [...WITHDRAW_APPROVABLE],
      ]
    );

    if (!result.rows[0]) {
      throw new CapitalError(
        'Withdrawal was already processed by another admin',
        'VALIDATION_ERROR',
        409
      );
    }

    await client.query('COMMIT');
    return { before: row, after: result.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lock withdrawal and transition status under FOR UPDATE.
 * @param {string} withdrawalId
 * @param {string} adminId
 * @param {object} opts
 */
async function mutateWithdrawalStatusLocked(
  withdrawalId,
  adminId,
  { allowedFrom, nextStatus, adminRemark, paymentUtr, paymentDate }
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT ${WITHDRAWAL_COLUMNS}
       FROM capital_withdrawal_requests
       WHERE id = $1 AND is_deleted = FALSE
       LIMIT 1
       FOR UPDATE`,
      [withdrawalId]
    );
    const row = existing.rows[0];
    if (!row) {
      throw new CapitalError(
        'Withdrawal request not found',
        'USER_NOT_FOUND',
        404
      );
    }
    if (!allowedFrom.includes(row.status)) {
      throw new CapitalError(
        `Withdrawal cannot move from ${row.status} to ${nextStatus}`,
        'VALIDATION_ERROR',
        400
      );
    }

    const result = await client.query(
      `UPDATE capital_withdrawal_requests
       SET status = $2,
           admin_id = $3,
           admin_remark = COALESCE($4, admin_remark),
           payment_utr = COALESCE($5, payment_utr),
           payment_date = COALESCE($6::DATE, payment_date, CASE WHEN $2 = 'completed' THEN CURRENT_DATE ELSE payment_date END),
           updated_at = NOW()
       WHERE id = $1
         AND status = ANY($7::TEXT[])
       RETURNING ${WITHDRAWAL_COLUMNS}`,
      [
        withdrawalId,
        nextStatus,
        adminId,
        adminRemark || null,
        paymentUtr || null,
        paymentDate || null,
        allowedFrom,
      ]
    );

    if (!result.rows[0]) {
      throw new CapitalError(
        'Withdrawal was already processed by another admin',
        'VALIDATION_ERROR',
        409
      );
    }

    await client.query('COMMIT');
    return { before: row, after: result.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/admin/capital/withdraw/:id/approve
 */
export async function approveWithdraw(req, res) {
  try {
    const { before, after } = await approveWithdrawalById(
      req.params.id,
      req.user.userId,
      req.body || {}
    );
    const investor = await getInvestorOrThrow(after.investor_id);

    await pushUndo({
      investorId: investor.id,
      adminId: req.user.userId,
      actionType: 'withdraw_approve',
      entityType: 'withdrawal',
      entityId: after.id,
      snapshot: { before, after },
    });

    await audit(
      req,
      buildActionDescription('Approved', 'withdrawal', after.amount),
      after.id,
      before,
      after
    );

    await notifyInvestorCapital(investor, {
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
        utr: after.payment_utr || undefined,
      },
      referenceId: after.transaction_id,
      referenceType: 'capital_withdrawal',
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal approved',
      data: after,
    });
  } catch (error) {
    return handleError(res, error, 'approveWithdraw');
  }
}

/**
 * PATCH /api/v1/admin/capital/withdraw/:id/process
 */
export async function processWithdraw(req, res) {
  try {
    const { before: row, after } = await mutateWithdrawalStatusLocked(
      req.params.id,
      req.user.userId,
      {
        allowedFrom: ['approved'],
        nextStatus: 'processed',
      }
    );
    const investor = await getInvestorOrThrow(after.investor_id);

    await pushUndo({
      investorId: investor.id,
      adminId: req.user.userId,
      actionType: 'withdraw_process',
      entityType: 'withdrawal',
      entityId: after.id,
      snapshot: { before: row, after },
    });

    await audit(
      req,
      buildActionDescription('Processed', 'withdrawal', after.amount),
      after.id,
      row,
      after
    );

    await notifyInvestorCapital(investor, {
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
      referenceType: 'capital_withdrawal',
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal marked as processed',
      data: after,
    });
  } catch (error) {
    return handleError(res, error, 'processWithdraw');
  }
}

/**
 * PATCH /api/v1/admin/capital/withdraw/:id/complete
 * Body: payment_utr (required), payment_date?
 */
export async function completeWithdraw(req, res) {
  try {
    const paymentUtr = req.body.payment_utr
      ? String(req.body.payment_utr).trim().toUpperCase()
      : '';
    if (!paymentUtr) {
      throw new CapitalError('payment_utr is required', 'VALIDATION_ERROR', 400);
    }

    const paymentDate = req.body.payment_date || null;
    const { before: row, after } = await mutateWithdrawalStatusLocked(
      req.params.id,
      req.user.userId,
      {
        allowedFrom: ['processed', 'approved'],
        nextStatus: 'completed',
        paymentUtr,
        paymentDate,
      }
    );
    const investor = await getInvestorOrThrow(after.investor_id);

    await pushUndo({
      investorId: investor.id,
      adminId: req.user.userId,
      actionType: 'withdraw_complete',
      entityType: 'withdrawal',
      entityId: after.id,
      snapshot: { before: row, after },
    });

    await audit(
      req,
      buildActionDescription('Completed', 'withdrawal', after.amount),
      after.id,
      row,
      after
    );

    await notifyInvestorCapital(investor, {
      title: 'Withdrawal completed',
      body: `Your withdrawal ${after.transaction_id} of ${formatCurrency(after.amount)} is completed. UTR: ${paymentUtr}.`,
      emailTemplate: 'withdrawal',
      emailData: {
        amount: formatCurrency(after.amount),
        transferMode: after.transfer_mode === 'upi' ? 'UPI' : 'Bank Transfer',
        status: 'Completed',
        transactionId: after.transaction_id,
        utr: paymentUtr,
        withdrawalType:
          after.account_type === 'revenue'
            ? 'Revenue Withdrawal'
            : 'Capital Withdrawal',
      },
      referenceId: after.transaction_id,
      referenceType: 'capital_withdrawal',
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal completed',
      data: after,
    });
  } catch (error) {
    return handleError(res, error, 'completeWithdraw');
  }
}

/**
 * PATCH /api/v1/admin/capital/withdraw/:id/reject
 * Body: reason
 */
export async function rejectWithdraw(req, res) {
  try {
    const reason = req.body.reason ? String(req.body.reason).trim() : '';
    if (!reason) {
      throw new CapitalError('Rejection reason is required', 'VALIDATION_ERROR', 400);
    }

    const { before: row, after } = await mutateWithdrawalStatusLocked(
      req.params.id,
      req.user.userId,
      {
        allowedFrom: ['submitted', 'under_review', 'approved', 'processed'],
        nextStatus: 'rejected',
        adminRemark: reason,
      }
    );
    const investor = await getInvestorOrThrow(after.investor_id);

    await pushUndo({
      investorId: investor.id,
      adminId: req.user.userId,
      actionType: 'withdraw_reject',
      entityType: 'withdrawal',
      entityId: after.id,
      snapshot: { before: row, after },
    });

    await audit(
      req,
      buildActionDescription('Rejected', 'withdrawal', after.amount),
      after.id,
      row,
      after
    );

    await notifyInvestorCapital(investor, {
      title: 'Withdrawal rejected',
      body: `Your withdrawal ${after.transaction_id} was rejected. Amount restored. Reason: ${reason}`,
      emailTemplate: 'rejection',
      emailData: {
        actionLabel: 'Withdrawal',
        reason,
        transactionId: after.transaction_id,
        amount: formatCurrency(after.amount),
      },
      referenceId: after.transaction_id,
      referenceType: 'capital_withdrawal',
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal rejected. Amount restored to balance.',
      data: after,
    });
  } catch (error) {
    return handleError(res, error, 'rejectWithdraw');
  }
}

/**
 * POST /api/v1/admin/capital/withdraw/bulk-approve
 * Body: { ids: string[] }
 */
export async function bulkApproveWithdraw(req, res) {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (ids.length === 0) {
      throw new CapitalError('ids array is required', 'VALIDATION_ERROR', 400);
    }

    const approved = [];
    const failed = [];

    for (const id of ids) {
      try {
        const { before, after } = await approveWithdrawalById(
          id,
          req.user.userId,
          {}
        );
        const investor = await getInvestorOrThrow(after.investor_id);

        await pushUndo({
          investorId: investor.id,
          adminId: req.user.userId,
          actionType: 'withdraw_approve',
          entityType: 'withdrawal',
          entityId: after.id,
          snapshot: { before, after },
        });

        await audit(
          req,
          buildActionDescription('Approved', 'withdrawal', after.amount),
          after.id,
          before,
          after
        );

        await notifyInvestorCapital(investor, {
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
          referenceType: 'capital_withdrawal',
        });

        approved.push(after);
      } catch (error) {
        failed.push({
          id,
          message: error.message,
          error: error.code || 'INTERNAL_ERROR',
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Bulk approve completed: ${approved.length} approved, ${failed.length} failed`,
      data: { approved, failed },
    });
  } catch (error) {
    return handleError(res, error, 'bulkApproveWithdraw');
  }
}

/**
 * POST /api/v1/admin/capital/investor/:id/credit
 * Body: amount, remark?
 */
export async function creditCapital(req, res) {
  const client = await pool.connect();
  try {
    const investor = await getInvestorOrThrow(req.params.id);
    const amount = normalizeAmount(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new CapitalError('Valid amount is required', 'VALIDATION_ERROR', 400);
    }

    const remark = req.body.remark ? String(req.body.remark).trim() : null;

    await client.query('BEGIN');
    const transactionId = await generateTransactionId(TRANSACTION_TYPES.ADM, {
      client,
    });

    const result = await client.query(
      `INSERT INTO capital_transactions (
         transaction_id, investor_id, type, amount, original_requested_amount,
         status, remark, admin_id, admin_remark
       ) VALUES ($1, $2, 'admin_credit', $3, $3, 'approved', $4, $5, $4)
       RETURNING ${DEPOSIT_COLUMNS}`,
      [transactionId, investor.id, amount, remark, req.user.userId]
    );
    await client.query('COMMIT');

    const row = result.rows[0];

    await pushUndo({
      investorId: investor.id,
      adminId: req.user.userId,
      actionType: 'admin_credit',
      entityType: 'deposit',
      entityId: row.id,
      snapshot: { created: row },
    });

    await audit(
      req,
      buildActionDescription('Credited', 'capital', amount),
      row.id,
      null,
      row
    );

    await notifyInvestorCapital(investor, {
      title: 'Capital credited',
      body: `Admin credited ${formatCurrency(amount)} to your capital account. Transaction ID: ${transactionId}.`,
      emailTemplate: 'capital-transaction',
      emailData: {
        amount: formatCurrency(amount),
        transactionType: 'Admin Capital Credit',
        status: 'Approved',
        transactionId,
        message: remark || 'Capital has been credited to your account by admin.',
      },
      referenceId: transactionId,
      referenceType: 'admin_credit',
    });

    const balance = await getCapitalBalance(investor.id);

    return res.status(201).json({
      success: true,
      message: 'Capital credited',
      data: { transaction: row, capitalBalance: balance.capitalBalance },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleError(res, error, 'creditCapital');
  } finally {
    client.release();
  }
}

/**
 * POST /api/v1/admin/capital/investor/:id/debit
 * Body: amount, remark?
 */
export async function debitCapital(req, res) {
  const client = await pool.connect();
  try {
    const investor = await getInvestorOrThrow(req.params.id);
    const amount = normalizeAmount(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new CapitalError('Valid amount is required', 'VALIDATION_ERROR', 400);
    }

    const remark = req.body.remark ? String(req.body.remark).trim() : null;

    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1::text))',
      [investor.id]
    );

    const balance = await getCapitalBalance(investor.id, { client });
    if (amount > balance.capitalBalance) {
      throw new CapitalError(
        'Insufficient capital balance for debit',
        'WITHDRAWAL_INSUFFICIENT_BALANCE',
        400
      );
    }

    const transactionId = await generateTransactionId(TRANSACTION_TYPES.ADM, {
      client,
    });

    const result = await client.query(
      `INSERT INTO capital_transactions (
         transaction_id, investor_id, type, amount, original_requested_amount,
         status, remark, admin_id, admin_remark
       ) VALUES ($1, $2, 'admin_debit', $3, $3, 'approved', $4, $5, $4)
       RETURNING ${DEPOSIT_COLUMNS}`,
      [transactionId, investor.id, amount, remark, req.user.userId]
    );
    await client.query('COMMIT');

    const row = result.rows[0];

    await pushUndo({
      investorId: investor.id,
      adminId: req.user.userId,
      actionType: 'admin_debit',
      entityType: 'deposit',
      entityId: row.id,
      snapshot: { created: row },
    });

    await audit(
      req,
      buildActionDescription('Debited', 'capital', amount),
      row.id,
      null,
      row
    );

    await notifyInvestorCapital(investor, {
      title: 'Capital debited',
      body: `Admin debited ${formatCurrency(amount)} from your capital account. Transaction ID: ${transactionId}.`,
      emailTemplate: 'capital-transaction',
      emailData: {
        amount: formatCurrency(amount),
        transactionType: 'Admin Capital Debit',
        status: 'Approved',
        transactionId,
        message: remark || 'Capital has been debited from your account by admin.',
      },
      referenceId: transactionId,
      referenceType: 'admin_debit',
    });

    const afterBalance = await getCapitalBalance(investor.id);

    return res.status(201).json({
      success: true,
      message: 'Capital debited',
      data: { transaction: row, capitalBalance: afterBalance.capitalBalance },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleError(res, error, 'debitCapital');
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/v1/admin/capital/investor/:id/lock
 */
export async function lockCapital(req, res) {
  try {
    const investor = await getInvestorOrThrow(req.params.id);

    const pending = await query(
      `SELECT ${WITHDRAWAL_COLUMNS}
       FROM capital_withdrawal_requests
       WHERE investor_id = $1
         AND account_type = 'capital'
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])`,
      [investor.id, LOCK_AUTO_CANCEL_STATUSES]
    );

    const cancelled = [];
    for (const wdr of pending.rows) {
      const result = await query(
        `UPDATE capital_withdrawal_requests
         SET status = 'cancelled',
             auto_cancelled_reason = 'Capital locked for withdrawal',
             admin_id = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING ${WITHDRAWAL_COLUMNS}`,
        [wdr.id, req.user.userId]
      );
      cancelled.push({ before: wdr, after: result.rows[0] });

      await notifyInvestorCapital(investor, {
        title: 'Withdrawal auto-cancelled',
        body: `Your capital withdrawal ${wdr.transaction_id} was auto-cancelled because capital was locked for withdrawal. Amount restored.`,
        emailTemplate: 'withdrawal',
        emailData: {
          amount: formatCurrency(wdr.amount),
          transferMode: wdr.transfer_mode === 'upi' ? 'UPI' : 'Bank Transfer',
          status: 'Cancelled',
          transactionId: wdr.transaction_id,
          withdrawalType: 'Capital Withdrawal',
        },
        referenceId: wdr.transaction_id,
        referenceType: 'capital_withdrawal',
      });
    }

    const lockResult = await query(
      `INSERT INTO capital_lock_status (
         investor_id, is_locked, locked_by, locked_at
       ) VALUES ($1, TRUE, $2, NOW())
       ON CONFLICT (investor_id) DO UPDATE SET
         is_locked = TRUE,
         locked_by = EXCLUDED.locked_by,
         locked_at = NOW(),
         unlock_reason = NULL,
         updated_at = NOW()
       RETURNING investor_id, is_locked, locked_by, locked_at`,
      [investor.id, req.user.userId]
    );

    await pushUndo({
      investorId: investor.id,
      adminId: req.user.userId,
      actionType: 'lock',
      entityType: 'lock',
      entityId: investor.id,
      snapshot: { cancelled, lock: lockResult.rows[0] },
    });

    await audit(
      req,
      buildActionDescription('Locked', 'capital withdrawals'),
      investor.id,
      null,
      { is_locked: true, auto_cancelled: cancelled.length }
    );

    await notifyInvestorCapital(investor, {
      title: 'Capital locked for withdrawal',
      body: 'Your capital has been locked for withdrawal. You cannot submit capital withdrawal requests until it is unlocked.',
      emailTemplate: 'custom-notification',
      emailData: {
        subjectTitle: 'Capital locked for withdrawal',
        body: 'Your capital has been locked for withdrawal by admin. Pending capital withdrawal requests (if any) were auto-cancelled and amounts restored.',
      },
      referenceId: investor.id,
      referenceType: 'capital_lock',
    });

    return res.status(200).json({
      success: true,
      message: 'Capital locked for withdrawal',
      data: {
        lock: lockResult.rows[0],
        autoCancelledWithdrawals: cancelled.map((c) => c.after),
      },
    });
  } catch (error) {
    return handleError(res, error, 'lockCapital');
  }
}

/**
 * PATCH /api/v1/admin/capital/investor/:id/unlock
 * Body: unlock_reason?
 */
export async function unlockCapital(req, res) {
  try {
    const investor = await getInvestorOrThrow(req.params.id);
    const unlockReason = req.body.unlock_reason
      ? String(req.body.unlock_reason).trim()
      : null;

    const before = await query(
      `SELECT investor_id, is_locked, locked_by, locked_at, unlock_reason
       FROM capital_lock_status
       WHERE investor_id = $1
       LIMIT 1`,
      [investor.id]
    );

    const result = await query(
      `INSERT INTO capital_lock_status (
         investor_id, is_locked, unlock_reason, updated_at
       ) VALUES ($1, FALSE, $2, NOW())
       ON CONFLICT (investor_id) DO UPDATE SET
         is_locked = FALSE,
         unlock_reason = EXCLUDED.unlock_reason,
         updated_at = NOW()
       RETURNING investor_id, is_locked, unlock_reason, updated_at`,
      [investor.id, unlockReason]
    );

    await pushUndo({
      investorId: investor.id,
      adminId: req.user.userId,
      actionType: 'unlock',
      entityType: 'lock',
      entityId: investor.id,
      snapshot: { before: before.rows[0] || null, after: result.rows[0] },
    });

    await audit(
      req,
      buildActionDescription('Unlocked', 'capital withdrawals'),
      investor.id,
      before.rows[0] || null,
      result.rows[0]
    );

    await notifyInvestorCapital(investor, {
      title: 'Capital unlocked for withdrawal',
      body: 'Your capital is now available for withdrawal.',
      emailTemplate: 'custom-notification',
      emailData: {
        subjectTitle: 'Capital unlocked for withdrawal',
        body: 'Your capital has been unlocked. You may submit capital withdrawal requests again.',
      },
      referenceId: investor.id,
      referenceType: 'capital_lock',
    });

    return res.status(200).json({
      success: true,
      message: 'Capital unlocked for withdrawal',
      data: result.rows[0],
    });
  } catch (error) {
    return handleError(res, error, 'unlockCapital');
  }
}

/**
 * POST /api/v1/admin/capital/investor/:id/undo
 */
export async function undoLastAction(req, res) {
  try {
    await ensureUndoSchema();
    const investor = await getInvestorOrThrow(req.params.id);

    const stack = await query(
      `SELECT id, action_type, entity_type, entity_id, snapshot
       FROM capital_undo_stack
       WHERE investor_id = $1
         AND is_undone = FALSE
       ORDER BY created_at DESC
       LIMIT 1`,
      [investor.id]
    );

    if (stack.rowCount === 0) {
      throw new CapitalError('No reversible capital action to undo', 'VALIDATION_ERROR', 400);
    }

    const entry = stack.rows[0];
    const snapshot = entry.snapshot;

    switch (entry.action_type) {
      case 'deposit_approve':
      case 'deposit_reject':
      case 'withdraw_approve':
      case 'withdraw_process':
      case 'withdraw_complete':
      case 'withdraw_reject': {
        const before = snapshot.before;
        if (entry.entity_type === 'deposit') {
          await query(
            `UPDATE capital_transactions
             SET amount = $2,
                 original_requested_amount = $3,
                 status = $4,
                 admin_id = $5,
                 admin_remark = $6,
                 updated_at = NOW()
             WHERE id = $1`,
            [
              before.id,
              before.amount,
              before.original_requested_amount,
              before.status,
              before.admin_id,
              before.admin_remark,
            ]
          );
        } else {
          await query(
            `UPDATE capital_withdrawal_requests
             SET status = $2,
                 admin_id = $3,
                 admin_remark = $4,
                 payment_date = $5,
                 payment_utr = $6,
                 auto_cancelled_reason = $7,
                 updated_at = NOW()
             WHERE id = $1`,
            [
              before.id,
              before.status,
              before.admin_id,
              before.admin_remark,
              before.payment_date,
              before.payment_utr,
              before.auto_cancelled_reason,
            ]
          );
        }
        break;
      }
      case 'admin_credit':
      case 'admin_debit': {
        await query(
          `UPDATE capital_transactions
           SET is_deleted = TRUE, updated_at = NOW()
           WHERE id = $1`,
          [snapshot.created.id]
        );
        break;
      }
      case 'lock': {
        for (const item of snapshot.cancelled || []) {
          const b = item.before;
          await query(
            `UPDATE capital_withdrawal_requests
             SET status = $2,
                 auto_cancelled_reason = $3,
                 admin_id = $4,
                 updated_at = NOW()
             WHERE id = $1`,
            [b.id, b.status, b.auto_cancelled_reason, b.admin_id]
          );
        }
        await query(
          `UPDATE capital_lock_status
           SET is_locked = FALSE, updated_at = NOW()
           WHERE investor_id = $1`,
          [investor.id]
        );
        break;
      }
      case 'unlock': {
        if (snapshot.before?.is_locked) {
          await query(
            `UPDATE capital_lock_status
             SET is_locked = TRUE,
                 locked_by = $2,
                 locked_at = $3,
                 unlock_reason = $4,
                 updated_at = NOW()
             WHERE investor_id = $1`,
            [
              investor.id,
              snapshot.before.locked_by,
              snapshot.before.locked_at,
              snapshot.before.unlock_reason,
            ]
          );
        } else {
          await query(
            `UPDATE capital_lock_status
             SET is_locked = TRUE, locked_at = NOW(), updated_at = NOW()
             WHERE investor_id = $1`,
            [investor.id]
          );
        }
        break;
      }
      default:
        throw new CapitalError('Unsupported undo action type', 'VALIDATION_ERROR', 400);
    }

    await query(
      `UPDATE capital_undo_stack
       SET is_undone = TRUE, updated_at = NOW()
       WHERE id = $1`,
      [entry.id]
    );

    await audit(
      req,
      buildActionDescription('Undid', `capital action (${entry.action_type})`),
      investor.id,
      snapshot,
      { undone: true, action_type: entry.action_type }
    );

    await notifyInvestorCapital(investor, {
      title: 'Capital action reversed',
      body: `A recent capital action (${entry.action_type.replace(/_/g, ' ')}) was undone by admin.`,
      emailTemplate: 'custom-notification',
      emailData: {
        subjectTitle: 'Capital action reversed',
        body: `A recent capital action on your account was undone by admin (${entry.action_type.replace(/_/g, ' ')}).`,
      },
      referenceId: investor.id,
      referenceType: 'capital_undo',
    });

    const balance = await getCapitalBalance(investor.id);

    return res.status(200).json({
      success: true,
      message: 'Last capital action undone',
      data: {
        undoneAction: entry.action_type,
        capitalBalance: balance.capitalBalance,
        isLocked: balance.isLocked,
      },
    });
  } catch (error) {
    return handleError(res, error, 'undoLastAction');
  }
}
