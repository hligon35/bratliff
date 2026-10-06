# Production release and Copilot handoff

Target: https://jackrabbitpunkinpublishing.com. This branch changes code only. It does not deploy, apply remote migrations, send real email, modify DNS/Access, or run live tests. The homepage launch gate stays in place.

## Before release: account-dependent work

1. Export/backup production D1 and record the current Worker deployment/version and applied migrations. Confirm a usable restore point. Review all outstanding migrations through **0014**, including **0013_mailbox_email_html.sql**. Historical 0003/0006 rebuild tables; the migration chain is not entirely additive. Rehearse upgrades on a copy with representative existing data before applying them remotely.
2. Review and apply approved migrations before publishing this Worker. The queue, rate limits, refunds and settlement require 0014. Do not deploy this code against an older schema. Review commands, then run them from the repo root only when release is authorized:
   ```sh
   npx wrangler d1 migrations list DB --remote --config cloudflare/wrangler.jsonc
   npx wrangler d1 migrations apply DB --remote --config cloudflare/wrangler.jsonc
   ```
3. Confirm Worker secrets: `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_LOCATION_ID`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `UNSUBSCRIBE_SECRET`, `CUSTOMER_SESSION_SECRET` (or the legacy `ADMIN_SESSION_SECRET` fallback), and `NAMECHEAP_EMAIL_PASSWORD` if using Private Email. Set public build values `GOOGLE_CLIENT_ID`, `TURNSTILE_SITE_KEY`, `ADMIN_NOTIFICATION_EMAIL`, and production `SITE_URL` in the deployment environment or ignored `.env.local`. These are different from Worker secrets. Deployment rejects missing/placeholder required public values and an explicit nonproduction site origin. Environment values override `.env.local`, `.env`, then `.env.example`.
4. Verify the production Resend sending domain and key/team match `MAIL_FROM_EMAIL`. Install the DNS records Resend supplies. The code can report failures and retry transient errors; it cannot verify the domain for the account owner.
5. Production explicitly uses `ADMIN_AUTH_MODE=access`. Confirm the Access application covers `/admin/*` and `/api/admin/*` on the apex **and www** hosts, allows the intended Google identities, and has the correct audience/team domain. Keep `/api/auth/config`, public checkout/form/customer APIs, `/api/unsubscribe` and `/square/webhook` outside the admin Access wall. The login page links to the protected admin URL; logout uses `/cdn-cgi/access/logout`. Verify the Access logout destination returns to the branded `/login/` page. Sandbox uses the custom Google session mode.
6. Confirm Square production token permissions include orders/payment reads for shipping details and out-of-order refund reconciliation, plus the existing payment-link permissions. Confirm webhook URL/signature configuration and subscriptions for completed payments/refunds. Capture one redacted Square checkout order fixture to verify that the buyer's recipient/address comes from `fulfillments[].shipment_details.recipient` or `payment.shipping_address`.
7. Verify private Resource Library PDFs exist under the catalog's `resource-guides/<slug>.pdf` keys in R2. Keep the bucket and those objects private. Upload any missing guides; do not copy them into static/public assets. Public image endpoints now accept only their own image prefix/shape.
8. Confirm the deployed Workers plan/runtime supports the existing reader PBKDF2 configuration (120,000 SHA-256 iterations) and request CPU budget. Local Node tests cannot establish Cloudflare's production host policy. Do not silently change the iteration count: existing hashes have no stored algorithm/version, so a change needs a compatible versioned migration or managed-auth transition.
9. Require a successful Quality Checks run on the PR. The prior main workflow run failed at startup without check jobs; inspect GitHub Actions account/runner/billing settings if startup failures continue. Node 22 and a deployment dry-run are now part of the checks. No CI success is claimed merely because a workflow file is valid.

## Inventory, payments and reconciliation

Production and sandbox use `INVENTORY_AUTHORITY=local`. Square polling/manual import does not overwrite local counts. Keep that setting until checkout is redesigned to use Square catalog variations and Square inventory adjustments end to end; ad hoc line items do not maintain catalog stock. Stock receipts/physical returns are recorded through the admin inventory adjustment with a reason.

A checkout atomically saves the order/cart and reserves nonpreorder stock for 30 minutes. Completed Square payments atomically create a settlement ledger row, order items and inventory events, decrement stock and mark Paid. Duplicate notifications cannot repeat these effects. Guest name/email/address are copied from Square; a missing provider response or shipping address leaves the notification retryable. A Square order reference can recover a crash before the Square ID was saved locally.

