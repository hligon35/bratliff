const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low", "Informational"];

/** Count findings by severity, always including every severity key (zero if absent). */
export function severityCounts(findings) {
  const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  for (const finding of findings) {
    if (counts[finding.severity] === undefined) counts[finding.severity] = 0;
    counts[finding.severity] += 1;
  }
  return counts;
}

/**
 * Decide the overall run result from findings + check results. Critical
 * findings or any failed non-optional check must never be reported as passed.
 */
export function computeOverallResult(findings, checks) {
  const counts = severityCounts(findings);
  const hasCriticalFinding = counts.Critical > 0;
  const hasHardFailure = checks.some((c) => c.status === "fail" && c.required !== false);
  const hasHighFinding = counts.High > 0;
  const hasWarnings = counts.Medium > 0 || counts.Low > 0 || checks.some((c) => c.status === "fail" && c.required === false);

  if (hasCriticalFinding || hasHardFailure) return "Review required";
  if (hasHighFinding) return "Review required";
  if (hasWarnings) return "Passed with warnings";
  return "Passed";
}

function table(headers, rows) {
  if (rows.length === 0) {
    return `_None._\n`;
  }
  const head = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|") || "-").join(" | ")} |`).join("\n");
  return `${head}\n${divider}\n${body}\n`;
}

function statusLabel(check) {
  if (check.status === "skip") return "Skipped";
  if (check.status === "pass") return "Pass";
  return "Fail";
}

/** Render the full monthlyReport.md content from a collected run model. */
export function renderReport(model) {
  const {
    runInfo,
    updates,
    findings,
    dependencyStatus,
    securityStatus,
    cloudflareStatus,
    websiteQuality,
    checks,
    deferredManualReview,
    recommendation,
    recommendationReason,
    nextActions,
  } = model;

  const counts = severityCounts(findings);
  const testsPassed = checks.filter((c) => c.status === "pass").length;
  const testsFailed = checks.filter((c) => c.status === "fail").length;
  const testsSkipped = checks.filter((c) => c.status === "skip").length;

  const lines = [];
  lines.push("# Jackrabbit Punkin Publishing Monthly Maintenance Report", "");

  lines.push("## Run Information", "");
  lines.push(`- Run date and time (UTC): ${runInfo.runDateUtc}`);
  lines.push(`- Repository: ${runInfo.repository}`);
  lines.push(`- Source/default branch: ${runInfo.defaultBranch}`);
  lines.push(`- Maintenance branch: ${runInfo.maintenanceBranch}`);
  lines.push(`- Commit before maintenance: ${runInfo.commitBefore}`);
  lines.push(`- Commit after maintenance: ${runInfo.commitAfter || "(pending commit)"}`);
  lines.push(`- Trigger type: ${runInfo.trigger}`);
  lines.push(`- Workflow run URL: ${runInfo.workflowRunUrl || "(local run, no workflow URL)"}`);
  lines.push(`- Overall result: **${runInfo.overallResult}**`, "");

  lines.push("## Executive Summary", "");
  lines.push(`- Updates applied: ${updates.length}`);
  lines.push(`- Critical findings: ${counts.Critical}`);
  lines.push(`- High findings: ${counts.High}`);
  lines.push(`- Medium findings: ${counts.Medium}`);
  lines.push(`- Low findings: ${counts.Low}`);
  lines.push(`- Informational findings: ${counts.Informational}`);
  lines.push(`- Tests passed: ${testsPassed}`);
  lines.push(`- Tests failed: ${testsFailed}`);
  lines.push(`- Tests skipped: ${testsSkipped}`);
  lines.push(`- Preview deployment: ${model.previewDeploymentStatus || "Not configured in this run"}`);
  lines.push(`- Production deployment recommended: ${model.productionDeploymentRecommended ? "Yes" : "No — human review required"}`, "");

  lines.push("## Updates Applied", "");
  lines.push(
    table(
      ["Package/file", "Previous", "New", "Classification", "Reason", "Validation performed", "Result"],
      updates.map((u) => [u.package, u.previous, u.next, u.classification, u.reason, u.validation, u.result]),
    ),
  );

  lines.push("## Findings", "");
  lines.push(
    table(
      ["ID", "Severity", "Area", "Finding", "Evidence", "Recommended Action", "Automation Status"],
      findings.map((f) => [f.id, f.severity, f.area, f.finding, f.evidence, f.recommendedAction, f.automationStatus]),
    ),
  );

  lines.push("## Dependency Status", "");
  lines.push(`- Outdated dependencies: ${dependencyStatus.outdatedCount}`);
  lines.push(`- Vulnerabilities: ${dependencyStatus.vulnerabilitySummary}`);
  lines.push(`- Deprecated packages: ${dependencyStatus.deprecatedSummary}`);
  lines.push(`- Major updates deferred for review: ${dependencyStatus.majorDeferredSummary}`);
  lines.push(`- Lockfile status: ${dependencyStatus.lockfileStatus}`, "");

  lines.push("## Security Status", "");
  for (const [label, value] of Object.entries(securityStatus)) {
    lines.push(`- ${label}: ${value}`);
  }
  lines.push("");

  lines.push("## Cloudflare and Data Status", "");
  for (const [label, value] of Object.entries(cloudflareStatus)) {
    lines.push(`- ${label}: ${value}`);
  }
  lines.push("");

  lines.push("## Website Quality", "");
  for (const [label, value] of Object.entries(websiteQuality)) {
    lines.push(`- ${label}: ${value}`);
  }
  lines.push("");

  lines.push("## Tests and Commands", "");
  lines.push(
    table(
      ["Command", "Exit Code", "Result", "Summary"],
      checks.map((c) => [c.command, c.exitCode, statusLabel(c), c.summary]),
    ),
  );

  lines.push("## Deferred Manual Review", "");
  if (deferredManualReview.length === 0) {
    lines.push("_None this run._", "");
  } else {
    for (const item of deferredManualReview) lines.push(`- ${item}`);
    lines.push("");
  }

  lines.push("## Recommendation", "");
  lines.push(`**${recommendation}**`, "");
  lines.push(recommendationReason, "");

  lines.push("## Next Actions", "");
  for (const action of nextActions) {
    lines.push(`- [ ] ${action.text}${action.owner ? ` _(owner: ${action.owner})_` : ""}`);
  }
  lines.push("");

  return lines.join("\n");
}
