import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireInvestor } from '../middleware/role.middleware.js';
import { getInvestorDashboard } from '../controllers/dashboard.controller.js';

const router = Router();

router.use(authenticate, requireInvestor);

router.get('/', getInvestorDashboard);

export default router;
