ALTER TABLE sponsors ADD COLUMN mailing_address TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sponsors_mailing_address
  ON sponsors(package, mailing_address)
  WHERE package = 'literacyTrailblazer' AND mailing_address != '';
