import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  requireInvestor,
  requireAdmin,
} from '../middleware/role.middleware.js';
import { adminMutationLimiter } from '../middleware/rateLimit.middleware.js';
import { validate, sanitizeText, body } from '../middleware/validate.middleware.js';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  unreadCount,
  adminNotificationSummary,
  listAdminNotifications,
  getPendingCounts,
  broadcastNotification,
} from '../controllers/notification.controller.js';

const investorRouter = Router();
const adminRouter = Router();

investorRouter.use(authenticate, requireInvestor);

investorRouter.get('/', listNotifications);
investorRouter.get('/unread-count', unreadCount);
investorRouter.patch('/read-all', markAllNotificationsRead);
investorRouter.patch('/:id/read', markNotificationRead);

adminRouter.use(authenticate, requireAdmin);

adminRouter.get('/pending-counts', getPendingCounts);
adminRouter.get('/summary', adminNotificationSummary);
adminRouter.post(
  '/broadcast',
  adminMutationLimiter,
  [
    body('target_type')
      .exists({ checkFalsy: true })
      .isIn(['single', 'selected', 'all'])
      .withMessage('target_type must be single, selected, or all'),
    sanitizeText('title')
      .exists({ checkFalsy: true })
      .isLength({ min: 1, max: 200 })
      .withMessage('title is required (max 200)'),
    sanitizeText('body')
      .exists({ checkFalsy: true })
      .isLength({ min: 1, max: 5000 })
      .withMessage('body is required (max 5000)'),
    body('send_email').optional().isBoolean().toBoolean(),
    body('target_ids').optional().isArray(),
  ],
  validate,
  broadcastNotification
);
adminRouter.get('/', listAdminNotifications);

export { investorRouter, adminRouter };
export default investorRouter;
