import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  requireAdmin,
  requireSuperAdmin,
} from '../middleware/role.middleware.js';
import { adminMutationLimiter } from '../middleware/rateLimit.middleware.js';
import { validate, body, sanitizeText } from '../middleware/validate.middleware.js';
import { uuidParam, amountBody, optionalRemark } from '../middleware/routeValidators.js';
import {
  submitSingleRevenueBackdate,
  submitBulkRevenueBackdate,
  listBackdateRequests,
  approveBackdateRequest,
  rejectBackdateRequest,
  previewCapitalBackdate,
  submitCapitalBackdate,
  submitNewInvestorBackdate,
  getBackdateHistory,
  getBackdateRequestLog,
} from '../controllers/backdate.controller.js';

/** Mounted at /api/v1/admin/backdate */
const backdateRouter = Router();

backdateRouter.use(authenticate, requireAdmin);

const investorIdBody = body('investor_id')
  .exists({ checkFalsy: true })
  .isUUID()
  .withMessage('investor_id must be a valid UUID');

const isoDateBody = (field) =>
  body(field)
    .exists({ checkFalsy: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage(`${field} must be YYYY-MM-DD`);

backdateRouter.post(
  '/revenue/single',
  adminMutationLimiter,
  [investorIdBody, isoDateBody('date'), optionalRemark()],
  validate,
  submitSingleRevenueBackdate
);
backdateRouter.post(
  '/revenue/bulk',
  adminMutationLimiter,
  [investorIdBody, isoDateBody('start_date'), isoDateBody('end_date'), optionalRemark()],
  validate,
  submitBulkRevenueBackdate
);

backdateRouter.post(
  '/capital/preview',
  [investorIdBody, isoDateBody('date'), amountBody('amount')],
  validate,
  previewCapitalBackdate
);
backdateRouter.post(
  '/capital',
  adminMutationLimiter,
  [investorIdBody, isoDateBody('date'), amountBody('amount'), optionalRemark()],
  validate,
  submitCapitalBackdate
);

backdateRouter.post(
  '/new-investor',
  adminMutationLimiter,
  submitNewInvestorBackdate
);

backdateRouter.get('/history', getBackdateHistory);
backdateRouter.get('/requests/:id/log', getBackdateRequestLog);
backdateRouter.get('/requests', listBackdateRequests);

backdateRouter.patch(
  '/requests/:id/approve',
  requireSuperAdmin,
  adminMutationLimiter,
  uuidParam('id'),
  validate,
  approveBackdateRequest
);
backdateRouter.patch(
  '/requests/:id/reject',
  requireSuperAdmin,
  adminMutationLimiter,
  uuidParam('id'),
  sanitizeText('reason')
    .exists({ checkFalsy: true })
    .withMessage('reason is required'),
  validate,
  rejectBackdateRequest
);

export default backdateRouter;
