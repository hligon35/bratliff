# October 20 launch validation — October 14, 2026

Repository inspected: `hligon35/bratliff`, main `399b4c1994bdccea9882eeba90050e0a14a97489`.
Launch target: Tuesday, October 20. Existing administrator training materials are retained.

## GitHub Actions diagnosis

1. [Main run 37968624312](https://github.com/hligon35/bratliff/actions/runs/37968624312) failed at startup with zero jobs/check runs. Its annotation explicitly rejects `docker://rhysd/actionlint:1.7.12`, `actions/checkout@v4` and `actions/setup-node@v4`: only owner/GitHub-created actions are allowed and all actions must use full commit SHAs.
2. The fix pins both GitHub-created actions to their verified v4 commit SHAs and installs the official actionlint 1.7.12 Linux archive with a hardcoded SHA-256 obtained from its GitHub release asset digest and independently checked locally. It keeps the action allowlist intact, adds manual dispatch, and adds a local-only D1 migration rehearsal.
3. GitHub refused to retry the original run: HTTP 403, `This workflow run cannot be retried`. [PR #37](https://github.com/hligon35/bratliff/pull/37) triggered a new run.
4. [PR run 38603750070](https://github.com/hligon35/bratliff/actions/runs/38603750070) passed workflow admission and created `validate`, then failed with the explicit annotation: **“The job was not started because your account is locked due to a billing issue.”** Job 115989241385 has no steps and runner ID 0. This establishes a separate account billing blocker; it does not establish runner capacity exhaustion. A supported failed-job rerun was accepted, but attempt 2 also failed without executing steps. No executed CI success is claimed.
5. The account owner must resolve the GitHub billing lock, then rerun the failed PR job/run. No account settings, spending limits or payment details were changed. The runner is pinned to Ubuntu 24.04 because GitHub announced an `ubuntu-latest` migration starting October 19, one day before launch.

## Safe validation completed

- `npm ci`: passed.
- actionlint 1.7.12: both repository workflows passed.
- `npm audit --audit-level=high`: zero vulnerabilities.
- `npm run release:check` and `npm run worker:check`: passed.
- `npm run test:maintenance`: all 168 regression tests passed locally under both Node 24.19.0 and **Node 22.23.3**, matching the workflow major version. Tests exercise actual Worker logic with in-memory SQLite and mock providers, including settlement rollback/duplicates, reservation contention, late payments, refunds, inventory sync, Google/Access verification and homepage preview isolation.
- All **19 migrations** applied to a fresh **local Wrangler D1** database.
- Separate local SQLite upgrade from 0017 through 0019 retained representative catalog/order rows; integrity/foreign-key checks passed. This is not a production-backup rehearsal.
- Asset preparation and Wrangler **deployment dry-run** passed; no publish occurred.

## Read-only production observations

Public GET checks reached production on October 14. Node initially timed out without proxy support; rerunning the verifier with this environment's proxy support reached the site. Python's default HTTP client encountered Cloudflare 1010 responses, while curl and the proxy-aware Node verifier reached the application. A client-specific edge rejection is not treated as an application outage.

| Dependency | Verified observation | Remaining acceptance |
| --- | --- | --- |
| Worker | `/healthz`: 200, production health `ok: true` | Confirm deployed Worker version in Cloudflare |
| Admin authentication | `/api/auth/config`: `mode=google`; unauthenticated `/api/admin/session`: 401 and `no-store`; admin HTML loads without an Access challenge; www admin redirects to apex | Intended admin Google login, roles, invitation acceptance, expiry/logout; inspect any remaining Access application/policy in Zero Trust |
| Native checkout | `/api/store/books`: `books: []`, checkout unavailable, tax mode `unconfigured` | Publish approved catalog/stock; approve tax policy; verify Square credentials/location/scopes, webhooks and settlement/inventory with controlled testing |
| Featured Square link | Live books page retains `https://square.link/u/llSOK4s4`; GET follows a redirect to a Square-hosted checkout page returning 200 | Does not prove that a payment settles or stock synchronizes; do not infer a broken link from HEAD, which returned 404 |
| Homepage gate | Anonymous `/`: 302 to `/coming-soon`, `no-store`; coming-soon page available; local preview/session isolation tests pass | Keep closed until explicit launch authorization; browser acceptance remains |
| D1 | Local chain and representative upgrade pass through **0019**, including resource views/invitations | Production applied-migration list, backup/restore point, and upgrade rehearsal on a production copy require account access |
| HTTPS headers | Final edge responses emit HSTS `max-age=0`, despite positive max-age in repository headers | Review zone HSTS/response transforms and recheck final responses; no zone changes made |
| Resend | Offline retries/idempotency/queue tests pass | Verify sender domain, key, cron and delivery outcomes in production; no real mail sent |

The existing direct Square link is separate from the native catalog/tax-gated checkout. Native checkout is not ready merely because the hosted link redirects. No approved tax rate was assumed and no invented inventory was inserted.

## Required before launch acceptance

1. Account owner clears GitHub's billing lock; obtain a successful Quality Checks run on the PR. Review/merge separately; this work does not merge or deploy.
2. Confirm production D1 backup and applied migrations through **0019**. Review historical 0003/0006 table rebuilds if still pending; rehearse on a backup before any approved remote application.
3. Approve/publish real native catalog and tax policy if native checkout is part of launch. Confirm Square permissions, location and webhook subscriptions, then validate completed payment, duplicate notification, stock decrement, shipping, late-payment review and refund reconciliation with approved controlled provider tests.
4. Complete an intended administrator's Google login/role/invitation/logout journey; inspect Access coverage rather than changing authentication based on stale documentation. Main currently explicitly uses direct Google in both environments.
5. Verify Resend configuration and cron/provider outcomes, private R2 guide availability and final edge HSTS, then complete browser/mobile acceptance.
6. Record release approval, Worker version, DB restore point and rollback constraints before deploying or opening the homepage. **The homepage remains closed; no deployment, remote migration, paid order, real email, DNS/Access change or production-data mutation was performed.**
