import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';
import {
  listAuditLogs,
  listInvestorAuditLogs,
  listCronLogs,
  listLatestCronLogs,
} from '../controllers/audit.controller.js';

/** Mounted at /api/v1/admin/audit-logs */
const auditRouter = Router();

auditRouter.use(authenticate, requireAdmin);

auditRouter.get('/investor/:id', listInvestorAuditLogs);
auditRouter.get('/', listAuditLogs);

// Intentionally no DELETE (or any mutating) routes — audit logs are permanent.

export default auditRouter;

/**
 * Mounted at /api/v1/admin/cron-logs
 * (Task 12.5 — filtering + latest; replaces earlier revenue-mounted router)
 */
export const adminCronLogsRouter = Router();
adminCronLogsRouter.use(authenticate, requireAdmin);
adminCronLogsRouter.get('/latest', listLatestCronLogs);
adminCronLogsRouter.get('/', listCronLogs);
