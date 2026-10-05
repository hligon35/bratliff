#!/usr/bin/env node
// Orchestrates the monthly maintenance run: executes every check module,
// collects results even when individual checks fail, and always writes
// monthlyReport.md at the repo root. Never deploys production and never
// applies destructive dependency commands.
//
// Usage:
//   node scripts/monthly-maintenance.mjs [--dry-run] [--trigger schedule|workflow_dispatch|local]
//                                          [--workflow-run-url <url>] [--repository owner/name]

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runCommand } from "./maintenance/lib/exec.mjs";
import { renderReport, computeOverallResult } from "./maintenance/lib/report.mjs";
import { buildPlainSummary, renderPlainText, renderHtml } from "./maintenance/lib/eli10.mjs";
import { checkDependencies } from "./maintenance/checks/dependencies.mjs";
import { checkSecurityAudit } from "./maintenance/checks/security.mjs";
import { checkTypeScript, checkWranglerBuild } from "./maintenance/checks/build.mjs";
import { checkD1Migrations } from "./maintenance/checks/d1.mjs";
import { checkSecretScan } from "./maintenance/checks/secret-scan.mjs";
import { checkCodePatterns } from "./maintenance/checks/code-scan.mjs";
import { checkSquareConfig } from "./maintenance/checks/square.mjs";
import { checkSiteContent } from "./maintenance/checks/site-content.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  return value && !value.startsWith("--") ? value : true;
}

/** Run a check module, and no matter what happens, keep going — a thrown
 * error becomes a single failed "check" entry instead of aborting the run. */
async function runSafely(label, fn) {
  try {
    return await fn();
  } catch (error) {
    return {
      checks: [
        {
          command: label,
          exitCode: -1,
          status: "fail",
          summary: `Check threw an unexpected error: ${error?.message || error}`,
        },
      ],
      findings: [],
    };
  }
}

