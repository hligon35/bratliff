-- Additive ledgers. Existing paid orders are left intact for explicit reconciliation.
CREATE TABLE checkout_reservations (
  order_number TEXT NOT NULL REFERENCES orders(order_number),
  book_id TEXT NOT NULL REFERENCES books(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  expires_at TEXT NOT NULL,
  PRIMARY KEY (order_number, book_id)
);
CREATE INDEX idx_reservations_book_expiry ON checkout_reservations(book_id, expires_at);
CREATE TRIGGER checkout_reservation_stock BEFORE INSERT ON checkout_reservations
BEGIN
  SELECT RAISE(ABORT, 'Insufficient available inventory') WHERE NOT EXISTS (
    SELECT 1 FROM books b WHERE b.id = NEW.book_id
      AND b.stock >= NEW.quantity + COALESCE((SELECT SUM(r.quantity)
        FROM checkout_reservations r WHERE r.book_id = NEW.book_id
        AND datetime(r.expires_at) > datetime('now')), 0)
  );
END;

CREATE TABLE order_settlements (
  order_number TEXT PRIMARY KEY REFERENCES orders(order_number),
  payment_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  shipping_address TEXT NOT NULL DEFAULT '',
  settled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- An insert, its inventory checks, all items, audit rows and Paid state are one
-- SQLite transaction. A duplicate order_number cannot replay any side effect.
CREATE TRIGGER order_settlement_validate BEFORE INSERT ON order_settlements
WHEN NOT EXISTS (SELECT 1 FROM order_settlements WHERE order_number = NEW.order_number)
BEGIN
  SELECT RAISE(ABORT, 'Checkout cart missing') WHERE NOT EXISTS (
    SELECT 1 FROM checkout_sessions WHERE session_id = NEW.order_number
      AND json_valid(cart_json) AND json_array_length(cart_json) > 0
  );
  SELECT RAISE(ABORT, 'Legacy paid order requires reconciliation') WHERE EXISTS (
    SELECT 1 FROM orders WHERE order_number = NEW.order_number AND payment_status IN ('Paid', 'Refunded', 'Partially Refunded')
  );
  SELECT RAISE(ABORT, 'Insufficient inventory for settlement') WHERE EXISTS (
    SELECT 1 FROM checkout_sessions s, json_each(s.cart_json) j
    LEFT JOIN books b ON b.id = json_extract(j.value, '$.bookId')
    WHERE s.session_id = NEW.order_number AND (
      b.id IS NULL OR (COALESCE(json_extract(j.value, '$.preorder'), 0) = 0 AND
        b.stock < (SELECT SUM(json_extract(j2.value, '$.quantity')) FROM json_each(s.cart_json) j2
          WHERE json_extract(j2.value, '$.bookId') = b.id)
          + COALESCE((SELECT SUM(r.quantity) FROM checkout_reservations r WHERE r.book_id = b.id
            AND r.order_number != NEW.order_number AND datetime(r.expires_at) > datetime('now')), 0))
    )
  );
END;

CREATE TRIGGER order_settlement_apply AFTER INSERT ON order_settlements
BEGIN
  INSERT INTO order_items (order_number, book_id, sku, title, quantity, unit_price, line_total)
    SELECT NEW.order_number, json_extract(j.value, '$.bookId'), json_extract(j.value, '$.sku'),
      json_extract(j.value, '$.title'), json_extract(j.value, '$.quantity'),
      json_extract(j.value, '$.unitPrice'), json_extract(j.value, '$.lineTotal')
    FROM checkout_sessions s, json_each(s.cart_json) j WHERE s.session_id = NEW.order_number;
  INSERT INTO inventory_events (id, created_at, book_id, sku, title, change_qty, previous_qty, new_qty, reason, order_number, admin_email, notes)
    SELECT 'sale:' || NEW.order_number || ':' || b.id, datetime('now'), b.id, b.sku, b.title,
      -SUM(json_extract(j.value, '$.quantity')), b.stock, b.stock - SUM(json_extract(j.value, '$.quantity')),
      'Online sale', NEW.order_number, 'Square', ''
    FROM checkout_sessions s, json_each(s.cart_json) j JOIN books b ON b.id = json_extract(j.value, '$.bookId')
    WHERE s.session_id = NEW.order_number AND COALESCE(json_extract(j.value, '$.preorder'), 0) = 0 GROUP BY b.id;
  UPDATE books SET stock = stock + (SELECT change_qty FROM inventory_events
      WHERE id = 'sale:' || NEW.order_number || ':' || books.id), updated_at = datetime('now')
    WHERE id IN (SELECT book_id FROM inventory_events WHERE order_number = NEW.order_number AND reason = 'Online sale');
  UPDATE books SET status = CASE WHEN stock <= 0 THEN 'Out of Stock' ELSE 'Published' END
    WHERE id IN (SELECT book_id FROM inventory_events WHERE order_number = NEW.order_number AND reason = 'Online sale')
      AND preorder = 0 AND status NOT IN ('Draft', 'Archived');
  UPDATE orders SET square_payment_id = NEW.payment_id, square_event_id = NEW.event_id,
    payment_status = 'Paid', total = NEW.amount_cents / 100.0,
    customer_name = CASE WHEN NEW.customer_name != '' THEN NEW.customer_name ELSE customer_name END,
    customer_email = CASE WHEN NEW.customer_email != '' THEN NEW.customer_email ELSE customer_email END,
    shipping_address = CASE WHEN NEW.shipping_address != '' THEN NEW.shipping_address ELSE shipping_address END
    WHERE order_number = NEW.order_number;
  DELETE FROM checkout_reservations WHERE order_number = NEW.order_number;
END;

ALTER TABLE orders ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sponsor_payments ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0;
-- Preserve historical fully-refunded status. Audit old partial refunds separately:
-- the previous implementation recorded them as fully Refunded.
UPDATE orders SET refunded_cents = CAST(ROUND(total * 100) AS INTEGER) WHERE payment_status = 'Refunded';
UPDATE sponsor_payments SET refunded_cents = amount_cents WHERE status = 'refunded';
CREATE TABLE square_refunds (
  refund_id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_square_refunds_payment ON square_refunds(payment_id);
-- Financial refunds do not imply that physical books were returned.
CREATE TRIGGER square_refund_apply AFTER INSERT ON square_refunds
BEGIN
  UPDATE orders SET refunded_cents = MAX(refunded_cents, (SELECT SUM(amount_cents) FROM square_refunds WHERE payment_id = NEW.payment_id))
    WHERE square_payment_id = NEW.payment_id;
  UPDATE orders SET payment_status = CASE WHEN refunded_cents >= ROUND(total * 100) THEN 'Refunded' ELSE 'Partially Refunded' END
    WHERE square_payment_id = NEW.payment_id;
  UPDATE sponsor_payments SET refunded_cents = MAX(refunded_cents, (SELECT SUM(amount_cents) FROM square_refunds WHERE payment_id = NEW.payment_id)),
    updated_at = datetime('now') WHERE square_payment_id = NEW.payment_id;
  UPDATE sponsor_payments SET status = CASE WHEN refunded_cents >= amount_cents THEN 'refunded' ELSE 'partially_refunded' END
    WHERE square_payment_id = NEW.payment_id;
  UPDATE sponsors SET recognition_status = CASE WHEN EXISTS (
      SELECT 1 FROM sponsor_payments WHERE sponsor_id = sponsors.id AND square_payment_id = NEW.payment_id AND status = 'refunded'
    ) THEN 'Refunded' ELSE 'Partially Refunded' END, updated_at = datetime('now')
    WHERE id IN (SELECT sponsor_id FROM sponsor_payments WHERE square_payment_id = NEW.payment_id);
END;

CREATE TABLE public_rate_limits (
  identity_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  requests INTEGER NOT NULL,
  PRIMARY KEY (identity_key, window_start)
);

ALTER TABLE newsletter_campaigns ADD COLUMN delivery_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE newsletter_campaigns ADD COLUMN send_lock_id TEXT NOT NULL DEFAULT '';
ALTER TABLE newsletter_campaigns ADD COLUMN send_lock_until TEXT NOT NULL DEFAULT '';
CREATE TABLE newsletter_deliveries (
  campaign_id TEXT NOT NULL REFERENCES newsletter_campaigns(campaign_id),
  email TEXT NOT NULL,
  unsubscribe_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Sent', 'Failed', 'Skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  first_attempt_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, email)
);
CREATE INDEX idx_newsletter_delivery_due ON newsletter_deliveries(campaign_id, status, next_attempt_at);

-- Certificate retries must not race or outlive the provider's deduplication window.
ALTER TABLE sponsors ADD COLUMN certificate_first_attempt_at TEXT NOT NULL DEFAULT '';
ALTER TABLE sponsors ADD COLUMN certificate_lock_id TEXT NOT NULL DEFAULT '';
ALTER TABLE sponsors ADD COLUMN certificate_lock_until TEXT NOT NULL DEFAULT '';
