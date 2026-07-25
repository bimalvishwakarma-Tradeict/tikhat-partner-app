-- Migration: 004_create_otp_table
-- Tikhat Partner App — OTP verifications

CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  purpose VARCHAR(30) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_otp_purpose CHECK (
    purpose IN ('login', 'register', 'reset_password', 'email_change')
  )
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_verifications (email);
CREATE INDEX IF NOT EXISTS idx_otp_purpose ON otp_verifications (purpose);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_verifications (expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_is_used ON otp_verifications (is_used);
CREATE INDEX IF NOT EXISTS idx_otp_created_at ON otp_verifications (created_at);
CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_verifications (email, purpose);
