import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  requireAdmin,
  requireInvestor,
} from '../middleware/role.middleware.js';
import { adminMutationLimiter, financialLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  amountBody,
  optionalRemark,
  uuidParam,
} from '../middleware/routeValidators.js';
import {
  getInvestorRoi,
  setInvestorDefaultRoi,
  addInvestorTermRoi,
  removeInvestorTermRoi,
  getInvestorActiveRoi,
  patchRevenueSettings,
  getMyRevenueTransactions,
  getMyRevenueSummary,
  getMyRevenueMonthly,
  getAdminInvestorRevenueTransactions,
  getAdminInvestorRevenueSummary,
  adminManualCredit,
  adminManualDebit,
  reverseRevenueEntry,
  pauseInvestorRevenue,
  resumeInvestorRevenue,
  getRevenueDashboard,
  listRevenueInvestors,
  getTodayRevenueSchedule,
  listCronLogs,
} from '../controllers/revenue.controller.js';

/** Investor revenue routes — mounted at /api/v1/investor/revenue */
export const investorRevenueRouter = Router();
investorRevenueRouter.use(authenticate, requireInvestor);
investorRevenueRouter.get('/transactions', getMyRevenueTransactions);
investorRevenueRouter.get('/summary', getMyRevenueSummary);
investorRevenueRouter.get('/monthly', getMyRevenueMonthly);

/** Admin revenue routes — mounted at /api/v1/admin/revenue */
const adminRevenueRouter = Router();
adminRevenueRouter.use(authenticate, requireAdmin);

adminRevenueRouter.get('/dashboard', getRevenueDashboard);
adminRevenueRouter.get('/investors', listRevenueInvestors);
adminRevenueRouter.get('/schedule/today', getTodayRevenueSchedule);

adminRevenueRouter.get('/investor/:id/roi', getInvestorRoi);
adminRevenueRouter.post('/investor/:id/roi/default', setInvestorDefaultRoi);
adminRevenueRouter.post('/investor/:id/roi/term', addInvestorTermRoi);
adminRevenueRouter.delete(
  '/investor/:id/roi/term/:termId',
  removeInvestorTermRoi
);
adminRevenueRouter.get('/investor/:id/roi/active', getInvestorActiveRoi);
adminRevenueRouter.patch('/settings/:id', patchRevenueSettings);

adminRevenueRouter.get(
  '/investor/:id/transactions',
  getAdminInvestorRevenueTransactions
);
adminRevenueRouter.get('/investor/:id/summary', getAdminInvestorRevenueSummary);
adminRevenueRouter.post(
  '/investor/:id/credit',
  financialLimiter,
  uuidParam('id'),
  amountBody('amount'),
  optionalRemark(),
  validate,
  adminManualCredit
);
adminRevenueRouter.post(
  '/investor/:id/debit',
  financialLimiter,
  uuidParam('id'),
  amountBody('amount'),
  optionalRemark(),
  validate,
  adminManualDebit
);
adminRevenueRouter.patch(
  '/entry/:id/reverse',
  adminMutationLimiter,
  uuidParam('id'),
  validate,
  reverseRevenueEntry
);
adminRevenueRouter.patch(
  '/investor/:id/pause',
  adminMutationLimiter,
  uuidParam('id'),
  validate,
  pauseInvestorRevenue
);
adminRevenueRouter.patch(
  '/investor/:id/resume',
  adminMutationLimiter,
  uuidParam('id'),
  validate,
  resumeInvestorRevenue
);

/** Mounted at /api/v1/admin/cron-logs */
export const adminCronLogsRouter = Router();
adminCronLogsRouter.use(authenticate, requireAdmin);
adminCronLogsRouter.get('/', listCronLogs);

export default adminRevenueRouter;
