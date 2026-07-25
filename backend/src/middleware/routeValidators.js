/**
 * Shared express-validator chains for sensitive financial / admin routes (Task 26.1).
 */

import {
  body,
  param,
  query,
  sanitizeText,
} from './validate.middleware.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuidParam = (name = 'id') =>
  param(name)
    .exists({ checkFalsy: true })
    .withMessage(`${name} is required`)
    .matches(UUID_RE)
    .withMessage(`Valid ${name} UUID is required`);

export const amountBody = (field = 'amount') =>
  body(field)
    .exists({ checkFalsy: true })
    .withMessage(`${field} is required`)
    .isFloat({ gt: 0 })
    .withMessage(`${field} must be a positive number`)
    .customSanitizer((value) => Math.round(Number(value)));

export const optionalRemark = (field = 'remark') =>
  sanitizeText(field)
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ max: 1000 })
    .withMessage(`${field} must be at most 1000 characters`);

export const optionalAdminRemark = optionalRemark('admin_remark');

export const transferModeBody = body('transfer_mode')
  .exists({ checkFalsy: true })
  .withMessage('transfer_mode is required')
  .isIn(['bank', 'upi'])
  .withMessage('transfer_mode must be bank or upi');

export const accountTypeBody = body('account_type')
  .exists({ checkFalsy: true })
  .withMessage('account_type is required')
  .isIn(['capital', 'revenue'])
  .withMessage('account_type must be capital or revenue');

export const ticketStatusBody = body('status')
  .exists({ checkFalsy: true })
  .withMessage('status is required')
  .isIn(['in_progress', 'resolved', 'closed'])
  .withMessage('status must be in_progress, resolved, or closed');

export const assignAdminBody = body('admin_id')
  .exists({ checkFalsy: true })
  .withMessage('admin_id is required')
  .matches(UUID_RE)
  .withMessage('Valid admin_id UUID is required');

export const paymentUtrBody = body('payment_utr')
  .exists({ checkFalsy: true })
  .withMessage('payment_utr is required')
  .isString()
  .trim()
  .isLength({ min: 8, max: 64 })
  .withMessage('payment_utr must be 8–64 characters');

export const optionalPaymentUtr = body('payment_utr')
  .optional({ nullable: true, checkFalsy: true })
  .isString()
  .trim()
  .isLength({ min: 8, max: 64 })
  .withMessage('payment_utr must be 8–64 characters');

export const optionalIsoDate = (field) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage(`${field} must be YYYY-MM-DD`);

export const reportDateQuery = [
  query('from')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('from must be YYYY-MM-DD'),
  query('to')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('to must be YYYY-MM-DD'),
  query('format')
    .optional()
    .isIn(['pdf', 'excel', 'xlsx'])
    .withMessage('format must be pdf or excel'),
];

export const depositBodyValidators = [
  amountBody('amount'),
  sanitizeText('utr_number')
    .exists({ checkFalsy: true })
    .withMessage('utr_number is required')
    .isLength({ min: 8, max: 64 })
    .withMessage('utr_number must be 8–64 characters'),
  optionalRemark(),
  optionalIsoDate('transfer_date'),
];

export const withdrawBodyValidators = [
  amountBody('amount'),
  accountTypeBody,
  transferModeBody,
];

export const capitalWithdrawBodyValidators = [
  amountBody('amount'),
  transferModeBody,
];

export const revenueWithdrawBodyValidators = [
  amountBody('amount'),
  transferModeBody,
];
