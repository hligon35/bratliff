import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSquareConfig } from "../checks/square.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("Square Sandbox/production credentials are never required to run this check", async () => {
  const savedEnv = {};
  for (const key of ["SQUARE_ACCESS_TOKEN", "SQUARE_WEBHOOK_SIGNATURE_KEY", "SQUARE_LOCATION_ID"]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  try {
    const result = await checkSquareConfig({ cwd: REPO_ROOT });
    const skipCheck = result.checks.find((c) => c.command.includes("Square Sandbox credential availability"));
    assert.ok(skipCheck, "credential-availability check must be present");
    assert.equal(skipCheck.status, "skip", "must skip, not fail, when Square credentials are absent");
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) process.env[key] = value;
    }
  }
});

test("sponsorship tier math matches the documented spec in cloudflare/src/config.ts", async () => {
  const result = await checkSquareConfig({ cwd: REPO_ROOT });
  const tierChecks = result.checks.filter((c) => c.command.startsWith("verify SPONSOR_PACKAGES"));
  assert.ok(tierChecks.length >= 4, "expected checks for pagePal, chapterChampion, bookshelfBuilder, literacyTrailblazer");
  for (const check of tierChecks) {
    assert.equal(check.status, "pass", `${check.command} failed: ${check.summary}`);
  }
});

test("webhook signature verification and idempotency guard are detected in app.ts", async () => {
  const result = await checkSquareConfig({ cwd: REPO_ROOT });
  const sig = result.checks.find((c) => c.command.includes("signature check present"));
  const idem = result.checks.find((c) => c.command.includes("idempotency table usage"));
  assert.equal(sig.status, "pass");
  assert.equal(idem.status, "pass");
});
