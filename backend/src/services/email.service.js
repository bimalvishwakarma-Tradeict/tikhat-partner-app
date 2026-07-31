import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import React from 'react';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { register } from 'tsx/esm/api';
import cron from 'node-cron';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate, TIMEZONE } from '../utils/formatDate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

register();

const FROM_ADDRESS = 'Tikhat Partner <noreply@tikhatpartner.online>';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = Number(process.env.EMAIL_RETRY_DELAY_MS) || 5 * 60 * 1000;
const EMAIL_RETRY_JOB_NAME = 'email_retry';
/** Every 5 minutes */
const EMAIL_RETRY_CRON = '*/5 * * * *';

const IMMEDIATE_TEMPLATES = new Set(['otp', 'approval', 'rejection']);

/** Investor email notification toggles in global_settings (defaults). */
export const EMAIL_NOTIFICATION_DEFAULTS = Object.freeze({
  email_on_registration: true,
  email_on_approval: true,
  email_on_rejection: true,
  email_on_capital_deposit: true,
  email_on_capital_withdrawal: true,
  email_on_revenue_credit: true,
  email_on_revenue_withdrawal: true,
  email_on_support_ticket: true,
  email_on_support_reply: true,
  email_on_support_closed: true,
  email_on_kyc_update: true,
  email_on_account_pause: false,
  email_on_profile_update: true,
});

export const EMAIL_NOTIFICATION_KEYS = Object.freeze(
  Object.keys(EMAIL_NOTIFICATION_DEFAULTS)
);

const EMAIL_NOTIFICATION_CACHE_TTL_MS = 5 * 60 * 1000;

/** @type {Record<string, boolean> | null} */
let emailNotificationSettingsCache = null;
let emailNotificationSettingsCachedAt = 0;

const TEMPLATE_FILES = Object.freeze({
  approval: 'approval.email.jsx',
  rejection: 'rejection.email.jsx',
  'revenue-credit': 'revenue-credit.email.jsx',
  'capital-transaction': 'capital-transaction.email.jsx',
  withdrawal: 'withdrawal.email.jsx',
  support: 'support.email.jsx',
  'monthly-summary': 'monthly-summary.email.jsx',
  otp: 'otp.email.jsx',
  'custom-notification': 'custom-notification.email.jsx',
});

const AMOUNT_FIELDS = [
  'amount',
  'runningBalance',
  'amountRestored',
  'totalRevenueCredited',
  'capitalBalance',
  'revenueWithdrawn',
  'capitalWithdrawn',
  'closingRevenueBalance',
];

const DATE_FIELDS = ['creditDate', 'date', 'transactionDate'];

const templateCache = new Map();
const pendingDeliveries = new Map();

/** Serialize Resend API calls (~6/sec) to stay under Resend's 10 req/sec limit. */
const EMAIL_SEND_GAP_MS = 150;
const emailSendQueue = [];
let isProcessingEmailQueue = false;

let resendClient = null;
let schemaReady = false;

/**
 * Process queued Resend sends with a gap between each attempt.
 */
async function processEmailSendQueue() {
  if (isProcessingEmailQueue) {
    return;
  }
  isProcessingEmailQueue = true;
  try {
    while (emailSendQueue.length > 0) {
      const job = emailSendQueue.shift();
      try {
        const result = await job.run();
        job.resolve(result);
      } catch (error) {
        job.reject(error);
      }
      if (emailSendQueue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, EMAIL_SEND_GAP_MS));
      }
    }
  } finally {
    isProcessingEmailQueue = false;
    if (emailSendQueue.length > 0) {
      void processEmailSendQueue();
    }
  }
}

/**
 * Enqueue a Resend send so bulk callers (e.g. backdate approval) cannot burst.
 * @param {() => Promise<unknown>} run
 * @returns {Promise<unknown>}
 */
function enqueueResendSend(run) {
  return new Promise((resolve, reject) => {
    emailSendQueue.push({ run, resolve, reject });
    void processEmailSendQueue();
  });
}

/**
 * @returns {Resend}
 */
function getResend() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Allow tests to inject a mock Resend client.
 * @param {Resend | null} client
 */
export function setResendClient(client) {
  resendClient = client;
}

/**
 * @returns {number}
 */
