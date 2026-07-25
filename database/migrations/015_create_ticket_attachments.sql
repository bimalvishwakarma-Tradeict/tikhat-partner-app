-- Migration: 015_create_ticket_attachments
-- Tikhat Partner App — Attachments on ticket messages (JPG/PNG/PDF, max 5MB)

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  ticket_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_ticket_attachments_file_type CHECK (
    file_type IN ('image/jpeg', 'image/png', 'application/pdf')
  ),
  CONSTRAINT chk_ticket_attachments_file_size CHECK (
    file_size > 0 AND file_size <= 5242880
  ),
  CONSTRAINT fk_ticket_attachments_message
    FOREIGN KEY (message_id) REFERENCES ticket_messages (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ticket_attachments_ticket
    FOREIGN KEY (ticket_id) REFERENCES support_tickets (id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message_id
  ON ticket_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id
  ON ticket_attachments (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_created_at
  ON ticket_attachments (created_at);
