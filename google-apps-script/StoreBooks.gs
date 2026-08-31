function listStoreBooksAdmin() {
  storeRequireAdmin_();
  return readStoreBooks_(false);
}

function listPublishedStoreBooks() {
  return readStoreBooks_(true);
}

function readStoreBooks_(publishedOnly) {
  const sheet = getStoreSpreadsheet_().getSheetByName(
    STORE_CONFIG.SHEETS.BOOKS,
  );
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, STORE_BOOK_HEADERS.length)
    .getValues();
  const books = values.map(bookRowToObject_).filter(function (book) {
    return (
      book.bookId &&
      (!publishedOnly ||
        ["Published", "Coming Soon", "Out of Stock"].indexOf(book.status) !==
          -1)
    );
  });
  return books.sort(function (a, b) {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return new Date(b.updated || 0) - new Date(a.updated || 0);
  });
}

function getStoreBookById(bookId) {
  const book = findStoreBook_(storeText_(bookId, 100));
  return book ? book.object : null;
}

function saveStoreBook(payload) {
  const admin = storeRequireAdmin_();
  setupPublisherStore();
  payload = payload || {};
  const sheet = getStoreSpreadsheet_().getSheetByName(
    STORE_CONFIG.SHEETS.BOOKS,
  );
  const existing = payload.bookId ? findStoreBook_(payload.bookId) : null;
  const now = storeNow_();
  const bookId = existing ? existing.object.bookId : storeId_("BK");
  const sku = storeText_(payload.sku, 100).toUpperCase();
  const title = storeText_(payload.title, 300);
  if (!sku) throw new Error("SKU is required.");
  if (!title) throw new Error("Book title is required.");
  ensureUniqueSku_(sku, bookId);

  const stock = Math.max(
    0,
    Math.floor(
      storeNumber_(payload.stock, existing ? existing.object.stock : 0),
    ),
  );
  let status = storeText_(payload.status, 40) || "Draft";
  if (status === "Published" && stock <= 0 && !storeBool_(payload.preorder))
    status = "Out of Stock";

  const row = [
    bookId,
    sku,
    storeText_(payload.isbn, 80),
    title,
    storeText_(payload.subtitle, 300),
    storeText_(payload.author, 200),
    storeText_(payload.synopsis, 12000),
    storeText_(payload.shortDescription, 1000),
    storeText_(payload.format, 100),
    storeText_(payload.category, 150),
    storeMoney_(payload.price),
    storeMoney_(payload.comparePrice),
    stock,
    Math.max(
      0,
      Math.floor(
        storeNumber_(payload.lowStockThreshold, STORE_CONFIG.LOW_STOCK_DEFAULT),
      ),
    ),
    existing ? existing.object.imageFileId : "",
    existing ? existing.object.imageUrl : "",
    storeBool_(payload.featured),
    storeBool_(payload.comingSoon),
    storeBool_(payload.preorder),
    status,
    payload.publicationDate ? new Date(payload.publicationDate) : "",
    existing ? existing.object.created : now,
    now,
  ];

  if (existing)
    sheet
      .getRange(existing.row, 1, 1, STORE_BOOK_HEADERS.length)
      .setValues([row]);
  else sheet.appendRow(row);

  if (existing && stock !== Number(existing.object.stock || 0)) {
    logInventoryChange_(
      sku,
      title,
      stock - Number(existing.object.stock || 0),
      Number(existing.object.stock || 0),
      stock,
      "Admin adjustment",
      "",
      admin,
    );
  }
  return getStoreBookById(bookId);
}

function publishStoreBook(bookId) {
  storeRequireAdmin_();
  const found = findStoreBook_(bookId);
  if (!found) throw new Error("Book not found.");
  const statusCol = STORE_BOOK_HEADERS.indexOf("Status") + 1;
  const updatedCol = STORE_BOOK_HEADERS.indexOf("Updated") + 1;
  const status =
    Number(found.object.stock || 0) > 0 || found.object.preorder
      ? "Published"
      : "Out of Stock";
  found.sheet.getRange(found.row, statusCol).setValue(status);
  found.sheet.getRange(found.row, updatedCol).setValue(storeNow_());
  return getStoreBookById(bookId);
}

function archiveStoreBook(bookId) {
  storeRequireAdmin_();
  const found = findStoreBook_(bookId);
  if (!found) throw new Error("Book not found.");
  found.sheet
    .getRange(found.row, STORE_BOOK_HEADERS.indexOf("Status") + 1)
    .setValue("Archived");
  found.sheet
    .getRange(found.row, STORE_BOOK_HEADERS.indexOf("Updated") + 1)
    .setValue(storeNow_());
  return { ok: true };
}

function findStoreBook_(bookId) {
  const sheet = getStoreSpreadsheet_().getSheetByName(
    STORE_CONFIG.SHEETS.BOOKS,
  );
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, STORE_BOOK_HEADERS.length)
    .getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(bookId))
      return {
        sheet: sheet,
        row: i + 2,
        values: values[i],
        object: bookRowToObject_(values[i]),
      };
  }
  return null;
}

function ensureUniqueSku_(sku, bookId) {
  readStoreBooks_(false).forEach(function (book) {
    if (book.sku === sku && book.bookId !== bookId)
      throw new Error("That SKU is already in use.");
  });
}

function bookRowToObject_(row) {
  return {
    bookId: row[0],
    sku: row[1],
    isbn: row[2],
    title: row[3],
    subtitle: row[4],
    author: row[5],
    synopsis: row[6],
    shortDescription: row[7],
    format: row[8],
    category: row[9],
    price: Number(row[10] || 0),
    comparePrice: Number(row[11] || 0),
    stock: Number(row[12] || 0),
    lowStockThreshold: Number(row[13] || STORE_CONFIG.LOW_STOCK_DEFAULT),
    imageFileId: row[14],
    imageUrl: row[15],
    featured: Boolean(row[16]),
    comingSoon: Boolean(row[17]),
    preorder: Boolean(row[18]),
    status: row[19] || "Draft",
    publicationDate: row[20] || "",
    created: row[21] || "",
    updated: row[22] || "",
  };
}
