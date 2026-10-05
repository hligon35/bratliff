# Monthly Maintenance System

This repository has an automated, low-risk monthly maintenance system. It runs
on a schedule, records everything it finds/does in `monthlyReport.md`, commits
its work to a dedicated `monthlyUpdate` branch, and opens a pull request for
human review. **It never merges its own PR and never deploys to production.**

## Monthly check-up, plain-English email, and approved fixes

- **When:** the first day of every month at 13:00 UTC (and any time from Actions > Monthly Maintenance > Run workflow).
- **Default mode is look-only.** It scans, then emails a plain-English ("explain it like I'm 10") summary through Resend. It changes nothing.
- **Approving fixes:** start the workflow manually and tick **Apply the safe fixes**. That run installs only in-range dependency updates, commits to `monthlyUpdate`, and opens a pull request for review. It never merges, deploys, or touches production data. Starting a manual run requires repository write access, which is the confirmation step.
- **Email setup (repository secrets, Settings > Secrets and variables > Actions):** `RESEND_API_KEY`, `MAINTENANCE_EMAIL_TO`, `MAINTENANCE_EMAIL_FROM` (an address on a Resend-verified domain). If any is missing, or Resend rejects the send (for example an unverified domain), the workflow's email step fails visibly instead of pretending it worked.
- **Reports:** `monthlyReport.md` and `maintenance-summary.txt` are generated, not committed to `main`; they are attached to each run as an artifact.
## What is checked

Each run executes these checks and records the results:

| Area | What it does | Auto-applies changes? |
| --- | --- | --- |
| Dependencies (`scripts/maintenance/checks/dependencies.mjs`) | Reports outdated npm packages; applies `npm update` (never crosses a `package.json` semver range) then verifies with `npm ci`. | Yes — in-range only |
| Security audit (`checks/security.mjs`) | Runs `npm audit --json`, reports advisories by severity. | No — report only, never runs `npm audit fix --force` |
| Build/type-check (`checks/build.mjs`) | Runs `tsc --noEmit` and a Wrangler **dry-run** build (`wrangler deploy --dry-run`). | No — validation only, never deploys |
| D1 migrations (`checks/d1.mjs`) | Verifies migrations are sequentially numbered and applies them to a **local-only** D1 database (`wrangler d1 migrations apply --local`). | No — local database only, never touches production D1 |
| Secret scanning (`checks/secret-scan.mjs`) | Regex scan of all git-tracked files for tokens/keys/PEM blocks/hardcoded secrets. | No — report only |
| Static code scan (`checks/code-scan.mjs`) | Heuristics for `.innerHTML =`, SQL string concatenation, `target="_blank"` without `rel`, wildcard CORS. | No — report only |
| Square configuration (`checks/square.mjs`) | Validates sponsorship tier math against `cloudflare/src/config.ts`, confirms webhook signature verification + idempotency exist in `app.ts`. Never requires or uses real Square credentials. | No — validation only |
| Site content/quality (`checks/site-content.mjs`) | Finds broken internal links, missing `alt` text, admin/login `noindex` + `robots.txt` coverage, sitemap canonical-domain check. | No — report only |

All command output is passed through `scripts/maintenance/lib/redact.mjs`
before it is ever written to the report or logs, to strip tokens, keys, and
email addresses.

## What this system will never do

- Merge its own pull request, or any pull request.
- Deploy to production Cloudflare (`wrangler deploy` is only ever run with `--dry-run`).
- Apply D1 migrations to the production database (only `--local`).
- Write to production R2 buckets.
- Change DNS, Cloudflare Access, WAF, or other account-level settings.
- Rotate or read real secrets, or require Square Sandbox/production credentials to run.
- Run `npm audit fix --force` or any command that could cross a major version silently.
- Force-push over a branch that wasn't created by this automation (see "Branch safety" below).

## Running it locally

```bash
npm run maintenance:dry-run   # scan + report only, no dependency updates, no branch/PR changes
npm run maintenance:run       # applies in-range dependency updates, still local-only otherwise
npm run test:maintenance      # unit + static-guard tests for the maintenance system itself
```

Both `maintenance:run` and `maintenance:dry-run` write `monthlyReport.md` at
the repository root and exit with a non-zero status if there are Critical
findings or a required check failed — this is intentional so CI reflects an
accurate pass/fail state; it never blocks the report from being written.

## Branch behavior (`monthlyUpdate`)

`scripts/maintenance/sync-branch.mjs` creates or reuses a single branch named
exactly `monthlyUpdate`:

- If `origin/monthlyUpdate` does not exist, it is created fresh from the
  default branch.
