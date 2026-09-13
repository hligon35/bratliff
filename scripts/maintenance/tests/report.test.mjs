import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReport, computeOverallResult, severityCounts } from "../lib/report.mjs";

function baseModel(overrides = {}) {
  return {
    runInfo: {
      runDateUtc: "2026-01-01T00:00:00.000Z",
      repository: "hligon35/bratliff",
      defaultBranch: "main",
      maintenanceBranch: "monthlyUpdate",
      commitBefore: "abc123",
      commitAfter: "",
      trigger: "local",
      workflowRunUrl: "",
      overallResult: "Passed",
    },
    updates: [],
    findings: [],
    dependencyStatus: { outdatedCount: 0, vulnerabilitySummary: "none", deprecatedSummary: "none", majorDeferredSummary: "None", lockfileStatus: "unchanged" },
    securityStatus: { "Dependency audit": "0 advisories" },
    cloudflareStatus: { "Worker build": "OK" },
    websiteQuality: { "Broken links": 0 },
    checks: [],
    deferredManualReview: [],
    recommendation: "Safe to review and merge",
    recommendationReason: "All good.",
    previewDeploymentStatus: "Not configured",
    productionDeploymentRecommended: false,
    nextActions: [],
    ...overrides,
  };
}

test("report is generated after successful checks", () => {
  const model = baseModel({ checks: [{ command: "npm ci", exitCode: 0, status: "pass", summary: "ok" }] });
  const markdown = renderReport(model);
  assert.match(markdown, /# Jackrabbit Punkin Publishing Monthly Maintenance Report/);
  assert.match(markdown, /## Tests and Commands/);
  assert.match(markdown, /npm ci/);
});

test("report is generated after failed checks (never throws, never hides the failure)", () => {
  const model = baseModel({
    checks: [{ command: "npm ci", exitCode: 1, status: "fail", summary: "lockfile mismatch" }],
    findings: [
      {
        id: "DEP-LOCKFILE-CI",
        severity: "High",
        area: "Dependencies",
        finding: "lockfile broken",
        evidence: "exit 1",
        recommendedAction: "fix it",
        automationStatus: "Blocked",
      },
    ],
  });
  const markdown = renderReport(model);
  assert.match(markdown, /lockfile mismatch/);
  assert.match(markdown, /DEP-LOCKFILE-CI/);
  assert.match(markdown, /\| Fail \|/);
});

test("severityCounts always includes every severity key", () => {
  const counts = severityCounts([{ severity: "High" }]);
  assert.deepEqual(counts, { Critical: 0, High: 1, Medium: 0, Low: 0, Informational: 0 });
});

test("a critical finding forces 'Review required', never 'Passed'", () => {
  const result = computeOverallResult([{ severity: "Critical" }], []);
  assert.equal(result, "Review required");
});

test("a required check failure forces 'Review required' even with no findings", () => {
  const result = computeOverallResult([], [{ status: "fail", required: true }]);
  assert.equal(result, "Review required");
});

test("an optional (non-required) check failure alone produces 'Passed with warnings', not 'Passed'", () => {
  const result = computeOverallResult([], [{ status: "fail", required: false }]);
  assert.equal(result, "Passed with warnings");
});

test("medium/low findings alone produce 'Passed with warnings'", () => {
  const result = computeOverallResult([{ severity: "Medium" }], []);
  assert.equal(result, "Passed with warnings");
});

test("no findings and no failures produces 'Passed'", () => {
  const result = computeOverallResult([], [{ status: "pass", required: true }]);
  assert.equal(result, "Passed");
});
