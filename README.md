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

Copy `.env.example` to `.env` and fill in your deployment values before wiring up the live form endpoint. If you prefer local-only overrides, `.env.local` is also supported and takes precedence over `.env`.

- `SITE_URL`: the public website URL.
- `GOOGLE_APPS_SCRIPT_WEB_APP_URL`: the deployed Apps Script `/exec` endpoint used by the site.
- `GOOGLE_APPS_SCRIPT_ADMIN_URL`: optional dedicated admin dashboard URL. If omitted, the site falls back to `GOOGLE_APPS_SCRIPT_WEB_APP_URL?action=admin`.
- `GOOGLE_SPREADSHEET_ID`: the destination spreadsheet ID for form submissions.
- `ADMIN_NOTIFICATION_EMAIL`: the mailbox that receives form notifications.
- `GOOGLE_APPS_SENDER_NAME`: the display name used for confirmation emails.
- `ADMIN_ALLOWED_EMAILS`: comma-separated Google account emails allowed to open the admin dashboard.
- `UNSUBSCRIBE_SECRET`: a private signing secret for newsletter unsubscribe links.

Only the public URL values should ever be exposed in frontend code. Keep `UNSUBSCRIBE_SECRET` in Apps Script Script Properties, not in browser-delivered files.

## Admin dashboard

The website footer shows an `Admin` link when `GOOGLE_APPS_SCRIPT_ADMIN_URL` or a valid `GOOGLE_APPS_SCRIPT_WEB_APP_URL` is configured. The Apps Script endpoint serves an authenticated dashboard at `?action=admin` and checks the signed-in Google account against `ADMIN_ALLOWED_EMAILS`.

The static site also includes two branded entry routes:

- `/login/` for the publisher sign-in handoff
- `/admin/` for the branded admin landing page that forwards to the Apps Script dashboard

## Launch assets still needed

- Official Jackrabbit Punkin Publishing LLC logo
- Official outdoor author photo of Barbara J. Ratliff in a blue dress
- High-resolution *Battles Beyond the Waves* cover
- Retailer/purchase URL
- Facebook and LinkedIn profile URLs
- Discussion guide PDF and media kit PDF
- Website URL, mailing address (optional), and legal effective date

Asset placeholders are deliberate and should be replaced without cropping, recoloring, filtering, or otherwise altering the supplied originals.
