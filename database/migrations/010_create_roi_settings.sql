-- Migration: 010_create_roi_settings
-- Tikhat Partner App — Default and term-based ROI per investor

CREATE TABLE IF NOT EXISTS roi_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL,
  type VARCHAR(20) NOT NULL,
  roi_percentage INTEGER NOT NULL,
  start_date DATE,
  end_date DATE,
  created_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_roi_settings_type CHECK (type IN ('default', 'term')),
  CONSTRAINT chk_roi_settings_percentage CHECK (roi_percentage > 0),
  CONSTRAINT chk_roi_settings_term_dates CHECK (
    (type = 'default' AND end_date IS NULL)
    OR (
      type = 'term'
      AND start_date IS NOT NULL
      AND end_date IS NOT NULL
      AND end_date >= start_date
    )
  ),
  CONSTRAINT fk_roi_settings_investor
    FOREIGN KEY (investor_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_roi_settings_created_by
    FOREIGN KEY (created_by) REFERENCES admins (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_roi_settings_investor_id
  ON roi_settings (investor_id);
CREATE INDEX IF NOT EXISTS idx_roi_settings_type
  ON roi_settings (type);
CREATE INDEX IF NOT EXISTS idx_roi_settings_is_active
  ON roi_settings (is_active);
CREATE INDEX IF NOT EXISTS idx_roi_settings_dates
  ON roi_settings (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_roi_settings_created_at
  ON roi_settings (created_at);

-- At most one active default ROI per investor
CREATE UNIQUE INDEX IF NOT EXISTS uq_roi_settings_active_default
  ON roi_settings (investor_id)
  WHERE type = 'default' AND is_active = TRUE;
