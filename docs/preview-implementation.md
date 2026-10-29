# Preview branch implementation status

This branch is the safe integration branch for the planned Cloudflare + Expo transition.

## Implemented

- Corrected malformed canonical sitemap URLs.
- Made robots rules apply consistently to private account and API routes.
- Release checker now checks canonical sitemap paths instead of hard-coding a past launch date.
- Added an isolated `apps/mobile` Expo starter with only a branded root view, no product routes or account flows.

## Native shell local check

```sh
cd apps/mobile
npm install
npx expo-doctor
npm run check
npm run start
```

The mobile shell is **not** deployed, has not been run through EAS, and is not wired into the production frontend. It does not currently use the existing website or Worker routes.

## Next work, before deployment

1. Provision a dedicated Cloudflare preview Worker with its own D1 and R2 resources; do not reuse production identifiers. Existing `sandbox` is left unchanged.
2. Configure test-only Square and email identities and environment-scoped secrets.
3. Add CI checks for Expo, Worker, SEO and browser accessibility. Validate the native build dependency matrix.
4. Incrementally migrate public pages to Expo Web with static generation and URL parity.
5. Align the production auth policy across Wrangler, release checks and operational documentation before touching live deployment.
6. Rehearse and approve schema migrations separately. Never sync live customer data into preview automatically.

Nothing in these commits changes the deployed Cloudflare Worker, production database, or website implementation.

## Isolated preview configuration

`cloudflare/wrangler.preview.jsonc` is a disabled template, separate from production and the existing sandbox. Its zero D1 ID, placeholder bucket, invalid origins/email identities, disabled routes/workers.dev/preview URLs and empty cron prevent an accidental usable deployment. All requests run through the Worker so preview responses receive `X-Robots-Tag: noindex, nofollow, noarchive` and `Cache-Control: no-store`. Production private-file staging and authorization remain in force.

After separate infrastructure approval, create a preview-only D1 and private R2 bucket, replace only the preview placeholders, choose a preview hostname, and configure preview-only Google/Turnstile origins and secrets. Never copy production customer data, secrets, mailbox credentials or payment tokens. Square must remain sandbox; email must use an approved test sender and recipient isolation before any sends are enabled. Cron remains disabled until test delivery/cancellation targets have been reviewed. Build the public config for the preview origin and test identities explicitly; the current production/sandbox build commands must not be used to publish a preview. No preview deploy command is supplied while these prerequisites are outstanding.

## Release checks

Quality Checks runs on preview pushes and PRs targeting preview/main. `Release checks` depends on both `validate` and `mobile` and fails if either fails, is cancelled, or is skipped. It includes Worker typing, the full offline Square/email/security regression suite, release/link/SEO configuration checks, production bundle dry-run, Expo typing, dependency compatibility and an Android JavaScript export. It does not deploy or apply remote migrations.

A repository owner must separately require **Quality Checks / Release checks** in the main and preview rulesets, prevent bypasses as appropriate, and verify an actual successful run for the reviewed commit. Workflow code cannot enforce repository settings or repair Actions account/billing startup failures. EAS signing, native Android/iOS builds, simulators and real-device accessibility/UX remain acceptance work; the shell still contains only a branded screen.


## Mobile dependency follow-up

The SDK 54 shell is locked and aligned to React Native 0.81.5. Worker tooling was updated within its existing range and PostCSS is pinned through a compatible override to address its advisory. The mobile audit still reports a high-severity `image-size` advisory through Metro's v1 dependency, plus low-severity `deepmerge` tooling advisories. Do not force an incompatible image-size v2 override or the audit tool's suggested Expo downgrade. An upstream compatible fix or a reviewed Expo/Metro upgrade that actually resolves the advisory is needed; the mobile security audit deliberately blocks the aggregate release check until resolved. Local type checks and Android JavaScript export do not constitute a native application build or security sign-off.

Upstream tracking: https://github.com/expo/expo/issues/48670. The newer SDK also reports this dependency issue; upgrading the SDK alone is not evidence of a fix.
