-- Migration: 020_create_backdate_requests
-- Tikhat Partner App — Backdate entries pending Super Admin approval

CREATE TABLE IF NOT EXISTS backdate_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by UUID NOT NULL,
  approved_by UUID,
  investor_id UUID,
  type VARCHAR(30) NOT NULL,
  start_date DATE,
  end_date DATE,
  roi_percentage INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  send_email_to_investor BOOLEAN NOT NULL DEFAULT FALSE,
  execution_log JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_backdate_requests_type CHECK (
    type IN ('single_revenue', 'bulk_revenue', 'capital', 'new_investor')
  ),
  CONSTRAINT chk_backdate_requests_status CHECK (
    status IN ('pending', 'approved', 'rejected', 'executed')
  ),
  CONSTRAINT chk_backdate_requests_roi CHECK (
    roi_percentage IS NULL OR roi_percentage > 0
  ),
  CONSTRAINT chk_backdate_requests_dates CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  ),
  CONSTRAINT fk_backdate_requests_submitted_by
    FOREIGN KEY (submitted_by) REFERENCES admins (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_backdate_requests_approved_by
    FOREIGN KEY (approved_by) REFERENCES admins (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_backdate_requests_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backdate_requests_submitted_by
  ON backdate_requests (submitted_by);
CREATE INDEX IF NOT EXISTS idx_backdate_requests_approved_by
  ON backdate_requests (approved_by);
CREATE INDEX IF NOT EXISTS idx_backdate_requests_investor_id
  ON backdate_requests (investor_id);
CREATE INDEX IF NOT EXISTS idx_backdate_requests_status
  ON backdate_requests (status);
CREATE INDEX IF NOT EXISTS idx_backdate_requests_type
  ON backdate_requests (type);
CREATE INDEX IF NOT EXISTS idx_backdate_requests_created_at
  ON backdate_requests (created_at);
