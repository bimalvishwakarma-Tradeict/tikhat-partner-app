import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';
import { getAdminDashboard } from '../controllers/adminDashboard.controller.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', getAdminDashboard);

export default router;
