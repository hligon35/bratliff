const STORE_CONFIG = Object.freeze({
  SHEETS: {
    BOOKS: 'Books',
    ORDERS: 'Orders',
    ORDER_ITEMS: 'Order Items',
    INVENTORY: 'Inventory Log'
  },
  DRIVE_FOLDER_PROPERTY: 'STORE_PRODUCT_IMAGE_FOLDER_ID',
  STRIPE_CHECKOUT_ENDPOINT_PROPERTY: 'STORE_CHECKOUT_ENDPOINT',
  STORE_CURRENCY: 'USD',
  LOW_STOCK_DEFAULT: 5,
  MAX_IMAGE_BYTES: 6 * 1024 * 1024,
  ALLOWED_IMAGE_TYPES: ['image/png', 'image/jpeg', 'image/webp']
});

const STORE_BOOK_HEADERS = Object.freeze([
  'Book ID', 'SKU', 'ISBN', 'Title', 'Subtitle', 'Author', 'Synopsis',
  'Short Description', 'Format', 'Category', 'Price', 'Compare Price',
  'Stock', 'Low Stock Threshold', 'Image File ID', 'Image URL', 'Featured',
  'Coming Soon', 'Preorder', 'Status', 'Publication Date', 'Created', 'Updated'
]);

const STORE_ORDER_HEADERS = Object.freeze([
  'Order #', 'Stripe Session ID', 'Stripe Payment ID', 'Date', 'Customer',
  'Email', 'Subtotal', 'Shipping', 'Tax', 'Total', 'Payment Status',
  'Fulfillment Status', 'Tracking #', 'Shipping Address', 'Notes'
]);

const STORE_ORDER_ITEM_HEADERS = Object.freeze([
  'Order #', 'SKU', 'Title', 'Quantity', 'Unit Price', 'Line Total'
]);

const STORE_INVENTORY_HEADERS = Object.freeze([
  'Date', 'SKU', 'Title', 'Change', 'Previous Qty', 'New Qty', 'Reason',
  'Order #', 'Admin'
]);

function getStoreSpreadsheet_() {
  return SpreadsheetApp.openById(getSpreadsheetId_());
}

function getStoreProperty_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function storeNow_() {
  return new Date();
}

function storeId_(prefix) {
  const stamp = Utilities.formatDate(storeNow_(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  return String(prefix || 'ID') + '-' + stamp + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function storeBool_(value) {
  return /^(true|yes|1|on)$/i.test(String(value == null ? '' : value));
}

function storeNumber_(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number(fallback || 0);
}

function storeText_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength || 5000);
}

function storeMoney_(value) {
  return Math.round(storeNumber_(value, 0) * 100) / 100;
}

function storeRequireAdmin_() {
  const email = getAuthorizedAdminEmail_();
  if (!email) throw new Error('Administrator access is required.');
  return email;
}