async function main() {
  const dryRun = Boolean(arg("dry-run", false));
  const trigger = arg("trigger", "local");
  const workflowRunUrl = arg("workflow-run-url", "");
  const repository = arg("repository", "hligon35/bratliff");

  const cwd = REPO_ROOT;
  const commitBefore = (await runCommand("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim() || "(unknown)";
  const branchName = (await runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })).stdout.trim() || "(unknown)";

  const allChecks = [];
  const allFindings = [];
  const allUpdates = [];
  let dependencyStatus = {};
  let securityStatus = {};
  let cloudflareStatus = {};
  let websiteQuality = {};

  const steps = [
    ["Dependencies", () => checkDependencies({ cwd, dryRun })],
    ["Security audit", () => checkSecurityAudit({ cwd })],
    ["TypeScript compilation", () => checkTypeScript({ cwd })],
    ["Wrangler dry-run build", () => checkWranglerBuild({ cwd })],
    ["D1 local migrations", () => checkD1Migrations({ cwd })],
    ["Secret scan", () => checkSecretScan({ cwd })],
    ["Static code pattern scan", () => checkCodePatterns({ cwd })],
    ["Square config + webhook checks", () => checkSquareConfig({ cwd })],
    ["Site content checks", () => checkSiteContent({ cwd })],
  ];

  for (const [label, fn] of steps) {
    const result = await runSafely(label, fn);
    if (result.checks) allChecks.push(...result.checks);
    if (result.findings) allFindings.push(...result.findings);
    if (result.updates) allUpdates.push(...result.updates);
    if (result.dependencyStatus) dependencyStatus = { ...dependencyStatus, ...result.dependencyStatus };
    if (result.securityStatus) securityStatus = { ...securityStatus, ...result.securityStatus };
    if (result.squareStatus) securityStatus = { ...securityStatus, ...result.squareStatus };
    if (result.cloudflareStatus) cloudflareStatus = { ...cloudflareStatus, ...result.cloudflareStatus };
    if (result.websiteQuality) websiteQuality = { ...websiteQuality, ...result.websiteQuality };
  }

  const overallResult = computeOverallResult(allFindings, allChecks);
  const criticalCount = allFindings.filter((f) => f.severity === "Critical").length;
  const highCount = allFindings.filter((f) => f.severity === "High").length;

  const deferredManualReview = [
    ...allFindings
      .filter((f) => f.automationStatus === "Human review required" || f.automationStatus === "Blocked")
      .map((f) => `${f.id}: ${f.finding}`),
    "Production D1 migrations (only applied to a local-only database this run).",
    "Production Cloudflare deploy (only a --dry-run build was performed).",
    "Square production configuration and live sandbox integration calls.",
    "Any major-version dependency upgrades (see Dependency Status).",
  ];

  const recommendation =
    criticalCount > 0 || highCount > 0
      ? "Do not merge"
      : overallResult === "Passed with warnings"
        ? "Merge after listed corrections"
        : "Safe to review and merge";
  const recommendationReason =
    criticalCount > 0
      ? `${criticalCount} critical finding(s) require resolution before this branch should be merged or deployed.`
      : highCount > 0
        ? `${highCount} high-severity finding(s) require human review before merging.`
        : overallResult === "Passed with warnings"
          ? "Only medium/low/informational findings were detected; review the Findings table before merging."
          : "All automated checks passed with no critical or high findings.";

  const model = {
    runInfo: {
      runDateUtc: new Date().toISOString(),
      repository,
      defaultBranch: arg("default-branch", "main"),
      maintenanceBranch: branchName,
      commitBefore,
      commitAfter: "",
      trigger,
      workflowRunUrl,
      overallResult,
    },
    updates: allUpdates,
    findings: allFindings,
    dependencyStatus: {
      outdatedCount: dependencyStatus.outdatedCount ?? 0,
      vulnerabilitySummary: securityStatus["Dependency audit (npm audit)"] || "Not available",
      deprecatedSummary: dependencyStatus.deprecatedSummary || "Not evaluated",
      majorDeferredSummary: dependencyStatus.majorDeferredSummary || "None",
      lockfileStatus: dependencyStatus.lockfileStatus || "Not modified",
    },
    securityStatus,
    cloudflareStatus,
    websiteQuality,
    checks: allChecks,
    deferredManualReview,
    recommendation,
    recommendationReason,
    previewDeploymentStatus: "Not configured in this run (see docs/maintenance.md for optional preview environment setup).",
    productionDeploymentRecommended: false,
    nextActions: [
      { text: "Review every row in the Findings table, starting with Critical/High severity.", owner: "Repository owner" },
      { text: "Confirm npm ci and the Wrangler dry-run build both passed before merging.", owner: "Reviewer" },
      { text: "Do not merge the maintenance PR without reviewing Deferred Manual Review.", owner: "Repository owner" },
    ],
  };

  const reportMarkdown = renderReport(model);
  writeFileSync(path.join(REPO_ROOT, "monthlyReport.md"), reportMarkdown, "utf8");
  console.log(`monthlyReport.md written. Overall result: ${overallResult}`);

  const summary = buildPlainSummary(model);
  const summaryOptions = {
    runUrl: workflowRunUrl === true ? "" : workflowRunUrl,
    approveUrl: `https://github.com/${repository}/actions/workflows/monthly-maintenance.yml`,
    dryRun,
  };
  writeFileSync(path.join(REPO_ROOT, "maintenance-summary.txt"), renderPlainText(summary, summaryOptions), "utf8");
  writeFileSync(path.join(REPO_ROOT, "maintenance-summary.html"), renderHtml(summary, summaryOptions), "utf8");
  writeFileSync(path.join(REPO_ROOT, "maintenance-summary.json"), JSON.stringify({ verdict: summary.verdict, headline: summary.headline }), "utf8");

  const hasCritical = allFindings.some((f) => f.severity === "Critical");
  const hasHardFailure = allChecks.some((c) => c.status === "fail" && c.required !== false);
  if (hasCritical || hasHardFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Fatal error in monthly-maintenance.mjs:", error);
  process.exitCode = 1;
});
