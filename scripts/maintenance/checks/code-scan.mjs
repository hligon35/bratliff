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
      appliesTo: (file) => /^cloudflare\/src\/.*\.ts$/.test(file),
      test: sqlLooksInterpolated,
      finding: "A D1 query appears to include an interpolated value instead of a bound parameter.",
      recommendedAction: "Bind the value with ?1, ?2, ... Only fixed SQL fragments (UPPER_CASE constants or names ending in Sql/Clause) may be interpolated.",
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
        if (matchesRule(rule, file, line)) {
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

const SAFE_FRAGMENT = /^(?:[A-Z][A-Z0-9_]*|\w*(?:Sql|SQL|Clause|Bind|Placeholders|placeholders))$/;

function sqlLooksInterpolated(line) {
  if (!/\b(?:prepare|exec|batch)\(|\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*`|`\s*(?:SELECT|INSERT|UPDATE|DELETE)\b/.test(line) && !/\b(?:SELECT|INSERT INTO|UPDATE \w+ SET|DELETE FROM)\b/.test(line)) return false;
  for (const match of line.matchAll(/\$\{([^}]*)\}/g)) {
    if (!SAFE_FRAGMENT.test(match[1].trim())) return true;
  }
  const stripped = line.replace(/\+\s*(?:slots|where|from|\w*Sql|\w*Clause|\w*Bind)\b/g, "").replace(/\b(?:slots|where|from|\w*Sql|\w*Clause|\w*Bind)\s*\+/g, "");
  return /["\x27`]\s+\+\s+[A-Za-z_(]/.test(stripped) && /\b(?:SELECT|INSERT INTO|UPDATE \w+ SET|DELETE FROM)\b/.test(stripped);
}

function matchesRule(rule, file, line) {
  if (rule.appliesTo && !rule.appliesTo(file)) return false;
  return rule.test ? rule.test(line) : rule.pattern.test(line);
}
