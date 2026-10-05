#!/usr/bin/env node
// Emails the plain-English maintenance summary through Resend.
// Needs RESEND_API_KEY, MAINTENANCE_EMAIL_TO and MAINTENANCE_EMAIL_FROM (an address on a
// Resend-verified domain). Exits non-zero with a clear message when sending is not possible,
// so a missing key or unverified domain is never reported as a success.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function sendSummary({ env = process.env, fetchImpl = fetch, read = (name) => readFileSync(path.join(ROOT, name), "utf8") } = {}) {
  const missing = ["RESEND_API_KEY", "MAINTENANCE_EMAIL_TO", "MAINTENANCE_EMAIL_FROM"].filter((name) => !env[name]);
  if (missing.length) {
    return { ok: false, error: `Email not sent: missing ${missing.join(", ")}. Add them as GitHub Actions secrets.` };
  }
  const meta = JSON.parse(read("maintenance-summary.json"));
  const runId = env.GITHUB_RUN_ID || "local";
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `jpp-maintenance-${runId}-${env.GITHUB_RUN_ATTEMPT || "1"}`,
    },
    body: JSON.stringify({
      from: env.MAINTENANCE_EMAIL_FROM,
      to: [env.MAINTENANCE_EMAIL_TO],
      subject: `Website check-up: ${meta.verdict}`,
      text: read("maintenance-summary.txt"),
      html: read("maintenance-summary.html"),
    }),
  });
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json()).message || ""; } catch { detail = ""; }
    const domainHint = /domain|verif/i.test(detail) ? " The sending domain is not verified in Resend." : "";
    return { ok: false, error: `Resend rejected the email (HTTP ${response.status}). ${detail}${domainHint}`.trim() };
  }
  return { ok: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await sendSummary();
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
  } else {
    console.log("Maintenance summary email sent.");
  }
}