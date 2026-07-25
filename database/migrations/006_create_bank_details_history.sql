-- Migration: 006_create_bank_details_history
-- Tikhat Partner App — Permanent retention of old bank details

CREATE TABLE IF NOT EXISTS bank_details_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL,
  bank_account_number VARCHAR(50),
  bank_ifsc VARCHAR(20),
  bank_account_name VARCHAR(255),
  bank_name VARCHAR(255),
  upi_id VARCHAR(100),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by VARCHAR(20) NOT NULL,
  admin_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_bank_details_history_changed_by CHECK (
    changed_by IN ('investor', 'admin')
  ),
  CONSTRAINT fk_bank_details_history_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_bank_details_history_admin
    FOREIGN KEY (admin_id) REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_details_history_investor_id
  ON bank_details_history (investor_id);
CREATE INDEX IF NOT EXISTS idx_bank_details_history_changed_at
  ON bank_details_history (changed_at);
CREATE INDEX IF NOT EXISTS idx_bank_details_history_changed_by
  ON bank_details_history (changed_by);
CREATE INDEX IF NOT EXISTS idx_bank_details_history_admin_id
  ON bank_details_history (admin_id);
CREATE INDEX IF NOT EXISTS idx_bank_details_history_created_at
  ON bank_details_history (created_at);
