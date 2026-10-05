# Workspace status and remaining work

Last updated 2026-10-05. Earlier analysis items that are finished have been removed; only open work is detailed below.

## 1. Completed (summary)

- Removed: `.secrets.sandbox`, `cloudflare/.env.example`, `worker-configuration.d.ts`, `assets/finalUpdates.txt`, `CNAME`, `.nojekyll`, `cloudflare-proxy/`, `scripts/generate-resource-covers.py`, scripts `dev`/`start`/`open`/`proxy:deploy`, and devDependencies `http-server`/`open-cli`.
- Resource PDFs renamed to `<Name>_v1.pdf` and compressed (press kit 16.2 MB to 0.6 MB). Staging now publishes only the press kit, certificate and `S2CEO.png` from `assets/documents`; resource guides stay in private R2.
- Used images optimized in place (39 MB to 3 MB, same names and format). IG, X and YouTube icons kept.
- `jppIcon.png` is the mobile home-screen icon (`jppIcon-180/192/512.png`, apple-touch-icon on every page, admin manifest).
- One local Material Icons subset (`assets/material-icons.woff2`, 157 icons) for the site and admin; text glyphs replaced with icons.
- Admin drawer menu button fixed at the top-left on its own row above the logo (verified at 1280 px and 390 px).
- `account_id` pinned in `cloudflare/wrangler.jsonc`.
- Tests: `worker:check` passes, `test:maintenance` passes 60/60.
- Deployed to sandbox and production (2026-10-05); public pages no longer log 401 for the admin-session probe.

## 2. Configuration reference (unchanged)

| Where | Holds |
|---|---|
| `cloudflare/wrangler.jsonc` `vars` | Non-secret settings per environment |
| Worker secrets (`wrangler secret put/bulk`) | The 9 secrets (Resend, Namecheap, Square, Turnstile, session, unsubscribe, Google) |
| `.env.example` (tracked) | Template |
| `.env.local` (ignored) | Sandbox values for `write-site-config.js`, sandbox scripts, `wrangler dev`. Its `SITE_URL` is still the old `jrpp.alphazonelabs.com`; set `SITE_URL` explicitly per deploy or update it |
| `.env.local2` (ignored) | Production values; no script reads it |

Needed scripts: `worker:deploy`, `worker:deploy:sandbox`, `worker:prepare`, `prepare:config`, `worker:dev`, `worker:check`, `test:maintenance`. Optional: `maintenance:run`/`maintenance:dry-run`, `review-data:generate`, and `scripts/bootstrap-sandbox.mjs` (not wired to an npm script).

## 3. Still to do

### Needs your action
1. Back up `.env.local2` to a password manager, then delete or rename it (for example `.env.production.local`).
2. Confirm GitHub Pages is disabled for the repository.
3. Test live integrations (Resend, Namecheap, Square, Turnstile, Google sign-in); these were never exercised against live services from here.
4. Decide on the working-tree deletions of `FORM_SETUP.md` and `PUBLISHER_STORE_MANAGER.md` (not in any commit; merge anything useful into `docs/` first).
5. Add GitHub Actions secrets `RESEND_API_KEY`, `MAINTENANCE_EMAIL_TO`, `MAINTENANCE_EMAIL_FROM` so the monthly check-up can email you (see `docs/maintenance.md`), then run the workflow once manually to confirm delivery.

### Decisions
6. Monthly maintenance: now kept, scheduled for the 1st of each month, look-only by default, with a plain-English email and approval-gated fixes. Nothing to decide.
7. All other branches are removed (only `main` remains). `dotenv` 18 and `typescript` 7 are major upgrades; the monthly email will keep reminding you.
8. `assets/photos/barbaraRatliff2.png` is unreferenced; keep or delete.

### Engineering follow-ups
10. `assets/admin.js` (116 KB) and `admin.css` (38 KB) are still monoliths loaded on every non-workspace admin page; splitting is a refactor.
11. To add icons later, rebuild `material-icons.woff2` from the original OTF (retrievable from git history, `HEAD~` before commit `753cacc`) with the new names; the tooling lives in the gitignored `.venv`.

After any removal run `npm run worker:check` and `npm run test:maintenance`; the static-guard tests reference the workflow and `monthlyReport.md`.