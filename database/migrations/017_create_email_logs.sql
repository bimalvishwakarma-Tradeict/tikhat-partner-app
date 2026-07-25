-- Migration: 017_create_email_logs
-- Tikhat Partner App — Permanent email delivery logs (Resend queue)

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email VARCHAR(255) NOT NULL,
  recipient_type VARCHAR(20) NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  reference_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_email_logs_recipient_type CHECK (
    recipient_type IN ('investor', 'admin')
  ),
  CONSTRAINT chk_email_logs_status CHECK (
    status IN ('queued', 'sent', 'failed', 'retrying')
  ),
  CONSTRAINT chk_email_logs_attempts CHECK (
    attempts >= 0 AND attempts <= 3
  )
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient_email
  ON email_logs (recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_status
  ON email_logs (status);
CREATE INDEX IF NOT EXISTS idx_email_logs_template_name
  ON email_logs (template_name);
CREATE INDEX IF NOT EXISTS idx_email_logs_reference_id
  ON email_logs (reference_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at
  ON email_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient_type
  ON email_logs (recipient_type);
