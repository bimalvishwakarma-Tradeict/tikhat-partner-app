import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  requireAdmin,
  requireInvestor,
} from '../middleware/role.middleware.js';
import {
  adminInvestorStatement,
  investorOwnStatement,
  adminCapitalReport,
  adminRevenueReport,
  adminFinancialYearReport,
} from '../controllers/report.controller.js';

/** Mounted at /api/v1/admin/reports */
export const adminReportsRouter = Router();
adminReportsRouter.use(authenticate, requireAdmin);

adminReportsRouter.get('/investor/:id/statement', adminInvestorStatement);
adminReportsRouter.get('/capital', adminCapitalReport);
adminReportsRouter.get('/revenue', adminRevenueReport);
adminReportsRouter.get('/financial-year', adminFinancialYearReport);

/** Mounted at /api/v1/investor/reports */
export const investorReportsRouter = Router();
investorReportsRouter.use(authenticate, requireInvestor);
investorReportsRouter.get('/statement', investorOwnStatement);

export default adminReportsRouter;
