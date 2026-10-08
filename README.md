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

Public forms and reader sign-in share the Turnstile loader in [assets/turnstile.js](assets/turnstile.js). Widgets use their standard 300 x 65 size without stretching across the form, with compact sizing below 300 pixels of available width. The header reader-login form includes a keyboard-accessible eye button to show or hide the password in both its desktop popover and mobile dialog; passwords start hidden whenever the form is rendered.

The mobile account overlay is mounted directly under the document body, outside the blurred fixed header, so it stays centered in the viewport. Its card scrolls within the dynamic viewport height on short screens.

Copy `.env.example` to `.env` and fill in the Cloudflare deployment values. `.env.local` is optional and overrides `.env` during local development.

- `SITE_URL`: the public website URL.
- `PUBLIC_API_URL`: the Worker base URL used by forms, checkout, media, and admin API requests.
- `PUBLIC_ADMIN_URL`: the admin dashboard URL shown after successful sign-in.
- The featured paperback’s **Buy Direct from JPP** link opens its Square checkout page for that specific item. The Live Catalog separately uses the native cart and `/api/store/checkout`.
- `SQUARE_PAGE_PAL_URL`, `SQUARE_CHAPTER_CHAMPION_URL`, `SQUARE_BOOKSHELF_BUILDER_URL`, and `SQUARE_LITERACY_TRAILBLAZER_URL`: legacy static Square sponsorship links, superseded by the dynamic `/api/sponsors/checkout` flow but left wired for backward compatibility.
- `CORS_ORIGIN`: origin allowed for browser requests to the Worker.
- `ADMIN_BOOTSTRAP_EMAILS`: initial owner emails inserted into D1 on first admin access.
- `GOOGLE_CLIENT_ID`: Google Identity Services web client ID used by the branded login screen.
- `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`: Cloudflare Access team domain and Application Audience tag. In Access mode the Worker verifies the assertion header or signed `CF_Authorization` application cookie for every admin request. `ADMIN_AUTH_MODE=google` explicitly selects the separate Google session flow. See "Cloudflare Access (optional)" below.
- `SQUARE_ACCESS_TOKEN`: Square API access token used for checkout, catalog reads (`ITEMS_READ`), and inventory reads/updates (`INVENTORY_READ`, `INVENTORY_WRITE`). The admin Square Catalog view lists live Square products and variations; quantity edits update Square directly and also update D1 for variations linked to bookstore books.
- `SQUARE_WEBHOOK_SIGNATURE_KEY`: signing key used to verify `POST /square/webhook` notifications.
- `SQUARE_LOCATION_ID`: the Square location used for all generated orders.
- `SQUARE_ENVIRONMENT`: `sandbox` or `production`, selects the Square API host.
- `RESEND_API_KEY`: API key used to send transactional and newsletter email via Resend.
- `MAIL_FROM_EMAIL`: the verified Resend sender, `publisher@jackrabbitpunkinpublishing.com`.
- `UNSUBSCRIBE_SECRET`: private signing secret for newsletter unsubscribe links.
- `ADMIN_SESSION_SECRET`: HMAC secret used by the Worker to sign the admin session cookie.

All forms, the store, checkout, and the admin API run natively on Cloudflare (D1 for storage, R2 for book images, Square for payments and inventory, and Resend for outbound email). D1 remains the transaction-safe checkout ledger; Square catalog variations receive physical-count updates after bookstore adjustments and paid orders.

### Square webhook subscription

The Worker's `POST /square/webhook` endpoint (`handleSquareWebhook()` in `cloudflare/src/app.ts`) only reacts to these event types — the Square Developer Dashboard subscription for this application must include exactly these, or paid orders/sponsorships and refunds will never reconcile in D1:

- `payment.created`
- `payment.updated`
- `refund.created`
- `refund.updated`

Set the notification URL to `${SITE_URL}/square/webhook` and copy the subscription's signature key into `SQUARE_WEBHOOK_SIGNATURE_KEY`. The dynamic store checkout (`/api/store/checkout`, `assets/store.js`, `admin/store.html`) and the sponsor checkout (`/api/sponsors/checkout`) both rely solely on this webhook to mark orders/sponsorships paid and to decrement book inventory — `handleConfirmCheckout()` only polls existing status and never marks anything paid itself.

Existing D1 deployments must apply [cloudflare/migrations/0002_review_form_fields.sql](cloudflare/migrations/0002_review_form_fields.sql) and [cloudflare/migrations/0003_square_sponsors_content.sql](cloudflare/migrations/0003_square_sponsors_content.sql) after the initial migration.

### Square sandbox deployment

The default Wrangler environment remains production at `https://jackrabbitpunkinpublishing.com`. The named `sandbox` environment deploys a separate Worker at `https://sandbox.jackrabbitpunkinpublishing.com`, uses isolated D1/R2 resources, and selects Square's sandbox API.

Deploy the sandbox Worker and apply its migrations with:

