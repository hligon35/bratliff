# Website form connection

Before deployment, copy `.env.example` to `.env` (or `.env.local`) and fill in the Cloudflare values used by the Worker.

## Current runtime

- Public forms post to `/api/forms/submit`.
- Submissions are stored in D1 (the system of record — no external spreadsheet or Apps Script involved).
- Confirmation and admin-notification emails are sent directly by the Worker via the Resend API.
- Newsletter unsubscribe links are HMAC-signed by the Worker.
- The "Notify Me" book-notification form only sends a confirmation email to the submitter; it does **not** send a publisher notification email.

## Required variables

- `PUBLIC_API_URL`
- `PUBLIC_ADMIN_URL`
- `ADMIN_NOTIFICATION_EMAIL`
- `UNSUBSCRIBE_SECRET`
- `ADMIN_SESSION_SECRET`
- `MAIL_FROM_EMAIL` (the address Resend sends from, e.g. `no-reply@jackrabbitpunkinpublishing.com`)
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Deployment flow

1. Create the D1 database and R2 bucket referenced by [cloudflare/wrangler.jsonc](cloudflare/wrangler.jsonc) (`wrangler d1 create`, `wrangler r2 bucket create`).
2. Apply [cloudflare/migrations/0001_initial.sql](cloudflare/migrations/0001_initial.sql) to D1.
3. Apply [cloudflare/migrations/0002_review_form_fields.sql](cloudflare/migrations/0002_review_form_fields.sql) to add the current speaking-request fields without changing existing submissions.
4. Verify the sending domain in the [Resend dashboard](https://resend.com/domains) and add the SPF/DKIM DNS records it provides.
5. Configure the required Wrangler vars and secrets (`wrangler secret put ...`), including `RESEND_API_KEY`.
6. Google Sign-In for the admin dashboard is handled natively by the Worker via `GOOGLE_CLIENT_ID` and signed admin session cookies.
7. Run `npm run prepare:config` so [assets/site-config.js](assets/site-config.js) points at the Worker.
8. Run `npm run worker:prepare` to stage the site into `cloudflare/public`.
9. Deploy the Worker and static assets with `npm run worker:deploy` (or `wrangler deploy --config cloudflare/wrangler.jsonc`).

## Confirmation emails

Every accepted submission is saved in D1 and attempts to generate:

- An administrative notification to `ADMIN_NOTIFICATION_EMAIL` (skipped for the book-notification form).
- A form-specific confirmation to the submitter.
- A plain-text fallback for mail clients that do not render HTML.

If email delivery fails, the submission still remains in D1 and the API responds with `emailSent: false`.

## Newsletter campaigns

Newsletter campaigns are stored in D1 and sent in batches directly through the Resend API, the same mechanism used for form confirmations. Keep campaign batch sizes reasonable and monitor delivery via the Resend dashboard.

