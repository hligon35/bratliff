-- Resetting a password invalidates older signed sessions without deleting users.
ALTER TABLE customer_accounts ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
