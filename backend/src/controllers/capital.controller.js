import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { sendEmail } from '../services/email.service.js';
import { createNotification } from '../services/notification.service.js';
import { getActiveAdmins } from '../models/user.model.js';
import { query } from '../db/connection.js';
import {
  CAPITAL_LIMITS,
  CapitalError,
  createDepositRequest,
  createWithdrawalRequest,
  cancelWithdrawalRequest,
  getInvestorCapitalTransactions,
  getCapitalBalance,
  getRevenueBalance,
  getPendingWithdrawalAmount,
  isUtrTaken,
  normalizeAmount,
  normalizeUtr,
  ensureCapitalSchema,
} from '../models/capital.model.js';
import { toInvestorSafeCapitalTxn } from '../utils/maskSensitive.js';

const SUCCESS_MESSAGE =
  'Your request has been received. Your account will be updated within 24-48 hours upon verification. Thank you for your request.';

/**
 * @param {string | undefined} value
 * @returns {boolean}
 */
function isValidTransferDate(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Store admin-facing notification in admin_notifications.
 * @param {string | null} adminId
 * @param {string} title
 * @param {string} body
 * @param {string} referenceId
 */
async function createAdminNotification(adminId, title, body, referenceId) {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id UUID,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      reference_id VARCHAR(100),
      reference_type VARCHAR(50),
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(
    `INSERT INTO admin_notifications (
       admin_id,
       title,
       body,
       type,
       reference_id,
       reference_type
     ) VALUES ($1, $2, $3, 'request', $4, 'capital_deposit')`,
    [adminId, title, body, referenceId]
  );
}

/**
 * Notify admins (in-app + email) without blocking the investor response.
 * @param {object} deposit
 * @param {object} investor
 */
function notifyAdminsAsync(deposit, investor) {
  setImmediate(async () => {
    try {
      const admins = await getActiveAdmins();
      const amountLabel = formatCurrency(deposit.amount);
      const title = 'New capital deposit request';
      const body = `${investor.name || 'A Tikhat Partner'} submitted a capital deposit of ${amountLabel}. Transaction ID: ${deposit.transaction_id}. UTR: ${deposit.utr_number}.`;

      if (admins.length === 0) {
        await createAdminNotification(null, title, body, deposit.transaction_id);
      } else {
        await Promise.allSettled(
          admins.map((admin) =>
            createAdminNotification(admin.id, title, body, deposit.transaction_id)
          )
        );
      }

      await Promise.allSettled(
        admins.map((admin) =>
          sendEmail(admin.email, 'custom-notification', {
            investorName: admin.full_name,
            subjectTitle: title,
            body: `${body}\n\nInvestor: ${investor.name || 'Tikhat Partner'}\nEmail: ${investor.email || 'N/A'}\nTransfer date: ${deposit.transfer_date ? formatDate(deposit.transfer_date) : 'N/A'}\n\nPlease review in the admin panel.`,
            referenceId: deposit.transaction_id,
            recipientType: 'admin',
          })
        )
      );
    } catch (error) {
      logger.error(
        `[Capital] Admin notification failed: ${error.message}`,
        { error, transactionId: deposit.transaction_id }
      );
    }
  });
}

/**
 * Remove uploaded file if request fails after multer write.
 * @param {Express.Multer.File | undefined} file
 */
function cleanupUploadedFile(file) {
  if (!file?.path) {
    return;
  }

  try {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch (error) {
    logger.warn(`[Capital] Failed to cleanup upload: ${error.message}`);
  }
}

/**
 * Relative path stored in DB for payment screenshot.
 * @param {Express.Multer.File} file
 * @returns {string}
 */
function screenshotRelativePath(file) {
  return path.join('payment-screenshots', file.filename).replace(/\\/g, '/');
}

/**
 * POST /api/v1/investor/capital/deposit
 * Multipart: amount, transfer_date, utr_number, payment_screenshot, remark?
 */
export async function submitDeposit(req, res) {
  const file = req.file;

  try {
    await ensureCapitalSchema();

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Payment screenshot is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const amountRaw = req.body.amount;
    const transferDate = req.body.transfer_date;
    const utrRaw = req.body.utr_number;
    const remark = req.body.remark;

    if (amountRaw === undefined || amountRaw === null || amountRaw === '') {
      cleanupUploadedFile(file);
      return res.status(400).json({
        success: false,
        message: 'Amount is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const amount = normalizeAmount(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      cleanupUploadedFile(file);
      return res.status(400).json({
        success: false,
        message: 'Amount must be a valid whole number',
        error: 'VALIDATION_ERROR',
      });
    }

    if (amount < CAPITAL_LIMITS.MIN_DEPOSIT) {
      cleanupUploadedFile(file);
      return res.status(400).json({
        success: false,
        message: `Minimum capital deposit is ${formatCurrency(CAPITAL_LIMITS.MIN_DEPOSIT)}`,
        error: 'CAPITAL_BELOW_MINIMUM',
      });
    }

    if (amount > CAPITAL_LIMITS.MAX_DEPOSIT) {
      cleanupUploadedFile(file);
      return res.status(400).json({
        success: false,
        message: `Maximum capital deposit is ${formatCurrency(CAPITAL_LIMITS.MAX_DEPOSIT)}`,
        error: 'CAPITAL_ABOVE_MAXIMUM',
      });
    }

    if (!isValidTransferDate(transferDate)) {
      cleanupUploadedFile(file);
      return res.status(400).json({
        success: false,
        message: 'transfer_date is required in YYYY-MM-DD format',
        error: 'VALIDATION_ERROR',
      });
    }

    if (!utrRaw || !String(utrRaw).trim()) {
      cleanupUploadedFile(file);
      return res.status(400).json({
        success: false,
        message: 'UTR number is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const utr = normalizeUtr(utrRaw);
    if (await isUtrTaken(utr)) {
      cleanupUploadedFile(file);
      return res.status(409).json({
        success: false,
        message: 'This UTR number has already been used',
        error: 'USER_UTR_EXISTS',
      });
    }

    const investorId = req.user.userId;
    const screenshotUrl = screenshotRelativePath(file);

    const deposit = await createDepositRequest({
      investorId,
      amount,
      transferDate: String(transferDate).trim(),
      utrNumber: utr,
      paymentScreenshotUrl: screenshotUrl,
      remark: remark ? String(remark).trim() : null,
    });

    await createNotification(
      investorId,
      'Capital deposit submitted',
      `Your capital deposit request of ${formatCurrency(deposit.amount)} has been received. Transaction ID: ${deposit.transaction_id}. We will update your account within 24-48 hours upon verification.`,
      'transaction',
      deposit.transaction_id,
      'capital_deposit'
    );

    let investorInfo = { name: req.user.name, email: null };
    try {
      const userRow = await query(
        `SELECT full_name, email FROM users WHERE id = $1 LIMIT 1`,
        [investorId]
      );
      if (userRow.rows[0]) {
        investorInfo = {
          name: userRow.rows[0].full_name,
          email: userRow.rows[0].email,
        };
      }
    } catch (lookupError) {
      logger.warn(
        `[Capital] Investor lookup for admin alert failed: ${lookupError.message}`
      );
    }

    notifyAdminsAsync(deposit, investorInfo);

    return res.status(201).json({
      success: true,
      message: SUCCESS_MESSAGE,
      transactionId: deposit.transaction_id,
    });
  } catch (error) {
    cleanupUploadedFile(file);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'This UTR number has already been used',
        error: 'USER_UTR_EXISTS',
      });
    }

    logger.error(`[Capital] submitDeposit: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to submit capital deposit request',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/v1/investor/capital/transactions
 */
export async function listTransactions(req, res) {
  try {
    const { page, limit } = req.query;
    const result = await getInvestorCapitalTransactions(
      req.user.userId,
      page,
      limit
    );

    return res.status(200).json({
      success: true,
      message: 'Capital transactions retrieved',
      data: {
        ...result,
        transactions: (result.transactions || []).map(toInvestorSafeCapitalTxn),
      },
    });
  } catch (error) {
    logger.error(`[Capital] listTransactions: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve capital transactions',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/v1/investor/capital/balance
 */
export async function getBalance(req, res) {
  try {
    const balance = await getCapitalBalance(req.user.userId);
    const revenueBalance = await getRevenueBalance(req.user.userId);

    return res.status(200).json({
      success: true,
      message: 'Capital balance retrieved',
      data: {
        capitalBalance: balance.capitalBalance,
        capitalBalanceFormatted: formatCurrency(balance.capitalBalance),
        revenueBalance,
        revenueBalanceFormatted: formatCurrency(revenueBalance),
        pendingWithdrawalAmount: balance.pendingWithdrawalAmount,
        pendingWithdrawalFormatted: formatCurrency(
          balance.pendingWithdrawalAmount
        ),
        isLocked: balance.isLocked,
        statusLabel: balance.statusLabel,
      },
    });
  } catch (error) {
    logger.error(`[Capital] getBalance: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve capital balance',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * POST /api/v1/investor/capital/withdraw
 * Body: amount, account_type (capital|revenue), transfer_mode (bank|upi)
 */
export async function submitWithdraw(req, res) {
  try {
    const { amount, account_type, transfer_mode } = req.body;

    const withdrawal = await createWithdrawalRequest({
      investorId: req.user.userId,
      amount,
      accountType: account_type,
      transferMode: transfer_mode,
    });

    const capital = await getCapitalBalance(req.user.userId);
    const revenueBalance = await getRevenueBalance(req.user.userId);

    await createNotification(
      req.user.userId,
      'Withdrawal request submitted',
      `Your withdrawal of ${formatCurrency(withdrawal.amount)} from ${withdrawal.account_type} account has been submitted. Transaction ID: ${withdrawal.transaction_id}. The amount is held as pending until processed.`,
      'transaction',
      withdrawal.transaction_id,
      'capital_withdrawal'
    ).catch((err) => {
      logger.warn(`[Capital] Withdrawal notification failed: ${err.message}`);
    });

    return res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: {
        id: withdrawal.id,
        transactionId: withdrawal.transaction_id,
        amount: withdrawal.amount,
        amountFormatted: formatCurrency(withdrawal.amount),
        accountType: withdrawal.account_type,
        transferMode: withdrawal.transfer_mode,
        status: withdrawal.status,
        capitalBalance: capital.capitalBalance,
        revenueBalance,
        pendingWithdrawalAmount: capital.pendingWithdrawalAmount,
      },
    });
  } catch (error) {
    if (error instanceof CapitalError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        error: error.code,
      });
    }

    logger.error(`[Capital] submitWithdraw: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to submit withdrawal request',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * PATCH /api/v1/investor/capital/withdraw/:id/cancel
 */
export async function cancelWithdraw(req, res) {
  try {
    const { id } = req.params;

    const cancelled = await cancelWithdrawalRequest(id, req.user.userId);
    const capital = await getCapitalBalance(req.user.userId);
    const revenueBalance = await getRevenueBalance(req.user.userId);

    await createNotification(
      req.user.userId,
      'Withdrawal cancelled',
      `Your withdrawal request ${cancelled.transaction_id} of ${formatCurrency(cancelled.amount)} has been cancelled. The amount has been restored to your ${cancelled.account_type} balance.`,
      'transaction',
      cancelled.transaction_id,
      'capital_withdrawal'
    ).catch((err) => {
      logger.warn(`[Capital] Cancel notification failed: ${err.message}`);
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal request cancelled. Amount restored to balance.',
      data: {
        id: cancelled.id,
        transactionId: cancelled.transaction_id,
        amount: cancelled.amount,
        status: cancelled.status,
        capitalBalance: capital.capitalBalance,
        revenueBalance,
        pendingWithdrawalAmount: capital.pendingWithdrawalAmount,
      },
    });
  } catch (error) {
    if (error instanceof CapitalError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        error: error.code,
      });
    }

    logger.error(`[Capital] cancelWithdraw: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel withdrawal request',
      error: 'INTERNAL_ERROR',
    });
  }
}

// ---------------------------------------------------------------------------
// Task 7.1 — Revenue withdrawal (investor)
// ---------------------------------------------------------------------------

/**
 * Pending revenue withdrawal amount (submitted / under_review).
 * @param {string} investorId
 * @returns {Promise<number>}
 */
async function getPendingRevenueWithdrawal(investorId) {
  return getPendingWithdrawalAmount(investorId, 'revenue');
}

/**
 * POST /api/v1/investor/revenue/withdraw
 * Body: amount, transfer_mode (bank|upi)
 * Forces account_type = revenue. Does not alter capital withdraw handler.
 */
export async function submitRevenueWithdraw(req, res) {
  try {
    const { amount, transfer_mode } = req.body;
    const investorId = req.user.userId;

    const withdrawal = await createWithdrawalRequest({
      investorId,
      amount,
      accountType: 'revenue',
      transferMode: transfer_mode,
    });

    const revenueBalance = await getRevenueBalance(investorId);
    const pendingRevenueWithdrawal =
      await getPendingRevenueWithdrawal(investorId);

    await createNotification(
      investorId,
      'Revenue withdrawal submitted',
      `Your revenue withdrawal of ${formatCurrency(withdrawal.amount)} has been submitted. Transaction ID: ${withdrawal.transaction_id}. The amount is held as pending until processed.`,
      'transaction',
      withdrawal.transaction_id,
      'revenue_withdrawal'
    ).catch((err) => {
      logger.warn(
        `[Capital] Revenue withdrawal notification failed: ${err.message}`
      );
    });

    const admins = await getActiveAdmins();
    await Promise.allSettled(
      admins.map((admin) =>
        sendEmail(admin.email, 'custom-notification', {
          investorName: admin.full_name || 'Admin',
          subjectTitle: 'New revenue withdrawal request',
          body: `Investor submitted a revenue withdrawal of ${formatCurrency(withdrawal.amount)}. Transaction ID: ${withdrawal.transaction_id}.`,
          referenceId: withdrawal.transaction_id,
          recipientType: 'admin',
        })
      )
    );

    const pendingNote =
      pendingRevenueWithdrawal > 0
        ? `${formatCurrency(pendingRevenueWithdrawal)} pending withdrawal`
        : null;

    return res.status(201).json({
      success: true,
      message: 'Revenue withdrawal request submitted successfully',
      data: {
        id: withdrawal.id,
        transactionId: withdrawal.transaction_id,
        amount: withdrawal.amount,
        amountFormatted: formatCurrency(withdrawal.amount),
        accountType: 'revenue',
        transferMode: withdrawal.transfer_mode,
        status: withdrawal.status,
        revenueBalance,
        pendingRevenueWithdrawal,
        pendingWithdrawalNote: pendingNote,
      },
    });
  } catch (error) {
    if (error instanceof CapitalError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        error: error.code,
      });
    }

    logger.error(`[Capital] submitRevenueWithdraw: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to submit revenue withdrawal request',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * Task 7.3 — Investor withdrawal history
 */
const WITHDRAWAL_HISTORY_STATUSES = Object.freeze([
  'submitted',
  'under_review',
  'approved',
  'processed',
  'completed',
  'rejected',
  'cancelled',
]);

const WITHDRAWN_TOTAL_STATUSES = Object.freeze([
  'approved',
  'processed',
  'completed',
]);

const DEFAULT_WITHDRAWAL_PAGE = 1;
const DEFAULT_WITHDRAWAL_LIMIT = 20;
const MAX_WITHDRAWAL_LIMIT = 100;

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return n;
}

/**
 * Map withdrawal row for investor history response.
 * @param {object} row
 * @returns {object}
 */
function mapWithdrawalHistoryItem(row) {
  const dateValue = row.payment_date || row.created_at;
  return {
    id: row.id,
    transaction_id: row.transaction_id,
    date: dateValue ? formatDate(dateValue) : null,
    amount: Math.round(Number(row.amount) || 0),
    amount_formatted: formatCurrency(row.amount),
    account_type: row.account_type,
    transfer_mode: row.transfer_mode,
    status: row.status,
    payment_utr: row.payment_utr || null,
    created_at: row.created_at,
  };
}

/**
 * GET /api/v1/investor/withdrawals
 * Query: account_type?, status?, page?, limit?
 */
export async function listWithdrawals(req, res) {
  try {
    const investorId = req.user.userId;
    const { account_type: accountType, status } = req.query;

    const pageNum = toPositiveInt(req.query.page, DEFAULT_WITHDRAWAL_PAGE);
    let limitNum = toPositiveInt(req.query.limit, DEFAULT_WITHDRAWAL_LIMIT);
    if (limitNum > MAX_WITHDRAWAL_LIMIT) {
      limitNum = MAX_WITHDRAWAL_LIMIT;
    }
    const offset = (pageNum - 1) * limitNum;

    const conditions = [
      'investor_id = $1',
      'is_deleted = FALSE',
    ];
    const params = [investorId];

    if (accountType !== undefined && accountType !== null && accountType !== '') {
      const normalized = String(accountType).trim().toLowerCase();
      if (normalized !== 'capital' && normalized !== 'revenue') {
        return res.status(400).json({
          success: false,
          message: 'account_type must be capital or revenue',
          error: 'VALIDATION_ERROR',
        });
      }
      params.push(normalized);
      conditions.push(`account_type = $${params.length}`);
    }

    if (status !== undefined && status !== null && status !== '') {
      const normalizedStatus = String(status).trim().toLowerCase();
      if (!WITHDRAWAL_HISTORY_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid withdrawal status filter',
          error: 'VALIDATION_ERROR',
        });
      }
      params.push(normalizedStatus);
      conditions.push(`status = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM capital_withdrawal_requests
       WHERE ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const listParams = [...params, limitNum, offset];
    const listResult = await query(
      `SELECT id, transaction_id, amount, account_type, transfer_mode,
              status, payment_date, payment_utr, created_at, updated_at
       FROM capital_withdrawal_requests
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );

    return res.status(200).json({
      success: true,
      message: 'Withdrawal history retrieved',
      data: {
        withdrawals: listResult.rows.map(mapWithdrawalHistoryItem),
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: total === 0 ? 0 : Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    logger.error(`[Capital] listWithdrawals: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve withdrawal history',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/v1/investor/withdrawals/summary
 */
export async function getWithdrawalSummary(req, res) {
  try {
    const investorId = req.user.userId;

    const result = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN account_type = 'capital' THEN amount ELSE 0 END), 0)::INTEGER
           AS total_withdrawn_capital,
         COALESCE(SUM(CASE WHEN account_type = 'revenue' THEN amount ELSE 0 END), 0)::INTEGER
           AS total_withdrawn_revenue,
         COALESCE(SUM(amount), 0)::INTEGER AS total_withdrawn_all
       FROM capital_withdrawal_requests
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])`,
      [investorId, [...WITHDRAWN_TOTAL_STATUSES]]
    );

    const row = result.rows[0] || {};
    const totalWithdrawnCapital = Math.round(
      Number(row.total_withdrawn_capital) || 0
    );
    const totalWithdrawnRevenue = Math.round(
      Number(row.total_withdrawn_revenue) || 0
    );
    const totalWithdrawnAll = Math.round(Number(row.total_withdrawn_all) || 0);

    return res.status(200).json({
      success: true,
      message: 'Withdrawal summary retrieved',
      data: {
        total_withdrawn_capital: totalWithdrawnCapital,
        total_withdrawn_capital_formatted: formatCurrency(totalWithdrawnCapital),
        total_withdrawn_revenue: totalWithdrawnRevenue,
        total_withdrawn_revenue_formatted: formatCurrency(totalWithdrawnRevenue),
        total_withdrawn_all: totalWithdrawnAll,
        total_withdrawn_all_formatted: formatCurrency(totalWithdrawnAll),
      },
    });
  } catch (error) {
    logger.error(`[Capital] getWithdrawalSummary: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve withdrawal summary',
      error: 'INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/v1/investor/revenue/balance
 * Revenue balance + pending withdrawal note for UI.
 */
export async function getRevenueWithdrawalBalance(req, res) {
  try {
    const investorId = req.user.userId;
    const revenueBalance = await getRevenueBalance(investorId);
    const pendingRevenueWithdrawal =
      await getPendingRevenueWithdrawal(investorId);

    const pendingNote =
      pendingRevenueWithdrawal > 0
        ? `${formatCurrency(pendingRevenueWithdrawal)} pending withdrawal`
        : null;

    return res.status(200).json({
      success: true,
      message: 'Revenue balance retrieved',
      data: {
        revenueBalance,
        revenueBalanceFormatted: formatCurrency(revenueBalance),
        pendingRevenueWithdrawal,
        pendingWithdrawalNote: pendingNote,
      },
    });
  } catch (error) {
    logger.error(`[Capital] getRevenueWithdrawalBalance: ${error.message}`, {
      error,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve revenue balance',
      error: 'INTERNAL_ERROR',
    });
  }
}
