import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireInvestor } from '../middleware/role.middleware.js';
import {
  validate,
  sanitizeText,
  body,
} from '../middleware/validate.middleware.js';
import { isValidEmail, isValidIndianMobile } from '../utils/validators.js';
import {
  createUploader,
  uploadProfilePhoto as uploadProfilePhotoMw,
  handleUploadError,
} from '../middleware/upload.middleware.js';
import {
  getMyProfile,
  submitProfileUpdates,
  uploadProfilePhoto,
  uploadKycDocuments,
  requestEmailChange,
  requestMobileChange,
  dismissBanner,
  selfDeactivate,
  listMyUpdateRequests,
} from '../controllers/investorProfile.controller.js';

const router = Router();
const kycTempUpload = createUploader('tmp');

router.use(authenticate, requireInvestor);

router.get('/', getMyProfile);
router.patch('/', submitProfileUpdates);
router.get('/update-requests', listMyUpdateRequests);
router.patch('/dismiss-banner', dismissBanner);
router.post('/deactivate', selfDeactivate);

router.post(
  '/request-email-change',
  [
    sanitizeText('new_email'),
    body('new_email')
      .exists({ checkFalsy: true })
      .withMessage('new_email is required')
      .custom((value) => {
        if (!isValidEmail(value)) {
          throw new Error('Valid email address is required');
        }
        return true;
      }),
  ],
  validate,
  requestEmailChange
);

router.post(
  '/request-mobile-change',
  [
    sanitizeText('new_mobile'),
    body('new_mobile')
      .exists({ checkFalsy: true })
      .withMessage('new_mobile is required')
      .custom((value) => {
        if (!isValidIndianMobile(value)) {
          throw new Error('Valid Indian mobile number is required');
        }
        return true;
      }),
  ],
  validate,
  requestMobileChange
);

router.post('/photo', (req, res, next) => {
  uploadProfilePhotoMw.single('photo')(req, res, (err) => {
    if (err) {
      return handleUploadError(err, req, res, next);
    }
    return uploadProfilePhoto(req, res);
  });
});

router.post('/documents', (req, res, next) => {
  kycTempUpload.fields([
    { name: 'pan_front', maxCount: 1 },
    { name: 'pan_back', maxCount: 1 },
    { name: 'aadhar_front', maxCount: 1 },
    { name: 'aadhar_back', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      return handleUploadError(err, req, res, next);
    }
    return uploadKycDocuments(req, res);
  });
});

export default router;
