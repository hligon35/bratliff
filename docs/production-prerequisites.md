# Production prerequisites (https://jackrabbitpunkinpublishing.com)

These items live outside the code and must be completed by an account owner before or during release. Nothing here is applied by the repository.

## Deployment safety

- `npm run worker:deploy` regenerates `assets/site-config.js` from `SITE_URL` (process environment first, then `.env*`). A placeholder or empty value falls back to `https://jackrabbitpunkinpublishing.com`; make sure the deploy shell does not export a sandbox `SITE_URL`.
- The temporary site gate in `index.html` / `coming-soon.html` is intentional. Removing it is a separate launch decision.

## D1 migrations (apply manually, in order, after review)

`cloudflare/migrations/0001` through `0012` (0011 and 0012 create the mailbox tables). All migrations are additive. Apply with `wrangler d1 migrations apply DB --remote --config cloudflare/wrangler.jsonc` only when ready.

## Resend (notifications and newsletter)

- Production sends from `MAIL_FROM_EMAIL` (`no-reply@jackrabbitpunkinpublishing.com`). Resend rejects sends when that domain is not verified for the account that owns `RESEND_API_KEY`. The sandbox uses `website@notifications.jackrabbitpunkinpublishing.com`, which suggests only the `notifications.` subdomain is verified.
- Fix in Resend (verify `jackrabbitpunkinpublishing.com` and add the SPF/DKIM DNS records it lists), or set `MAIL_FROM_EMAIL` to an address on an already verified domain. Confirm the API key belongs to the same Resend team.
- The Worker now reports this clearly: form-notification failures are written to the Activity log, newsletter sends return the Resend error and store it in `last_error`, and mailbox sends surface the failure on the message. Newsletter sends use per-recipient idempotency keys and refuse to re-send a campaign that is already Sent or Sending.

## Namecheap mailbox

- Worker secret `NAMECHEAP_EMAIL_PASSWORD` (set with `wrangler secret put`); `NAMECHEAP_EMAIL_ADDRESS` is a variable. Without both, the Mailbox shows "Namecheap not configured".
- Attachments are not supported (send or receive).

## Required Worker secrets

`RESEND_API_KEY`, `NAMECHEAP_EMAIL_PASSWORD`, `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_LOCATION_ID`, `TURNSTILE_SECRET_KEY`, `UNSUBSCRIBE_SECRET`, `ADMIN_SESSION_SECRET` / `GOOGLE_CLIENT_SECRET` (Google sign-in mode) or `CF_ACCESS_*` (Cloudflare Access mode).

## Local verification

```
npm ci
npm run worker:check
npm run test:maintenance
npm run worker:prepare
npx wrangler deploy --config cloudflare/wrangler.jsonc --dry-run --outdir %TEMP%\wdry
```
