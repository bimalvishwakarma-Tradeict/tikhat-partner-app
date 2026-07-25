-- Migration: 023_seed_global_settings
-- Tikhat Partner App — Default system settings (Task 2.8 keys)

INSERT INTO global_settings (key, value)
VALUES
  ('revenue_credit_hour', '18'),
  ('revenue_credit_minute', '0'),
  ('min_capital_deposit', '10000'),
  ('max_capital_deposit', '1000000'),
  ('min_withdrawal', '1000'),
  ('upi_transfer_limit', '100000'),
  ('maintenance_mode', 'false')
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  updated_at = NOW();
