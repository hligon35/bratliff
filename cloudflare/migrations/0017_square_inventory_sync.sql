-- D1 remains authoritative for checkout reservations. Keep Square's physical
-- count aligned with every bookstore stock or catalog variation change.
CREATE TABLE IF NOT EXISTS square_inventory_sync (
  book_id TEXT PRIMARY KEY,
  variation_id TEXT NOT NULL DEFAULT '',
  desired_stock INTEGER NOT NULL DEFAULT 0,
  synced_stock INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending','syncing','synced','error','unlinked')),
  last_attempt_at TEXT NOT NULL DEFAULT '',
  last_synced_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_square_inventory_sync_queue
  ON square_inventory_sync(sync_status, updated_at);
INSERT INTO square_inventory_sync (book_id, variation_id, desired_stock, sync_status)
SELECT id, square_catalog_variation_id, stock, 'pending' FROM books WHERE 1
ON CONFLICT(book_id) DO UPDATE SET
  variation_id=excluded.variation_id,
  desired_stock=excluded.desired_stock,
  sync_status=CASE WHEN square_inventory_sync.sync_status='synced'
    AND square_inventory_sync.synced_stock=excluded.desired_stock
    AND square_inventory_sync.variation_id=excluded.variation_id
    THEN 'synced' ELSE 'pending' END,
  updated_at=datetime('now');
CREATE TRIGGER IF NOT EXISTS books_square_inventory_insert
AFTER INSERT ON books BEGIN
  INSERT INTO square_inventory_sync(book_id,variation_id,desired_stock,sync_status,updated_at)
  VALUES(NEW.id,NEW.square_catalog_variation_id,NEW.stock,'pending',datetime('now'))
  ON CONFLICT(book_id) DO UPDATE SET variation_id=excluded.variation_id,
    desired_stock=excluded.desired_stock,sync_status='pending',last_error='',updated_at=datetime('now');
END;
CREATE TRIGGER IF NOT EXISTS books_square_inventory_update
AFTER UPDATE OF stock,square_catalog_variation_id ON books
WHEN OLD.stock IS NOT NEW.stock OR OLD.square_catalog_variation_id IS NOT NEW.square_catalog_variation_id
BEGIN
  INSERT INTO square_inventory_sync(book_id,variation_id,desired_stock,sync_status,updated_at)
  VALUES(NEW.id,NEW.square_catalog_variation_id,NEW.stock,'pending',datetime('now'))
  ON CONFLICT(book_id) DO UPDATE SET variation_id=excluded.variation_id,
    desired_stock=excluded.desired_stock,sync_status='pending',last_error='',updated_at=datetime('now');
END;
