import { runCommand, summarize } from "../lib/exec.mjs";

/** TypeScript compilation check for the Worker (no emit, matches `npm run worker:check`). */
export async function checkTypeScript({ cwd }) {
  const result = await runCommand("npx", ["tsc", "-p", "cloudflare/tsconfig.json", "--noEmit"], { cwd });
  const status = result.exitCode === 0 ? "pass" : "fail";
  const findings = [];
  if (status === "fail") {
    findings.push({
      id: "TS-COMPILE",
      severity: "High",
      area: "Application build",
      finding: "TypeScript compilation failed for the Worker source.",
      evidence: summarize(result.stdout || result.stderr, 10),
      recommendedAction: "Fix the reported type errors before merging.",
      automationStatus: "Human review required",
    });
  }
  return {
    checks: [
      {
        command: "npx tsc -p cloudflare/tsconfig.json --noEmit",
        exitCode: result.exitCode,
        status,
        summary: status === "pass" ? "No TypeScript errors." : summarize(result.stdout || result.stderr, 6),
      },
    ],
    findings,
  };
}

/**
 * Non-destructive Wrangler validation: stage assets, then run `wrangler
 * deploy --dry-run`, which builds and validates configuration/bindings
 * without publishing anything or touching the production Worker.
 */
export async function checkWranglerBuild({ cwd }) {
  const checks = [];
  const findings = [];

  const stage = await runCommand("node", ["scripts/stage-cloudflare-assets.js"], { cwd });
  checks.push({
    command: "node scripts/stage-cloudflare-assets.js",
    exitCode: stage.exitCode,
    status: stage.exitCode === 0 ? "pass" : "fail",
    summary: stage.exitCode === 0 ? "Static assets staged into cloudflare/public." : summarize(stage.stderr || stage.stdout, 6),
  });

  const dryRun = await runCommand("npx", ["wrangler", "deploy", "--dry-run", "--config", "cloudflare/wrangler.jsonc"], { cwd });
  const status = dryRun.exitCode === 0 ? "pass" : "fail";
  checks.push({
    command: "npx wrangler deploy --dry-run --config cloudflare/wrangler.jsonc",
    exitCode: dryRun.exitCode,
    status,
    summary: status === "pass" ? "Wrangler dry-run build succeeded (nothing deployed)." : summarize(dryRun.stdout || dryRun.stderr, 8),
  });
  if (status === "fail") {
    findings.push({
      id: "WRANGLER-DRYRUN",
      severity: "High",
      area: "Cloudflare Worker build",
      finding: "wrangler deploy --dry-run failed, meaning the current config/bindings would not deploy.",
      evidence: summarize(dryRun.stdout || dryRun.stderr, 8),
      recommendedAction: "Fix the Worker configuration or source before the next real deploy.",
      automationStatus: "Human review required",
    });
  }

  return { checks, findings };
}
