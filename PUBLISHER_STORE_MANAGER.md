# Publisher Store Manager

The Publisher Store Manager now runs on the Cloudflare Worker stack while preserving the current website layout.

## Modules

### Cloudflare Worker

- [cloudflare/src/app.ts](cloudflare/src/app.ts) — public routes, admin API, Stripe webhook, and newsletter scheduling.
- [cloudflare/migrations/0001_initial.sql](cloudflare/migrations/0001_initial.sql) — D1 schema for books, orders, subscribers, campaigns, submissions, and admins.
- R2 bucket binding `BOOK_ASSETS` — book-cover storage.

### Website

- [assets/store.css](assets/store.css) — storefront/cart styles using the existing navy, purple, gold, cream brand variables.
- [assets/store.js](assets/store.js) — live catalog loader, local cart, quantity control, cart drawer, and Stripe Checkout redirect.
- [admin/index.html](admin/index.html), [assets/admin.js](assets/admin.js), and [assets/admin.css](assets/admin.css) — protected static admin console.

## Public routes

- `GET /api/store/books` — published, coming-soon, and out-of-stock catalog.
- `GET /api/store/book?id=BK-...` — one public book.
- `POST /api/store/checkout` — validates live inventory and creates a Stripe Checkout Session.
- `POST /stripe/webhook` — authenticated Stripe payment completion.
- `GET /media/books/...` — public R2 image delivery.

## Admin routes

- `GET /api/admin/bootstrap`
- `GET /api/admin/submissions`
- `GET|POST /api/admin/books`
- `POST /api/admin/books/:bookId/image`
- `POST /api/admin/inventory/adjust`
- `GET|POST /api/admin/orders`
- `POST /api/admin/orders/:orderNumber/fulfillment`
- `GET /api/admin/newsletter/state`
- `POST /api/admin/newsletter/campaigns`
- `POST /api/admin/newsletter/test`
- `GET /api/admin/newsletter/subscribers`
- `GET|POST|DELETE /api/admin/admins`

## Initial setup

1. Configure the D1 database and R2 bucket in [cloudflare/wrangler.jsonc](cloudflare/wrangler.jsonc).
2. Apply [cloudflare/migrations/0001_initial.sql](cloudflare/migrations/0001_initial.sql).
3. Add Stripe values and other Wrangler secrets to `.env.local` and to the deployed Worker.
4. Run `npm run prepare:config`.
5. Run `npm run worker:prepare`.
6. Protect `/admin/*` and `/api/admin/*` with Cloudflare Access.
7. Deploy the Worker.

The existing legacy `?action=store-books` and `action=store-checkout` compatibility routes are still handled by the Worker to keep the static site migration low-risk.

## Payment webhook

The Worker creates Stripe Checkout Sessions, but only the authenticated Stripe webhook records a paid order and reduces inventory. Browser redirects are never treated as proof of payment. The storefront also confirms successful sessions server-side after Stripe redirects back (`POST /api/store/confirm-checkout`), which idempotently records the order in D1 if the webhook has not already done so.

## Storefront integration

[books.html](books.html) now includes the live store stylesheet, loader script, cart trigger, and `data-store-grid` mount point for the Worker-backed catalog.

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
