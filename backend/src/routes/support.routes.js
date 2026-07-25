import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireInvestor, requireAdmin } from '../middleware/role.middleware.js';
import {
  uploadSupportAttachment,
  handleUploadError,
} from '../middleware/upload.middleware.js';
import {
  uploadLimiter,
  adminMutationLimiter,
} from '../middleware/rateLimit.middleware.js';
import { validate, sanitizeText, body } from '../middleware/validate.middleware.js';
import {
  assignAdminBody,
  ticketStatusBody,
  uuidParam,
} from '../middleware/routeValidators.js';
import {
  createInvestorTicket,
  listMyTickets,
  getMyTicket,
  replyMyTicket,
  reopenMyTicket,
  listAllTickets,
  getAdminTicket,
  adminReplyTicket,
  patchTicketStatus,
  assignTicketToAdmin,
  getSupportSummary,
  getInvestorSupportTickets,
  listEscalatedTickets,
} from '../controllers/support.controller.js';

/**
 * Multipart wrapper for support attachments field.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function parseAttachments(req, res, next) {
  uploadSupportAttachment.array('attachments', 5)(req, res, (err) => {
    if (err) {
      return handleUploadError(err, req, res, next);
    }
    return next();
  });
}

const createTicketValidators = [
  sanitizeText('category')
    .exists({ checkFalsy: true })
    .withMessage('category is required')
    .isIn([
      'capital',
      'revenue',
      'withdrawal',
      'kyc_profile',
      'technical',
      'other',
    ])
    .withMessage('Invalid category'),
  sanitizeText('subject')
    .exists({ checkFalsy: true })
    .withMessage('subject is required')
    .isLength({ min: 3, max: 200 })
    .withMessage('subject must be 3–200 characters'),
  sanitizeText('message')
    .exists({ checkFalsy: true })
    .withMessage('message is required')
    .isLength({ min: 1, max: 5000 })
    .withMessage('message must be 1–5000 characters'),
];

const replyValidators = [
  sanitizeText('message')
    .exists({ checkFalsy: true })
    .withMessage('message is required')
    .isLength({ min: 1, max: 5000 })
    .withMessage('message must be 1–5000 characters'),
];

/** Investor support — mounted at /api/v1/investor/support */
export const investorSupportRouter = Router();
investorSupportRouter.use(authenticate, requireInvestor);

investorSupportRouter.post(
  '/tickets',
  uploadLimiter,
  parseAttachments,
  createTicketValidators,
  validate,
  createInvestorTicket
);
investorSupportRouter.get('/tickets', listMyTickets);
investorSupportRouter.get('/tickets/:id', getMyTicket);
investorSupportRouter.post(
  '/tickets/:id/reply',
  uploadLimiter,
  parseAttachments,
  replyValidators,
  validate,
  replyMyTicket
);
investorSupportRouter.patch('/tickets/:id/reopen', reopenMyTicket);

/** Admin support — mounted at /api/v1/admin/support */
export const adminSupportRouter = Router();
adminSupportRouter.use(authenticate, requireAdmin);

adminSupportRouter.get('/summary', getSupportSummary);
adminSupportRouter.get('/investor/:id/tickets', getInvestorSupportTickets);
adminSupportRouter.get('/tickets/escalated', listEscalatedTickets);
adminSupportRouter.get('/tickets', listAllTickets);
adminSupportRouter.get('/tickets/:id', getAdminTicket);
adminSupportRouter.post(
  '/tickets/:id/reply',
  uploadLimiter,
  parseAttachments,
  replyValidators,
  validate,
  adminReplyTicket
);
adminSupportRouter.patch(
  '/tickets/:id/status',
  adminMutationLimiter,
  ticketStatusBody,
  validate,
  patchTicketStatus
);
adminSupportRouter.patch(
  '/tickets/:id/assign',
  adminMutationLimiter,
  assignAdminBody,
  validate,
  assignTicketToAdmin
);

export default investorSupportRouter;
