import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  requireAdmin,
  requireSuperAdmin,
} from '../middleware/role.middleware.js';
import {
  getAllSettings,
  patchGlobalSettings,
  getMaintenanceMode,
  patchMaintenanceMode,
  patchInvestorRevenueSettings,
  listEmailLogs,
  listFailedEmailLogs,
  retryEmailLog,
  getPublicTerms,
  getPublicPrivacy,
  getAdminTerms,
  getAdminPrivacy,
  patchTerms,
  patchPrivacy,
  getTermsHistory,
  triggerManualBackup,
  listBackupHistory,
  getEmailNotificationSettings,
  patchEmailNotificationSettings,
} from '../controllers/settings.controller.js';

/** Mounted at /api/v1/admin/settings */
const settingsRouter = Router();

settingsRouter.use(authenticate, requireAdmin);

settingsRouter.get('/', getAllSettings);
settingsRouter.patch('/', requireSuperAdmin, patchGlobalSettings);
settingsRouter.patch('/global', requireSuperAdmin, patchGlobalSettings);

settingsRouter.get('/maintenance', getMaintenanceMode);
settingsRouter.patch(
  '/maintenance',
  requireSuperAdmin,
  patchMaintenanceMode
);

settingsRouter.get('/terms', getAdminTerms);
settingsRouter.get('/terms/history', getTermsHistory);
settingsRouter.patch('/terms', requireSuperAdmin, patchTerms);

settingsRouter.get('/privacy', getAdminPrivacy);
settingsRouter.patch('/privacy', requireSuperAdmin, patchPrivacy);

settingsRouter.get('/backup/history', listBackupHistory);
settingsRouter.post('/backup', requireSuperAdmin, triggerManualBackup);

settingsRouter.get('/email-notifications', getEmailNotificationSettings);
settingsRouter.patch(
  '/email-notifications',
  requireSuperAdmin,
  patchEmailNotificationSettings
);

export default settingsRouter;

/**
 * Per-investor revenue settings — mounted at /api/v1/admin/revenue
 * (avoids modifying revenue.routes.js / ROI management routes)
 */
export const adminRevenueInvestorSettingsRouter = Router();
adminRevenueInvestorSettingsRouter.use(authenticate, requireAdmin);
adminRevenueInvestorSettingsRouter.patch(
  '/investor/:id/settings',
  patchInvestorRevenueSettings
);

/**
 * Email delivery logs — mounted at /api/v1/admin/email-logs
 */
export const adminEmailLogsRouter = Router();
adminEmailLogsRouter.use(authenticate, requireAdmin);
adminEmailLogsRouter.get('/failed', listFailedEmailLogs);
adminEmailLogsRouter.get('/', listEmailLogs);
adminEmailLogsRouter.post('/:id/retry', retryEmailLog);

/**
 * Public legal pages — mounted at /api/v1/public
 */
export const publicLegalRouter = Router();
publicLegalRouter.get('/terms', getPublicTerms);
publicLegalRouter.get('/privacy', getPublicPrivacy);
