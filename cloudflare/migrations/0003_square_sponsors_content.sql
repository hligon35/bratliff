-- Adds Square commerce fields, sponsor recognition, contacts/consent, book interests,
-- authors/featured-content, privacy-conscious analytics, and an audit log.
-- Additive and data-preserving: existing Stripe order identifiers are copied into
-- nullable legacy_* columns rather than destroyed.

-- ---------------------------------------------------------------------------
-- Books: merchandising, imagery metadata, Square catalog linkage
-- ---------------------------------------------------------------------------
ALTER TABLE books ADD COLUMN on_sale INTEGER NOT NULL DEFAULT 0;
ALTER TABLE books ADD COLUMN image_alt TEXT NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN image_focal_x REAL NOT NULL DEFAULT 50;
ALTER TABLE books ADD COLUMN image_focal_y REAL NOT NULL DEFAULT 50;
ALTER TABLE books ADD COLUMN square_catalog_item_id TEXT NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN square_catalog_variation_id TEXT NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN retailer_urls TEXT NOT NULL DEFAULT '[]';
ALTER TABLE books ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE books ADD COLUMN author_id TEXT NOT NULL DEFAULT '';

-- Only one book may be the homepage-featured book at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_books_single_featured ON books(featured) WHERE featured = 1;

-- ---------------------------------------------------------------------------
-- Contacts: one identity record per email, separate from consent/interests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  first_interaction_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_interaction_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  newsletter_consent INTEGER NOT NULL DEFAULT 0,
  newsletter_consent_at TEXT NOT NULL DEFAULT '',
  newsletter_consent_source TEXT NOT NULL DEFAULT '',
  unsubscribed INTEGER NOT NULL DEFAULT 0,
  suppressed INTEGER NOT NULL DEFAULT 0,
  suppression_reason TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  is_sponsor INTEGER NOT NULL DEFAULT 0,
  is_customer INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_consent
  ON contacts(newsletter_consent, unsubscribed, suppressed);

-- Backfill one contact per distinct email already on file, with no automatic
-- newsletter consent beyond what newsletter_subscribers already recorded.
INSERT OR IGNORE INTO contacts (id, email, display_name, source, first_interaction_at, last_interaction_at, newsletter_consent, newsletter_consent_at, newsletter_consent_source, is_customer)
SELECT lower(hex(randomblob(16))), lower(email), '', 'newsletter_subscribers', first_seen_at, last_seen_at,
       CASE WHEN consent = 1 AND status = 'active' THEN 1 ELSE 0 END,
       CASE WHEN consent = 1 AND status = 'active' THEN last_seen_at ELSE '' END,
       'newsletter', 0
FROM newsletter_subscribers;

INSERT OR IGNORE INTO contacts (id, email, display_name, source, first_interaction_at, last_interaction_at)
SELECT lower(hex(randomblob(16))), lower(email), name, 'form_submissions', min(created_at), max(created_at)
FROM form_submissions
WHERE email != ''
GROUP BY lower(email);

INSERT OR IGNORE INTO contacts (id, email, display_name, source, first_interaction_at, last_interaction_at, is_customer)
SELECT lower(hex(randomblob(16))), lower(customer_email), customer_name, 'orders', min(created_at), max(created_at), 1
FROM orders
WHERE customer_email != ''
GROUP BY lower(customer_email);

