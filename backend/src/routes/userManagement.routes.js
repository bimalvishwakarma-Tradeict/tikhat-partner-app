import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAdmin, requireSuperAdmin } from '../middleware/role.middleware.js';
import {
  trackConcurrentEdit,
  releaseConcurrentEdit,
} from '../middleware/concurrent.middleware.js';
import {
  listInvestors,
  getInvestorById,
  createInvestor,
  updateInvestor,
  approveInvestor,
  rejectInvestor,
  pauseInvestor,
  resumeInvestor,
  unlockInvestor,
  softDeleteInvestor,
  flushInvestorTransactions,
  updateJoiningDate,
  releaseInvestorEdit,
  listPendingProfileRequests,
  listInvestorProfileRequests,
  approveProfileRequest,
  rejectProfileRequest,
  getInvestorKyc,
  downloadAdminFile,
  updateInvestorKycStatus,
  overrideKycField,
} from '../controllers/userManagement.controller.js';

/** Mounted at /api/v1/admin/investors */
const investorsRouter = Router();

investorsRouter.use(authenticate, requireAdmin);

investorsRouter.get('/', listInvestors);
investorsRouter.post('/', createInvestor);

investorsRouter.get('/:id/kyc', getInvestorKyc);
investorsRouter.patch('/:id/kyc/status', updateInvestorKycStatus);
investorsRouter.post('/:id/kyc/override', overrideKycField);

investorsRouter.patch('/:id/approve', approveInvestor);
investorsRouter.patch('/:id/reject', rejectInvestor);
investorsRouter.patch('/:id/pause', pauseInvestor);
investorsRouter.patch('/:id/resume', resumeInvestor);
investorsRouter.patch('/:id/unlock', unlockInvestor);
investorsRouter.patch('/:id/joining-date', updateJoiningDate);
investorsRouter.delete(
  '/:id/edit',
  releaseConcurrentEdit,
  releaseInvestorEdit
);
investorsRouter.delete(
  '/:id/flush-transactions',
  requireSuperAdmin,
  flushInvestorTransactions
);

investorsRouter.get('/:id', trackConcurrentEdit, getInvestorById);
investorsRouter.patch('/:id', updateInvestor);
investorsRouter.delete('/:id', softDeleteInvestor);

/** Mounted at /api/v1/admin/profile-requests */
const profileRequestsRouter = Router();

profileRequestsRouter.use(authenticate, requireAdmin);

profileRequestsRouter.get('/', listPendingProfileRequests);
profileRequestsRouter.get('/investor/:id', listInvestorProfileRequests);
profileRequestsRouter.patch('/:id/approve', approveProfileRequest);
profileRequestsRouter.patch('/:id/reject', rejectProfileRequest);

/** Mounted at /api/v1/admin/files */
const adminFilesRouter = Router();

adminFilesRouter.use(authenticate, requireAdmin);
adminFilesRouter.get('/:fileId/download', downloadAdminFile);

export { investorsRouter, profileRequestsRouter, adminFilesRouter };
export default investorsRouter;
