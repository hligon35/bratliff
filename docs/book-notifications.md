# Automatic book availability alerts

Book notification forms now connect directly to the admin's product inventory. Readers get one availability announcement per title, even if they signed up twice or the book has multiple SKUs/formats. General newsletter membership is not required.

## Admin workflow

1. Add or edit the product in **Admin Store → Book Catalog**.
2. Use the same title as the notification signup list. Matching ignores case, repeated whitespace, and typographic apostrophe/dash differences; it never guesses using partial titles. If the product has a different title, use **Notification list title** to select the intended list. Leave it blank for automatic title matching. Verify the chosen list carefully, especially for series and sequels.
3. Set **Published**, a positive price and stock count, and turn off **Coming Soon** and **Preorder**. Drafts, zero-stock products and unreleased/preorder entries do not trigger an availability announcement. Inventory adjustments and linked Square count changes are also picked up.
4. Saving the book or receiving stock starts a background delivery pass. The existing every-minute Worker schedule continues pending alerts and retries. Each pass queues up to 100 new matching recipients and attempts up to 10 messages, paced at one per second; large lists drain across multiple passes. This starts promptly but is not a promise of inbox delivery within a minute.
5. Use **Book availability notifications → Refresh status** to see active lists and Pending, Sending, Sent, Failed or Skipped counts and errors. Sent means the email provider accepted the request. A failed email does not undo the product save.

Email includes the book title, the reader's first name, a link that opens/focuses that book in the catalog, and a signed unsubscribe link. No pricing, tax or surcharge logic changed.

## Delivery safety and consent

- Additive migration **0022_book_notifications.sql** stores matching keys and a separate durable availability outbox. Existing form signups are normalized in bounded batches when the queue runs; their confirmation receipts are never replayed. Existing published/in-stock products can notify their previously waiting lists after this feature is enabled.
- The availability outbox reuses the form-email delivery processor and Resend adapter. Atomic claims prevent overlapping workers from sending the same row. A unique reader/title constraint prevents duplicate alerts across repeated saves, stock adjustments, formats and duplicate signups. Sent rows are not reset by restocking.
- Messages, sender, links and provider idempotency keys are frozen before delivery. Transient failures retry with bounded backoff, at most six attempts and within 23 hours of the first attempt. Permanent errors and exhausted/uncertain retry windows remain Failed for provider review. Never reset a failed row or change its key simply to force a resend.
- Consent, opt-outs and product availability are checked again before each attempt. An unavailable product pauses its queued message. Opted-out readers are skipped. An already-sent message cannot be recalled if inventory changes afterward.
- Unsubscribe now records suppression even for book-only readers, marks their old newsletter/book submissions opted out and clears consent. A new explicit book signup restores only that title's consent without subscribing to the general newsletter or older titles. A never-attempted Skipped row may be reactivated by that new signup; attempted or successful alerts are never automatically replayed.
- Removing a book with notification history archives it, preserving delivery records. Public APIs do not expose subscriber addresses or delivery state; the progress view requires existing admin authorization.

## Release requirements

No deployment, remote migration or real email send is performed by implementing this feature. Use the existing approved backup/migration process before applying migration 0022, then separately approve deployment. Required Worker configuration remains `RESEND_API_KEY`, verified `MAIL_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `UNSUBSCRIBE_SECRET`, `SITE_URL`, and `PUBLIC_API_URL`. Background continuation requires the every-minute cron; the isolated preview template intentionally has no cron and must use approved test recipients/credentials before enabling any automatic sends.

Before enabling production, review existing list-to-product matches (including already available products), confirm the verified sender and schedule, and test delivery/unsubscribe using approved sandbox recipients. The repository's existing GitHub Actions startup failure and mobile dependency advisory remain separate release blockers.

## Local verification

The full regression suite passed 203 tests after this implementation. This includes 13 availability-alert tests and the product-link focus test, alongside the existing payment, email, admin and private-file coverage. Worker type checking, release checks, regenerated admin bundle checks and a production bundle dry-run passed. Local tests use SQLite and mocked providers; no live delivery, deployment or remote migration was executed.
