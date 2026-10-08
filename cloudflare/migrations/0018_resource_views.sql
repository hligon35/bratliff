CREATE TABLE IF NOT EXISTS resource_view_sessions (
  view_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  resource_slug TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  viewed_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_resource_view_sessions_counts
  ON resource_view_sessions(resource_slug, viewed_at);
CREATE INDEX IF NOT EXISTS idx_resource_view_sessions_pending
  ON resource_view_sessions(customer_id, started_at)
  WHERE viewed_at = '';