export function getRetryDelayMs() {
  return RETRY_DELAY_MS;
}

/**
 * Wait for in-flight delivery (used by tests).
 * @param {string} logId
 * @returns {Promise<void>}
 */
export function waitForDelivery(logId) {
  return pendingDeliveries.get(logId) || Promise.resolve();
}

/**
 * Ensure email_logs can store template payload for retries.
 */
async function ensureEmailLogSchema() {
  if (schemaReady) {
    return;
  }

  await query(`
    ALTER TABLE email_logs
    ADD COLUMN IF NOT EXISTS template_data JSONB
  `);

  schemaReady = true;
}

/**
 * @param {string} templateName
 * @returns {Promise<Function>}
 */
async function loadTemplate(templateName) {
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName);
  }

  const fileName = TEMPLATE_FILES[templateName];
  if (!fileName) {
    throw new Error(`Unknown email template: ${templateName}`);
  }

  const filePath = path.join(__dirname, '../../emails', fileName);
  const mod = await import(pathToFileURL(filePath).href);
  const Component = mod.default;

  if (typeof Component !== 'function') {
    throw new Error(`Email template has no default export: ${templateName}`);
  }

  templateCache.set(templateName, Component);
  return Component;
}

/**
 * Format numeric amounts and raw dates for templates.
 * @param {Record<string, unknown>} data
 * @returns {Record<string, unknown>}
 */
function prepareTemplateData(data = {}) {
  const prepared = { ...data };

  for (const field of AMOUNT_FIELDS) {
    if (typeof prepared[field] === 'number') {
      prepared[field] = formatCurrency(prepared[field]);
    }
  }

  for (const field of DATE_FIELDS) {
    const value = prepared[field];
    if (value instanceof Date || typeof value === 'number') {
      prepared[field] = formatDate(value);
    } else if (
      typeof value === 'string' &&
      value.trim() !== '' &&
      !Number.isNaN(Date.parse(value)) &&
      !/^\d{2} [A-Za-z]{3} \d{4}$/.test(value)
    ) {
      prepared[field] = formatDate(value);
    }
  }

  return prepared;
}

/**
 * @param {string} templateName
 * @param {Record<string, unknown>} data
 * @returns {string}
 */
function buildSubject(templateName, data) {
  switch (templateName) {
    case 'otp':
      return 'Your Tikhat Partner OTP';
    case 'approval':
      return `${data.actionLabel || 'Your request'} approved — Tikhat Partner`;
    case 'rejection':
      return `${data.actionLabel || 'Your request'} not approved — Tikhat Partner`;
    case 'revenue-credit':
      return 'Revenue credited — Tikhat Partner';
    case 'capital-transaction':
      return 'Capital transaction update — Tikhat Partner';
    case 'withdrawal':
      return `Withdrawal ${data.status || 'update'} — Tikhat Partner`;
    case 'support':
      return `${data.eventLabel || 'Support update'} — Tikhat Partner`;
    case 'monthly-summary':
      return `Monthly summary ${data.monthLabel || ''} — Tikhat Partner`.trim();
    case 'custom-notification':
      return String(data.subjectTitle || data.subject || 'Notification — Tikhat Partner');
    default:
      return 'Tikhat Partner notification';
  }
}

/**
 * @param {string} templateName
 * @param {Record<string, unknown>} data
 * @returns {string | null}
 */
function resolveReferenceId(templateName, data) {
  if (data.referenceId) return String(data.referenceId);
  if (data.transactionId) return String(data.transactionId);
  if (data.ticketId) return String(data.ticketId);
  if (templateName === 'otp' && data.otp) return null;
  return null;
}

/**
 * @param {string} logId
 * @param {object} fields
 */
async function updateEmailLog(logId, fields) {
  const ALLOWED_COLUMNS = new Set([
    'status',
    'attempts',
    'last_attempt_at',
    'error_message',
    'resend_id',
    'template_data',
    'subject',
  ]);

  const sets = [];
  const values = [];
  let i = 1;

  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_COLUMNS.has(key)) {
      continue;
    }
    if (key === 'template_data') {
      sets.push(`template_data = $${i}::jsonb`);
      values.push(JSON.stringify(value));
    } else {
      sets.push(`${key} = $${i}`);
      values.push(value);
    }
    i += 1;
  }

  if (sets.length === 0) {
    return;
  }

  sets.push(`updated_at = NOW()`);
  values.push(logId);

  await query(
    `UPDATE email_logs SET ${sets.join(', ')} WHERE id = $${i}`,
    values
  );
}

