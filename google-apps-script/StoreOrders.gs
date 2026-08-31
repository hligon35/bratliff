function listStoreOrders(limit) {
  storeRequireAdmin_();
  const sheet = getStoreSpreadsheet_().getSheetByName(
    STORE_CONFIG.SHEETS.ORDERS,
  );
  if (!sheet || sheet.getLastRow() < 2) return [];
  const count = Math.min(
    Math.max(1, Number(limit || 100)),
    sheet.getLastRow() - 1,
  );
  const start = Math.max(2, sheet.getLastRow() - count + 1);
  const rows = sheet
    .getRange(start, 1, count, STORE_ORDER_HEADERS.length)
    .getValues();
  return rows.reverse().map(orderRowToObject_);
}

function getStoreOrder(orderNumber) {
  storeRequireAdmin_();
  const order = findStoreOrder_(orderNumber);
  if (!order) return null;
  const itemSheet = getStoreSpreadsheet_().getSheetByName(
    STORE_CONFIG.SHEETS.ORDER_ITEMS,
  );
  const items = [];
  if (itemSheet && itemSheet.getLastRow() > 1) {
    itemSheet
      .getRange(
        2,
        1,
        itemSheet.getLastRow() - 1,
        STORE_ORDER_ITEM_HEADERS.length,
      )
      .getValues()
      .forEach(function (row) {
        if (String(row[0]) === String(orderNumber)) {
          items.push({
            orderNumber: row[0],
            sku: row[1],
            title: row[2],
            quantity: Number(row[3] || 0),
            unitPrice: Number(row[4] || 0),
            lineTotal: Number(row[5] || 0),
          });
        }
      });
  }
  const result = order.object;
  result.items = items;
  return result;
}

function updateStoreFulfillment(
  orderNumber,
  fulfillmentStatus,
  trackingNumber,
  notes,
) {
  storeRequireAdmin_();
  const found = findStoreOrder_(orderNumber);
  if (!found) throw new Error("Order not found.");
  found.sheet
    .getRange(found.row, STORE_ORDER_HEADERS.indexOf("Fulfillment Status") + 1)
    .setValue(storeText_(fulfillmentStatus, 80) || "Unfulfilled");
  found.sheet
    .getRange(found.row, STORE_ORDER_HEADERS.indexOf("Tracking #") + 1)
    .setValue(storeText_(trackingNumber, 200));
  if (notes !== undefined)
    found.sheet
      .getRange(found.row, STORE_ORDER_HEADERS.indexOf("Notes") + 1)
      .setValue(storeText_(notes, 4000));
  return getStoreOrder(orderNumber);
}

function recordPaidStoreOrder(orderPayload) {
  orderPayload = orderPayload || {};
  setupPublisherStore_();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sessionId = storeText_(orderPayload.stripeSessionId, 300);
    if (sessionId && findStoreOrderBySession_(sessionId))
      return { ok: true, duplicate: true };

    const items = Array.isArray(orderPayload.items) ? orderPayload.items : [];
    if (!items.length) throw new Error("Order requires at least one item.");
    const validated = validateOrderItems_(items);
    const orderNumber =
      storeText_(orderPayload.orderNumber, 100) || storeId_("JRPP");
    const subtotal = validated.reduce(function (sum, item) {
      return sum + item.lineTotal;
    }, 0);
    const shipping = storeMoney_(orderPayload.shipping);
    const tax = storeMoney_(orderPayload.tax);
    const total = storeMoney_(orderPayload.total || subtotal + shipping + tax);
    const orderSheet = getStoreSpreadsheet_().getSheetByName(
      STORE_CONFIG.SHEETS.ORDERS,
    );
    const itemSheet = getStoreSpreadsheet_().getSheetByName(
      STORE_CONFIG.SHEETS.ORDER_ITEMS,
    );

    orderSheet.appendRow([
      orderNumber,
      sessionId,
      storeText_(orderPayload.stripePaymentId, 300),
      storeNow_(),
      storeText_(orderPayload.customer, 250),
      storeText_(orderPayload.email, 320),
      subtotal,
      shipping,
      tax,
      total,
      "Paid",
      "Unfulfilled",
      "",
      storeText_(orderPayload.shippingAddress, 2000),
      storeText_(orderPayload.notes, 4000),
    ]);

    validated.forEach(function (item) {
      itemSheet.appendRow([
        orderNumber,
        item.sku,
        item.title,
        item.quantity,
        item.unitPrice,
        item.lineTotal,
      ]);
      decrementInventoryForOrder_(item, orderNumber);
    });

    return { ok: true, orderNumber: orderNumber };
  } finally {
    lock.releaseLock();
  }
}

