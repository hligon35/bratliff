// Turns the technical maintenance model into a short, plain-English summary
// ("explain it like I'm 10") and into email-ready text/HTML.

const CHECK_LABELS = [
  [/npm outdated/, "Are our building blocks (software packages) up to date?"],
  [/npm update/, "Install the small, safe package updates"],
  [/npm audit/, "Do any of our packages have known security holes?"],
  [/tsc/, "Does the website's brain (the code) make sense to the computer?"],
  [/stage-cloudflare-assets/, "Can we pack up the website files for the internet?"],
  [/wrangler deploy --dry-run/, "Would the site build correctly if we published it? (practice run, nothing published)"],
  [/migrations file numbering/, "Is the list of database changes in order?"],
  [/d1 migrations apply/, "Do the database changes work on a throw-away copy?"],
  [/secret scan/, "Did anyone leave a password or secret key in the code?"],
  [/static pattern scan/, "Does the code have risky habits we should double-check?"],
  [/SPONSOR_PACKAGES/, "Do the sponsor prices match the price list?"],
  [/Square webhook/, "Is the payment-notification safety check still in place?"],
  [/Square Sandbox credential/, "Practice payments with Square"],
  [/internal-link/, "Do all the links and pictures on the pages work?"],
  [/robots\.txt/, "Are private pages hidden from search engines?"],
  [/sitemap/, "Does the sitemap point only to the real website?"],
];

function labelFor(command) {
  const hit = CHECK_LABELS.find(([pattern]) => pattern.test(command));
  return hit ? hit[1] : `Check: ${command}`;
}

function statusIcon(status) {
  if (status === "pass") return "OK";
  if (status === "skip" || status === "skipped") return "SKIPPED";
  return "PROBLEM";
}

function normalizeStatus(status) {
  return String(status || "").toLowerCase();
}

/** @returns {{ verdict: string, headline: string, sections: {title: string, lines: string[]}[], canFix: boolean }} */
export function buildPlainSummary(model) {
  const findings = model.findings || [];
  const checks = model.checks || [];
  const failed = checks.filter((c) => normalizeStatus(c.status) === "fail" && c.required !== false);
  const urgent = findings.filter((f) => f.severity === "Critical" || f.severity === "High");
  const medium = findings.filter((f) => f.severity === "Medium");
  const lowCount = findings.filter((f) => f.severity === "Low").length;
  const outdated = Number(model.dependencyStatus?.outdatedCount || 0);
  const majors = model.dependencyStatus?.majorDeferredSummary;
  const updatesApplied = (model.updates || []).length;

  let verdict = "ALL GOOD";
  let headline = "The website passed its monthly check-up. Nothing needs your attention right now.";
  if (failed.length || urgent.length) {
    verdict = "NEEDS ATTENTION";
    headline = "The check-up found something important. Please read the 'What needs you' part below.";
  } else if (medium.length || outdated || (majors && majors !== "None")) {
    verdict = "MOSTLY GOOD";
    headline = "The website is healthy. A few small housekeeping items are waiting.";
  }

  const sections = [];

  sections.push({
    title: "What I looked at",
    lines: [...new Set(checks
      .filter((c) => !/^verify SPONSOR_PACKAGES\./.test(c.command))
      .map((c) => `${statusIcon(normalizeStatus(c.status))} - ${labelFor(c.command)}`))],
  });

  const needsYou = [];
  for (const check of failed) needsYou.push(`${labelFor(check.command)} did not pass. Technical note: ${String(check.summary || "").slice(0, 200)}`);
  for (const finding of urgent) needsYou.push(`${finding.severity.toUpperCase()}: ${finding.finding} Suggested next step: ${finding.recommendedAction}`);
  for (const finding of medium) needsYou.push(`${finding.finding} Suggested next step: ${finding.recommendedAction}`);
  if (majors && majors !== "None") needsYou.push(`Some tools have big new versions (${majors}). Big jumps can break things, so I will not install them without a careful test run.`);
  if (lowCount) needsYou.push(`${lowCount} tiny "keep an eye on it" notes about how pages are built. They were reviewed as low risk and need no action.`);
  sections.push({ title: "What needs you", lines: needsYou.length ? needsYou : ["Nothing."] });

  const fixes = [];
  if (updatesApplied) fixes.push(`I installed ${updatesApplied} small, safe update(s) and opened a pull request for you to look at. Nothing was published to the live website.`);
  else if (outdated) fixes.push(`Up to ${outdated} package(s) have updates. I can install the safe ones (same major version) and open a pull request for you to review. Nothing goes live until you merge and deploy it yourself.`);
  else fixes.push("There is nothing I need to fix right now.");
  sections.push({ title: "What I can fix once you say yes", lines: fixes });

  return { verdict, headline, sections, canFix: !updatesApplied && outdated > 0 };
}

export function renderPlainText(summary, { runUrl = "", approveUrl = "", dryRun = true } = {}) {
  const out = [`${summary.verdict}: ${summary.headline}`, ""];
  for (const section of summary.sections) {
    out.push(section.title.toUpperCase());
    for (const line of section.lines) out.push(`- ${line}`);
    out.push("");
  }
  if (dryRun && summary.canFix && approveUrl) {
    out.push("TO SAY YES TO THE FIXES");
    out.push(`Open ${approveUrl}, click "Run workflow", tick "Apply the safe fixes", and press the green button.`);
    out.push("Until you do that, I only look; I never change anything on my own.", "");
  }
  if (runUrl) out.push(`Full technical report: ${runUrl}`);
  out.push("I never publish the live website, change the live database, or merge anything for you.");
  return out.join("\n");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function renderHtml(summary, options = {}) {
  const text = renderPlainText(summary, options).split("\n");
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#10213b">${text
    .map((line) => (line.startsWith("- ") ? `<div>&bull; ${escapeHtml(line.slice(2))}</div>` : line ? `<p style="margin:10px 0 4px"><strong>${escapeHtml(line)}</strong></p>` : ""))
    .join("")}</div>`;
}
