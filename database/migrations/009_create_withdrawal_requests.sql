-- Migration: 009_create_withdrawal_requests
-- Tikhat Partner App — Capital/revenue withdrawal workflow + capital lock status

CREATE TABLE IF NOT EXISTS capital_withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(32) NOT NULL,
  investor_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  account_type VARCHAR(20) NOT NULL,
  transfer_mode VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  admin_id UUID,
  admin_remark TEXT,
  payment_date DATE,
  payment_utr VARCHAR(100),
  auto_cancelled_reason TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_capital_withdrawal_requests_transaction_id UNIQUE (transaction_id),
  CONSTRAINT chk_capital_withdrawal_requests_account_type CHECK (
    account_type IN ('capital', 'revenue')
  ),
  CONSTRAINT chk_capital_withdrawal_requests_transfer_mode CHECK (
    transfer_mode IN ('bank', 'upi')
  ),
  CONSTRAINT chk_capital_withdrawal_requests_status CHECK (
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
  CONSTRAINT chk_capital_withdrawal_requests_amount CHECK (amount > 0),
  CONSTRAINT chk_capital_withdrawal_requests_id_format CHECK (
    (
      account_type = 'capital'
      AND transaction_id ~ '^TKT-CAP-WDR-[0-9]{4}-[0-9]{5}$'
    )
    OR (
      account_type = 'revenue'
      AND transaction_id ~ '^TKT-REV-WDR-[0-9]{4}-[0-9]{5}$'
    )
  ),
  CONSTRAINT fk_capital_withdrawal_requests_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_capital_withdrawal_requests_admin
    FOREIGN KEY (admin_id) REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_capital_withdrawal_requests_investor_id
  ON capital_withdrawal_requests (investor_id);
CREATE INDEX IF NOT EXISTS idx_capital_withdrawal_requests_status
  ON capital_withdrawal_requests (status);
CREATE INDEX IF NOT EXISTS idx_capital_withdrawal_requests_created_at
  ON capital_withdrawal_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_capital_withdrawal_requests_transaction_id
  ON capital_withdrawal_requests (transaction_id);
CREATE INDEX IF NOT EXISTS idx_capital_withdrawal_requests_account_type
  ON capital_withdrawal_requests (account_type);
CREATE INDEX IF NOT EXISTS idx_capital_withdrawal_requests_admin_id
  ON capital_withdrawal_requests (admin_id);

-- Per-investor capital lock (Available / Locked for Withdrawal)
CREATE TABLE IF NOT EXISTS capital_lock_status (
  investor_id UUID PRIMARY KEY,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_by UUID,
  locked_at TIMESTAMPTZ,
  unlock_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_capital_lock_status_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_capital_lock_status_locked_by
    FOREIGN KEY (locked_by) REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_capital_lock_status_is_locked
  ON capital_lock_status (is_locked);
CREATE INDEX IF NOT EXISTS idx_capital_lock_status_locked_by
  ON capital_lock_status (locked_by);
