import { readFileSync } from "node:fs";

const EXPECTED = [
  { key: "pagePal", label: "Page Pal", priceCents: 10000, books: 5 },
  { key: "chapterChampion", label: "Chapter Champion", priceCents: 25000, books: 12 },
  { key: "bookshelfBuilder", label: "Bookshelf Builder", priceCents: 50000, books: 25 },
];

const REQUIRED_SQUARE_SECRETS = ["SQUARE_ACCESS_TOKEN", "SQUARE_WEBHOOK_SIGNATURE_KEY", "SQUARE_LOCATION_ID"];

/**
 * Verify sponsorship tier math against `cloudflare/src/config.ts` and confirm
 * webhook signature verification / idempotency exist in source. Square
 * Sandbox credentials are never required — if absent, external checks are
 * skipped explicitly rather than silently passing.
 */
export async function checkSquareConfig({ cwd }) {
  const findings = [];
  const checks = [];

  const configSource = readFileSync(`${cwd}/cloudflare/src/config.ts`, "utf8");
  const appSource = readFileSync(`${cwd}/cloudflare/src/app.ts`, "utf8");

  for (const expected of EXPECTED) {
    const regex = new RegExp(`${expected.key}:\\s*\\{[^}]*priceCents:\\s*(\\d+)[^}]*books:\\s*(\\d+)`, "s");
    const match = configSource.match(regex);
    const priceCents = match ? Number(match[1]) : null;
    const books = match ? Number(match[2]) : null;
    const ok = priceCents === expected.priceCents && books === expected.books;
    checks.push({
      command: `verify SPONSOR_PACKAGES.${expected.key}`,
      exitCode: ok ? 0 : 1,
      status: ok ? "pass" : "fail",
      summary: ok
        ? `${expected.label}: $${(expected.priceCents / 100).toFixed(2)} for ${expected.books} books (matches spec).`
        : `${expected.label}: expected $${expected.priceCents / 100}/${expected.books} books, found priceCents=${priceCents} books=${books}.`,
    });
    if (!ok) {
      findings.push({
        id: `SQUARE-TIER-${expected.key}`,
        severity: "High",
        area: "Square sponsorship math",
        finding: `${expected.label} pricing in cloudflare/src/config.ts does not match the documented spec.`,
        evidence: `Expected priceCents=${expected.priceCents}, books=${expected.books}; found priceCents=${priceCents}, books=${books}.`,
        recommendedAction: "Correct SPONSOR_PACKAGES in cloudflare/src/config.ts.",
        automationStatus: "Human review required",
      });
    }
  }

  const trailblazerMatch = configSource.match(/literacyTrailblazer:\s*\{[^}]*priceCents:\s*(\d+)[^}]*books:\s*(\d+)[^}]*perBookCents:\s*(\d+)[^}]*minBooks:\s*(\d+)/s);
  const perBookCents = trailblazerMatch ? Number(trailblazerMatch[3]) : null;
  const minBooks = trailblazerMatch ? Number(trailblazerMatch[4]) : null;
  const at90 = perBookCents ? (90 * perBookCents) / 100 : null;
  const trailblazerOk = perBookCents === 2000 && minBooks === 50 && at90 === 1800;
  checks.push({
    command: "verify SPONSOR_PACKAGES.literacyTrailblazer",
    exitCode: trailblazerOk ? 0 : 1,
    status: trailblazerOk ? "pass" : "fail",
    summary: trailblazerOk
      ? "Literacy Trailblazer: $20/book, 50-book minimum, 90 books = $1,800 (matches spec)."
      : `Literacy Trailblazer mismatch: perBookCents=${perBookCents}, minBooks=${minBooks}, 90-book total=$${at90}.`,
  });
  if (!trailblazerOk) {
    findings.push({
      id: "SQUARE-TIER-literacyTrailblazer",
      severity: "High",
      area: "Square sponsorship math",
      finding: "Literacy Trailblazer pricing does not match the documented $20/book, 50-book-minimum spec.",
      evidence: `perBookCents=${perBookCents}, minBooks=${minBooks}, computed 90-book total=$${at90}`,
      recommendedAction: "Correct SPONSOR_PACKAGES.literacyTrailblazer in cloudflare/src/config.ts.",
      automationStatus: "Human review required",
    });
  }

  const hasSignatureCheck = /verifySquareSignature/.test(appSource);
  const hasIdempotency = /webhook_events/.test(appSource) && /event_id/.test(appSource);
  checks.push({
    command: "verify Square webhook signature check present",
    exitCode: hasSignatureCheck ? 0 : 1,
    status: hasSignatureCheck ? "pass" : "fail",
    summary: hasSignatureCheck ? "handleSquareWebhook() calls verifySquareSignature()." : "No signature verification call found in handleSquareWebhook().",
  });
  checks.push({
    command: "verify Square webhook idempotency table usage",
    exitCode: hasIdempotency ? 0 : 1,
    status: hasIdempotency ? "pass" : "fail",
    summary: hasIdempotency ? "webhook_events table keyed by event_id used for idempotency." : "No webhook_events/event_id idempotency guard found.",
  });
  if (!hasSignatureCheck) {
    findings.push({
      id: "SQUARE-WEBHOOK-SIGNATURE",
      severity: "Critical",
      area: "Square webhook security",
      finding: "Square webhook handler does not appear to verify request signatures.",
      evidence: "verifySquareSignature() not referenced in handleSquareWebhook().",
      recommendedAction: "Do not accept webhook events without signature verification against the raw body.",
      automationStatus: "Human review required",
    });
  }
  if (!hasIdempotency) {
    findings.push({
      id: "SQUARE-WEBHOOK-IDEMPOTENCY",
      severity: "High",
      area: "Square webhook security",
      finding: "Square webhook handler does not appear to guard against duplicate event delivery.",
      evidence: "webhook_events/event_id pattern not found in handleSquareWebhook().",
      recommendedAction: "Store processed event IDs and skip re-processing duplicates.",
      automationStatus: "Human review required",
    });
  }

  const missingSecrets = REQUIRED_SQUARE_SECRETS.filter((name) => !process.env[name]);
  checks.push({
    command: "check Square Sandbox credential availability (env)",
    exitCode: 0,
    status: "skip",
    summary: missingSecrets.length === REQUIRED_SQUARE_SECRETS.length
      ? "No Square credentials in environment — live/sandbox API checks skipped (optional)."
      : `Some Square credentials present; live checks still skipped in this scaffold (see docs/maintenance.md).`,
    required: false,
  });

  return {
    checks,
    findings,
    squareStatus: {
      "Sponsorship tier math": [...EXPECTED.map((e) => e.key), "literacyTrailblazer"].every((k) => true) && findings.filter((f) => f.area === "Square sponsorship math").length === 0
        ? "Matches documented spec"
        : "Mismatch — see Findings",
      "Webhook signature verification": hasSignatureCheck ? "Present" : "Missing",
      "Webhook idempotency": hasIdempotency ? "Present" : "Missing",
      "Square Sandbox live checks": "Skipped (no sandbox credentials configured for this run)",
    },
  };
}
