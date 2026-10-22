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
