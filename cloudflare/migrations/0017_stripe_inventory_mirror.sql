-- D1 remains the transaction-safe inventory authority. Stripe receives a
-- product metadata mirror for visibility; Stripe Checkout does not decrement it.
CREATE TABLE IF NOT EXISTS stripe_inventory_mirror (
  book_id TEXT PRIMARY KEY,
  stripe_product_id TEXT NOT NULL DEFAULT '',
  desired_stock INTEGER NOT NULL DEFAULT 0,
  desired_status TEXT NOT NULL DEFAULT 'Draft',
  synced_stock INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
  last_attempt_at TEXT NOT NULL DEFAULT '',
  last_synced_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stripe_inventory_mirror_queue
  ON stripe_inventory_mirror(sync_status, updated_at);
INSERT INTO stripe_inventory_mirror (book_id, desired_stock, desired_status, sync_status)
SELECT id, stock, status, 'pending' FROM books WHERE 1
ON CONFLICT(book_id) DO UPDATE SET
  desired_stock = excluded.desired_stock,
  desired_status = excluded.desired_status,
  sync_status = CASE WHEN stripe_inventory_mirror.sync_status = 'synced'
    AND stripe_inventory_mirror.synced_stock = excluded.desired_stock
    THEN 'synced' ELSE 'pending' END,
  updated_at = datetime('now');
CREATE TRIGGER IF NOT EXISTS books_stripe_inventory_insert
AFTER INSERT ON books
BEGIN
  INSERT INTO stripe_inventory_mirror (book_id, desired_stock, desired_status, sync_status, updated_at)
  VALUES (NEW.id, NEW.stock, NEW.status, 'pending', datetime('now'))
  ON CONFLICT(book_id) DO UPDATE SET
    desired_stock = excluded.desired_stock,
    desired_status = excluded.desired_status,
    sync_status = 'pending',
    last_error = '',
    updated_at = datetime('now');
END;
CREATE TRIGGER IF NOT EXISTS books_stripe_inventory_update
AFTER UPDATE OF stock, sku, title, synopsis, short_description, price, status ON books
WHEN OLD.stock IS NOT NEW.stock
  OR OLD.sku IS NOT NEW.sku
  OR OLD.title IS NOT NEW.title
  OR OLD.synopsis IS NOT NEW.synopsis
  OR OLD.short_description IS NOT NEW.short_description
  OR OLD.price IS NOT NEW.price
  OR OLD.status IS NOT NEW.status
BEGIN
  INSERT INTO stripe_inventory_mirror (book_id, desired_stock, desired_status, sync_status, updated_at)
  VALUES (NEW.id, NEW.stock, NEW.status, 'pending', datetime('now'))
  ON CONFLICT(book_id) DO UPDATE SET
    desired_stock = excluded.desired_stock,
    desired_status = excluded.desired_status,
    sync_status = 'pending',
    last_error = '',
    updated_at = datetime('now');
END;
