-- Migration: 002_create_admins_table
-- Tikhat Partner App — Admins & Super Admin

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  mobile VARCHAR(15),
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_admins_email UNIQUE (email),
  CONSTRAINT chk_admins_role CHECK (role IN ('super_admin', 'admin')),
  CONSTRAINT chk_admins_status CHECK (status IN ('active', 'suspended')),
  CONSTRAINT fk_admins_created_by FOREIGN KEY (created_by)
    REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_admins_email ON admins (email);
CREATE INDEX IF NOT EXISTS idx_admins_status ON admins (status);
CREATE INDEX IF NOT EXISTS idx_admins_role ON admins (role);
CREATE INDEX IF NOT EXISTS idx_admins_created_at ON admins (created_at);
CREATE INDEX IF NOT EXISTS idx_admins_created_by ON admins (created_by);
