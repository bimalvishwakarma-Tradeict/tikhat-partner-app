-- Migration: 013_create_support_tickets
-- Tikhat Partner App — Support tickets

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id VARCHAR(32) NOT NULL,
  investor_id UUID NOT NULL,
  category VARCHAR(30) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  assigned_to UUID,
  escalated_to_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_support_tickets_ticket_id UNIQUE (ticket_id),
  CONSTRAINT chk_support_tickets_ticket_id_format CHECK (
    ticket_id ~ '^TKT-SUP-[0-9]{4}-[0-9]{5}$'
  ),
  CONSTRAINT chk_support_tickets_category CHECK (
    category IN (
      'capital',
      'revenue',
      'withdrawal',
      'kyc_profile',
      'technical',
      'other'
    )
  ),
  CONSTRAINT chk_support_tickets_status CHECK (
    status IN ('open', 'in_progress', 'resolved', 'closed')
  ),
  CONSTRAINT fk_support_tickets_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_support_tickets_assigned_to
    FOREIGN KEY (assigned_to) REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_id
  ON support_tickets (ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_investor
  ON support_tickets (investor_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to
  ON support_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category
  ON support_tickets (category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_escalated
  ON support_tickets (escalated_to_super_admin);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
  ON support_tickets (created_at);