-- ---------------------------------------------------------------------------
-- Book interests ("Notify Me"), keyed by stable book_id
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS book_interests (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  signup_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_page TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  notified_at TEXT NOT NULL DEFAULT '',
  suppressed_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(contact_id) REFERENCES contacts(id),
  FOREIGN KEY(book_id) REFERENCES books(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_book_interests_active_unique
  ON book_interests(contact_id, book_id) WHERE status = 'Active';
CREATE INDEX IF NOT EXISTS idx_book_interests_book
  ON book_interests(book_id, signup_at DESC);

-- ---------------------------------------------------------------------------
-- Authors and featured-author homepage content
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  short_intro TEXT NOT NULL DEFAULT '',
  biography TEXT NOT NULL DEFAULT '',
  portrait_key TEXT NOT NULL DEFAULT '',
  portrait_url TEXT NOT NULL DEFAULT '',
  portrait_alt TEXT NOT NULL DEFAULT '',
  portrait_focal_x REAL NOT NULL DEFAULT 50,
  portrait_focal_y REAL NOT NULL DEFAULT 50,
  website_url TEXT NOT NULL DEFAULT '',
  social_links TEXT NOT NULL DEFAULT '[]',
  related_book_ids TEXT NOT NULL DEFAULT '[]',
  cta_label TEXT NOT NULL DEFAULT '',
  cta_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft',
  start_at TEXT NOT NULL DEFAULT '',
  end_at TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Only one author may be Published (homepage-featured) at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_authors_single_published ON authors(status) WHERE status = 'Published';

-- ---------------------------------------------------------------------------
-- Sponsors (Read It Forward) and their Square payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  package TEXT NOT NULL,
  books_sponsored INTEGER NOT NULL DEFAULT 0,
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  payer_name TEXT NOT NULL DEFAULT '',
  payer_email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT 'individual',
  anonymous INTEGER NOT NULL DEFAULT 0,
  publish_permission INTEGER NOT NULL DEFAULT 0,
  logo_key TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  logo_alt TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  recognition_status TEXT NOT NULL DEFAULT 'Awaiting Payment',
  admin_notes TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL DEFAULT '',
  approved_at TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sponsors_public
  ON sponsors(recognition_status, package, display_order);
CREATE INDEX IF NOT EXISTS idx_sponsors_payer_email ON sponsors(payer_email);

CREATE TABLE IF NOT EXISTS sponsor_payments (
  id TEXT PRIMARY KEY,
  sponsor_id TEXT NOT NULL,
  square_order_id TEXT NOT NULL DEFAULT '',
  square_payment_id TEXT NOT NULL DEFAULT '',
  square_checkout_id TEXT NOT NULL DEFAULT '',
  square_event_id TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(sponsor_id) REFERENCES sponsors(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsor_payments_checkout
  ON sponsor_payments(square_checkout_id) WHERE square_checkout_id != '';
CREATE INDEX IF NOT EXISTS idx_sponsor_payments_sponsor ON sponsor_payments(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_payments_order ON sponsor_payments(square_order_id);

-- ---------------------------------------------------------------------------
-- Privacy-conscious analytics: raw short-retention events + daily aggregates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT NOT NULL,
  page_path TEXT NOT NULL DEFAULT '',
  referrer_category TEXT NOT NULL DEFAULT '',
  device_category TEXT NOT NULL DEFAULT '',
  book_id TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}',
  visitor_hash TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
  ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_page
  ON analytics_events(page_path, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_daily (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  dimension TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric, dimension)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_metric ON analytics_daily(metric, day DESC);

-- ---------------------------------------------------------------------------
-- Audit log for admin actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  admin_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin
  ON audit_log(admin_email, created_at DESC);

-- ---------------------------------------------------------------------------
-- webhook_events: make provider-generic (was Stripe-only) and add retry fields
-- ---------------------------------------------------------------------------
ALTER TABLE webhook_events ADD COLUMN provider TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE webhook_events ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE webhook_events ADD COLUMN last_error TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider
  ON webhook_events(provider, processed_at DESC);

-- ---------------------------------------------------------------------------
-- Orders: move off required stripe_* columns. SQLite cannot drop NOT
-- NULL/UNIQUE constraints in place, so the table is rebuilt and existing rows
-- (and their Stripe identifiers) are preserved into legacy_stripe_* columns.
-- ---------------------------------------------------------------------------
CREATE TABLE orders_new (
  order_number TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'square',
  square_order_id TEXT NOT NULL DEFAULT '',
  square_payment_id TEXT NOT NULL DEFAULT '',
  square_checkout_id TEXT NOT NULL DEFAULT '',
  square_event_id TEXT NOT NULL DEFAULT '',
  legacy_stripe_session_id TEXT NOT NULL DEFAULT '',
  legacy_stripe_payment_id TEXT NOT NULL DEFAULT '',
  legacy_stripe_event_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0,
  shipping REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'Pending',
  fulfillment_status TEXT NOT NULL DEFAULT 'Unfulfilled',
  tracking_number TEXT NOT NULL DEFAULT '',
  shipping_address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

INSERT INTO orders_new (
  order_number, provider, legacy_stripe_session_id, legacy_stripe_payment_id, legacy_stripe_event_id,
  created_at, customer_name, customer_email, subtotal, shipping, tax, total,
  payment_status, fulfillment_status, tracking_number, shipping_address, notes
)
SELECT order_number, 'stripe', stripe_session_id, stripe_payment_id, stripe_event_id,
  created_at, customer_name, customer_email, subtotal, shipping, tax, total,
  payment_status, fulfillment_status, tracking_number, shipping_address, notes
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_square_checkout
  ON orders(square_checkout_id) WHERE square_checkout_id != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_square_event
  ON orders(square_event_id) WHERE square_event_id != '';

-- order_items referenced orders by order_number, which is preserved as-is.
