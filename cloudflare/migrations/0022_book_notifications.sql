ALTER TABLE books ADD COLUMN notification_title TEXT NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN notification_key TEXT NOT NULL DEFAULT '';
ALTER TABLE form_submissions ADD COLUMN book_notification_key TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_book_notification_match ON form_submissions(form_type, book_notification_key, status);
CREATE INDEX idx_available_notification_books ON books(notification_key, status, stock);

-- One availability announcement per reader/title, including multiple formats.
-- Uses the same delivery processor as form receipts, with separate progress.
CREATE TABLE book_notification_email_deliveries (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES form_submissions(id),
  book_id TEXT NOT NULL REFERENCES books(id),
  notification_key TEXT NOT NULL,
  email TEXT NOT NULL,
  message_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Sending','Sent','Failed','Skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT NOT NULL DEFAULT '',
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lock_id TEXT NOT NULL DEFAULT '',
  lock_until TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(notification_key, email)
);
CREATE INDEX idx_book_notification_email_queue ON book_notification_email_deliveries(status, next_attempt_at);
