-- Migration: 005_create_profile_update_requests
-- Tikhat Partner App — Profile field update requests (admin approval)
-- id uses Profile Request transaction ID format: TKT-PRF-YYYY-XXXXX

CREATE TABLE IF NOT EXISTS profile_update_requests (
  id VARCHAR(32) PRIMARY KEY,
  investor_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_id UUID,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_profile_update_requests_id_format CHECK (
    id ~ '^TKT-PRF-[0-9]{4}-[0-9]{5}$'
  ),
  CONSTRAINT chk_profile_update_requests_status CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT fk_profile_update_requests_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_profile_update_requests_admin
    FOREIGN KEY (admin_id) REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_update_requests_investor_id
  ON profile_update_requests (investor_id);
CREATE INDEX IF NOT EXISTS idx_profile_update_requests_status
  ON profile_update_requests (status);
CREATE INDEX IF NOT EXISTS idx_profile_update_requests_admin_id
  ON profile_update_requests (admin_id);
CREATE INDEX IF NOT EXISTS idx_profile_update_requests_created_at
  ON profile_update_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_profile_update_requests_field_name
  ON profile_update_requests (field_name);
