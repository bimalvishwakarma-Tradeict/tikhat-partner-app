-- Migration: 012_create_monthly_revenue_tracking
-- Tikhat Partner App — Monthly tracking, per-investor credit settings, global settings

CREATE TABLE IF NOT EXISTS monthly_revenue_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  expected_total INTEGER NOT NULL DEFAULT 0,
  credited_total INTEGER NOT NULL DEFAULT 0,
  days_credited INTEGER NOT NULL DEFAULT 0,
  days_paused INTEGER NOT NULL DEFAULT 0,
  days_remaining INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_monthly_revenue_tracking_year CHECK (year >= 2020),
  CONSTRAINT chk_monthly_revenue_tracking_month CHECK (month >= 1 AND month <= 12),
  CONSTRAINT chk_monthly_revenue_tracking_totals CHECK (
    expected_total >= 0
    AND credited_total >= 0
    AND days_credited >= 0
    AND days_paused >= 0
    AND days_remaining >= 0
  ),
  CONSTRAINT chk_monthly_revenue_tracking_status CHECK (
    status IN ('in_progress', 'completed')
  ),
  CONSTRAINT uq_monthly_revenue_tracking_investor_month
    UNIQUE (investor_id, year, month),
  CONSTRAINT fk_monthly_revenue_tracking_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_monthly_revenue_tracking_year_month_investor
  ON monthly_revenue_tracking (year, month, investor_id);
CREATE INDEX IF NOT EXISTS idx_monthly_revenue_tracking_investor_id
  ON monthly_revenue_tracking (investor_id);
CREATE INDEX IF NOT EXISTS idx_monthly_revenue_tracking_status
  ON monthly_revenue_tracking (status);
CREATE INDEX IF NOT EXISTS idx_monthly_revenue_tracking_created_at
  ON monthly_revenue_tracking (created_at);

-- Per-investor revenue credit & withdrawal frequency settings
CREATE TABLE IF NOT EXISTS revenue_credit_settings (
  investor_id UUID PRIMARY KEY,
  credit_frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
  credit_time_hour INTEGER NOT NULL DEFAULT 18,
  credit_time_minute INTEGER NOT NULL DEFAULT 0,
  withdrawal_frequency INTEGER NOT NULL DEFAULT 1,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_by UUID,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_revenue_credit_settings_frequency CHECK (
    credit_frequency IN ('daily', 'weekly', 'monthly')
  ),
  CONSTRAINT chk_revenue_credit_settings_hour CHECK (
    credit_time_hour >= 0 AND credit_time_hour <= 23
  ),
  CONSTRAINT chk_revenue_credit_settings_minute CHECK (
    credit_time_minute >= 0 AND credit_time_minute <= 59
  ),
  CONSTRAINT chk_revenue_credit_settings_withdrawal_frequency CHECK (
    withdrawal_frequency >= 0
  ),
  CONSTRAINT fk_revenue_credit_settings_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_revenue_credit_settings_paused_by
    FOREIGN KEY (paused_by) REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_revenue_credit_settings_is_paused
  ON revenue_credit_settings (is_paused);
CREATE INDEX IF NOT EXISTS idx_revenue_credit_settings_frequency
  ON revenue_credit_settings (credit_frequency);

-- System-wide settings (Super Admin)
CREATE TABLE IF NOT EXISTS global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_global_settings_key UNIQUE (key),
  CONSTRAINT fk_global_settings_updated_by
    FOREIGN KEY (updated_by) REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_global_settings_key
  ON global_settings (key);
CREATE INDEX IF NOT EXISTS idx_global_settings_updated_at
  ON global_settings (updated_at);

-- Seed essential global settings (idempotent)
INSERT INTO global_settings (key, value)
VALUES
  ('revenue_credit_time', '18:00'),
  ('minimum_capital_deposit', '10000'),
  ('maximum_capital_deposit', '1000000'),
  ('minimum_withdrawal_amount', '1000'),
  ('upi_transfer_limit', '100000'),
  ('maintenance_mode', 'off')
ON CONFLICT (key) DO NOTHING;
