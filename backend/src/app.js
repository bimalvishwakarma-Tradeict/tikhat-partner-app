import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { query } from './db/connection.js';
import { generalLimiter } from './middleware/rateLimit.middleware.js';
import { handleUploadError } from './middleware/upload.middleware.js';
import {
  investorRouter as notificationInvestorRoutes,
  adminRouter as notificationAdminRoutes,
} from './routes/notification.routes.js';
import auditRoutes, {
  adminCronLogsRouter,
} from './routes/audit.routes.js';
import authRoutes from './routes/auth.routes.js';
import investorProfileRoutes from './routes/investorProfile.routes.js';
import {
  adminAuthRouter,
  adminManagementRouter,
} from './routes/admin.routes.js';
import capitalRoutes, {
  investorRevenueWithdrawRouter,
  investorWithdrawalsRouter,
} from './routes/capital.routes.js';
import adminCapitalRoutes from './routes/adminCapital.routes.js';
import revenueRoutes, {
  investorRevenueRouter,
} from './routes/revenue.routes.js';
import settingsRoutes, {
  adminRevenueInvestorSettingsRouter,
  adminEmailLogsRouter,
  publicLegalRouter,
} from './routes/settings.routes.js';
import adminWithdrawalRoutes from './routes/adminWithdrawal.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import adminDashboardRoutes from './routes/adminDashboard.routes.js';
import {
  investorSupportRouter,
  adminSupportRouter,
} from './routes/support.routes.js';
import backdateRoutes from './routes/backdate.routes.js';
import {
  investorsRouter as userManagementRoutes,
  profileRequestsRouter,
  adminFilesRouter,
} from './routes/userManagement.routes.js';
import {
  adminReportsRouter,
  investorReportsRouter,
} from './routes/report.routes.js';
import { maintenanceMiddleware } from './controllers/settings.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();

/** Core cron keys reported by GET /api/health */
const CRON_KEYS = Object.freeze([
  'revenue',
  'unlock',
  'backup',
  'summary',
  'escalation',
  'roiAlert',
  'withdrawal',
]);

/** @type {Record<string, 'active' | 'inactive'>} */
const cronStatuses = Object.fromEntries(
  CRON_KEYS.map((key) => [key, 'inactive'])
);

/**
 * Mark a core cron as active after it is scheduled.
 * @param {string} name
 */
export function markCronActive(name) {
  if (Object.prototype.hasOwnProperty.call(cronStatuses, name)) {
    cronStatuses[name] = 'active';
  }
}

/**
 * Reset all cron statuses to inactive (used before re-registering).
 */
export function resetCronStatuses() {
  for (const key of CRON_KEYS) {
    cronStatuses[key] = 'inactive';
  }
}

/**
 * @returns {Record<string, 'active' | 'inactive'>}
 */
export function getCronStatuses() {
  return { ...cronStatuses };
}

// Behind Cloudflare / Nginx — required for correct client IP + rate limits
app.set('trust proxy', 1);

const isDevelopment = process.env.NODE_ENV === 'development';

/** Production: comma-separated FRONTEND_URL allowlist */
const allowedOrigins = String(process.env.FRONTEND_URL || 'https://tikhatpartner.online')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: true,
    hsts: true,
    noSniff: true,
    xssFilter: true,
  })
);

app.use(
  cors({
    // Dev: reflect any Origin (localhost / LAN Expo web). Prod: FRONTEND_URL list only.
    origin: isDevelopment
      ? true
      : (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204,
    preflightContinue: false,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', async (req, res) => {
  let database = 'error';

  try {
    await query('SELECT 1 AS ok');
    database = 'ok';
  } catch (error) {
    logger.error(`[Health] Database check failed: ${error.message}`, {
      error,
    });
    database = 'error';
  }

  const payload = {
    success: database === 'ok',
    message: database === 'ok' ? 'Server running' : 'Database unavailable',
    server: 'ok',
    database,
    crons: getCronStatuses(),
  };

  return res.status(database === 'ok' ? 200 : 503).json(payload);
});

app.use('/api', (req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  return generalLimiter(req, res, next);
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/auth/admin', adminAuthRouter);
app.use('/api/v1/public', publicLegalRouter);

app.use(maintenanceMiddleware);

app.use('/api/v1/investor/profile', investorProfileRoutes);
app.use('/api/v1/investor/capital', capitalRoutes);
app.use('/api/v1/investor/withdrawals', investorWithdrawalsRouter);
app.use('/api/v1/investor/revenue', investorRevenueWithdrawRouter);
app.use('/api/v1/investor/revenue', investorRevenueRouter);
app.use('/api/v1/investor/dashboard', dashboardRoutes);
app.use('/api/v1/investor/support', investorSupportRouter);
app.use('/api/v1/investor/reports', investorReportsRouter);
app.use('/api/v1/admin/capital', adminCapitalRoutes);
app.use('/api/v1/admin/withdrawals', adminWithdrawalRoutes);
app.use('/api/v1/admin/dashboard', adminDashboardRoutes);
app.use('/api/v1/admin/support', adminSupportRouter);
app.use('/api/v1/admin/revenue', adminRevenueInvestorSettingsRouter);
app.use('/api/v1/admin/revenue', revenueRoutes);
app.use('/api/v1/admin/cron-logs', adminCronLogsRouter);
app.use('/api/v1/admin/reports', adminReportsRouter);
app.use('/api/v1/admin/settings', settingsRoutes);
app.use('/api/v1/admin/email-logs', adminEmailLogsRouter);
app.use('/api/v1/admin/backdate', backdateRoutes);
app.use('/api/v1/admin/investors', userManagementRoutes);
app.use('/api/v1/admin/profile-requests', profileRequestsRouter);
app.use('/api/v1/admin/files', adminFilesRouter);
app.use('/api/v1/admin', adminManagementRouter);
app.use('/api/v1/notifications', notificationInvestorRoutes);
app.use('/api/v1/admin/notifications', notificationAdminRoutes);
app.use('/api/v1/admin/audit-logs', auditRoutes);

app.use(handleUploadError);

app.use((err, req, res, next) => {
  logger.error(`[App] Unhandled error: ${err.message}`, { error: err });

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'Origin not allowed',
      error: 'AUTH_FORBIDDEN',
    });
  }

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: 'INTERNAL_ERROR',
  });
});

export default app;
