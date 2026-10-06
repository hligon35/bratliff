-- Existing access decisions are authoritative. Bootstrap only an empty database.
CREATE TABLE admin_bootstrap_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO admin_bootstrap_state (id) SELECT 1 WHERE EXISTS (SELECT 1 FROM admins);

CREATE TRIGGER admins_keep_last_owner_on_delete BEFORE DELETE ON admins
WHEN OLD.role = 'owner' AND (SELECT COUNT(*) FROM admins WHERE role = 'owner') <= 1
BEGIN SELECT RAISE(ABORT, 'The last owner cannot be removed.'); END;
CREATE TRIGGER admins_keep_last_owner_on_update BEFORE UPDATE OF role ON admins
WHEN OLD.role = 'owner' AND NEW.role != 'owner'
  AND (SELECT COUNT(*) FROM admins WHERE role = 'owner') <= 1
BEGIN SELECT RAISE(ABORT, 'The last owner cannot be demoted.'); END;

ALTER TABLE form_submissions ADD COLUMN request_key TEXT NOT NULL DEFAULT '';
ALTER TABLE form_submissions ADD COLUMN request_hash TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_form_submission_request ON form_submissions(request_key) WHERE request_key != '';

-- Frozen payloads and stable provider keys let acknowledgments retry independently.
CREATE TABLE submission_email_deliveries (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES form_submissions(id),
  message_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Sending', 'Sent', 'Failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT NOT NULL DEFAULT '',
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lock_id TEXT NOT NULL DEFAULT '',
  lock_until TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_submission_email_queue ON submission_email_deliveries(status, next_attempt_at);
CREATE INDEX idx_submission_email_record ON submission_email_deliveries(submission_id, status);
