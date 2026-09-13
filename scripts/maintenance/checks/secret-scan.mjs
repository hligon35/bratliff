import { readFileSync } from "node:fs";
import { runCommand } from "../lib/exec.mjs";

const SECRET_PATTERNS = [
  { name: "Square access/signature token", pattern: /\bEAAA[a-zA-Z0-9+/=_-]{10,}\b|\bsq0[a-z]{3}-[a-zA-Z0-9_-]{10,}\b/i },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Private key block", pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
  { name: "Resend/vendor API key", pattern: /\bre_[a-zA-Z0-9]{16,}\b/ },
  { name: "Hardcoded secret assignment", pattern: /(SQUARE_ACCESS_TOKEN|SQUARE_WEBHOOK_SIGNATURE_KEY|RESEND_API_KEY|ADMIN_SESSION_SECRET|UNSUBSCRIBE_SECRET|TURNSTILE_SECRET_KEY)\s*[:=]\s*['"][^'"\s]{6,}['"]/ },
];

const ALLOWED_FILES = new Set(["scripts/maintenance/checks/secret-scan.mjs", "scripts/maintenance/lib/redact.mjs"]);

/**
 * Scan git-tracked files (never node_modules or ignored files) for
 * secret-looking values that should never be committed. Report-only.
 */
export async function checkSecretScan({ cwd }) {
  const findings = [];
  const lsFiles = await runCommand("git", ["ls-files"], { cwd });
  const files = lsFiles.stdout.split(/\r?\n/).filter(Boolean).filter((f) => !ALLOWED_FILES.has(f));

  let scanned = 0;
  let hits = 0;
  for (const file of files) {
    if (/\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|woff2?|ttf|eot)$/i.test(file)) continue;
    let content;
    try {
      content = readFileSync(`${cwd}/${file}`, "utf8");
    } catch {
      continue;
    }
    scanned += 1;
    for (const { name, pattern } of SECRET_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        hits += 1;
        findings.push({
          id: `SECRET-${file}-${name.replace(/\W+/g, "-")}`,
          severity: "Critical",
          area: "Secret scanning",
          finding: `Possible ${name} committed in ${file}.`,
          evidence: `Pattern matched in ${file} (value redacted).`,
          recommendedAction: "Rotate the credential immediately and remove it from git history.",
          automationStatus: "Human review required",
        });
      }
    }
  }

  const envTracked = files.includes(".env");
  if (envTracked) {
    findings.push({
      id: "SECRET-ENV-TRACKED",
      severity: "Critical",
      area: "Secret scanning",
      finding: ".env is tracked by git (should only ever exist locally/in GitHub Secrets).",
      evidence: "git ls-files includes .env",
      recommendedAction: "Remove .env from git history and confirm .gitignore covers it.",
      automationStatus: "Human review required",
    });
  }

  return {
    checks: [
      {
        command: "custom secret scan over git ls-files",
        exitCode: hits > 0 ? 1 : 0,
        status: hits > 0 ? "fail" : "pass",
        summary: `${scanned} tracked file(s) scanned, ${hits} potential secret(s) found.`,
      },
    ],
    findings,
  };
}