/**
 * @param {object} params
 * @returns {Promise<string>} log id
 */
async function insertEmailLog({
  recipientEmail,
  recipientType,
  templateName,
  subject,
  referenceId,
  templateData,
}) {
  await ensureEmailLogSchema();

  const result = await query(
    `INSERT INTO email_logs (
       recipient_email,
       recipient_type,
       template_name,
       subject,
       status,
       attempts,
       reference_id,
       template_data
     ) VALUES ($1, $2, $3, $4, 'queued', 0, $5, $6::jsonb)
     RETURNING id`,
    [
      recipientEmail,
      recipientType,
      templateName,
      subject,
      referenceId,
      templateData ? JSON.stringify(templateData) : null,
    ]
  );

  return result.rows[0].id;
}

/**
 * @param {string} templateName
 * @param {Record<string, unknown>} data
 * @returns {Promise<string>}
 */
async function renderTemplateHtml(templateName, data) {
  const Component = await loadTemplate(templateName);
  const element = React.createElement(Component, prepareTemplateData(data));
  return render(element);
}

/**
 * Send via Resend (or throw).
 * Goes through the rate-limit queue (150ms between sends).
 * Used by sendEmail, retry cron, and admin failure alerts.
 * @param {object} params
 */
async function sendViaResend({ to, subject, html, forceFail }) {
  return enqueueResendSend(async () => {
    if (forceFail) {
      throw new Error('Forced email failure (test)');
    }

    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html,
    });

    if (error) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : String(error);
      throw new Error(message);
    }

    return data;
  });
}

/**
 * Resolve display name for admin alert.
 * @param {string} email
 * @returns {Promise<string>}
 */
async function resolveRecipientName(email) {
  const investor = await query(
    `SELECT full_name FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  if (investor.rows[0]?.full_name) {
    return investor.rows[0].full_name;
  }

  const admin = await query(
    `SELECT full_name FROM admins WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  if (admin.rows[0]?.full_name) {
    return admin.rows[0].full_name;
  }

  return email;
}

/**
 * Alert Super Admin after final delivery failure (no recursive retry loop).
 * @param {object} failedLog
 */
async function alertAdminOfFailure(failedLog) {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!adminEmail) {
    logger.error('Cannot alert admin of email failure: SUPER_ADMIN_EMAIL missing');
    return;
  }

  const recipientName = await resolveRecipientName(failedLog.recipient_email);
  const subject = 'Email delivery failure — Tikhat Partner';
  const alertBody = `Email delivery failed for ${recipientName} - ${failedLog.template_name} after ${MAX_ATTEMPTS} attempts`;
  const html = `
    <div style="font-family: sans-serif; color: #0A1628;">
      <h2>Email delivery failed</h2>
      <p>${alertBody}</p>
      <ul>
        <li><strong>Log ID:</strong> ${failedLog.id}</li>
        <li><strong>Recipient:</strong> ${failedLog.recipient_email}</li>
        <li><strong>Template:</strong> ${failedLog.template_name}</li>
        <li><strong>Subject:</strong> ${failedLog.subject}</li>
        <li><strong>Last error:</strong> ${failedLog.error_message || 'Unknown'}</li>
      </ul>
      <p>tikhatpartner.online</p>
    </div>
  `;

  let alertLogId = null;
  try {
    alertLogId = await insertEmailLog({
      recipientEmail: adminEmail,
      recipientType: 'admin',
      templateName: 'email-failure-alert',
      subject,
      referenceId: failedLog.id,
      templateData: null,
    });

    await updateEmailLog(alertLogId, {
      status: 'retrying',
      attempts: 1,
      last_attempt_at: new Date(),
    });

    await sendViaResend({ to: adminEmail, subject, html });

    await updateEmailLog(alertLogId, {
      status: 'sent',
      error_message: null,
    });

    logger.info('Admin alerted of email delivery failure', {
      failedLogId: failedLog.id,
      alertLogId,
    });
  } catch (err) {
    logger.error(`Failed to send admin email-failure alert: ${err.message}`, {
      error: err,
      failedLogId: failedLog.id,
    });

    if (alertLogId) {
      await updateEmailLog(alertLogId, {
        status: 'failed',
        attempts: MAX_ATTEMPTS,
        last_attempt_at: new Date(),
        error_message: err.message,
      });
    }
  }
}

