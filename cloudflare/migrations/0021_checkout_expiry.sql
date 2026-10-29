-- Additive checkout lifecycle tracking; no paid orders or stock are replayed.
ALTER TABLE orders ADD COLUMN checkout_expired_at TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN checkout_expiry_lock_until TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN checkout_expiry_next_attempt_at TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN checkout_expiry_error TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_checkout_expiry ON orders(payment_status, checkout_expired_at, created_at);

CREATE TRIGGER prevent_unpaid_fulfillment
BEFORE UPDATE OF fulfillment_status ON orders
WHEN NEW.fulfillment_status IN ('Processing', 'Shipped', 'Fulfilled') AND NEW.payment_status != 'Paid'
BEGIN
  SELECT RAISE(ABORT, 'Only settled paid orders can be fulfilled.');
END;
