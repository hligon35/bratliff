# Remediation status — October 29, 2026

Review branch: `fix/production-remediation`, based on `preview` at `0ca546d`. Changes are grouped into sequential commits for auth, D1 safety, checkout, preview security, regression tests and CI.
Draft PR: https://github.com/hligon35/bratliff/pull/42

## Implemented

- **P0 authentication:** Production/sandbox retain explicit direct Google login. Access requires explicit selection; missing mode plus Access settings fails closed. Stale Access assertions cannot replace a Google app session. Code, environment example, release policy and operator documentation now agree. Existing edge policies have not been changed.
- **P0 D1 safety:** Production deployment no longer applies migrations. The separate backup command requires explicit export approval, writes a private ignored SQL export, captures Time Travel information, hashes the export/migrations, and rehearses pending migrations locally. Applying remotely requires separate approval and a matching, rehearsed backup less than 24 hours old for the same release commit/database. No production export or migration was run.
- **P0 Square:** Every-minute scheduled work claims old pending links, reconciles completed tenders before cancellation, retries failures and records diagnostic state. Late payments retain atomic stock/reservation safeguards and payment IDs for review. Both API and database block fulfillment of unsettled orders. Migration 0021 is additive and remains unapplied remotely. Cancellation is best effort; it cannot guarantee a precise provider-side cutoff during outages or races.
- **P0 CI:** Preview pushes and PRs to preview/main trigger website/mobile checks. An always-running aggregate fails unless both jobs succeed. No automatic deployment or migration is added. Required-check rulesets remain an owner action.
- **P1 regression/security:** Added cancellation, missed-payment, retry, concurrency, reservation-competition, fulfillment, backup-gate, auth-mode and preview-header tests. Ran existing refund/webhook, newsletter/consent, submission outbox, SMTP uncertainty, mailbox isolation, role/session and private R2 regression coverage. No production secrets or buckets were modified.
- **P1 preview:** Separate disabled configuration uses placeholder D1/R2/origin identities, sandbox Square, no routes or cron, and no mailbox credentials. All preview responses are noindex/no-store. No resources were provisioned.
- **P2 SEO/accessibility:** Existing clean sitemap/private robots checks remain; release checks now require document language, one main landmark, a title and explicit image alternative text on top-level public HTML.
- **P2 Expo:** Added mobile lockfile, aligned React Native 0.81.5 to SDK 54, checked types and exported the Android JavaScript bundle. The application remains a branded starter screen.
- **PR #41:** Client-managed tax and no additional customer surcharge remain covered by passing checkout regression tests.

## Validation performed locally

- Full regression suite: **189 passed, 0 failed**, using two concurrent test files.
- Worker TypeScript check and release/link/SEO/accessibility/configuration checks: passed.
- Migration rehearsal on local SQLite: all 21 migrations passed, including integrity and foreign-key checks. This is not a remote D1 compatibility or production restore certification.
- Production deployment bundle dry-run: passed with Wrangler 4.156.0; nothing published.
- Website dependency audit after compatible tooling updates: **0 vulnerabilities**.
- Expo TypeScript, installed-SDK dependency compatibility and Android JavaScript export: passed. Compatibility used the SDK's offline version matrix; no Expo account or EAS service was used.
- Mobile audit: **9 advisories (8 low, 1 high)** remain. The high advisory is image-size through Metro v1; the low chain involves deepmerge. Compatible PostCSS fixes are included. No forced SDK downgrade or incompatible image parser override was used. Upstream tracking: https://github.com/expo/expo/issues/48670. The CI mobile audit intentionally prevents a successful release gate while the high advisory remains.
- GitHub Actions run 40942171458 for PR commit `6ea2ad6` completed with **startup_failure** before check jobs ran. This is separate from the known mobile audit blocker; local results do not establish green CI. GitGuardian passed its scan of the eight implementation commits. Recheck the latest documentation commit separately.

## Pending — code or account configuration

1. Resolve the upstream mobile image parser advisory through a compatible fix or an explicitly reviewed Expo/Metro upgrade that removes it. Then obtain a fully successful CI run for the reviewed commit.
2. Configure main/preview rulesets to require `Quality Checks / Release checks` and review bypass permissions. Inspect Actions account/runner/billing restrictions if jobs fail at startup. No repository rules were changed.
3. Review and approve the intended live Google/Access edge policy, dashboard overrides and Google allowed origins. Verify login/logout/session expiry and role behavior on apex and www without weakening access controls.
4. Provision preview-only D1/R2 and configure test identities, sender/recipient isolation and secrets only after approval. Replace disabled placeholders explicitly; never reuse production data, resources or credentials.

## Pending — approved acceptance/release work

- Export/rehearse representative production data, secure the backup off-machine, test restoration and record a restore point/Worker version. Review outstanding migrations through 0021 and obtain separate remote migration approval.
- Test actual sandbox Square purchases, provider cancellation permissions, delayed/missed webhooks, refund reconciliation and stock under real provider timing. Review historical pending links before enabling scheduled cancellation.
- Test real Resend delivery/verified domain, unsubscribe, queued mail and mailbox provider behavior using approved test recipients.
- Verify private R2 dashboard settings, approved guide content and authenticated downloads; local tests do not prove bucket privacy or deployed content.
- Complete browser/mobile/keyboard/screen-reader testing, responsive layouts, performance/Core Web Vitals and deployed indexing/headers. Static semantic checks are only a baseline.
- Validate native Android/iOS builds, simulator/device behavior, signing and EAS configuration if the shell is to ship. No website-to-Expo migration or native account/navigation flow is implemented.
- Reconcile production orders/refunds/inventory and perform final launch acceptance. Merge, deployment, remote migrations, live provider transactions and live infrastructure changes still require explicit approval.


## Book alert follow-up

Automatic signup-to-inventory availability alerts are now implemented in this PR, with migration 0022, exact normalized title matching, an optional explicit list-title mapping, a durable one-per-reader/title outbox, shared retry handling, rechecked consent/availability, and admin delivery progress. The latest full local regression run passed **203 tests**; Worker/release checks and bundle dry-run passed. See [Book availability alerts](book-notifications.md) for operation, rollout and limitations. Migration 0022 and deployment remain unapplied; existing CI/mobile release blockers are unchanged.