/**
 * Single delivery attempt for an email_logs row.
 * Failed emails with attempts < 3 are picked up by the retry cron.
 *
 * @param {string} logId
 * @param {(() => void) | null} [onSettled]
 * @returns {Promise<{ success: boolean, attempts: number, status: string }>}
 */
export async function attemptEmailDelivery(logId, onSettled = null) {
  await ensureEmailLogSchema();

  const logResult = await query(
    `SELECT id, recipient_email, recipient_type, template_name, subject,
            status, attempts, error_message, reference_id, template_data
     FROM email_logs
     WHERE id = $1
     LIMIT 1`,
    [logId]
  );

  const logRow = logResult.rows[0];
  if (!logRow) {
    if (onSettled) onSettled();
    throw new Error('Email log not found');
  }

  if (logRow.status === 'sent') {
    if (onSettled) onSettled();
    return { success: true, attempts: logRow.attempts, status: 'sent' };
  }

  if (logRow.attempts >= MAX_ATTEMPTS) {
    if (onSettled) onSettled();
    return { success: false, attempts: logRow.attempts, status: 'failed' };
  }

  // Non-template alerts (admin failure alert) cannot be retried via template render
  if (!TEMPLATE_FILES[logRow.template_name]) {
    if (onSettled) onSettled();
    return {
      success: false,
      attempts: logRow.attempts,
      status: logRow.status,
    };
  }

  const nextAttempt = Math.round(Number(logRow.attempts) || 0) + 1;
  const templateData =
    logRow.template_data && typeof logRow.template_data === 'object'
      ? { ...logRow.template_data }
      : {};
  const forceFail = Boolean(templateData.__forceFail);
  delete templateData.__forceFail;

  try {
    await updateEmailLog(logId, {
      status: nextAttempt === 1 ? 'queued' : 'retrying',
      attempts: nextAttempt,
      last_attempt_at: new Date(),
    });

    const html = await renderTemplateHtml(logRow.template_name, templateData);
    await sendViaResend({
      to: logRow.recipient_email,
      subject: logRow.subject,
      html,
      forceFail,
    });

    await updateEmailLog(logId, {
      status: 'sent',
      error_message: null,
    });

    logger.info('Email sent successfully', {
      logId,
      to: logRow.recipient_email,
      templateName: logRow.template_name,
      attempt: nextAttempt,
    });

    if (onSettled) onSettled();
    return { success: true, attempts: nextAttempt, status: 'sent' };
  } catch (err) {
    const lastError = err.message || String(err);
    logger.error(`Email send attempt ${nextAttempt} failed: ${lastError}`, {
      logId,
      to: logRow.recipient_email,
      templateName: logRow.template_name,
      error: err,
    });

    const isFinal = nextAttempt >= MAX_ATTEMPTS;

    await updateEmailLog(logId, {
      status: 'failed',
      attempts: nextAttempt,
      last_attempt_at: new Date(),
      error_message: lastError,
    });

    if (onSettled) onSettled();

    if (isFinal) {
      const failedResult = await query(
        `SELECT id, recipient_email, template_name, subject, error_message
         FROM email_logs WHERE id = $1`,
        [logId]
      );
      if (failedResult.rows[0]) {
        await alertAdminOfFailure(failedResult.rows[0]);
      }
    }

    return {
      success: false,
      attempts: nextAttempt,
      status: 'failed',
      error: lastError,
    };
  }
}

/**
 * Clear in-memory email notification toggle cache.
 */
export function invalidateEmailNotificationSettingsCache() {
  emailNotificationSettingsCache = null;
  emailNotificationSettingsCachedAt = 0;
}

/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function parseEmailToggle(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value == null || value === '') {
    return fallback;
  }
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'on' || s === 'yes') {
    return true;
  }
  if (s === 'false' || s === '0' || s === 'off' || s === 'no') {
    return false;
  }
  return fallback;
}

