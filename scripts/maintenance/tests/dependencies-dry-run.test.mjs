import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDependencies } from "../checks/dependencies.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("dry-run mode never runs npm update or npm ci, and reports it as skipped", async () => {
  const result = await checkDependencies({ cwd: REPO_ROOT, dryRun: true });
  assert.equal(result.updates.length, 0, "dry-run must not apply any dependency updates");

  const commands = result.checks.map((c) => c.command);
  assert.ok(!commands.some((c) => c.startsWith("npm ci")), "npm ci must not run in dry-run mode");

  const updateCheck = result.checks.find((c) => c.command === "npm update");
  assert.ok(updateCheck, "an npm update entry must still be reported");
  assert.equal(updateCheck.status, "skip");
});
