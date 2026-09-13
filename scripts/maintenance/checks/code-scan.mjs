import { readFileSync } from "node:fs";
import { runCommand } from "../lib/exec.mjs";

/**
 * Heuristic static-analysis grep pass. This intentionally never modifies
 * source — every hit becomes a finding for human review. False positives are
 * expected and acceptable; false confidence ("nothing found") is not, so
 * patterns are kept broad.
 */
export async function checkCodePatterns({ cwd }) {
  const findings = [];
  const lsFiles = await runCommand("git", ["ls-files"], { cwd });
  const files = lsFiles.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((f) => /\.(js|ts|html)$/.test(f) && !f.startsWith("cloudflare/public/") && !f.includes("node_modules/"));

  const rules = [
    {
      id: "innerHTML",
      severity: "Low",
      pattern: /\.innerHTML\s*=/,
      finding: "Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).",
      recommendedAction: "Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input.",
    },
    {
      id: "sql-concat",
      severity: "High",
      pattern: /(SELECT|INSERT|UPDATE|DELETE)[^`'"]*(\$\{|"\s*\+\s*|'\s*\+\s*)/i,
      finding: "SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.",
      recommendedAction: "Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values.",
    },
    {
      id: "target-blank",
      severity: "Informational",
      pattern: /target=["']_blank["'](?!\s*rel=)/,
      finding: "target=\"_blank\" link without a neighboring rel attribute (reverse-tabnabbing risk).",
      recommendedAction: "Add rel=\"noopener noreferrer\" alongside target=\"_blank\".",
    },
    {
      id: "wildcard-cors",
      severity: "High",
      pattern: /Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*['"]/,
      finding: "Wildcard CORS origin (\"*\") found.",
      recommendedAction: "Confirm this is intentional for a public GET-only endpoint; admin/API routes must echo a validated origin only.",
    },
  ];

  let scanned = 0;
  const hitCounts = Object.fromEntries(rules.map((r) => [r.id, 0]));
  for (const file of files) {
    let content;
    try {
      content = readFileSync(`${cwd}/${file}`, "utf8");
    } catch {
      continue;
    }
    scanned += 1;
    for (const rule of rules) {
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) {
          hitCounts[rule.id] += 1;
          findings.push({
            id: `CODE-${rule.id}-${file}-${index + 1}`,
            severity: rule.severity,
            area: "Static code scan",
            finding: `${file}:${index + 1} — ${rule.finding}`,
            evidence: line.trim().slice(0, 160),
            recommendedAction: rule.recommendedAction,
            automationStatus: "Human review required",
          });
        }
      });
    }
  }

  return {
    checks: [
      {
        command: "custom static pattern scan (innerHTML, SQL concat, target=_blank, wildcard CORS)",
        exitCode: 0,
        status: "pass",
        summary: `${scanned} file(s) scanned. Hits: ${Object.entries(hitCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`,
        required: false,
      },
    ],
    findings,
  };
}