/**
 * Load email notification toggles (cached 5 minutes).
 * @returns {Promise<Record<string, boolean>>}
 */
async function getEmailNotificationSettingsCached() {
  const now = Date.now();
  if (
    emailNotificationSettingsCache &&
    now - emailNotificationSettingsCachedAt < EMAIL_NOTIFICATION_CACHE_TTL_MS
  ) {
    return emailNotificationSettingsCache;
  }

  const result = await query(
    `SELECT key, value
     FROM global_settings
     WHERE key = ANY($1::text[])`,
    [EMAIL_NOTIFICATION_KEYS]
  );

  /** @type {Record<string, boolean>} */
  const map = {};
  for (const key of EMAIL_NOTIFICATION_KEYS) {
    map[key] = EMAIL_NOTIFICATION_DEFAULTS[key] !== false;
  }
  for (const row of result.rows) {
    if (Object.prototype.hasOwnProperty.call(map, row.key)) {
      map[row.key] = parseEmailToggle(
        row.value,
        EMAIL_NOTIFICATION_DEFAULTS[row.key] !== false
      );
    }
  }

  emailNotificationSettingsCache = map;
  emailNotificationSettingsCachedAt = now;
  return map;
}

/**
 * Resolve which global_settings toggle gates this outbound email.
 * Returns null when the email should always send (OTP, admin alerts, etc.).
 * @param {string} templateName
 * @param {Record<string, unknown>} data
 * @returns {string | null}
 */
