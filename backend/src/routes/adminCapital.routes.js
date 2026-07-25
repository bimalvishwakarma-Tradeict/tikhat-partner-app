import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';
import { adminMutationLimiter, financialLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  amountBody,
  optionalAdminRemark,
  optionalRemark,
  optionalIsoDate,
  optionalPaymentUtr,
  paymentUtrBody,
  uuidParam,
} from '../middleware/routeValidators.js';
import {
  getCapitalDashboard,
  listInvestors,
  getInvestorCapital,
  getInvestorCapitalFull,
  listRequests,
  approveDeposit,
  rejectDeposit,
  approveWithdraw,
  processWithdraw,
  completeWithdraw,
  rejectWithdraw,
  bulkApproveWithdraw,
  creditCapital,
  debitCapital,
  lockCapital,
  unlockCapital,
  undoLastAction,
} from '../controllers/adminCapital.controller.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/dashboard', getCapitalDashboard);
router.get('/investors', listInvestors);
router.get('/requests', listRequests);
router.get('/investor/:id/full', uuidParam('id'), validate, getInvestorCapitalFull);
router.get('/investor/:id', uuidParam('id'), validate, getInvestorCapital);

router.patch(
  '/deposit/:id/approve',
  adminMutationLimiter,
  uuidParam('id'),
  optionalAdminRemark,
  validate,
  approveDeposit
);
router.patch(
  '/deposit/:id/reject',
  adminMutationLimiter,
  uuidParam('id'),
  optionalAdminRemark,
  validate,
  rejectDeposit
);

router.patch(
  '/withdraw/:id/approve',
  adminMutationLimiter,
  uuidParam('id'),
  optionalAdminRemark,
  optionalPaymentUtr,
  optionalIsoDate('payment_date'),
  validate,
  approveWithdraw
);
router.patch(
  '/withdraw/:id/process',
  adminMutationLimiter,
  uuidParam('id'),
  validate,
  processWithdraw
);
router.patch(
  '/withdraw/:id/complete',
  adminMutationLimiter,
  uuidParam('id'),
  paymentUtrBody,
  optionalIsoDate('payment_date'),
  validate,
  completeWithdraw
);
router.patch(
  '/withdraw/:id/reject',
  adminMutationLimiter,
  uuidParam('id'),
  optionalAdminRemark,
  validate,
  rejectWithdraw
);
router.post('/withdraw/bulk-approve', adminMutationLimiter, bulkApproveWithdraw);

router.post(
  '/investor/:id/credit',
  financialLimiter,
  uuidParam('id'),
  amountBody('amount'),
  optionalRemark(),
  validate,
  creditCapital
);
router.post(
  '/investor/:id/debit',
  financialLimiter,
  uuidParam('id'),
  amountBody('amount'),
  optionalRemark(),
  validate,
  debitCapital
);
router.patch(
  '/investor/:id/lock',
  adminMutationLimiter,
  uuidParam('id'),
  validate,
  lockCapital
);
router.patch(
  '/investor/:id/unlock',
  adminMutationLimiter,
  uuidParam('id'),
  validate,
  unlockCapital
);
router.post(
  '/investor/:id/undo',
  adminMutationLimiter,
  uuidParam('id'),
  validate,
  undoLastAction
);

export default router;
