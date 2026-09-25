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
- `PUBLIC_ADMIN_URL`: the admin dashboard URL shown after successful sign-in.
- `SQUARE_BATTLES_HARDCOVER_URL` and `SQUARE_BATTLES_PAPERBACK_URL`: public Square checkout links for direct book sales.
- `SQUARE_PAGE_PAL_URL`, `SQUARE_CHAPTER_CHAMPION_URL`, `SQUARE_BOOKSHELF_BUILDER_URL`, and `SQUARE_LITERACY_TRAILBLAZER_URL`: legacy static Square sponsorship links, superseded by the dynamic `/api/sponsors/checkout` flow but left wired for backward compatibility.
- `CORS_ORIGIN`: origin allowed for browser requests to the Worker.
- `ADMIN_BOOTSTRAP_EMAILS`: initial owner emails inserted into D1 on first admin access.
- `GOOGLE_CLIENT_ID`: Google Identity Services web client ID used by the branded login screen.
- `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`: optional Cloudflare Access team domain and Application Audience tag. When both are set, the Worker trusts the `Cf-Access-Jwt-Assertion` header instead of the Google session cookie for every `/api/admin/*` request. Leave blank to keep using Google sign-in. See "Cloudflare Access (optional)" below.
- `SQUARE_ACCESS_TOKEN`: Square API access token used to create Payment Links for store and sponsorship checkout.
- `SQUARE_WEBHOOK_SIGNATURE_KEY`: signing key used to verify `POST /square/webhook` notifications.
- `SQUARE_LOCATION_ID`: the Square location used for all generated orders.
- `SQUARE_ENVIRONMENT`: `sandbox` or `production`, selects the Square API host.
- `RESEND_API_KEY`: API key used to send transactional and newsletter email via Resend.
- `MAIL_FROM_EMAIL`: the sending address used with Resend for all transactional and newsletter email.
- `UNSUBSCRIBE_SECRET`: private signing secret for newsletter unsubscribe links.
- `ADMIN_SESSION_SECRET`: HMAC secret used by the Worker to sign the admin session cookie.

All forms, the store, checkout, and the admin API run natively on Cloudflare (D1 for storage, R2 for book images, Square for payments, and Resend for outbound email). There is no external relay.

### Square webhook subscription

The Worker's `POST /square/webhook` endpoint (`handleSquareWebhook()` in `cloudflare/src/app.ts`) only reacts to these event types — the Square Developer Dashboard subscription for this application must include exactly these, or paid orders/sponsorships and refunds will never reconcile in D1:

- `payment.created`
- `payment.updated`
- `refund.created`
- `refund.updated`

Set the notification URL to `${SITE_URL}/square/webhook` and copy the subscription's signature key into `SQUARE_WEBHOOK_SIGNATURE_KEY`. The dynamic store checkout (`/api/store/checkout`, `assets/store.js`, `admin/store.html`) and the sponsor checkout (`/api/sponsors/checkout`) both rely solely on this webhook to mark orders/sponsorships paid and to decrement book inventory — `handleConfirmCheckout()` only polls existing status and never marks anything paid itself.

Existing D1 deployments must apply [cloudflare/migrations/0002_review_form_fields.sql](cloudflare/migrations/0002_review_form_fields.sql) and [cloudflare/migrations/0003_square_sponsors_content.sql](cloudflare/migrations/0003_square_sponsors_content.sql) after the initial migration.

### Square sandbox deployment

The default Wrangler environment remains production at `https://jackrabbitpunkinpublishing.com`. The named `sandbox` environment deploys a separate Worker at `https://jrpp.alphazonelabs.com`, uses isolated D1/R2 resources, and selects Square's sandbox API.

Deploy the sandbox Worker and apply its migrations with:

```sh
npx wrangler deploy --config cloudflare/wrangler.jsonc --env sandbox
npx wrangler d1 migrations apply bratliff-platform-sandbox --remote --config cloudflare/wrangler.jsonc --env sandbox
```

Set the sandbox values for `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_LOCATION_ID`, and the other required secrets with `--env sandbox`. Keep the production secrets on the default environment. The `jrpp.alphazonelabs.com` DNS record must be proxied through the `alphazonelabs.com` Cloudflare zone for the route to receive traffic. The legacy `/square/sandbox` path redirects to the sandbox host; the production root and production checkout remain unchanged.

## Sandbox review data generator

Generate clearly labeled sample records for review on the isolated sandbox site. The default run is a dry run; it does not write to D1 or send email.

Before applying, put the Resend API key in `.env` or `.env.local` as `RESEND_API_KEY`, and put the Square Sandbox access token and location ID in `.env.local` as `SQUARE_ACCESS_TOKEN` and `SQUARE_LOCATION_ID`. Set `SQUARE_ENVIRONMENT=sandbox` there. Wrangler must be authenticated for the Cloudflare sandbox account. Deploy the updated sandbox Worker first so tagged test sponsors do not trigger certificate emails. Then run:

```sh
npm run review-data:generate -- --apply
```

