# Jackrabbit Punkin Publishing LLC

Static, responsive website built from the Version 4.0 Master Website Content & Build Guide.

## Preview

Install the local tooling once:

```sh
npm install
```

Run the local dev server:

```sh
npm run dev
```

This regenerates `assets/site-config.js` from `.env` before serving the site.

To preview the Cloudflare Worker and staged static assets together:

```sh
npm run worker:dev
```

This regenerates `assets/site-config.js`, copies the public website into `cloudflare/public`, and starts Wrangler using [cloudflare/wrangler.jsonc](cloudflare/wrangler.jsonc).

Open the local site in your default browser:

```sh
npm run open
```

If you prefer a one-off static server without npm tooling, you can still run, for example:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Environment template

Copy `.env.example` to `.env` and fill in the Cloudflare deployment values. `.env.local` is optional and overrides `.env` during local development.

- `SITE_URL`: the public website URL.
- `PUBLIC_API_URL`: the Worker base URL used by forms, checkout, media, and admin API requests.
- `PUBLIC_ADMIN_URL`: the protected admin URL shown in the footer and login page. If omitted, the site uses `/admin/` on the website.
- `CORS_ORIGIN`: origin allowed for browser requests to the Worker.
- `ADMIN_BOOTSTRAP_EMAILS`: initial owner emails inserted into D1 on first admin access.
- `TEAM_DOMAIN`: Cloudflare Access team domain.
- `POLICY_AUD`: Cloudflare Access application audience.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`: Stripe checkout and webhook secrets.
- `GOOGLE_APPS_SCRIPT_EMAIL_URL` and `GOOGLE_APPS_SCRIPT_EMAIL_SECRET`: signed mail relay settings when Apps Script should send branded email.
- `RESEND_API_KEY` and `MAIL_FROM_EMAIL`: optional direct-send fallback if you do not want to relay mail through Apps Script.
- `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, and `GOOGLE_SERVICE_ACCOUNT_TOKEN_URI`: Google Sheets export credentials.
- `SHEETS_EXPORT_SPREADSHEET_ID` and `SHEETS_EXPORT_ENABLED`: reporting export target and on/off switch.
- `UNSUBSCRIBE_SECRET`: private signing secret for newsletter unsubscribe links.

Legacy Apps Script URLs remain as optional fallback variables for public forms/store during migration, but the admin UI path is website-first and branded emails can be relayed to Apps Script.

## Admin dashboard

The website footer shows an `Admin` link to the website admin route. The static admin console now lives at [admin/index.html](admin/index.html) and calls the Worker at `/api/admin/*`.

Protect the admin route and API with Cloudflare Access using Google as the identity provider. The Worker validates the Access JWT and then checks the signed-in email against the `admins` table in D1.

## Launch assets still needed

- Official Jackrabbit Punkin Publishing LLC logo
- Official outdoor author photo of Barbara J. Ratliff in a blue dress
- High-resolution *Battles Beyond the Waves* cover
- Retailer/purchase URL
- Facebook and LinkedIn profile URLs
- Discussion guide PDF and media kit PDF
- Website URL, mailing address (optional), and legal effective date

Asset placeholders are deliberate and should be replaced without cropping, recoloring, filtering, or otherwise altering the supplied originals.
