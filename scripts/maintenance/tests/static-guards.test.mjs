import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

test("the maintenance branch name is exactly 'monthlyUpdate'", () => {
  const syncBranch = read("scripts/maintenance/sync-branch.mjs");
  assert.match(syncBranch, /const MAINTENANCE_BRANCH = "monthlyUpdate";/);
  const workflow = read(".github/workflows/monthly-maintenance.yml");
  assert.match(workflow, /monthlyUpdate/);
});

test("the report filename is exactly 'monthlyReport.md'", () => {
  const orchestrator = read("scripts/monthly-maintenance.mjs");
  assert.match(orchestrator, /"monthlyReport\.md"/);
});

test("the scheduled workflow never runs a real (non-dry-run) Wrangler deploy", () => {
  const workflow = read(".github/workflows/monthly-maintenance.yml");
  assert.ok(!/wrangler deploy(?!.*--dry-run)/.test(workflow.replace(/\n/g, " ")) || workflow.includes("--dry-run"), "workflow must not deploy without --dry-run");
  assert.ok(!workflow.includes("worker:deploy"), "workflow must never call the real worker:deploy script");
  const orchestrator = read("scripts/monthly-maintenance.mjs");
  assert.ok(!orchestrator.includes("worker:deploy"));
});

test("the workflow has a concurrency guard to prevent overlapping runs", () => {
  const workflow = read(".github/workflows/monthly-maintenance.yml");
  assert.match(workflow, /concurrency:/);
});

test("the workflow runs monthly, is look-only by default, and applies fixes only when approved", () => {
  const workflow = read(".github/workflows/monthly-maintenance.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /^\s*schedule:/m);
  assert.match(workflow, /apply_fixes:/);
  assert.match(workflow, /apply=false/);
  assert.match(workflow, /Create or safely reuse the monthlyUpdate branch\r?\n\s+if: steps\.mode\.outputs\.apply == .true./);
  assert.match(workflow, /Commit maintenance changes[^\n]*\r?\n\s+id: commit\r?\n\s+if: steps\.mode\.outputs\.apply == .true./);
  assert.match(workflow, /send-summary\.mjs/);
});

test("the workflow requests least-privilege token permissions and never merges the PR automatically", () => {
  const workflow = read(".github/workflows/monthly-maintenance.yml");
  assert.match(workflow, /permissions:/);
  assert.ok(!/gh pr merge/.test(workflow), "workflow must never auto-merge the maintenance PR");
});

test("the workflow never touches production D1 migrations or R2 objects", () => {
  const workflow = read(".github/workflows/monthly-maintenance.yml");
  assert.ok(!/d1 migrations apply[^\n]*(?<!--local)$/m.test(workflow), "must not apply migrations without --local");
  assert.ok(!/wrangler r2 object put/.test(workflow), "must never write production R2 objects");
});

test("sync-branch.mjs never force-pushes over commits that lack the automation marker", () => {
  const syncBranch = read("scripts/maintenance/sync-branch.mjs");
  assert.match(syncBranch, /Maintenance-Bot: true/);
  assert.match(syncBranch, /Refusing to reset or force-push/);
});

test("public pages probe the admin session without producing 401 console errors, while admin routes still return 401", () => {
  assert.match(read("assets/site.js"), /\/api\/auth\/session\?probe=1/);
  const app = read("cloudflare/src/app.ts");
  assert.match(app, /searchParams\.get\("probe"\) === "1"/);
  assert.match(app, /const viewer = await authorizeAdmin\(request, env\);\s+return json\(request, env, \{ ok: true, viewer \}\);/);
});
