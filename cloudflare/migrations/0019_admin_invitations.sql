CREATE TABLE admin_invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'developer', 'manager')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Accepted', 'Revoked', 'Expired')),
  expires_at TEXT NOT NULL,
  invited_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT
);

CREATE UNIQUE INDEX idx_admin_invitations_pending_email
  ON admin_invitations(lower(email)) WHERE status = 'Pending';
CREATE INDEX idx_admin_invitations_expiry
  ON admin_invitations(status, expires_at);
