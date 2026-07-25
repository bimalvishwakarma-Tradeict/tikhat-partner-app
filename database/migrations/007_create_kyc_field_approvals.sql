-- Migration: 007_create_kyc_field_approvals
-- Tikhat Partner App — Field-by-field KYC approval tracking

CREATE TABLE IF NOT EXISTS kyc_field_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_id UUID,
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_kyc_field_approvals_status CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT fk_kyc_field_approvals_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_kyc_field_approvals_admin
    FOREIGN KEY (admin_id) REFERENCES admins (id)
    ON DELETE SET NULL,
  CONSTRAINT uq_kyc_field_approvals_investor_field
    UNIQUE (investor_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_kyc_field_approvals_investor_id
  ON kyc_field_approvals (investor_id);
CREATE INDEX IF NOT EXISTS idx_kyc_field_approvals_status
  ON kyc_field_approvals (status);
CREATE INDEX IF NOT EXISTS idx_kyc_field_approvals_admin_id
  ON kyc_field_approvals (admin_id);
CREATE INDEX IF NOT EXISTS idx_kyc_field_approvals_field_name
  ON kyc_field_approvals (field_name);
CREATE INDEX IF NOT EXISTS idx_kyc_field_approvals_created_at
  ON kyc_field_approvals (created_at);