```sh
npx wrangler deploy --config cloudflare/wrangler.jsonc --env sandbox
npx wrangler d1 migrations apply bratliff-platform-sandbox --remote --config cloudflare/wrangler.jsonc --env sandbox
```

Set the sandbox values for `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_LOCATION_ID`, and the other required secrets with `--env sandbox`. Keep the production secrets on the default environment. The sandbox custom domain belongs to the `jackrabbitpunkinpublishing.com` Cloudflare zone. Point the Square Sandbox webhook subscription that owns `SQUARE_WEBHOOK_SIGNATURE_KEY` at `https://sandbox.jackrabbitpunkinpublishing.com/square/webhook` so payment events reach this Worker. The legacy `/square/sandbox` path redirects to the sandbox host; the production root and production checkout remain unchanged.

## Sandbox review data generator

Generate clearly labeled sample records for review on the isolated sandbox site. The default run is a dry run; it does not write to D1 or send email.

Before applying, put the Resend API key in `.env` or `.env.local` as `RESEND_API_KEY`, and put the Square Sandbox access token and location ID in `.env.local` as `SQUARE_ACCESS_TOKEN` and `SQUARE_LOCATION_ID`. Set `SQUARE_ENVIRONMENT=sandbox` there. Wrangler must be authenticated for the Cloudflare sandbox account. Deploy the updated sandbox Worker first so tagged test sponsors do not trigger certificate emails. Then run:

```sh
npm run review-data:generate -- --apply
```

The script applies pending sandbox migrations, then creates at least 10 records of each public form type (contact, newsletter, speaking, book club, and book notification) and 10 examples of each admin data type: books, inventory events, authors, sponsors, newsletter campaigns, contacts, inactive subscribers, book interests, completed Square Sandbox bookstore purchases, and 10 completed Square Sandbox purchases for each of the four sponsorship packages, plus analytics events and audit entries. The webhook reconciles payments, then the script publishes the test sponsors so they appear on the sponsor wall. It attempts to email one review digest containing all generated form submissions and transaction details to `hligon@getsparqd.com`. Resend must accept the API key and the configured sender domain; if email delivery is rejected, the script saves `review-data-digest-RUN_ID.txt` and `.html` in the repository root. Generated user addresses use `example.invalid`; user confirmation emails are not sent.

The script pins its health check to `https://sandbox.jackrabbitpunkinpublishing.com` and writes only to `bratliff-platform-sandbox` with Wrangler's `sandbox` environment. It creates OPEN orders through Square's Sandbox Orders API, writes matching pending order/payment records to sandbox D1, then completes each payment with Square's Sandbox test token at `connect.squareupsandbox.com`. The Square webhook remains responsible for reconciling payment status and bookstore inventory; the script waits for reconciliation before publishing each test sponsor. The script loads `.env`, then `.env.local` (later files override earlier ones). Payments use test credentials and do not move real funds. Test sponsors are marked in admin notes so the certificate handler suppresses certificate email for them. The Literacy Trailblazer examples use a fictional mailing address. The script never calls IngramSpark or Amazon purchase paths. Newsletter campaigns are drafts, synthetic subscribers are inactive and have no consent, and author profiles are drafts. It does not seed administrator accounts.

Use `--count 15` to create more than 10 of each type (allowed range 10–100). Each run prints a run ID. To remove only that run's synthetic data:

```sh
npm run review-data:generate -- --apply --cleanup=RUN_ID
```

## Resource Center handoff

The public Resource Center is `https://jackrabbitpunkinpublishing.com/resources.html`; the Read It Forward page is `https://jackrabbitpunkinpublishing.com/read-it-forward.html`. The Resource Center link inside each guide must point to the public page, not a registration screen. Have JPP replace all placeholder URLs in the final six PDFs before they are uploaded; do not publish an older PDF with placeholder links.

Guide titles, approved card/detail copy, audiences, and cover alt text live in [assets/resource-catalog.json](assets/resource-catalog.json). Add the six approved portrait covers under `assets/resource-covers/` and set their `cover` paths in the catalog; preserve each cover's original design and full composition. Export portrait images at approximately 900 x 1200 px in WebP or PNG, ideally below 500 KB each. Do not substitute book covers for guide covers. Until those files arrive, cards explicitly show "Cover pending."

Upload each corrected PDF to the **private** `BOOK_ASSETS` R2 bucket under `resource-guides/<catalog-slug>.pdf` (for example, `resource-guides/battles-reader-discussion-guide.pdf`); do not place these PDFs under public `assets/`. Confirm the bucket has no public `r2.dev` or custom-domain access before launch. The staging script publishes only `JPP_Media_Press_Kit_v1.pdf`, `JPP_Certificate_of_Appreciation_v1.pdf` and `S2CEO.png` from `assets/documents/`; every other file there (the resource guides) is an upload source for R2 and is never served publicly. Keep document file names in the `<Name>_v1.pdf` form (no numbered copies or dates) and compress PDFs before committing. The Worker serves a PDF only through `/api/customer/resources/<slug>/download` after validating the reader's account and Resource Library registration, then records a download event. A user can still share a file they have downloaded; the site does not provide DRM.

