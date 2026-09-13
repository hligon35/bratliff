-- Adds "Book Buzz" audience targeting to newsletter campaigns: a campaign can
-- either go to all active/consented subscribers (default, unchanged behavior)
-- or to everyone who submitted the "Notify Me" form for a specific book title.
-- Additive and backward compatible; existing campaigns default to target_type = 'all'.

ALTER TABLE newsletter_campaigns ADD COLUMN target_type TEXT NOT NULL DEFAULT 'all';
ALTER TABLE newsletter_campaigns ADD COLUMN target_value TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_form_submissions_book_notification
  ON form_submissions(form_type, title) WHERE form_type = 'bookNotification';
