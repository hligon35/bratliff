CREATE TABLE IF NOT EXISTS resource_registrations (
  customer_id TEXT PRIMARY KEY REFERENCES customer_accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  organization TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  selected_resource TEXT NOT NULL,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resource_registrations_created
  ON resource_registrations(created_at DESC);

CREATE TABLE IF NOT EXISTS resource_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  resource_slug TEXT NOT NULL,
  downloaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resource_downloads_resource
  ON resource_downloads(resource_slug, downloaded_at DESC);