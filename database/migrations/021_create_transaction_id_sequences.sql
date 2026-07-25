-- Migration: 021_create_transaction_id_sequences
-- Tikhat Partner App — Per-type, per-year sequence counters for TKT-XXX-YYYY-XXXXX IDs

CREATE TABLE IF NOT EXISTS transaction_id_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_transaction_id_sequences_type_year UNIQUE (type, year),
  CONSTRAINT chk_transaction_id_sequences_type CHECK (
    type IN (
      'CAP-DEP',
      'CAP-WDR',
      'REV-CR',
      'REV-WDR',
      'ADM',
      'SUP',
      'PRF'
    )
  ),
  CONSTRAINT chk_transaction_id_sequences_year CHECK (year >= 2020),
  CONSTRAINT chk_transaction_id_sequences_last_sequence CHECK (last_sequence >= 0)
);

CREATE INDEX IF NOT EXISTS idx_transaction_id_sequences_type
  ON transaction_id_sequences (type);
CREATE INDEX IF NOT EXISTS idx_transaction_id_sequences_year
  ON transaction_id_sequences (year);
CREATE INDEX IF NOT EXISTS idx_transaction_id_sequences_type_year
  ON transaction_id_sequences (type, year);

-- Seed all 7 transaction types for the current IST calendar year
INSERT INTO transaction_id_sequences (type, year, last_sequence)
VALUES
  ('CAP-DEP', EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INTEGER, 0),
  ('CAP-WDR', EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INTEGER, 0),
  ('REV-CR', EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INTEGER, 0),
  ('REV-WDR', EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INTEGER, 0),
  ('ADM', EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INTEGER, 0),
  ('SUP', EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INTEGER, 0),
  ('PRF', EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INTEGER, 0)
ON CONFLICT (type, year) DO NOTHING;
