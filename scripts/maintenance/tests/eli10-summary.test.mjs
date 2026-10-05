import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlainSummary, renderPlainText, renderHtml } from "../lib/eli10.mjs";
import { sendSummary } from "../send-summary.mjs";

const clean = { findings: [], checks: [{ command: "npm audit --json", status: "pass", summary: "ok" }], dependencyStatus: { outdatedCount: 0, majorDeferredSummary: "None" }, updates: [] };

test("a clean run says everything is fine and offers no fixes", () => {
  const summary = buildPlainSummary(clean);
  assert.equal(summary.verdict, "ALL GOOD");
  assert.equal(summary.canFix, false);
});

test("outdated packages produce a look-only offer with an approval link", () => {
  const summary = buildPlainSummary({ ...clean, dependencyStatus: { outdatedCount: 2, majorDeferredSummary: "typescript (5 -> 7)" } });
  assert.equal(summary.verdict, "MOSTLY GOOD");
  assert.equal(summary.canFix, true);
  const text = renderPlainText(summary, { approveUrl: "https://github.com/o/r/actions/workflows/monthly-maintenance.yml", dryRun: true });
  assert.match(text, /Apply the safe fixes/);
  assert.match(text, /never publish the live website/);
});

test("a failed required check or a high finding needs attention and is explained in plain words", () => {
  const summary = buildPlainSummary({ ...clean, checks: [{ command: "npx tsc -p cloudflare/tsconfig.json --noEmit", status: "fail", summary: "2 errors" }], findings: [{ severity: "High", finding: "Bad thing.", recommendedAction: "Fix it." }] });
  assert.equal(summary.verdict, "NEEDS ATTENTION");
  assert.match(renderPlainText(summary), /brain/);
});

test("html output escapes untrusted finding text", () => {
  const summary = buildPlainSummary({ ...clean, findings: [{ severity: "High", finding: "<script>alert(1)</script>", recommendedAction: "x" }] });
  const html = renderHtml(summary);
  assert.ok(!html.includes("<script>"));
});

const files = { "maintenance-summary.json": JSON.stringify({ verdict: "ALL GOOD" }), "maintenance-summary.txt": "t", "maintenance-summary.html": "<p>t</p>" };
const read = (name) => files[name];
const env = { RESEND_API_KEY: "k", MAINTENANCE_EMAIL_TO: "a@b.c", MAINTENANCE_EMAIL_FROM: "x@y.z", GITHUB_RUN_ID: "9" };

test("sending reports missing configuration instead of succeeding silently", async () => {
  const result = await sendSummary({ env: {}, read, fetchImpl: async () => { throw new Error("must not call"); } });
  assert.equal(result.ok, false);
  assert.match(result.error, /RESEND_API_KEY/);
});

test("sending uses an idempotency key and surfaces an unverified-domain rejection", async () => {
  let headers;
  const result = await sendSummary({ env, read, fetchImpl: async (_url, init) => { headers = init.headers; return new Response(JSON.stringify({ message: "The domain is not verified" }), { status: 403 }); } });
  assert.equal(result.ok, false);
  assert.match(result.error, /not verified in Resend/);
  assert.equal(headers["Idempotency-Key"], "jpp-maintenance-9-1");
});

test("sending succeeds on an accepted response", async () => {
  const result = await sendSummary({ env, read, fetchImpl: async () => new Response("{}", { status: 200 }) });
  assert.equal(result.ok, true);
});