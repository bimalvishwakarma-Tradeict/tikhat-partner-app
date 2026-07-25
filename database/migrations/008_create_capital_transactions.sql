-- Migration: 008_create_capital_transactions
-- Tikhat Partner App — Capital deposits, withdrawals, and admin adjustments

CREATE TABLE IF NOT EXISTS capital_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(32) NOT NULL,
  investor_id UUID NOT NULL,
  type VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  original_requested_amount INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  utr_number VARCHAR(100),
  payment_screenshot_url TEXT,
  remark TEXT,
  admin_id UUID,
  admin_remark TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  transfer_mode VARCHAR(10),
  payment_date DATE,
  payment_utr VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_capital_transactions_transaction_id UNIQUE (transaction_id),
  CONSTRAINT uq_capital_transactions_utr_number UNIQUE (utr_number),
  CONSTRAINT chk_capital_transactions_type CHECK (
    type IN ('deposit', 'withdrawal', 'admin_credit', 'admin_debit')
  ),
  CONSTRAINT chk_capital_transactions_status CHECK (
    status IN (
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'cancelled',
      'processed',
      'completed'
    )
  ),
  CONSTRAINT chk_capital_transactions_transfer_mode CHECK (
    transfer_mode IS NULL OR transfer_mode IN ('bank', 'upi')
  ),
  CONSTRAINT chk_capital_transactions_amount CHECK (amount > 0),
  CONSTRAINT chk_capital_transactions_original_amount CHECK (
    original_requested_amount IS NULL OR original_requested_amount > 0
  ),
  CONSTRAINT chk_capital_transactions_id_format CHECK (
    (type = 'deposit' AND transaction_id ~ '^TKT-CAP-DEP-[0-9]{4}-[0-9]{5}$')
    OR (type = 'withdrawal' AND transaction_id ~ '^TKT-CAP-WDR-[0-9]{4}-[0-9]{5}$')
    OR (
      type IN ('admin_credit', 'admin_debit')
      AND transaction_id ~ '^TKT-ADM-[0-9]{4}-[0-9]{5}$'
    )
  ),
  CONSTRAINT fk_capital_transactions_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_capital_transactions_admin
    FOREIGN KEY (admin_id) REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_capital_investor_id
  ON capital_transactions (investor_id);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_status
  ON capital_transactions (status);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_created_at
  ON capital_transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_transaction_id
  ON capital_transactions (transaction_id);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_type
  ON capital_transactions (type);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_utr_number
  ON capital_transactions (utr_number);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_is_deleted
  ON capital_transactions (is_deleted);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_admin_id
  ON capital_transactions (admin_id);
