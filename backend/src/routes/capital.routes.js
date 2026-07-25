import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireInvestor } from '../middleware/role.middleware.js';
import {
  uploadPaymentScreenshot,
  handleUploadError,
} from '../middleware/upload.middleware.js';
import {
  financialLimiter,
  uploadLimiter,
} from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  depositBodyValidators,
  withdrawBodyValidators,
  revenueWithdrawBodyValidators,
  uuidParam,
} from '../middleware/routeValidators.js';
import {
  submitDeposit,
  listTransactions,
  getBalance,
  submitWithdraw,
  cancelWithdraw,
  submitRevenueWithdraw,
  getRevenueWithdrawalBalance,
  listWithdrawals,
  getWithdrawalSummary,
} from '../controllers/capital.controller.js';

const router = Router();

router.use(authenticate, requireInvestor);

router.post(
  '/deposit',
  uploadLimiter,
  financialLimiter,
  (req, res, next) => {
    uploadPaymentScreenshot.single('payment_screenshot')(req, res, (err) => {
      if (err) {
        return handleUploadError(err, req, res, next);
      }
      return next();
    });
  },
  depositBodyValidators,
  validate,
  submitDeposit
);

router.post(
  '/withdraw',
  financialLimiter,
  withdrawBodyValidators,
  validate,
  submitWithdraw
);

router.patch(
  '/withdraw/:id/cancel',
  financialLimiter,
  uuidParam('id'),
  validate,
  cancelWithdraw
);

router.get('/transactions', listTransactions);

router.get('/balance', getBalance);

export default router;

/**
 * Revenue withdrawal routes — mounted at /api/v1/investor/revenue
 * (keeps capital withdraw handler unchanged)
 */
export const investorRevenueWithdrawRouter = Router();
investorRevenueWithdrawRouter.use(authenticate, requireInvestor);
investorRevenueWithdrawRouter.post(
  '/withdraw',
  financialLimiter,
  revenueWithdrawBodyValidators,
  validate,
  submitRevenueWithdraw
);
investorRevenueWithdrawRouter.get('/balance', getRevenueWithdrawalBalance);

/**
 * Withdrawal history — mounted at /api/v1/investor/withdrawals
 */
export const investorWithdrawalsRouter = Router();
investorWithdrawalsRouter.use(authenticate, requireInvestor);
investorWithdrawalsRouter.get('/summary', getWithdrawalSummary);
investorWithdrawalsRouter.get('/', listWithdrawals);