- If it does exist, the script only resets/reuses it when the branch's last
  commit carries the `Maintenance-Bot: true` trailer (added by every
  automated commit). If that marker is missing — meaning a human pushed
  work to `monthlyUpdate` directly — the script refuses to touch the branch
  and exits non-zero with instructions to resolve it manually (e.g. rename
  the human branch, or merge/rebase by hand).

This means the workflow's `git push --force-with-lease origin monthlyUpdate`
step is safe: it only ever rewrites the automation's own prior run.

## The monthly report and PR review process

Every run writes `monthlyReport.md` with: run info, an executive summary,
updates applied, a full findings table (severity/area/evidence/recommended
action), dependency/security/Cloudflare/site-quality status sections, the
exact commands run and their results, a "Deferred Manual Review" list, and a
recommendation (`Safe to merge` / `Do not merge`).

The scheduled workflow (`.github/workflows/monthly-maintenance.yml`) commits
this report (and any in-range dependency updates) to `monthlyUpdate`, pushes
it, and opens or updates a single PR from `monthlyUpdate` into the default
branch, labeled `maintenance`, `dependencies`, `security-review`.

**To close a maintenance cycle:** review `monthlyReport.md` in the PR body,
address or dismiss each row in "Deferred Manual Review", then merge the PR
yourself (or close it without merging if nothing needs to ship). Do not merge
if the report's recommendation is "Do not merge" or any Critical finding is
still open — rotate/fix those first.

## Manually triggering a run in GitHub Actions

Actions tab → "Monthly Maintenance" → "Run workflow". The `dry_run` input
lets you do a scan-only pass (no dependency updates, no branch/PR changes).

## Emergency security updates outside the monthly cycle

`.github/dependabot.yml` additionally enables:

- GitHub's Dependabot **security updates** (vulnerability-alert driven),
  controlled under Settings → Code security → Dependabot, independent of this
  file and not limited by it — these can open a PR immediately for a
  high-severity advisory rather than waiting for the monthly run.
- A low-volume monthly Dependabot version-update pass (npm + GitHub Actions)
  as a second opinion; it does not replace the consolidated `monthlyUpdate`
  PR.

## Required/optional GitHub repository settings

- **Required:** the default `GITHUB_TOKEN` needs `contents: write` and
  `pull-requests: write` (already scoped minimally in the workflow's
  `permissions:` block — no repository setting change needed for a public
  repo with default token permissions at "read" or higher).
- **Recommended:** branch protection on the default branch requiring PR
  review before merge, so the maintenance PR can never be merged without a
  human looking at it.
- **Optional:** a dedicated GitHub Environment (e.g. `maintenance`) if you
  want to require manual approval before the workflow runs, or to scope
  secrets specifically to this workflow.

## Optional: Cloudflare preview / Square Sandbox

Not configured by default — the baseline checks work entirely without any
Cloudflare or Square credentials (Square checks are skipped, not failed, when
credentials are absent). If you want deeper validation in the future:

- **Cloudflare preview:** provide a `CLOUDFLARE_API_TOKEN` scoped to a
  preview/staging environment only (never production) as a repository or
  environment secret, and extend `checks/build.mjs` to run an actual preview
  deploy instead of only `--dry-run`.
- **Square Sandbox:** provide sandbox-only `SQUARE_ACCESS_TOKEN` /
  `SQUARE_WEBHOOK_SIGNATURE_KEY` / `SQUARE_LOCATION_ID` values as secrets;
  `checks/square.mjs` will then exercise a real Sandbox API call in addition
  to the static checks it already performs. Never place production Square
  credentials in this workflow.

## Disabling the schedule

Comment out or remove the `schedule:` block in
`.github/workflows/monthly-maintenance.yml`, or disable the workflow from the
Actions tab ("..." → "Disable workflow"). `workflow_dispatch` can be kept
enabled for on-demand runs.

## Credential rotation / access removal

If a run ever surfaces a Critical secret-scanning finding (a real credential
committed to the repository), rotate that credential at its source (Square
Dashboard, Cloudflare dashboard, Resend, etc.) and remove it from the
offending file **and from git history** before merging the maintenance PR.
This automation only reports the finding — it never rotates credentials or
rewrites git history itself.

## Disclaimer

This automation reports findings and applies a narrow set of low-risk,
deterministic changes on a monthly cadence. It does **not** constitute
continuous human security monitoring, and passing checks are **not** a
guarantee that the site or its dependencies are free of vulnerabilities. A
human must still review every `monthlyReport.md` and PR before merging.
