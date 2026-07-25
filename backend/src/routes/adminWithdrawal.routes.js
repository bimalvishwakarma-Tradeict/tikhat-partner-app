import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';
import { adminMutationLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  optionalAdminRemark,
  optionalIsoDate,
  paymentUtrBody,
  uuidParam,
} from '../middleware/routeValidators.js';
import {
  listWithdrawals,
  listPendingWithdrawals,
  reviewWithdrawal,
  approveWithdrawal,
  processWithdrawal,
  completeWithdrawal,
  rejectWithdrawal,
  bulkApproveWithdrawals,
} from '../controllers/adminWithdrawal.controller.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', listWithdrawals);
router.get('/pending', listPendingWithdrawals);
router.post('/bulk-approve', adminMutationLimiter, bulkApproveWithdrawals);

router.patch(
  '/:id/review',
  adminMutationLimiter,
  uuidParam('id'),
  validate,
  reviewWithdrawal
);
router.patch(
  '/:id/approve',
  adminMutationLimiter,
  uuidParam('id'),
  optionalAdminRemark,
  validate,
  approveWithdrawal
);
router.patch(
  '/:id/process',
  adminMutationLimiter,
  uuidParam('id'),
  validate,
  processWithdrawal
);
router.patch(
  '/:id/complete',
  adminMutationLimiter,
  uuidParam('id'),
  paymentUtrBody,
  optionalIsoDate('payment_date'),
  validate,
  completeWithdrawal
);
router.patch(
  '/:id/reject',
  adminMutationLimiter,
  uuidParam('id'),
  optionalAdminRemark,
  validate,
  rejectWithdrawal
);

export default router;
