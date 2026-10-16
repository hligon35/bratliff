-- Sponsor message moderation and initial Read It Forward Sponsor Wall entries.
-- Message review is independent from sponsor recognition, so a sponsor can be published
-- while their optional message is still Pending Review.
ALTER TABLE sponsors ADD COLUMN sponsor_message TEXT NOT NULL DEFAULT '';
ALTER TABLE sponsors ADD COLUMN sponsor_message_status TEXT NOT NULL DEFAULT '';
ALTER TABLE sponsors ADD COLUMN sponsor_message_acknowledged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sponsors ADD COLUMN sponsor_message_reviewed_by TEXT NOT NULL DEFAULT '';
ALTER TABLE sponsors ADD COLUMN sponsor_message_reviewed_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sponsors_message_review
  ON sponsors(sponsor_message_status, recognition_status);

-- These entries were supplied as current sponsors. They have no uploaded logo;
-- the public wall uses the standard recognition emblem where a logo slot is shown.
INSERT INTO sponsors (
  id, package, books_sponsored, amount_paid_cents, payer_name, display_name,
  entity_type, anonymous, publish_permission, logo_key, logo_url, logo_alt,
  recognition_status, approved_by, paid_at, approved_at, published_at, created_at, updated_at
)
SELECT
  'SP-SEED-R5-20261016', 'pagePal', 5, 10000, 'R5 Ventures Group', 'R5 Ventures Group',
  'organization', 0, 1, '', '', '',
  'Published', 'seed', datetime('now'), datetime('now'), datetime('now'), datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM sponsors WHERE lower(display_name) = lower('R5 Ventures Group') AND package = 'pagePal'
);

INSERT INTO sponsors (
  id, package, books_sponsored, amount_paid_cents, payer_name, display_name,
  entity_type, anonymous, publish_permission, logo_key, logo_url, logo_alt,
  recognition_status, approved_by, paid_at, approved_at, published_at, created_at, updated_at
)
SELECT
  'SP-SEED-RHA-20261016', 'literacyTrailblazer', 50, 100000, 'Restoration Hands of Aloha', 'Restoration Hands of Aloha',
  'organization', 0, 1, '', '', '',
  'Published', 'seed', datetime('now'), datetime('now'), datetime('now'), datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM sponsors WHERE lower(display_name) = lower('Restoration Hands of Aloha') AND package = 'literacyTrailblazer'
);
