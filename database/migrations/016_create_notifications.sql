-- Migration: 016_create_notifications
-- Tikhat Partner App — In-app notifications for investors

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(30) NOT NULL,
  reference_id VARCHAR(100),
  reference_type VARCHAR(50),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_notifications_type CHECK (
    type IN ('transaction', 'request', 'support', 'system', 'custom')
  ),
  CONSTRAINT fk_notifications_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_investor_is_read
  ON notifications (investor_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_investor_id
  ON notifications (investor_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications (type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_reference
  ON notifications (reference_type, reference_id);
