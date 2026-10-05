CREATE TABLE IF NOT EXISTS mailbox_external_messages (
  uid TEXT PRIMARY KEY,
  message_id TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  to_email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mailbox_external_messages_received
  ON mailbox_external_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_external_messages_from
  ON mailbox_external_messages(from_email);