function validateOrderItems_(items) {
  return items.map(function (requested) {
    const sku = storeText_(requested.sku, 100).toUpperCase();
    const quantity = Math.max(
      1,
      Math.floor(storeNumber_(requested.quantity, 1)),
    );
    const book = readStoreBooks_(false).find(function (entry) {
      return entry.sku === sku;
    });
    if (!book) throw new Error("Book not found for SKU " + sku + ".");
    if (
      book.status !== "Published" &&
      !(book.preorder && book.status !== "Archived")
    )
      throw new Error(book.title + " is not currently available for purchase.");
    if (!book.preorder && quantity > book.stock)
      throw new Error(
        "Only " + book.stock + " copies of " + book.title + " are available.",
      );
    return {
      bookId: book.bookId,
      sku: sku,
      title: book.title,
      quantity: quantity,
      unitPrice: storeMoney_(book.price),
      lineTotal: storeMoney_(book.price * quantity),
      preorder: book.preorder,
    };
  });
}

function decrementInventoryForOrder_(item, orderNumber) {
  if (item.preorder) return;
  const found = findStoreBook_(item.bookId);
  if (!found) throw new Error("Inventory book record is missing.");
  const previous = Number(found.object.stock || 0);
  const next = previous - item.quantity;
  if (next < 0)
    throw new Error("Insufficient inventory for " + item.title + ".");
  found.sheet
    .getRange(found.row, STORE_BOOK_HEADERS.indexOf("Stock") + 1)
    .setValue(next);
  if (next === 0)
    found.sheet
      .getRange(found.row, STORE_BOOK_HEADERS.indexOf("Status") + 1)
      .setValue("Out of Stock");
  found.sheet
    .getRange(found.row, STORE_BOOK_HEADERS.indexOf("Updated") + 1)
    .setValue(storeNow_());
  logInventoryChange_(
    item.sku,
    item.title,
    -item.quantity,
    previous,
    next,
    "Online sale",
    orderNumber,
    "Stripe",
  );
}

function findStoreOrder_(orderNumber) {
  const sheet = getStoreSpreadsheet_().getSheetByName(
    STORE_CONFIG.SHEETS.ORDERS,
  );
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, STORE_ORDER_HEADERS.length)
    .getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(orderNumber))
      return { sheet: sheet, row: i + 2, object: orderRowToObject_(values[i]) };
  }
  return null;
}

function findStoreOrderBySession_(sessionId) {
  const sheet = getStoreSpreadsheet_().getSheetByName(
    STORE_CONFIG.SHEETS.ORDERS,
  );
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, STORE_ORDER_HEADERS.length)
    .getValues();
  for (let i = 0; i < values.length; i++)
    if (String(values[i][1]) === String(sessionId))
      return orderRowToObject_(values[i]);
  return null;
}

function orderRowToObject_(row) {
  return {
    orderNumber: row[0],
    stripeSessionId: row[1],
    stripePaymentId: row[2],
    date: row[3],
    customer: row[4],
    email: row[5],
    subtotal: Number(row[6] || 0),
    shipping: Number(row[7] || 0),
    tax: Number(row[8] || 0),
    total: Number(row[9] || 0),
    paymentStatus: row[10],
    fulfillmentStatus: row[11],
    trackingNumber: row[12],
    shippingAddress: row[13],
    notes: row[14],
  };
}

function getStoreDashboardMetrics() {
  storeRequireAdmin_();
  const orders = listStoreOrders(5000).filter(function (order) {
    return String(order.paymentStatus).toLowerCase() === "paid";
  });
  const inventory = getStoreInventorySummary();
  const totalSales = orders.reduce(function (sum, order) {
    return sum + Number(order.total || 0);
  }, 0);
  const itemSheet = getStoreSpreadsheet_().getSheetByName(
    STORE_CONFIG.SHEETS.ORDER_ITEMS,
  );
  let booksSold = 0;
  if (itemSheet && itemSheet.getLastRow() > 1)
    itemSheet
      .getRange(2, 4, itemSheet.getLastRow() - 1, 1)
      .getValues()
      .forEach(function (row) {
        booksSold += Number(row[0] || 0);
      });
  return {
    totalSales: storeMoney_(totalSales),
    booksSold: booksSold,
    orderCount: orders.length,
    averageOrder: orders.length ? storeMoney_(totalSales / orders.length) : 0,
    lowStockCount: inventory.filter(function (book) {
      return book.lowStock;
    }).length,
  };
}
