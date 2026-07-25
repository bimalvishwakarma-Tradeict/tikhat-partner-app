-- Migration: 001_create_users_table
-- Tikhat Partner App — Investors (Tikhat Partners)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  mobile VARCHAR(15),
  profile_photo_url TEXT,
  date_of_birth DATE,
  address TEXT,
  pan_number VARCHAR(10),
  pan_front_url TEXT,
  pan_back_url TEXT,
  aadhar_number VARCHAR(12),
  aadhar_front_url TEXT,
  aadhar_back_url TEXT,
  bank_account_number VARCHAR(50),
  bank_ifsc VARCHAR(20),
  bank_account_name VARCHAR(255),
  bank_name VARCHAR(255),
  upi_id VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  kyc_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  joining_date DATE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  banner_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_pan_number UNIQUE (pan_number),
  CONSTRAINT uq_users_aadhar_number UNIQUE (aadhar_number),
  CONSTRAINT chk_users_status CHECK (
    status IN (
      'pending',
      'active',
      'paused',
      'locked',
      'self_deactivated',
      'deleted'
    )
  ),
  CONSTRAINT chk_users_kyc_status CHECK (
    kyc_status IN ('pending', 'verified', 'rejected')
  ),
  CONSTRAINT chk_users_failed_login_attempts CHECK (failed_login_attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users (kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON users (is_deleted);
CREATE INDEX IF NOT EXISTS idx_users_pan_number ON users (pan_number);
CREATE INDEX IF NOT EXISTS idx_users_aadhar_number ON users (aadhar_number);