**Late-payment policy remains an operational decision.** Reservations expire after 30 minutes; the Square hosted link does not automatically expire. A late payment that conflicts with other reservations/stock becomes `Payment Review`, cannot partially settle and requires reconciliation/refund before fulfillment. Have Copilot implement an approved checkout-link expiry/reconciliation policy if the business requires rejection at the provider before accepting late payment. Do not resolve this by bypassing the stock guard.

Refund records accumulate completed amounts by unique Square refund ID. Partial refunds remain partial, full refunds remain full, and neither automatically restocks physical books. Historical fully-refunded rows retain their recorded full amount; the previous code treated partial refunds as full, so compare older rows with Square before relying on historical refund totals.

Existing Paid orders are deliberately not replayed or automatically decremented. Run these **read-only** diagnostics against the approved database copy first and reconcile exceptions with Square and physical inventory:

```sql
SELECT o.order_number, o.square_payment_id, o.payment_status
FROM orders o
WHERE o.payment_status IN ('Paid', 'Refunded', 'Partially Refunded')
  AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_number = o.order_number);

SELECT order_number, square_order_id, square_payment_id, payment_status, notes
FROM orders WHERE payment_status = 'Payment Review';

SELECT order_number, customer_name, customer_email, shipping_address
FROM orders
WHERE payment_status = 'Paid'
  AND (customer_name = '' OR customer_email = '' OR shipping_address = '');

SELECT campaign_id, status, sent, failed, last_error
FROM newsletter_campaigns
WHERE status = 'Sending' AND delivery_snapshot = '';
```

A historical Sending campaign without a snapshot is not resumed automatically because recipient outcomes are unknown. Check Resend before deciding whether to duplicate/resend it. Also review legacy sponsors with `certificate_status IN ('sending', 'error') AND certificate_first_attempt_at = ''` before resetting their delivery state. Certificate notifications now use a serialized claim and refuse retries beyond 23 hours, or automatic retries of those ambiguous legacy records. Verify provider outcomes first; do not clear the guard merely to make a webhook succeed.

## Newsletter and mailbox operation

Immediate sends return **Queued**. Cron runs every minute, claims one due campaign, processes at most 20 recipients with one-second pacing and a bounded wall time, then saves progress. Analytics/inventory housekeeping and mailbox sync stay on the 15-minute cadence. Overlapping cron invocations cannot claim the same campaign. Recipient addresses, unsubscribe URLs, campaign content, sender and branding origin are frozen for retries; queued/sent campaigns cannot be edited or resent in place. Duplicate a campaign for a new send.

Transient failures retry with backoff, at most six attempts and within 23 hours of the first attempt. This stays inside [Resend's documented 24-hour idempotency window](https://resend.com/changelog/idempotency-keys). Permanent failures or expired windows require review. Check `newsletter_deliveries` and campaign `last_error` for recipient-level outcomes. Unsubscribed recipients are skipped even if they revoked consent after queueing. Cancel is allowed only before a queue is claimed. Schedules now use the selected time zone and reject nonexistent daylight-saving times.

Mailbox lists render saved records immediately and synchronize in the background, with network deadlines. SMTP acceptance is retained even if QUIT fails. A lost DATA acknowledgement stays **Sending** with a delivery-review message; SMTP Message-ID is not a provider deduplication guarantee. Check the sent mailbox/provider before composing another message. Failed mailbox retries claim the record atomically and reject changed content under the same send key. Attachments remain unsupported in the Private Email mailbox.

Guest orders are not exposed to accounts merely matching an unverified email address. If showing prior guest purchases in reader accounts is required, Copilot should add email verification and an explicit verified ownership/linking flow. Orders placed while signed in still appear by customer ID.

## Verification and release

All 14 migrations also apply successfully to a fresh local Wrangler D1 database. Local regression tests execute the actual Worker functions with mock Square/Resend/SMTP providers and the complete migration chain in SQLite. They cover settlement rollback/retry/duplicates, reservations, late-payment review, refunds, guest shipping/history privacy, media isolation, newsletter recovery/locks/consent/time zones, reset keys, Access logout and SMTP outcomes. These tests never contact production providers. They do not replace a D1 rehearsal or deployed runtime verification.

```sh
npm ci
npm run worker:check
npm run test:maintenance
npm run worker:prepare
npx wrangler deploy --dry-run --env="" --config cloudflare/wrangler.jsonc
```

After migrations/account checks and release authorization, `npm run worker:deploy` validates production public configuration, runs checks/tests, regenerates admin bundles and stages assets before publishing. Keep a reviewed rollback plan; do not reverse 0014 or replay paid orders as a routine application rollback. Check inventory authority before rolling back to an older Worker that still imports Square stock.
