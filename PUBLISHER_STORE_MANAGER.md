# Publisher Store Manager

The Publisher Store Manager extends the existing Jackrabbit Punkin Publishing Google Apps Script backend without replacing the current website layout.

## Modules

### Google Apps Script
- `StoreConfig.gs` — shared store settings, sheet headers, helpers.
- `StoreSetup.gs` — creates/repairs Books, Orders, Order Items, and Inventory Log sheets.
- `StoreBooks.gs` — catalog CRUD, publishing, archiving, SKU validation.
- `StoreImages.gs` — device image upload to Google Drive and image URL management.
- `StoreInventory.gs` — stock adjustments, low-stock detection, audit trail.
- `StoreOrders.gs` — order history, fulfillment, paid-order recording, inventory reduction, dashboard metrics.
- `StoreCheckout.gs` — Stripe Checkout Session creation using server-side pricing and stock validation.
- `StoreApi.gs` — public storefront/API routing helpers.
- `StoreAdmin.gs` — responsive branded Publisher Store Manager interface.

### Website
- `assets/store.css` — responsive storefront/cart styles using the existing navy, purple, gold, cream brand variables.
- `assets/store.js` — catalog loader, local cart, quantity control, cart drawer, and Stripe Checkout redirect.

## Required Apps Script routing

The existing `doGet` and `doPost` in `google-apps-script/Code.gs` remain the primary web-app entry points. Add the store router before the existing form/unsubscribe behavior:

```javascript
function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};
  const storeResponse = routeStoreGet_(params);
  if (storeResponse) return storeResponse;
  if (params.action === 'admin') return renderAdminDashboard_();
  if (params.action === 'unsubscribe') return handleUnsubscribe_(params);
  return jsonResponse_({ ok: true, service: 'Jackrabbit Punkin Publishing form endpoint' });
}
```

At the top of the existing `doPost`, after `payload` is created:

```javascript
const storeResponse = routeStorePost_(payload);
if (storeResponse) return storeResponse;
```

This keeps all existing form routes intact.

## Script Properties

Required existing properties:
- `GOOGLE_SPREADSHEET_ID`
- `ADMIN_NOTIFICATION_EMAIL`
- `ADMIN_ALLOWED_EMAILS`
- `SITE_URL`

Store properties:
- `STRIPE_SECRET_KEY` — Stripe secret key used only server-side.
- `STORE_SUCCESS_URL` — optional custom checkout success URL.
- `STORE_CANCEL_URL` — optional custom checkout cancel URL.
- `STRIPE_AUTOMATIC_TAX` — `true` to ask Stripe Checkout to calculate tax.
- `STORE_PRODUCT_IMAGE_FOLDER_ID` — created automatically when the first product image is uploaded.

## Initial setup

1. Add all `.gs` modules to the same Apps Script project as `Code.gs`.
2. Add the two router calls shown above to `doGet` and `doPost`.
3. Deploy a new Apps Script Web App version.
4. Open the store admin using:
   `WEB_APP_URL?action=store-admin`
5. Click **Initialize / Repair Store**.
6. Add the Stripe properties if checkout is being enabled.
7. Add `<link rel="stylesheet" href="assets/store.css">` and `<script src="assets/store.js" defer></script>` to pages that render the store.
8. Add a container with `data-store-grid` where the live book catalog should appear.

## Public API

- `GET ?action=store-books` — published / coming-soon catalog.
- `GET ?action=store-book&id=BK-...` — one public book.
- `POST action=store-checkout&cart=[...]` — validates current prices/inventory server-side and creates Stripe Checkout.
- `GET ?action=store-health` — lightweight health response.

## Payment webhook

The included Apps Script creates Stripe Checkout Sessions but does **not** treat browser redirects as proof of payment.

A verified Stripe webhook bridge should call `recordPaidStoreOrder(orderPayload)` only after the `checkout.session.completed` / paid event has been authenticated. The order payload should include Stripe session/payment IDs, customer/shipping data, totals, and an `items` array of `{ sku, quantity }`.

This separation prevents a customer browser from marking an unpaid order as paid or reducing inventory.

## Storefront integration without redesigning the current site

The existing Books page can keep its page hero, typography, navigation, spacing, footer, and general layout. Replace only the hard-coded product card area with:

```html
<link rel="stylesheet" href="assets/store.css">
<div class="store-grid" data-store-grid></div>
<script src="assets/store.js" defer></script>
```

A cart trigger can be placed anywhere without changing the navigation structure:

```html
<button class="button ghost store-cart-trigger" type="button" data-store-cart-trigger>
  Cart <span class="store-cart-count" data-store-cart-count>0</span>
</button>
```

## Inventory rules

- Pricing and stock are re-read from the Books sheet before checkout.
- Inventory is reduced only by the paid-order workflow.
- A sale writes a negative quantity to `Inventory Log`.
- Admin adjustments also create inventory-log entries.
- Stock cannot be reduced below zero.
- Published items with zero stock become `Out of Stock` unless preorders are enabled.

## Status behavior

- `Draft` — admin only.
- `Coming Soon` — public catalog, not normally purchasable unless preorder is enabled.
- `Published` — purchasable.
- `Out of Stock` — visible but unavailable.
- `Archived` — hidden from the public store while order history remains intact.
