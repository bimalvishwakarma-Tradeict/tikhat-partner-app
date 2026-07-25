-- Migration: 014_create_ticket_messages
-- Tikhat Partner App — Support ticket conversation thread

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  sender_type VARCHAR(20) NOT NULL,
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_ticket_messages_sender_type CHECK (
    sender_type IN ('investor', 'admin')
  ),
  CONSTRAINT chk_ticket_messages_message_not_empty CHECK (
    length(trim(message)) > 0
  ),
  CONSTRAINT fk_ticket_messages_ticket
    FOREIGN KEY (ticket_id) REFERENCES support_tickets (id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id
  ON ticket_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender
  ON ticket_messages (sender_type, sender_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at
  ON ticket_messages (created_at);
