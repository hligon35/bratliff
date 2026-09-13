import { readdirSync } from "node:fs";
import { runCommand, summarize } from "../lib/exec.mjs";

/**
 * Validate D1 migrations against a local-only SQLite database (Wrangler's
 * `--local` persistence under `.wrangler/state`). This never touches the
 * production D1 binding and never runs a remote migration.
 */
export async function checkD1Migrations({ cwd, cloudflareDir = "cloudflare" }) {
  const checks = [];
  const findings = [];

  let files = [];
  try {
    files = readdirSync(`${cwd}/${cloudflareDir}/migrations`)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    checks.push({ command: "list cloudflare/migrations", exitCode: -1, status: "fail", summary: "migrations directory not found." });
    return { checks, findings, cloudflareStatus: { "D1 local migration test": "Skipped — migrations directory missing" } };
  }

  const numbered = files.map((f) => f.match(/^(\d+)_/)?.[1]).filter(Boolean);
  const isSequential = numbered.every((n, i) => Number(n) === i + 1);
  checks.push({
    command: "verify cloudflare/migrations file numbering",
    exitCode: isSequential ? 0 : 1,
    status: isSequential ? "pass" : "fail",
    summary: isSequential ? `${files.length} migration(s), sequentially numbered.` : `Non-sequential migration numbering detected: ${files.join(", ")}`,
  });
  if (!isSequential) {
    findings.push({
      id: "D1-MIGRATION-ORDER",
      severity: "Medium",
      area: "Data / D1",
      finding: "Migration files are not sequentially numbered.",
      evidence: files.join(", "),
      recommendedAction: "Rename/renumber migrations so they apply in a deterministic order.",
      automationStatus: "Human review required",
    });
  }

  const apply = await runCommand(
    "npx",
    ["wrangler", "d1", "migrations", "apply", "bratliff-platform-db", "--local", "--config", "wrangler.jsonc"],
    { cwd: `${cwd}/${cloudflareDir}` },
  );
  const status = apply.exitCode === 0 ? "pass" : "fail";
  checks.push({
    command: "npx wrangler d1 migrations apply bratliff-platform-db --local",
    exitCode: apply.exitCode,
    status,
    summary: status === "pass" ? "All migrations applied cleanly to a local-only database." : summarize(apply.stdout || apply.stderr, 8),
  });
  if (status === "fail") {
    findings.push({
      id: "D1-MIGRATION-APPLY",
      severity: "High",
      area: "Data / D1",
      finding: "One or more migrations failed to apply against a local D1 database.",
      evidence: summarize(apply.stdout || apply.stderr, 8),
      recommendedAction: "Fix the failing migration before it is ever applied to production D1.",
      automationStatus: "Blocked",
    });
  }

  return {
    checks,
    findings,
    cloudflareStatus: {
      "D1 local migration test": status === "pass" ? `Passed (${files.length} migrations, local-only database)` : "Failed — see Findings",
    },
  };
}
