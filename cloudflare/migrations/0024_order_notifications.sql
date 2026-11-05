-- Queue only new settlements; historical orders must not generate a mail flood.
CREATE TABLE order_email_deliveries (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES orders(order_number),
  message_json TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Sending', 'Sent', 'Failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT NOT NULL DEFAULT '',
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lock_id TEXT NOT NULL DEFAULT '',
  lock_until TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_order_email_queue ON order_email_deliveries(status, next_attempt_at);
CREATE TRIGGER order_settlement_notification AFTER INSERT ON order_settlements
BEGIN
  INSERT INTO order_email_deliveries (id, submission_id)
  VALUES ('order:' || NEW.order_number, NEW.order_number)
  ON CONFLICT(submission_id) DO NOTHING;
END;

-- Preserve the selected format with each line even if the catalog changes later.
ALTER TABLE order_items ADD COLUMN format TEXT NOT NULL DEFAULT '';
CREATE TRIGGER order_item_format AFTER INSERT ON order_items
BEGIN
  UPDATE order_items SET format = COALESCE((
    SELECT json_extract(j.value, '$.format') FROM checkout_sessions s, json_each(s.cart_json) j
    WHERE s.session_id = NEW.order_number AND json_extract(j.value, '$.bookId') = NEW.book_id LIMIT 1
  ), '') WHERE id = NEW.id;
END;
