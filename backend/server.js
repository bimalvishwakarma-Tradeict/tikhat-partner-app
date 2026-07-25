import dotenv from 'dotenv';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import app, { markCronActive, resetCronStatuses } from './src/app.js';
import { logger } from './src/utils/logger.js';
import { startAccountUnlockCron } from './src/crons/unlock.cron.js';
import { startBackupCron } from './src/crons/backup.cron.js';
import { startWithdrawalReminderCron } from './src/crons/withdrawal.cron.js';
import { startRevenueCreditCron } from './src/crons/revenue.cron.js';
import { startRoiTermExpiryAlertCron } from './src/crons/roiAlert.cron.js';
import { startTicketEscalationCron } from './src/crons/escalation.cron.js';
import { startMonthlySummaryCron } from './src/crons/summary.cron.js';
import { startEmailRetryCron } from './src/services/email.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { validateEnv } = require('../scripts/validate-env.js');

dotenv.config({ path: path.join(__dirname, '.env') });

// Fail fast when required env vars are missing (Task 27.2)
validateEnv(process.env, { exit: true });

const PORT = process.env.PORT || 5000;

/**
 * Register all scheduled jobs in the required startup order.
 * Core 7 (health): unlock → backup → withdrawal → revenue → roiAlert → escalation → summary
 * Plus email retry (delivery monitoring from Task 9.2).
 */
export function registerAllCrons() {
  resetCronStatuses();

  startAccountUnlockCron();
  markCronActive('unlock');

  startBackupCron();
  markCronActive('backup');

  startWithdrawalReminderCron();
  markCronActive('withdrawal');

  startRevenueCreditCron();
  markCronActive('revenue');

  startRoiTermExpiryAlertCron();
  markCronActive('roiAlert');

  startTicketEscalationCron();
  markCronActive('escalation');

  startMonthlySummaryCron();
  markCronActive('summary');

  // Delivery monitoring (not part of the core-7 health set)
  startEmailRetryCron();

  logger.info('All cron jobs registered', {
    order: [
      'unlock',
      'backup',
      'withdrawal',
      'revenue',
      'roiAlert',
      'escalation',
      'summary',
      'emailRetry',
    ],
  });
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return path.resolve(entry) === path.resolve(__filename);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  app.listen(PORT, () => {
    logger.info(`Tikhat Partner backend running on port ${PORT}`, {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });

    registerAllCrons();
  });
}