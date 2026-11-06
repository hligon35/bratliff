# Published catalog and direct JPP orders

The Books page keeps the existing typography and corporate blue/purple design. `assets/published-books.json` owns the three published titles, descriptions, dates, cover paths and retailer links. Run `npm run catalog:build` after editorial changes; `npm run catalog:check` verifies that the committed Books page matches it. Catalog cards and retailer links remain visible if JavaScript or the inventory API fails.

## Release and inventory setup

1. Apply migrations **0023** (published metadata) and **0024** (order email outbox and frozen order-item format) after the existing migrations, before deploying this Worker. Follow the backup/rehearsal procedure in `docs/production-prerequisites.md`; the deployment command does not apply production migrations.
2. Migration 0023 matches existing entries by ISBN or title plus format and preserves their stock, IDs and Square links. Missing entries are created with **zero stock**, not an invented physical count. Existing matching entries become Published if stocked, otherwise Out of Stock. Only the Great Pie Mystery paperback is marked featured to respect the existing one-featured-product constraint.
3. Enter the real on-hand counts for all six entries in **Admin → Inventory / Manage inventory**. A positive stock count and Published status enable the matching direct-purchase button. Review duplicate legacy records before migration; do not count the same physical stock twice. Saving each book in Admin Store creates/links its Square catalog variation through the existing exact-SKU matching flow; manually link existing Square variations if their SKUs differ.
4. Keep JPP prices at **Paperback $20.00 / Hardcover $25.00**. Standard online retailer prices displayed on the page are **$17.99 / $24.99**. Website checkout validates the format price server-side, ignores client prices and totals, reserves stock, and requires Square-confirmed settlement before fulfillment.
5. Confirm `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `RESEND_API_KEY` and the verified sender are available in the deployment environment. The Square token needs checkout/order/payment permissions and existing catalog/inventory permissions. The Square webhook URL is `https://jackrabbitpunkinpublishing.com/square/webhook`; subscribe to `payment.created`, `payment.updated`, `refund.created`, `refund.updated`, and `inventory.count.updated` when using Square stock synchronization. Test the signing key against this exact URL.

## Shipping and tax

The server adds **500 cents × total number of copies**, regardless of title or format and even when copies share an address. The cart shows subtotal, shipping, $0.00 sales tax and total before sending the buyer to Square. The generated Square order includes the shipping charge and `ask_for_shipping_address: true` so the buyer can enter contact/shipping information and review payment on Square's hosted page.

No additional Square shipping-rate rule is required for this dynamic checkout; do not add a second shipping fee to it. The old fixed Square book link was replaced because it bypassed the mixed-book cart and its server-calculated shipping. Existing client-managed tax policy remains: this checkout does not add sales tax or a processing surcharge. This is not a claim of tax exemption. Any future checkout tax policy change must update calculations and reconciliation together.

## Publisher notifications

Production `ORDER_NOTIFICATION_EMAIL` is **publisher@jackrabbitpunkinpublishing.com**. Sandbox uses **hligon@getsparqd.com**. This setting is independent of general `ADMIN_NOTIFICATION_EMAIL` alerts. Confirm the business recipient before release.

A new completed-payment settlement atomically creates one `order_email_deliveries` job. The every-minute Worker task freezes an email containing order number, Square payment ID, paid status, each book's title/format/quantity/line total, customer name/email, shipping address, subtotal, shipping, sales tax and total paid. The message links to `/admin/#orders`. The selected format also persists in order items and appears in the main admin order detail.

Emails use the existing Resend adapter and delivery processor: atomic claims, stable idempotency keys, backoff, at most six attempts and a 23-hour retry window. Duplicate payment webhooks do not repeat stock deductions or create duplicate messages. Permanent failure or an exhausted retry window remains visible for operator review. Historical payments are not replayed. `Sent` means accepted by the email provider; inbox receipt must be confirmed in the live acceptance test. Square Dashboard merchant notifications are a separate setting; confirm the merchant's desired payment notification preferences there.

Read-only delivery diagnosis (do not replay a paid order to resend email):

```sql
SELECT submission_id AS order_number, status, attempts, last_error, updated_at
FROM order_email_deliveries ORDER BY updated_at DESC;
```

After fixing a failed delivery, verify provider delivery history/idempotency before authorizing a resend. Preserve the payment ledger and stock audit.

## Amazon hardcover — active

The client authorized the Great Pie Mystery Amazon hardcover option after the original hold. The active link is **https://www.amazon.com/Adventures-D-D-Reuel-Great-Mystery/dp/1972028324/ref=tmm_hrd_swatch_0** and appears beside the other hardcover options in both the featured release and Live Catalog.

The catalog uses nine shared CSS grid rows so covers, titles, release dates, descriptions, paperback options and hardcover options align across a row. Cover metadata describes the transparent margins of each original asset; CSS normalizes presentation without altering the book art. The featured cover has its own permanent, top-aligned desktop slot that scales from 340px to 500px (380px tablet / 340px phone), independent of the length of the description or purchase links. Future featured releases use this same slot.

## Acceptance status and remaining live checks

Automated tests exercise the actual Worker with SQLite and mocked Square/Resend responses: six metadata records; server-controlled prices; mixed-format shipping for one through four copies; required shipping collection; settlement and format snapshots; complete publisher notification; concurrent retry/idempotency; unpaid/mismatched payment rejection. Existing checkout, refund, inventory, form and security regressions also run.

Browser QA covers the desktop page, 390px mobile iframe viewport, direct-purchase cart, format display, quantity controls, shipping and totals with **local test inventory only**. This does not verify iOS Safari or a real Square transaction.

Retailer verification on November 5, 2026: both IngramSpark Pie Mystery links and both original Book I links returned HTTP 200 with the matching title family. Both Fading Lighthouse Amazon URLs returned HTTP 200 and matching ISBN/title metadata. Amazon Pie Mystery paperback and the retained Book I Kindle URL returned HTTP 500 to this workspace; their exact supplied/existing URLs are preserved and need a manual retailer check. Format-specific product details still need a human check where retailer responses do not expose them clearly.

The live store API returned an empty books list with Square checkout configured. Cloudflare CLI authentication is unavailable in this workspace, so no remote migrations, inventory writes or deployment were performed. Real stock quantities are still required.

Before promotion, deploy with the reviewed migrations/counts, then test: each retailer/format link; a single paperback ($25 shipped); a single hardcover ($30 shipped); mixed cart shipping; shipping address/contact entry; Square payment completion; webhook settlement; admin title/format/quantity/address; publisher inbox receipt; Square merchant payment notification; duplicate webhook handling; desktop and real mobile display. Use Square sandbox test payments first, then a client-supervised production purchase when ready.