function resolveEmailNotificationSettingKey(templateName, data = {}) {
  if (
    typeof data.emailNotificationKey === 'string' &&
    EMAIL_NOTIFICATION_KEYS.includes(data.emailNotificationKey)
  ) {
    return data.emailNotificationKey;
  }
  if (
    typeof data.notificationSetting === 'string' &&
    EMAIL_NOTIFICATION_KEYS.includes(data.notificationSetting)
  ) {
    return data.notificationSetting;
  }

  if (data.recipientType === 'admin') {
    return null;
  }

  if (templateName === 'otp' || templateName === 'monthly-summary') {
    return null;
  }

  if (templateName === 'revenue-credit') {
    return 'email_on_revenue_credit';
  }

  if (templateName === 'capital-transaction') {
    const typeText =
      `${data.transactionType || ''} ${data.message || ''} ${data.status || ''}`.toLowerCase();
    if (typeText.includes('withdraw')) {
      return 'email_on_capital_withdrawal';
    }
    return 'email_on_capital_deposit';
  }

  if (templateName === 'withdrawal') {
    const account = String(
      data.accountType || data.account_type || data.account || ''
    ).toLowerCase();
    if (account.includes('revenue')) {
      return 'email_on_revenue_withdrawal';
    }
    return 'email_on_capital_withdrawal';
  }

  if (templateName === 'support') {
    const event = String(data.eventLabel || data.event || '').toLowerCase();
    if (event.includes('created') || event.includes('raised')) {
      return 'email_on_support_ticket';
    }
    if (event.includes('resolved') || event.includes('closed')) {
      return 'email_on_support_closed';
    }
    return 'email_on_support_reply';
  }

  const haystack = [
    data.subjectTitle,
    data.actionLabel,
    data.message,
    data.body,
    data.subject,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (templateName === 'approval' || templateName === 'rejection') {
    if (
      haystack.includes('pause') ||
      haystack.includes('resumed') ||
      haystack.includes('resume')
    ) {
      return 'email_on_account_pause';
    }
    if (
      haystack.includes('kyc') ||
      haystack.includes('pan') ||
      haystack.includes('aadhar') ||
      haystack.includes('aadhaar')
    ) {
      return 'email_on_kyc_update';
    }
    if (
      haystack.includes('profile') ||
      haystack.includes('email change') ||
      haystack.includes('mobile change')
    ) {
      return 'email_on_profile_update';
    }
    return templateName === 'approval'
      ? 'email_on_approval'
      : 'email_on_rejection';
  }

  if (templateName === 'custom-notification') {
    if (haystack.includes('registration')) {
      return 'email_on_registration';
    }
    if (
      haystack.includes('pause') ||
      haystack.includes('resumed') ||
      haystack.includes('resume')
    ) {
      return 'email_on_account_pause';
    }
    if (
      haystack.includes('kyc') ||
      haystack.includes('pan') ||
      haystack.includes('aadhar') ||
      haystack.includes('aadhaar')
    ) {
      return 'email_on_kyc_update';
    }
    if (
      haystack.includes('profile') ||
      haystack.includes('email change') ||
      haystack.includes('mobile change')
    ) {
      return 'email_on_profile_update';
    }
    return 'email_on_approval';
  }

  return null;
}

/**
 * @param {string} templateName
 * @param {Record<string, unknown>} data
 * @returns {Promise<boolean>}
 */
async function isEmailNotificationAllowed(templateName, data = {}) {
  const key = resolveEmailNotificationSettingKey(templateName, data);
  if (!key) {
    return true;
  }

  try {
    const settings = await getEmailNotificationSettingsCached();
    return settings[key] !== false;
  } catch (error) {
    logger.warn(
      `Email notification settings lookup failed; allowing send: ${error.message}`,
      { templateName, key }
    );
    return true;
  }
}

/**
 * Queue and send an email via Resend.
 * OTP / approval / rejection wait for first attempt; others are non-blocking.
 * Retries are handled by the email retry cron (every 5 minutes).
 * Resend calls are serialized with a 150ms gap via enqueueResendSend.
 *
 * @param {string} to
 * @param {string} templateName
 * @param {Record<string, unknown>} data
 * @returns {Promise<{ success: true, message: string, data: { emailLogId: string, subject: string } }>}
 */
export async function sendEmail(to, templateName, data = {}) {
  if (!to || typeof to !== 'string') {
    throw new Error('Email recipient is required');
  }

  if (!TEMPLATE_FILES[templateName]) {
    throw new Error(`Unknown email template: ${templateName}`);
  }

  // Backdate ledger entries are silent — never email investors
  if (
    data?.source === 'backdate' ||
    data?.credit_type === 'backdate' ||
    data?.creditType === 'backdate' ||
    data?.isBackdated === true
  ) {
    logger.info('Skipping email for backdate source', {
      to,
      templateName,
    });
    return {
      success: true,
      message: 'Email skipped for backdate source',
      data: { emailLogId: null, subject: null, skipped: true },
    };
  }

  if (!(await isEmailNotificationAllowed(templateName, data))) {
    const settingKey = resolveEmailNotificationSettingKey(templateName, data);
    logger.info('Skipping email — notification setting disabled', {
      to,
      templateName,
      settingKey,
    });
    return {
      success: true,
      message: 'Email skipped — notification disabled',
      data: {
        emailLogId: null,
        subject: null,
        skipped: true,
        settingKey,
      },
    };
  }

  const prepared = prepareTemplateData(data);
  // Preserve force-fail flag for delivery (stripped before render)
  if (data.__forceFail) {
    prepared.__forceFail = true;
  }

  const subject = data.subject
    ? String(data.subject)
    : buildSubject(templateName, prepared);
  const recipientType =
    data.recipientType === 'admin' ? 'admin' : 'investor';
  const referenceId = resolveReferenceId(templateName, prepared);

  const emailLogId = await insertEmailLog({
    recipientEmail: to.trim().toLowerCase(),
    recipientType,
    templateName,
    subject,
    referenceId,
    templateData: prepared,
  });

  let resolveFirstAttempt;
  const firstAttemptPromise = new Promise((resolve) => {
    resolveFirstAttempt = resolve;
  });

  const deliveryPromise = attemptEmailDelivery(
    emailLogId,
    resolveFirstAttempt
  );

  pendingDeliveries.set(emailLogId, deliveryPromise);
  deliveryPromise
    .catch((err) => {
      logger.error(`Email delivery pipeline error: ${err.message}`, {
        emailLogId,
        error: err,
      });
    })
    .finally(() => {
      pendingDeliveries.delete(emailLogId);
    });

  if (IMMEDIATE_TEMPLATES.has(templateName)) {
    await firstAttemptPromise;
  }

  return {
    success: true,
    message: 'Email queued successfully',
    data: {
      emailLogId,
      subject,
    },
  };
}

/**
 * Find failed emails eligible for retry and attempt delivery.
 * @returns {Promise<object>}
 */
export async function runEmailRetryJob() {
  let cronLogId = null;
  let processedCount = 0;
  let failedCount = 0;
  let successCount = 0;
  const errors = [];

  try {
    await ensureEmailLogSchema();

    const cronInsert = await query(
      `INSERT INTO cron_job_logs (job_name, started_at, status)
       VALUES ($1, NOW(), 'running')
       RETURNING id`,
      [EMAIL_RETRY_JOB_NAME]
    );
    cronLogId = cronInsert.rows[0].id;

    const failed = await query(
      `SELECT id, recipient_email, template_name, attempts
       FROM email_logs
       WHERE status = 'failed'
         AND attempts < $1
         AND template_name = ANY($2::TEXT[])
         AND (
           last_attempt_at IS NULL
           OR last_attempt_at <= NOW() - ($3 || ' milliseconds')::INTERVAL
         )
       ORDER BY last_attempt_at ASC NULLS FIRST
       LIMIT 100`,
      [MAX_ATTEMPTS, Object.keys(TEMPLATE_FILES), String(RETRY_DELAY_MS)]
    );

    for (const row of failed.rows) {
      processedCount += 1;
      try {
        const result = await attemptEmailDelivery(row.id);
        if (result.success) {
          successCount += 1;
        } else {
          failedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        errors.push({ id: row.id, message: error.message });
        logger.error(
          `[Cron] ${EMAIL_RETRY_JOB_NAME} failed for ${row.id}: ${error.message}`,
          { error }
        );
      }
    }

    const status =
      failedCount === 0
        ? 'success'
        : successCount > 0
          ? 'partial'
          : processedCount === 0
            ? 'success'
            : 'failed';

    await query(
      `UPDATE cron_job_logs
       SET status = $2,
           completed_at = NOW(),
           processed_count = $3,
           failed_count = $4,
           total_amount = 0,
           error_details = $5::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        cronLogId,
        status,
        processedCount,
        failedCount,
        JSON.stringify({
          candidates: failed.rows.length,
          successCount,
          errors,
        }),
      ]
    );

    logger.info(`[Cron] ${EMAIL_RETRY_JOB_NAME} completed`, {
      candidates: failed.rows.length,
      processedCount,
      successCount,
      failedCount,
    });

    return {
      status,
      logId: cronLogId,
      candidates: failed.rows.length,
      processedCount,
      successCount,
      failedCount,
    };
  } catch (error) {
    if (cronLogId) {
      try {
        await query(
          `UPDATE cron_job_logs
           SET status = 'failed',
               completed_at = NOW(),
               processed_count = $2,
               failed_count = $3,
               error_details = $4::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [
            cronLogId,
            processedCount,
            failedCount + 1,
            JSON.stringify({ message: error.message }),
          ]
        );
      } catch (logError) {
        logger.error(`[Cron] ${EMAIL_RETRY_JOB_NAME} log update failed`, {
          error: logError,
        });
      }
    }

    logger.error(`[Cron] ${EMAIL_RETRY_JOB_NAME} failed`, { error });
    return {
      status: 'failed',
      logId: cronLogId,
      processedCount,
      failedCount,
      error: error.message,
    };
  }
}

/**
 * Schedule email retry job every 5 minutes (IST).
 * @returns {import('node-cron').ScheduledTask}
 */
export function startEmailRetryCron() {
  const task = cron.schedule(
    EMAIL_RETRY_CRON,
    async () => {
      await runEmailRetryJob();
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  );

  logger.info(`[Cron] ${EMAIL_RETRY_JOB_NAME} registered`, {
    schedule: EMAIL_RETRY_CRON,
    timezone: TIMEZONE,
    description: 'Retry failed emails every 5 minutes',
  });

  return task;
}

/**
 * Render a template to HTML without sending (testing / preview).
 * @param {string} templateName
 * @param {Record<string, unknown>} data
 * @returns {Promise<string>}
 */
export async function renderEmailPreview(templateName, data = {}) {
  return renderTemplateHtml(templateName, data);
}

export const EMAIL_TEMPLATES = Object.keys(TEMPLATE_FILES);
export const EMAIL_RETRY_CRON_META = Object.freeze({
  JOB_NAME: EMAIL_RETRY_JOB_NAME,
  CRON_EXPRESSION: EMAIL_RETRY_CRON,
  MAX_ATTEMPTS,
  RETRY_DELAY_MS,
});
