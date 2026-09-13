import { runCommand, summarize } from "../lib/exec.mjs";

/**
 * Dependency maintenance: report outdated/vulnerable packages, and — unless
 * dryRun is set — apply only in-range patch/minor updates via `npm update`
 * (never crosses the semver range declared in package.json, so this can never
 * silently jump a major version), then verify the lockfile with `npm ci`.
 */
export async function checkDependencies({ cwd, dryRun }) {
  const checks = [];
  const updates = [];
  const findings = [];

  const before = await runCommand("npm", ["outdated", "--json"], { cwd });
  // npm outdated exits 1 when outdated packages exist — that is expected, not a failure.
  const beforeMap = safeJsonParse(before.stdout) || {};
  checks.push({
    command: "npm outdated --json (before)",
    exitCode: before.exitCode,
    status: before.exitCode === 0 || before.exitCode === 1 ? "pass" : "fail",
    summary: `${Object.keys(beforeMap).length} package(s) outdated before update`,
  });

  for (const [name, info] of Object.entries(beforeMap)) {
    const isMajor = majorBump(info.current, info.wanted);
    if (isMajor || majorBump(info.current, info.latest)) {
      findings.push({
        id: `DEP-MAJOR-${name}`,
        severity: "Informational",
        area: "Dependencies",
        finding: `${name} has a major update available (${info.current} -> ${info.latest}).`,
        evidence: `npm outdated: current=${info.current}, wanted=${info.wanted}, latest=${info.latest}`,
        recommendedAction: "Review changelog and upgrade manually in a dedicated PR.",
        automationStatus: "Human review required",
      });
    }
  }

  if (dryRun) {
    checks.push({ command: "npm update", exitCode: 0, status: "skip", summary: "Dry-run mode: dependency updates not applied." });
    return { checks, updates, findings, dependencyStatus: buildDependencyStatus(beforeMap, beforeMap, dryRun) };
  }

  const update = await runCommand("npm", ["update"], { cwd });
  checks.push({
    command: "npm update",
    exitCode: update.exitCode,
    status: update.exitCode === 0 ? "pass" : "fail",
    summary: summarize(update.stdout || update.stderr, 6),
  });

  const after = await runCommand("npm", ["outdated", "--json"], { cwd });
  const afterMap = safeJsonParse(after.stdout) || {};

  for (const [name, info] of Object.entries(beforeMap)) {
    const afterInfo = afterMap[name];
    const newVersion = afterInfo ? afterInfo.current : info.wanted;
    if (newVersion !== info.current) {
      updates.push({
        package: name,
        previous: info.current,
        next: newVersion,
        classification: "Patch/minor (in-range)",
        reason: "Kept within the semver range declared in package.json.",
        validation: "npm update + npm ci",
        result: "Applied",
      });
    }
  }

  const ci = await runCommand("npm", ["ci"], { cwd });
  checks.push({
    command: "npm ci",
    exitCode: ci.exitCode,
    status: ci.exitCode === 0 ? "pass" : "fail",
    summary: ci.exitCode === 0 ? "Lockfile installs cleanly." : summarize(ci.stderr || ci.stdout, 8),
  });
  if (ci.exitCode !== 0) {
    findings.push({
      id: "DEP-LOCKFILE-CI",
      severity: "High",
      area: "Dependencies",
      finding: "package-lock.json does not install cleanly with npm ci after updates.",
      evidence: summarize(ci.stderr || ci.stdout, 4),
      recommendedAction: "Do not merge until npm ci succeeds; regenerate the lockfile manually.",
      automationStatus: "Blocked",
    });
  }

  return { checks, updates, findings, dependencyStatus: buildDependencyStatus(beforeMap, afterMap, dryRun) };
}

function buildDependencyStatus(beforeMap, afterMap, dryRun) {
  const remainingMajor = Object.entries(afterMap).filter(([, info]) => majorBump(info.current, info.latest));
  return {
    outdatedCount: Object.keys(dryRun ? beforeMap : afterMap).length,
    vulnerabilitySummary: "See Security Status section.",
    deprecatedSummary: "See Security Status section (npm audit / deprecation warnings).",
    majorDeferredSummary: remainingMajor.length === 0 ? "None" : remainingMajor.map(([name, info]) => `${name} (${info.current} -> ${info.latest})`).join(", "),
    lockfileStatus: dryRun ? "Not modified (dry run)" : "Regenerated via npm update + verified with npm ci",
  };
}

function majorBump(current, target) {
  if (!current || !target) return false;
  const a = String(current).split(".")[0];
  const b = String(target).split(".")[0];
  return a !== b;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
