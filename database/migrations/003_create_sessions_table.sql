-- Migration: 003_create_sessions_table
-- Tikhat Partner App — Active sessions (1 mobile + 1 web per user)

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type VARCHAR(20) NOT NULL,
  device_type VARCHAR(20) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_sessions_user_type CHECK (user_type IN ('investor', 'admin')),
  CONSTRAINT chk_sessions_device_type CHECK (device_type IN ('mobile', 'web'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_type ON sessions (user_type);
CREATE INDEX IF NOT EXISTS idx_sessions_device_type ON sessions (device_type);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_device ON sessions (user_id, user_type, device_type);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
