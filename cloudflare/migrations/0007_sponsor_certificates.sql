ALTER TABLE sponsors ADD COLUMN certificate_status TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE sponsors ADD COLUMN certificate_sent_at TEXT NOT NULL DEFAULT '';
ALTER TABLE sponsors ADD COLUMN certificate_error TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sponsors_certificate_status
  ON sponsors(certificate_status, updated_at DESC);
