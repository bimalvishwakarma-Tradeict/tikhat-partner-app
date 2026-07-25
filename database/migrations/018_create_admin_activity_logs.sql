-- Migration: 018_create_admin_activity_logs
-- Tikhat Partner App — Admin audit trail + concurrent edit sessions

CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100),
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_admin_activity_logs_entity_type CHECK (
    entity_type IN (
      'investor',
      'admin',
      'capital',
      'revenue',
      'withdrawal',
      'support',
      'profile',
      'kyc',
      'settings',
      'backdate',
      'notification',
      'other'
    )
  ),
  CONSTRAINT fk_admin_activity_logs_admin
    FOREIGN KEY (admin_id) REFERENCES admins (id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_created
  ON admin_activity_logs (admin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id
  ON admin_activity_logs (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at
  ON admin_activity_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_entity
  ON admin_activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_action
  ON admin_activity_logs (action);

-- Concurrent editing detection (in-DB companion to middleware memory store)
CREATE TABLE IF NOT EXISTS concurrent_edit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  admin_id UUID NOT NULL,
  admin_name VARCHAR(255) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ping_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_concurrent_edit_sessions_admin
    FOREIGN KEY (admin_id) REFERENCES admins (id)
    ON DELETE CASCADE,
  CONSTRAINT uq_concurrent_edit_sessions_entity_admin
    UNIQUE (entity_type, entity_id, admin_id)
);

CREATE INDEX IF NOT EXISTS idx_concurrent_edit_sessions_entity
  ON concurrent_edit_sessions (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_concurrent_edit_sessions_admin_id
  ON concurrent_edit_sessions (admin_id);
CREATE INDEX IF NOT EXISTS idx_concurrent_edit_sessions_last_ping
  ON concurrent_edit_sessions (last_ping_at);
