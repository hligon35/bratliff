import { runCommand, summarize } from "../lib/exec.mjs";

const SEVERITY_MAP = { critical: "Critical", high: "High", moderate: "Medium", low: "Low", info: "Informational" };

/**
 * Report-only dependency vulnerability scan. Never runs `npm audit fix
 * --force` or any destructive remediation — vulnerabilities become findings
 * for human review (or are noted as already covered by the in-range update
 * applied in the dependencies check).
 */
export async function checkSecurityAudit({ cwd }) {
  const checks = [];
  const findings = [];

  const audit = await runCommand("npm", ["audit", "--json"], { cwd });
  const parsed = safeJsonParse(audit.stdout);
  // npm audit exits non-zero when vulnerabilities are found — that is expected, not a tooling failure.
  const ranSuccessfully = parsed !== null;

  checks.push({
    command: "npm audit --json",
    exitCode: audit.exitCode,
    status: ranSuccessfully ? "pass" : "fail",
    summary: ranSuccessfully ? summarizeAudit(parsed) : summarize(audit.stderr || audit.stdout, 6),
    required: false,
  });

  if (parsed?.vulnerabilities) {
    for (const [pkgName, info] of Object.entries(parsed.vulnerabilities)) {
      const severity = SEVERITY_MAP[info.severity] || "Informational";
      findings.push({
        id: `SEC-AUDIT-${pkgName}`,
        severity,
        area: "Dependency security",
        finding: `${pkgName} has a reported ${info.severity} severity advisory (via ${info.via?.length || 0} path(s)).`,
        evidence: `npm audit: ${pkgName} range ${info.range || "n/a"}, fixAvailable=${JSON.stringify(info.fixAvailable)}`,
        recommendedAction: info.fixAvailable && typeof info.fixAvailable === "object"
          ? `Upgrade to ${info.fixAvailable.name}@${info.fixAvailable.version} (major bump) after manual review.`
          : info.fixAvailable
            ? "Covered by the in-range npm update applied this run; verify in Updates Applied."
            : "No automatic fix available upstream; review advisory manually.",
        automationStatus: info.fixAvailable === true ? "Fixed automatically" : "Human review required",
      });
    }
  }

  const securityStatus = {
    "Dependency audit (npm audit)": ranSuccessfully
      ? `${parsed.metadata?.vulnerabilities?.total ?? 0} total advisories (critical=${parsed.metadata?.vulnerabilities?.critical ?? 0}, high=${parsed.metadata?.vulnerabilities?.high ?? 0}, moderate=${parsed.metadata?.vulnerabilities?.moderate ?? 0}, low=${parsed.metadata?.vulnerabilities?.low ?? 0})`
      : "Could not parse npm audit output",
  };

  return { checks, findings, securityStatus };
}

function summarizeAudit(parsed) {
  const totals = parsed?.metadata?.vulnerabilities;
  if (!totals) return "No vulnerability metadata returned.";
  return `critical=${totals.critical || 0} high=${totals.high || 0} moderate=${totals.moderate || 0} low=${totals.low || 0}`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
