import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { withSecurityHeaders, json } = await import(new URL("cloudflare/src/utils.ts", root).href);

const env = { SITE_URL: "https://jackrabbitpunkinpublishing.com", CORS_ORIGIN: "", PUBLIC_ADMIN_URL: "" };

test("security headers block framing, plugins and base-tag injection", () => {
  const headers = withSecurityHeaders(new Response("ok")).headers;
  const csp = headers.get("Content-Security-Policy");
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
});

test("security headers keep a CSP that a route already set", () => {
  const response = new Response("ok", { headers: { "Content-Security-Policy": "default-src 'none'" } });
  assert.equal(withSecurityHeaders(response).headers.get("Content-Security-Policy"), "default-src 'none'");
});

test("API json responses are uncacheable, noindex and allow PATCH only for trusted origins", () => {
  const trusted = new Request("https://jackrabbitpunkinpublishing.com/api/admin/orders", {
    headers: { Origin: "https://jackrabbitpunkinpublishing.com" },
  });
  const ok = json(trusted, env, { ok: true });
  assert.equal(ok.headers.get("Cache-Control"), "no-store");
  assert.equal(ok.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.match(ok.headers.get("Access-Control-Allow-Methods"), /PATCH/);
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://jackrabbitpunkinpublishing.com");

  const hostile = new Request("https://jackrabbitpunkinpublishing.com/api/admin/orders", { headers: { Origin: "https://evil.example" } });
  assert.equal(json(hostile, env, { ok: true }).headers.get("Access-Control-Allow-Origin"), null);
});

test("worker enforces trusted origin on every cookie-authenticated mutation, including auth routes", () => {
  const app = read("cloudflare/src/app.ts");
  const guard = app.indexOf("requireTrustedMutationOrigin(request, env);");
  assert.ok(guard > 0);
  assert.ok(guard < app.indexOf('if (url.pathname === "/api/auth/google") {\r\n        return') || guard < app.indexOf('if (url.pathname === "/api/auth/google") {\n        return'));
  assert.match(app.slice(guard - 400, guard), /\/api\/auth\/logout/);
});

test("unhandled errors do not leak internal messages to clients", () => {
  const app = read("cloudflare/src/app.ts");
  assert.match(app, /Something went wrong on our side/);
  assert.doesNotMatch(app, /\{ ok: false, error: getErrorMessage\(error\) \}, status\)/);
});

test("Resend failures are classified with actionable messages", () => {
  const app = read("cloudflare/src/app.ts");
  assert.match(app, /export function describeResendFailure/);
  assert.match(app, /has not verified/);
  assert.match(app, /RESEND_API_KEY secret/);
});

test("fulfillment updates validate status, 404 unknown orders and preserve notes", () => {
  const app = read("cloudflare/src/app.ts");
  assert.match(app, /FULFILLMENT_STATUSES = \["Unfulfilled", "Processing", "Shipped", "Fulfilled", "Cancelled"\]/);
  assert.match(app, /throw new HttpError\(404, "Order not found\."\)/);
  assert.match(app, /typeof body\.notes === "string"/);
});

test("admin removal protects self and the last owner; profile cannot change sign-in email", () => {
  const app = read("cloudflare/src/app.ts");
  assert.match(app, /cannot remove your own admin access/);
  assert.match(app, /last owner cannot be removed/);
  assert.match(app, /sign-in email cannot be changed here/);
});

test("newsletter sends are idempotent per recipient and refuse duplicate campaign sends", () => {
  const app = read("cloudflare/src/app.ts");
  assert.match(app, /idempotencyKey: await newsletterIdempotencyKey\(campaign\.campaignId, email\)/);
  assert.match(app, /\["Sent", "Sending"\]\.includes\(existing\.status\)/);
  assert.match(app, /last_error = \?6/);
});

test("admin pages do not depend on external font hosts and preload the local icon font", () => {
  for (const css of ["assets/admin-shell.css", "assets/admin-src/admin.css"]) {
    assert.doesNotMatch(read(css), /fonts\.googleapis\.com|@import/);
  }
  assert.match(read("assets/admin-shell.css"), /material-icons\.woff2/);
  for (const page of ["index", "store", "author", "sponsors", "newsletter", "analytics", "activity", "profile", "settings"]) {
    assert.match(read(`admin/${page}.html`), /rel="preload" href="\/assets\/material-icons\.woff2"/, page);
  }
});

test("committed site config targets the production domain", () => {
  assert.match(read("assets/site-config.js"), /"siteUrl": "https:\/\/jackrabbitpunkinpublishing\.com"/);
});

test("the intentional site gate remains in place", () => {
  const home = read("index.html");
  assert.match(home, /TEMPORARY LAUNCH REDIRECT/);
  assert.match(home, /jppSiteUnlocked/);
});
