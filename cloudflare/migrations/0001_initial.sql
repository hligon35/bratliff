CREATE TABLE IF NOT EXISTS admins (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'fulfillment', 'marketing')),
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  form_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  identity_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL DEFAULT '',
  group_size TEXT NOT NULL DEFAULT '',
  preferred_format TEXT NOT NULL DEFAULT '',
  request_text TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_type_created
  ON form_submissions(form_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_submissions_identity_created
  ON form_submissions(identity_key, created_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status
  ON newsletter_subscribers(status, consent, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  campaign_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'Draft',
  title TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  preview_text TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  hero_message TEXT NOT NULL DEFAULT '',
  hero_cta_label TEXT NOT NULL DEFAULT '',
  hero_cta_url TEXT NOT NULL DEFAULT '',
  featured_book_id TEXT NOT NULL DEFAULT '',
  featured_book_title TEXT NOT NULL DEFAULT '',
  featured_book_description TEXT NOT NULL DEFAULT '',
  featured_book_image_url TEXT NOT NULL DEFAULT '',
  featured_cta_label TEXT NOT NULL DEFAULT '',
  featured_cta_url TEXT NOT NULL DEFAULT '',
  quick1_title TEXT NOT NULL DEFAULT '',
  quick1_text TEXT NOT NULL DEFAULT '',
  quick1_url TEXT NOT NULL DEFAULT '',
  quick2_title TEXT NOT NULL DEFAULT '',
  quick2_text TEXT NOT NULL DEFAULT '',
  quick2_url TEXT NOT NULL DEFAULT '',
  closing_note TEXT NOT NULL DEFAULT '',
  send_date TEXT NOT NULL DEFAULT '',
  send_time TEXT NOT NULL DEFAULT '',
  time_zone TEXT NOT NULL DEFAULT 'America/New_York',
  scheduled_at TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',
  recipients INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_updated
  ON newsletter_campaigns(updated_at DESC);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  isbn TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  synopsis TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  compare_price REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  image_key TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  coming_soon INTEGER NOT NULL DEFAULT 0,
  preorder INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft',
  publication_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_books_public_sort
  ON books(status, featured DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS inventory_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  book_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  change_qty INTEGER NOT NULL,
  previous_qty INTEGER NOT NULL,
  new_qty INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  order_number TEXT NOT NULL DEFAULT '',
  admin_email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(book_id) REFERENCES books(id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_events_created
  ON inventory_events(created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  order_number TEXT PRIMARY KEY,
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_id TEXT NOT NULL DEFAULT '',
  stripe_event_id TEXT NOT NULL UNIQUE,
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

CREATE INDEX IF NOT EXISTS idx_orders_created
  ON orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_email
  ON orders(customer_email, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL,
  book_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  FOREIGN KEY(order_number) REFERENCES orders(order_number),
  FOREIGN KEY(book_id) REFERENCES books(id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_number);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  session_id TEXT PRIMARY KEY,
  cart_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'processing'
);