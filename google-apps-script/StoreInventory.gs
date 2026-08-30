function adjustStoreInventory(bookId, change, reason, notes) {
  const admin = storeRequireAdmin_();
  const found = findStoreBook_(bookId);
  if (!found) throw new Error('Book not found.');
  const delta = Math.trunc(storeNumber_(change, 0));
  if (!delta) throw new Error('Enter an inventory adjustment other than zero.');

  const previous = Math.max(0, Number(found.object.stock || 0));
  const next = previous + delta;
  if (next < 0) throw new Error('Inventory cannot be reduced below zero.');

  const stockCol = STORE_BOOK_HEADERS.indexOf('Stock') + 1;
  const statusCol = STORE_BOOK_HEADERS.indexOf('Status') + 1;
  const updatedCol = STORE_BOOK_HEADERS.indexOf('Updated') + 1;
  found.sheet.getRange(found.row, stockCol).setValue(next);
  if (!found.object.preorder && found.object.status !== 'Draft' && found.object.status !== 'Archived') {
    found.sheet.getRange(found.row, statusCol).setValue(next > 0 ? 'Published' : 'Out of Stock');
  }
  found.sheet.getRange(found.row, updatedCol).setValue(storeNow_());

  logInventoryChange_(found.object.sku, found.object.title, delta, previous, next, storeText_(reason, 200) || 'Admin adjustment', '', admin, notes);
  return getStoreBookById(bookId);
}

function logInventoryChange_(sku, title, change, previous, next, reason, orderNumber, admin, notes) {
  const sheet = getStoreSpreadsheet_().getSheetByName(STORE_CONFIG.SHEETS.INVENTORY);
  if (!sheet) return;
  const detail = notes ? String(reason || '') + (reason ? ' — ' : '') + storeText_(notes, 1000) : reason;
  sheet.appendRow([
    storeNow_(), sku, title, Number(change || 0), Number(previous || 0), Number(next || 0),
    detail || 'Inventory update', orderNumber || '', admin || ''
  ]);
}

function getStoreInventorySummary() {
  storeRequireAdmin_();
  return readStoreBooks_(false).map(function (book) {
    return {
      bookId: book.bookId,
      sku: book.sku,
      title: book.title,
      stock: book.stock,
      lowStockThreshold: book.lowStockThreshold,
      lowStock: book.status === 'Published' && book.stock <= book.lowStockThreshold,
      status: book.status
    };
  });
}
