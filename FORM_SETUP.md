# Website form connection

Before deployment, copy `.env.example` to `.env` and fill in the Cloudflare and Google values used by the new Worker.

## Current runtime

- Public forms post to `/api/forms/submit`.
- Submissions are stored in D1 first.
- Confirmation and admin-notification emails are sent through Resend.
- Newsletter unsubscribe links are HMAC-signed by the Worker.
- Optional reporting exports write D1 data into Google Sheets on demand or from the Worker cron.

## Required variables

- `PUBLIC_API_URL`
- `PUBLIC_ADMIN_URL`
- `ADMIN_NOTIFICATION_EMAIL`
- `UNSUBSCRIBE_SECRET`
- `RESEND_API_KEY`
- `MAIL_FROM_EMAIL`
- `TEAM_DOMAIN`
- `POLICY_AUD`

If Sheets exports are enabled, also set:

- `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_TOKEN_URI`
- `SHEETS_EXPORT_SPREADSHEET_ID`
- `SHEETS_EXPORT_ENABLED=true`

## Deployment flow

1. Create the D1 database and R2 bucket referenced by [cloudflare/wrangler.jsonc](cloudflare/wrangler.jsonc).
2. Apply [cloudflare/migrations/0001_initial.sql](cloudflare/migrations/0001_initial.sql) to D1.
3. Configure the required Wrangler vars and secrets.
4. Protect the admin URL and the admin API with Cloudflare Access using Google identity.
5. Run `npm run prepare:config` so [assets/site-config.js](assets/site-config.js) points at the Worker.
6. Run `npm run worker:prepare` to stage the site into `cloudflare/public`.
7. Deploy the Worker and static assets with Wrangler.

## Confirmation emails

Every accepted submission is saved in D1 and attempts to generate:

- An administrative notification to `ADMIN_NOTIFICATION_EMAIL`.
- A form-specific confirmation to the submitter.
- A plain-text fallback for mail clients that do not render HTML.

If email delivery fails, the submission still remains in D1 and the API responds with `emailSent: false`.

## Reporting exports

The Google Sheet is now a reporting sink rather than the system of record. The Worker can export:

- Contact
- Newsletter
- Speaking Requests
- Book Club Requests
- Book Notifications
- Newsletter Subscribers
- Newsletter Campaigns
- Books
- Orders
- Order Items
- Inventory Log
- Admin Users
