-- Migration: 011_create_revenue_credits
-- Tikhat Partner App — Daily/manual/backdate revenue credit & debit records

CREATE TABLE IF NOT EXISTS revenue_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(32) NOT NULL,
  investor_id UUID NOT NULL,
  credit_date DATE NOT NULL,
  amount INTEGER NOT NULL,
  credit_type VARCHAR(20) NOT NULL,
  roi_percentage_applied INTEGER,
  capital_at_time INTEGER,
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversed_by UUID,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  cron_job_id UUID,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_revenue_credits_transaction_id UNIQUE (transaction_id),
  CONSTRAINT chk_revenue_credits_amount CHECK (amount > 0),
  CONSTRAINT chk_revenue_credits_credit_type CHECK (
    credit_type IN ('daily_auto', 'manual_credit', 'manual_debit', 'backdate')
  ),
  CONSTRAINT chk_revenue_credits_transaction_id_format CHECK (
    transaction_id ~ '^TKT-REV-CR-[0-9]{4}-[0-9]{5}$'
  ),
  CONSTRAINT chk_revenue_credits_roi_percentage CHECK (
    roi_percentage_applied IS NULL OR roi_percentage_applied > 0
  ),
  CONSTRAINT chk_revenue_credits_capital_at_time CHECK (
    capital_at_time IS NULL OR capital_at_time >= 0
  ),
  CONSTRAINT fk_revenue_credits_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_revenue_credits_reversed_by
    FOREIGN KEY (reversed_by) REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_revenue_investor_date
  ON revenue_credits (investor_id, credit_date);
CREATE INDEX IF NOT EXISTS idx_revenue_credits_investor_id
  ON revenue_credits (investor_id);
CREATE INDEX IF NOT EXISTS idx_revenue_credits_credit_date
  ON revenue_credits (credit_date);
CREATE INDEX IF NOT EXISTS idx_revenue_credits_transaction_id
  ON revenue_credits (transaction_id);
CREATE INDEX IF NOT EXISTS idx_revenue_credits_credit_type
  ON revenue_credits (credit_type);
CREATE INDEX IF NOT EXISTS idx_revenue_credits_is_reversed
  ON revenue_credits (is_reversed);
CREATE INDEX IF NOT EXISTS idx_revenue_credits_is_deleted
  ON revenue_credits (is_deleted);
CREATE INDEX IF NOT EXISTS idx_revenue_credits_cron_job_id
  ON revenue_credits (cron_job_id);
CREATE INDEX IF NOT EXISTS idx_revenue_credits_created_at
  ON revenue_credits (created_at);

-- Prevent duplicate daily auto credits for the same investor/date
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_credits_daily_auto
  ON revenue_credits (investor_id, credit_date)
  WHERE credit_type = 'daily_auto' AND is_deleted = FALSE AND is_reversed = FALSE;
