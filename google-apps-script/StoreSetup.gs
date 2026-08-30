function setupPublisherStore() {
  storeRequireAdmin_();
  const ss = getStoreSpreadsheet_();
  ensureStoreSheet_(ss, STORE_CONFIG.SHEETS.BOOKS, STORE_BOOK_HEADERS);
  ensureStoreSheet_(ss, STORE_CONFIG.SHEETS.ORDERS, STORE_ORDER_HEADERS);
  ensureStoreSheet_(ss, STORE_CONFIG.SHEETS.ORDER_ITEMS, STORE_ORDER_ITEM_HEADERS);
  ensureStoreSheet_(ss, STORE_CONFIG.SHEETS.INVENTORY, STORE_INVENTORY_HEADERS);
  ensureStoreImageFolder_();
  return { ok: true, message: 'Publisher Store Manager is ready.' };
}

function ensureStoreSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const mismatch = headers.some(function (header, index) { return current[index] !== header; });
  if (mismatch) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#d4ad55').setFontColor('#0a1628');
  sheet.autoResizeColumns(1, Math.min(headers.length, 12));
  return sheet;
}

function ensureStoreImageFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty(STORE_CONFIG.DRIVE_FOLDER_PROPERTY);
  if (existingId) {
    try { return DriveApp.getFolderById(existingId); } catch (error) {}
  }
  const folder = DriveApp.createFolder('Jackrabbit Punkin Publishing - Product Images');
  properties.setProperty(STORE_CONFIG.DRIVE_FOLDER_PROPERTY, folder.getId());
  return folder;
}
