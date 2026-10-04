CREATE TABLE IF NOT EXISTS mailbox_state (
  admin_email TEXT NOT NULL,
  item_key TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox', 'archive', 'trash')),
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (admin_email, item_key)
);
CREATE INDEX IF NOT EXISTS idx_mailbox_state_admin_folder
  ON mailbox_state(admin_email, folder, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_state_admin_star
  ON mailbox_state(admin_email, starred, updated_at DESC);

CREATE TABLE IF NOT EXISTS mailbox_drafts (
  admin_email TEXT NOT NULL,
  item_key TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (admin_email, item_key)
);

CREATE TABLE IF NOT EXISTS mailbox_outbound (
  id TEXT PRIMARY KEY,
  item_key TEXT NOT NULL DEFAULT '',
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Sending' CHECK (status IN ('Sending', 'Accepted', 'Failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_mailbox_outbound_item
  ON mailbox_outbound(admin_email, item_key, created_at DESC);