Registrations are stored in D1 `resource_registrations`, linked to `customer_accounts`; per-guide downloads are in `resource_downloads`. Apply migration `0010_resource_library.sql` before deploying the Worker to either environment. Barbara can review registrations, selected-guide totals, and per-guide downloads on the protected Admin Analytics page, and download the registrations CSV there. Each new registration attempts a confirmation email to the reader and a notification to `ADMIN_NOTIFICATION_EMAIL` via Resend. Marketing opt-in is optional and off by default; only explicit opt-in adds a newsletter subscriber. Returning readers use their existing reader-account password and the library link from the confirmation email; the site's existing password-reset flow remains available. If sending fails, the registration is retained and the failure is logged for follow-up.

Do not consider the library launched until all six approved covers and corrected PDFs are in place, the migration is applied remotely, email delivery and the notification address are tested, and the resource access/analytics flow is verified on the deployment domain.

## Temporary launch page

The public homepage temporarily redirects visitors to `coming-soon.html`, while the admin, login, API, and completed site files remain intact. Remove the temporary redirect block marked in `index.html` when the full website is ready to launch.

## Admin dashboard

The website footer shows an `Admin` link to the website admin route. The static admin console now lives at [admin/index.html](admin/index.html) and calls the Worker at `/api/admin/*`.

All admin routes share the mailbox-style drawer and header from [assets/admin-shell.js](assets/admin-shell.js) and [assets/admin-shell.css](assets/admin-shell.css). Publishing, administration, and the full bookstore manager retain their existing page workflows in [assets/admin.js](assets/admin.js); orders, catalog, inventory, and mailbox use [assets/admin-workspace.js](assets/admin-workspace.js). Update navigation only in the shared shell. Analytics, activity, and admin-access links are shown only for owner/developer sessions; the API remains responsible for authorization. The `jrpp-workspace-drawer` preference is shared across pages, and the mobile drawer supports Escape, keyboard focus containment, and backdrop dismissal. Run `node --test scripts/admin-shell.test.mjs` for shell regression checks.

The branded publisher login lives at [login/index.html](login/index.html). It uses Google Identity Services in the page, posts the returned Google credential to the Worker, and the Worker issues an HttpOnly admin session cookie after validating the Google account and the admin role.

The Worker confirms the Google account against the `admins` table in D1 before each admin request.

## Cloudflare Access (optional)

By default the admin API is protected by the built-in Google Identity Services sign-in described above. To front `/admin/*` and `/api/admin/*` with Cloudflare Access instead (recommended for stronger, centrally managed access control):

1. In the Cloudflare dashboard, open **Zero Trust > Access > Applications** and add a self-hosted application covering `jackrabbitpunkinpublishing.com/admin/*` and `jackrabbitpunkinpublishing.com/api/admin/*`.
2. Choose an identity provider (Google, One-time PIN, etc.) and add a policy that allows only the emails already listed in `ADMIN_BOOTSTRAP_EMAILS` / the `admins` D1 table.
3. Copy the application's **Audience (AUD) tag** and your **team domain** (`<team-name>.cloudflareaccess.com`) from the application's Overview tab.
4. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in `cloudflare/wrangler.jsonc`'s `vars` block (or `.env`/`.env.local` for local reference) and redeploy the Worker.
5. In Access mode, `authorizeAdmin()` verifies the `Cf-Access-Jwt-Assertion` header against Cloudflare's JWKS (`https://<team-domain>/cdn-cgi/access/certs`). When the edge does not supply the header, it verifies the `CF_Authorization` application cookie with the same signature, issuer, audience and expiration requirements. Both paths check the email against the `admins` table. The admin uses `/api/admin/session` and `/api/admin/logout`; `/api/auth/session` remains available for public session probes.
6. Keep the Access cookie path at `/` (disable the Cookie Path Attribute) so requests from `/admin/*` to `/api/admin/*` receive it. Include `/api/admin/*` in the same Access application as `/admin/*`; this also supplies the verified header on session/logout requests. `PUBLIC_ADMIN_URL` must point to a host protected by that application: the branded login page uses it even when opened on www.

This is intentionally opt-in and additive: leaving both variables blank keeps the current Google sign-in flow working exactly as before, so there is no risk of being locked out of `/admin/*` by deploying this change alone. Actually restricting access at Cloudflare's edge requires completing steps 1-4 above in the Zero Trust dashboard, which only an account owner should perform (a misconfigured Access policy can lock out all admins, including the person setting it up, until the policy is fixed from the dashboard).

## Production prerequisites

Cloudflare, Resend, Namecheap and migration steps required before release are listed in [docs/production-prerequisites.md](docs/production-prerequisites.md).

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