The script applies pending sandbox migrations, then creates at least 10 records of each public form type (contact, newsletter, speaking, book club, and book notification) and 10 examples of each admin data type: books, inventory events, authors, sponsors, newsletter campaigns, contacts, inactive subscribers, book interests, completed Square Sandbox bookstore purchases, and 10 completed Square Sandbox purchases for each of the four sponsorship packages, plus analytics events and audit entries. The webhook reconciles payments, then the script publishes the test sponsors so they appear on the sponsor wall. It attempts to email one review digest containing all generated form submissions and transaction details to `hligon@getsparqd.com`. Resend must accept the API key and the configured sender domain; if email delivery is rejected, the script saves `review-data-digest-RUN_ID.txt` and `.html` in the repository root. Generated user addresses use `example.invalid`; user confirmation emails are not sent.

The script pins its health check to `https://jrpp.alphazonelabs.com` and writes only to `bratliff-platform-sandbox` with Wrangler's `sandbox` environment. It creates OPEN orders through Square's Sandbox Orders API, writes matching pending order/payment records to sandbox D1, then completes each payment with Square's Sandbox test token at `connect.squareupsandbox.com`. The Square webhook remains responsible for reconciling payment status and bookstore inventory; the script waits for reconciliation before publishing each test sponsor. The script loads `.env`, then `.env.local`, then `.secrets.sandbox` (later files override earlier ones). Payments use test credentials and do not move real funds. Test sponsors are marked in admin notes so the certificate handler suppresses certificate email for them. The Literacy Trailblazer examples use a fictional mailing address. The script never calls IngramSpark or Amazon purchase paths. Newsletter campaigns are drafts, synthetic subscribers are inactive and have no consent, and author profiles are drafts. It does not seed administrator accounts.

Use `--count 15` to create more than 10 of each type (allowed range 10–100). Each run prints a run ID. To remove only that run's synthetic data:

```sh
npm run review-data:generate -- --apply --cleanup=RUN_ID
```

## Temporary launch page

The public homepage temporarily redirects visitors to `coming-soon.html`, while the admin, login, API, and completed site files remain intact. Remove the temporary redirect block marked in `index.html` when the full website is ready to launch.

## Admin dashboard

The website footer shows an `Admin` link to the website admin route. The static admin console now lives at [admin/index.html](admin/index.html) and calls the Worker at `/api/admin/*`.

The branded publisher login lives at [login/index.html](login/index.html). It uses Google Identity Services in the page, posts the returned Google credential to the Worker, and the Worker issues an HttpOnly admin session cookie after validating the Google account and the admin role.

The Worker confirms the Google account against the `admins` table in D1 before each admin request.

## Cloudflare Access (optional)

By default the admin API is protected by the built-in Google Identity Services sign-in described above. To front `/admin/*` and `/api/admin/*` with Cloudflare Access instead (recommended for stronger, centrally managed access control):

1. In the Cloudflare dashboard, open **Zero Trust > Access > Applications** and add a self-hosted application covering `jackrabbitpunkinpublishing.com/admin/*` and `jackrabbitpunkinpublishing.com/api/admin/*`.
2. Choose an identity provider (Google, One-time PIN, etc.) and add a policy that allows only the emails already listed in `ADMIN_BOOTSTRAP_EMAILS` / the `admins` D1 table.
3. Copy the application's **Audience (AUD) tag** and your **team domain** (`<team-name>.cloudflareaccess.com`) from the application's Overview tab.
4. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in `cloudflare/wrangler.jsonc`'s `vars` block (or `.env`/`.env.local` for local reference) and redeploy the Worker.
5. Once both values are non-empty, `authorizeAdmin()` in `cloudflare/src/app.ts` verifies the `Cf-Access-Jwt-Assertion` header against Cloudflare's JWKS (`https://<team-domain>/cdn-cgi/access/certs`) instead of the Google session cookie, and still checks the resolved email against the `admins` table for role/permission lookup.

This is intentionally opt-in and additive: leaving both variables blank keeps the current Google sign-in flow working exactly as before, so there is no risk of being locked out of `/admin/*` by deploying this change alone. Actually restricting access at Cloudflare's edge requires completing steps 1-4 above in the Zero Trust dashboard, which only an account owner should perform (a misconfigured Access policy can lock out all admins, including the person setting it up, until the policy is fixed from the dashboard).

## Monthly maintenance

A scheduled GitHub Actions workflow checks dependencies, security advisories, Cloudflare/D1 config, Square integration correctness, and site quality once a month, applies only safe in-range dependency updates, and opens a PR from a `monthlyUpdate` branch for review — it never merges itself or deploys to production. See [docs/maintenance.md](docs/maintenance.md) for the full details, and `monthlyReport.md` (generated at the repo root by each run) for the latest findings.

## Launch assets still needed

- Official Jackrabbit Punkin Publishing LLC logo
- Official outdoor author photo of Barbara J. Ratliff in a blue dress
- High-resolution *Battles Beyond the Waves* cover
- Retailer/purchase URL
- Facebook and LinkedIn profile URLs
- Discussion guide PDF and media kit PDF
- Website URL, mailing address (optional), and legal effective date

Asset placeholders are deliberate and should be replaced without cropping, recoloring, filtering, or otherwise altering the supplied originals.
