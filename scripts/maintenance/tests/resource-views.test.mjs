import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { fixture, loadWorker } from "./helpers/worker-harness.mjs";

const slug = "battles-reader-discussion-guide";
const readCount = (f, table) => f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

async function setup(registered = true) {
  const f = fixture();
  Object.assign(f.env, {
    ADMIN_AUTH_MODE: "google",
    GOOGLE_CLIENT_ID: "offline.apps.googleusercontent.com",
    ADMIN_BOOTSTRAP_EMAILS: "owner@example.org",
  });
  f.env.BOOK_ASSETS = {
    async head() { return { key: "resource-guides/" + slug + ".pdf" }; },
    async get() {
      return { body: new Uint8Array([37, 80, 68, 70]), writeHttpMetadata() {} };
    },
  };
  const worker = loadWorker();
  f.sqlite.prepare("INSERT INTO customer_accounts (id,email,password_salt,password_hash,display_name) VALUES ('reader-1','reader@example.org','salt','hash','Reader')").run();
  if (registered) {
    f.sqlite.prepare("INSERT INTO resource_registrations (customer_id,email,first_name,last_name,selected_resource) VALUES ('reader-1','reader@example.org','Reader','One',?1)").run(slug);
  }
  const session = await worker.review.issueCustomerSessionCookie(new Response(null), f.env, { id: "reader-1", email: "reader@example.org" });
  const customerCookie = (session.headers.get("Set-Cookie") || "").split(";")[0];
  const request = (path, method = "POST", body, cookie = customerCookie) => worker.default.fetch(new Request(f.env.SITE_URL + path, {
    method,
    headers: {
      Origin: f.env.SITE_URL,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), f.env, {});
  const adminRequest = async (path) => {
    const payload = Buffer.from(JSON.stringify({ email: "owner@example.org", role: "owner", sub: "offline", exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
    const signature = createHmac("sha256", f.env.ADMIN_SESSION_SECRET).update(payload).digest("base64url");
    return worker.default.fetch(new Request(f.env.SITE_URL + path, {
      headers: { Origin: f.env.SITE_URL, Cookie: "__Host-jrpp_admin_session=" + payload + "." + signature },
    }), f.env, {});
  };
  return { f, worker, customerCookie, request, adminRequest };
}

test("resource view sessions count only after ten seconds and are idempotent", async () => {
  const { f, request, adminRequest } = await setup();
  const started = await request("/api/customer/resources/view/start", "POST", { slug });
  assert.equal(started.status, 200);
  const { viewId } = await started.json();
  assert.ok(viewId);

  const early = await request("/api/customer/resources/view/complete", "POST", { viewId });
  assert.equal(early.status, 200);
  assert.equal((await early.json()).counted, false);
  assert.equal(readCount(f, "resource_view_sessions"), 1);
  assert.equal(f.sqlite.prepare("SELECT viewed_at FROM resource_view_sessions WHERE view_id=?1").get(viewId).viewed_at, "");

  f.sqlite.prepare("UPDATE resource_view_sessions SET started_at=datetime('now','-11 seconds') WHERE view_id=?1").run(viewId);
  const completed = await request("/api/customer/resources/view/complete", "POST", { viewId });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).counted, true);
  const retry = await request("/api/customer/resources/view/complete", "POST", { viewId });
  assert.equal((await retry.json()).counted, true);

  const adminMe = await adminRequest("/api/admin/me");
  assert.equal(adminMe.status, 200);
  const summaryResponse = await adminRequest("/api/admin/resources/summary");
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json();
  assert.equal(summary.totalViews, 1);
  assert.equal(summary.guides.find((guide) => guide.slug === slug).views, 1);
  assert.equal("selected" in summary.guides.find((guide) => guide.slug === slug), false);
});

test("resource view and inline PDF endpoints require the registered reader session; downloads remain intact", async () => {
  const { f, request } = await setup();
  assert.equal((await request("/api/customer/resources/view/start", "POST", { slug }, "")).status, 401);

  const unregistered = await setup(false);
  assert.equal((await unregistered.request("/api/customer/resources/view/start", "POST", { slug })).status, 403);

  const view = await request("/api/customer/resources/" + slug + "/view", "GET");
  assert.equal(view.status, 200);
  assert.match(view.headers.get("Content-Disposition"), /^inline;/);
  assert.equal(readCount(f, "resource_downloads"), 0);

  const download = await request("/api/customer/resources/" + slug + "/download", "GET");
  assert.equal(download.status, 200);
  assert.match(download.headers.get("Content-Disposition"), /^attachment;/);
  assert.equal(readCount(f, "resource_downloads"), 1);
});
