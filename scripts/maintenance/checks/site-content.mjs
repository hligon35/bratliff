import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { runCommand } from "../lib/exec.mjs";

const CANONICAL_DOMAIN = "jackrabbitpunkinpublishing.com";
const TEMP_DOMAIN = "alphazonelabs.com";

/**
 * Lightweight, dependency-free checks over the public/admin HTML: internal
 * link targets exist, images have alt text, and SEO-sensitive pages
 * (admin/login/coming-soon) are not indexable under the canonical domain.
 * Deep checks (Lighthouse, axe, cross-browser smoke tests, external link
 * retries) are intentionally NOT run here — see docs/maintenance.md for how
 * to opt into them; they are reported as skipped, not silently passed.
 */
export async function checkSiteContent({ cwd }) {
  const findings = [];
  const checks = [];

  const lsFiles = await runCommand("git", ["ls-files"], { cwd });
  const htmlFiles = lsFiles.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((f) => f.endsWith(".html") && !f.startsWith("cloudflare/public/"));

  let brokenLinks = 0;
  let missingAlt = 0;
  let scannedImgs = 0;

  for (const file of htmlFiles) {
    const fileDir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ".";
    let content;
    try {
      content = readFileSync(`${cwd}/${file}`, "utf8");
    } catch {
      continue;
    }

    // Respect <base href="..."> (used by admin/* pages to resolve relative
    // links against the repo root) instead of always resolving against the
    // HTML file's own directory.
    const baseHref = content.match(/<base\s+href=["']([^"']+)["']/i)?.[1];
    const dir = baseHref ? path.normalize(path.join(fileDir, baseHref)).replace(/\\/g, "/").replace(/\/$/, "") || "." : fileDir;

    for (const match of content.matchAll(/<img\b[^>]*>/gi)) {
      scannedImgs += 1;
      if (!/\balt\s*=\s*["'][^"']*["']/i.test(match[0])) {
        missingAlt += 1;
        findings.push({
          id: `SEO-ALT-${file}-${scannedImgs}`,
          severity: "Low",
          area: "Accessibility / SEO",
          finding: `${file} has an <img> tag with no alt attribute.`,
          evidence: match[0].slice(0, 140),
          recommendedAction: "Add a descriptive (or empty, for decorative images) alt attribute.",
          automationStatus: "Human review required",
        });
      }
    }

    for (const match of content.matchAll(/href=["']([^"':#][^"']*\.html)(#[^"']*)?["']/gi)) {
      const target = match[1];
      if (/^https?:\/\//i.test(target)) continue;
      const resolved = target.startsWith("/") ? `${cwd}/${target.slice(1)}` : `${cwd}/${dir}/${target}`;
      if (!existsSync(resolved)) {
        brokenLinks += 1;
        findings.push({
          id: `LINK-BROKEN-${file}-${target}`,
          severity: "Medium",
          area: "Website quality",
          finding: `${file} links to "${target}", which does not exist in the repository.`,
          evidence: match[0],
          recommendedAction: "Fix or remove the broken internal link.",
          automationStatus: "Human review required",
        });
      }
    }
  }

  checks.push({
    command: "custom internal-link + alt-text scan over tracked *.html",
    exitCode: brokenLinks > 0 ? 1 : 0,
    status: brokenLinks > 0 ? "fail" : "pass",
    summary: `${htmlFiles.length} HTML file(s), ${scannedImgs} <img> tag(s) (${missingAlt} missing alt), ${brokenLinks} broken internal link(s).`,
    required: false,
  });

  const noIndexPages = ["admin/index.html", "login/index.html"].filter((f) => htmlFiles.includes(f));
  const missingNoIndex = noIndexPages.filter((f) => {
    try {
      return !/name=["']robots["']\s+content=["'][^"']*noindex/i.test(readFileSync(`${cwd}/${f}`, "utf8"));
    } catch {
      return false;
    }
  });
  let robotsTxt = "";
  try {
    robotsTxt = readFileSync(`${cwd}/robots.txt`, "utf8");
  } catch {
    /* handled below */
  }
  const robotsDisallowsAdmin = /Disallow:\s*\/admin\//i.test(robotsTxt) && /Disallow:\s*\/login\//i.test(robotsTxt);
  checks.push({
    command: "verify robots.txt disallows /admin/ and /login/",
    exitCode: robotsDisallowsAdmin ? 0 : 1,
    status: robotsDisallowsAdmin ? "pass" : "fail",
    summary: robotsDisallowsAdmin ? "robots.txt disallows /admin/ and /login/." : "robots.txt is missing or does not disallow /admin/ and /login/.",
  });
  if (missingNoIndex.length > 0) {
    findings.push({
      id: "SEO-NOINDEX-ADMIN",
      severity: robotsDisallowsAdmin ? "Low" : "Medium",
      area: "SEO / admin exposure",
      finding: `${missingNoIndex.join(", ")} lack an explicit <meta name="robots" content="noindex,nofollow"> tag.`,
      evidence: `robots.txt Disallow coverage present: ${robotsDisallowsAdmin}. Missing meta tag on: ${missingNoIndex.join(", ")}.`,
      recommendedAction: "Add a noindex,nofollow meta tag as defense-in-depth for crawlers that ignore robots.txt.",
      automationStatus: "Report only",
    });
  }

  let sitemap = "";
  try {
    sitemap = readFileSync(`${cwd}/sitemap.xml`, "utf8");
  } catch {
    /* handled below */
  }
  const sitemapHasTempDomain = sitemap.includes(TEMP_DOMAIN);
  const sitemapUsesCanonical = sitemap.includes(CANONICAL_DOMAIN);
  checks.push({
    command: "verify sitemap.xml uses only the canonical production domain",
    exitCode: sitemapHasTempDomain || !sitemapUsesCanonical ? 1 : 0,
    status: sitemapHasTempDomain || !sitemapUsesCanonical ? "fail" : "pass",
    summary: sitemapHasTempDomain
      ? "sitemap.xml references the temporary AlphaZoneLabs hostname."
      : sitemapUsesCanonical
        ? "sitemap.xml only references the canonical production domain."
        : "sitemap.xml is missing or does not reference the canonical domain.",
  });
  if (sitemapHasTempDomain) {
    findings.push({
      id: "SEO-SITEMAP-TEMP-DOMAIN",
      severity: "Medium",
      area: "SEO / domain hygiene",
      finding: "sitemap.xml includes the temporary AlphaZoneLabs hostname alongside/instead of the canonical domain.",
      evidence: "sitemap.xml contains 'alphazonelabs.com'",
      recommendedAction: "Ensure sitemap.xml only lists canonical https://jackrabbitpunkinpublishing.com URLs.",
      automationStatus: "Human review required",
    });
  }

  return {
    checks,
    findings,
    websiteQuality: {
      "Broken internal links": brokenLinks,
      "Images missing alt text": missingAlt,
      "HTML validation": "Not run this pass (see docs/maintenance.md to enable html-validate)",
      "Browser smoke tests (Chromium/Firefox/WebKit)": "Not run this pass (see docs/maintenance.md to enable Playwright)",
      "Mobile responsiveness / Lighthouse": "Not run this pass (see docs/maintenance.md to enable Lighthouse CI)",
      "Admin/login noindex + robots.txt coverage": robotsDisallowsAdmin && missingNoIndex.length === 0 ? "OK" : "See Findings",
      "Sitemap canonical-domain check": sitemapHasTempDomain ? "Temp domain present — see Findings" : "OK",
    },
  };
}
