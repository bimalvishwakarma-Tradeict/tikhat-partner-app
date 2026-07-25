-- Migration: 019_create_cron_logs
-- Tikhat Partner App — Cron job execution logs

CREATE TABLE IF NOT EXISTS cron_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name VARCHAR(100) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_cron_job_logs_status CHECK (
    status IN ('running', 'success', 'partial', 'failed')
  ),
  CONSTRAINT chk_cron_job_logs_counts CHECK (
    processed_count >= 0
    AND failed_count >= 0
    AND total_amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_cron_job_logs_job_name
  ON cron_job_logs (job_name);
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_status
  ON cron_job_logs (status);
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_started_at
  ON cron_job_logs (started_at);
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_created_at
  ON cron_job_logs (created_at);
