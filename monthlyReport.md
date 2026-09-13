# Jackrabbit Punkin Publishing Monthly Maintenance Report

## Run Information

- Run date and time (UTC): 2026-09-13T04:42:52.325Z
- Repository: hligon35/bratliff
- Source/default branch: main
- Maintenance branch: monthlyUpdate
- Commit before maintenance: [REDACTED_HEX]
- Commit after maintenance: (pending commit)
- Trigger type: local
- Workflow run URL: (local run, no workflow URL)
- Overall result: **Review required**

## Executive Summary

- Updates applied: 2
- Critical findings: 1
- High findings: 10
- Medium findings: 2
- Low findings: 45
- Informational findings: 15
- Tests passed: 19
- Tests failed: 1
- Tests skipped: 1
- Preview deployment: Not configured in this run (see docs/maintenance.md for optional preview environment setup).
- Production deployment recommended: No — human review required

## Updates Applied

| Package/file | Previous | New | Classification | Reason | Validation performed | Result |
| --- | --- | --- | --- | --- | --- | --- |
| jose | 6.2.10 | 6.2.12 | Patch/minor (in-range) | Kept within the semver range declared in package.json. | npm update + npm ci | Applied |
| wrangler | 4.128.0 | 4.131.1 | Patch/minor (in-range) | Kept within the semver range declared in package.json. | npm update + npm ci | Applied |

## Findings

| ID | Severity | Area | Finding | Evidence | Recommended Action | Automation Status |
| --- | --- | --- | --- | --- | --- | --- |
| DEP-MAJOR-dotenv | Informational | Dependencies | dotenv has a major update available (16.6.1 -> 17.4.2). | npm outdated: current=16.6.1, wanted=16.6.1, latest=17.4.2 | Review changelog and upgrade manually in a dedicated PR. | Human review required |
| DEP-MAJOR-open-cli | Informational | Dependencies | open-cli has a major update available (8.0.0 -> 9.0.0). | npm outdated: current=8.0.0, wanted=8.0.0, latest=9.0.0 | Review changelog and upgrade manually in a dedicated PR. | Human review required |
| DEP-MAJOR-typescript | Informational | Dependencies | typescript has a major update available (5.9.3 -> 7.0.2). | npm outdated: current=5.9.3, wanted=5.9.3, latest=7.0.2 | Review changelog and upgrade manually in a dedicated PR. | Human review required |
| SEC-AUDIT-file-type | Medium | Dependency security | file-type has a reported moderate severity advisory (via 1 path(s)). | npm audit: file-type range 13.0.0 - 21.3.0, fixAvailable={"name":"open-cli","version":"9.0.0","isSemVerMajor":true} | Upgrade to open-cli@9.0.0 (major bump) after manual review. | Human review required |
| SEC-AUDIT-open-cli | Medium | Dependency security | open-cli has a reported moderate severity advisory (via 1 path(s)). | npm audit: open-cli range 6.0.0 - 8.0.0, fixAvailable={"name":"open-cli","version":"9.0.0","isSemVerMajor":true} | Upgrade to open-cli@9.0.0 (major bump) after manual review. | Human review required |
| SECRET-.env.example-Square-access-signature-token | Critical | Secret scanning | Possible Square access/signature token committed in .env.example. | Pattern matched in .env.example (value redacted). | Rotate the credential immediately and remove it from git history. | Human review required |
| CODE-innerHTML-assets/admin.js-368 | Low | Static code scan | assets/admin.js:368 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | root.innerHTML = [ | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-410 | Low | Static code scan | assets/admin.js:410 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | root.innerHTML = dashboardForms | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-455 | Low | Static code scan | assets/admin.js:455 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | root.innerHTML = tableMarkup( | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-577 | Low | Static code scan | assets/admin.js:577 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | root.innerHTML = computeStoreMetrics() | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-601 | Low | Static code scan | assets/admin.js:601 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | if (orderList) orderList.innerHTML = html; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-603 | Low | Static code scan | assets/admin.js:603 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | recentOrders.innerHTML = tableMarkup( | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-619 | Low | Static code scan | assets/admin.js:619 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | select.innerHTML = '<option value="">Select an order</option>' + state.orders | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-643 | Low | Static code scan | assets/admin.js:643 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | root.innerHTML = tableMarkup( | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-659 | Low | Static code scan | assets/admin.js:659 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | select.innerHTML = '<option value="">Select a book</option>' + state.books | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-673 | Low | Static code scan | assets/admin.js:673 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | root.innerHTML = tableMarkup( | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-702 | Low | Static code scan | assets/admin.js:702 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | if (preview) preview.innerHTML = "<span>No image</span>"; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-754 | Low | Static code scan | assets/admin.js:754 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | preview.innerHTML = book.imageUrl ? '<img src="' + escapeHtml(book.imageUrl) + '" alt="">' : "<span>No image</span>"; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1053 | Low | Static code scan | assets/admin.js:1053 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | body.innerHTML = '<div class="empty">No ' + (scheduled ? 'scheduled newsletters' : 'drafts') + ' yet.</div>'; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1055 | Low | Static code scan | assets/admin.js:1055 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | body.innerHTML = '<table class="campaign-library-table"><thead><tr><th>' + | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1071 | Low | Static code scan | assets/admin.js:1071 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | preview.innerHTML = | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1116 | Low | Static code scan | assets/admin.js:1116 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | root.innerHTML = tableMarkup( | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1133 | Low | Static code scan | assets/admin.js:1133 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | root.innerHTML = '<div class="nl-muted">No saved campaigns yet.</div>'; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1139 | Low | Static code scan | assets/admin.js:1139 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | root.innerHTML = | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1216 | Low | Static code scan | assets/admin.js:1216 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | featuredBook.innerHTML = '<option value="">None</option>' + state.newsletterBooks | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1226 | Low | Static code scan | assets/admin.js:1226 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | targetValueSelect.innerHTML = '<option value="">Select a title</option>' + state.bookBuzzTargets | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1316 | Low | Static code scan | assets/admin.js:1316 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | if (list) list.innerHTML = markup; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1328 | Low | Static code scan | assets/admin.js:1328 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | if (preview) preview.innerHTML = "<span>No logo</span>"; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1375 | Low | Static code scan | assets/admin.js:1375 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | preview.innerHTML = sponsor.logoUrl ? '<img src="' + escapeHtml(sponsor.logoUrl) + '" alt="">' : "<span>No logo</span>"; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1490 | Low | Static code scan | assets/admin.js:1490 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | if (list) list.innerHTML = markup; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1502 | Low | Static code scan | assets/admin.js:1502 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | if (preview) preview.innerHTML = "<span>No portrait</span>"; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1566 | Low | Static code scan | assets/admin.js:1566 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | preview.innerHTML = author.portraitUrl ? '<img src="' + escapeHtml(author.portraitUrl) + '" alt="">' : "<span>No portrait</span>"; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1745 | Low | Static code scan | assets/admin.js:1745 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | metrics.innerHTML = | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1754 | Low | Static code scan | assets/admin.js:1754 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | topPages.innerHTML = tableMarkup( | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1767 | Low | Static code scan | assets/admin.js:1767 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | eventBreakdown.innerHTML = tableMarkup( | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1781 | Low | Static code scan | assets/admin.js:1781 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | trend.innerHTML = rows.length ? buildTrendChart(rows) : '<p class="asset-note">No page view data yet.</p>'; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-1786 | Low | Static code scan | assets/admin.js:1786 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | sponsorBreakdown.innerHTML = tableMarkup( | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-2045 | Low | Static code scan | assets/admin.js:2045 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">'; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-2065 | Low | Static code scan | assets/admin.js:2065 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">'; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/admin.js-2144 | Low | Static code scan | assets/admin.js:2144 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">'; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-sql-concat-assets/admin.js-619 | High | Static code scan | assets/admin.js:619 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters. | select.innerHTML = '<option value="">Select an order</option>' + state.orders | Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values. | Human review required |
| CODE-sql-concat-assets/admin.js-659 | High | Static code scan | assets/admin.js:659 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters. | select.innerHTML = '<option value="">Select a book</option>' + state.books | Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values. | Human review required |
| CODE-sql-concat-assets/admin.js-710 | High | Static code scan | assets/admin.js:710 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters. | if (!window.confirm("Delete " + (book ? '"' + book.title + '"' : "this book") + "? This can't be undone.")) return; | Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values. | Human review required |
| CODE-sql-concat-assets/admin.js-1226 | High | Static code scan | assets/admin.js:1226 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters. | targetValueSelect.innerHTML = '<option value="">Select a title</option>' + state.bookBuzzTargets | Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values. | Human review required |
| CODE-sql-concat-assets/admin.js-1337 | High | Static code scan | assets/admin.js:1337 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters. | if (!window.confirm("Delete " + label + "? This can't be undone.")) return; | Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values. | Human review required |
| CODE-sql-concat-assets/admin.js-1511 | High | Static code scan | assets/admin.js:1511 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters. | if (!window.confirm("Delete " + label + "? This can't be undone.")) return; | Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values. | Human review required |
| CODE-innerHTML-assets/auth.js-108 | Low | Static code scan | assets/auth.js:108 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | buttonHost.innerHTML = ''; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/site.js-126 | Low | Static code scan | assets/site.js:126 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | target.innerHTML = `<img src="${src}" alt="${isDecorative ? "" : alt}">`; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/site.js-864 | Low | Static code scan | assets/site.js:864 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | recognitionMount.innerHTML = '<p class="asset-note">Sponsor recognition is temporarily unavailable.</p>'; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/site.js-898 | Low | Static code scan | assets/site.js:898 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | recognitionMount.innerHTML = | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-sql-concat-assets/site.js-295 | High | Static code scan | assets/site.js:295 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters. | ? `You’ll receive updates for ${title}.` | Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values. | Human review required |
| CODE-target-blank-assets/site.js-184 | Informational | Static code scan | assets/site.js:184 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-target-blank-assets/site.js-194 | Informational | Static code scan | assets/site.js:194 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-target-blank-assets/site.js-204 | Informational | Static code scan | assets/site.js:204 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-innerHTML-assets/store.js-65 | Low | Static code scan | assets/store.js:65 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | grid.innerHTML = '<div class="store-empty">No published books are available yet.</div>'; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/store.js-69 | Low | Static code scan | assets/store.js:69 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | grid.innerHTML = state.books.map(book => { | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/store.js-128 | Low | Static code scan | assets/store.js:128 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | if (!state.cart.length) itemsEl.innerHTML = '<div class="store-empty">Your cart is empty.</div>'; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/store.js-129 | Low | Static code scan | assets/store.js:129 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | else itemsEl.innerHTML = state.cart.map(item => `<div class="store-cart-item"> | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/store.js-228 | Low | Static code scan | assets/store.js:228 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | grid.innerHTML = '<div class="store-loading">Loading books…</div>'; | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-innerHTML-assets/store.js-229 | Low | Static code scan | assets/store.js:229 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input). | try { await fetchBooks(); renderStore(); } catch (error) { grid.innerHTML = `<div class="store-empty">${escapeHtml(error.message)}</div>`; } | Confirm the assigned value is fully escaped/trusted; prefer textContent or an escaping helper for user input. | Human review required |
| CODE-target-blank-books.html-158 | Informational | Static code scan | books.html:158 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-target-blank-books.html-184 | Informational | Static code scan | books.html:184 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-target-blank-books.html-210 | Informational | Static code scan | books.html:210 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-sql-concat-cloudflare/src/app.ts-1750 | High | Static code scan | cloudflare/src/app.ts:1750 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters. | const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM sponsors${whereClause}`) | Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values. | Human review required |
| CODE-sql-concat-cloudflare/src/app.ts-1755 | High | Static code scan | cloudflare/src/app.ts:1755 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters. | `${SPONSOR_SELECT}${whereClause} ORDER BY datetime(created_at) DESC LIMIT ?${bindings.length + 1} OFFSET ?${bindings.length + 2}`, | Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values. | Human review required |
| CODE-sql-concat-cloudflare/src/app.ts-2256 | High | Static code scan | cloudflare/src/app.ts:2256 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters. | `SELECT order_number AS orderNumber, book_id AS bookId, sku, title, quantity, unit_price AS unitPrice, line_total AS lineTotal FROM order_items WHERE order_numb | Confirm the query uses prepared statement bindings (?1, ?2, ...) rather than concatenated values. | Human review required |
| CODE-target-blank-coming-soon.html-46 | Informational | Static code scan | coming-soon.html:46 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-target-blank-coming-soon.html-54 | Informational | Static code scan | coming-soon.html:54 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-target-blank-coming-soon.html-62 | Informational | Static code scan | coming-soon.html:62 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-target-blank-contact.html-79 | Informational | Static code scan | contact.html:79 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-target-blank-contact.html-87 | Informational | Static code scan | contact.html:87 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| CODE-target-blank-contact.html-95 | Informational | Static code scan | contact.html:95 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk). | target="_blank" | Add rel="noopener noreferrer" alongside target="_blank". | Human review required |
| SEO-NOINDEX-ADMIN | Low | SEO / admin exposure | admin/index.html, login/index.html lack an explicit <meta name="robots" content="noindex,nofollow"> tag. | robots.txt Disallow coverage present: true. Missing meta tag on: admin/index.html, login/index.html. | Add a noindex,nofollow meta tag as defense-in-depth for crawlers that ignore robots.txt. | Report only |

## Dependency Status

- Outdated dependencies: 3
- Vulnerabilities: 2 total advisories (critical=0, high=0, moderate=2, low=0)
- Deprecated packages: See Security Status section (npm audit / deprecation warnings).
- Major updates deferred for review: dotenv (16.6.1 -> 17.4.2), open-cli (8.0.0 -> 9.0.0), typescript (5.9.3 -> 7.0.2)
- Lockfile status: Regenerated via npm update + verified with npm ci

## Security Status

- Dependency audit (npm audit): 2 total advisories (critical=0, high=0, moderate=2, low=0)
- Sponsorship tier math: Matches documented spec
- Webhook signature verification: Present
- Webhook idempotency: Present
- Square Sandbox live checks: Skipped (no sandbox credentials configured for this run)

## Cloudflare and Data Status

- D1 local migration test: Passed (4 migrations, local-only database)

## Website Quality

- Broken internal links: 0
- Images missing alt text: 0
- HTML validation: Not run this pass (see docs/maintenance.md to enable html-validate)
- Browser smoke tests (Chromium/Firefox/WebKit): Not run this pass (see docs/maintenance.md to enable Playwright)
- Mobile responsiveness / Lighthouse: Not run this pass (see docs/maintenance.md to enable Lighthouse CI)
- Admin/login noindex + robots.txt coverage: See Findings
- Sitemap canonical-domain check: OK

## Tests and Commands

| Command | Exit Code | Result | Summary |
| --- | --- | --- | --- |
| npm outdated --json (before) | 1 | Pass | 5 package(s) outdated before update |
| npm update | 0 | Pass | changed 8 packages, and audited 122 packages in 14s
51 packages are looking for funding
  run `npm fund` for details
2 moderate severity vulnerabilities
To address all issues (including breaking changes), run:
  npm audit fix --force |
| npm ci | 0 | Pass | Lockfile installs cleanly. |
| npm audit --json | 1 | Pass | critical=0 high=0 moderate=2 low=0 |
| npx tsc -p cloudflare/tsconfig.json --noEmit | 0 | Pass | No TypeScript errors. |
| node scripts/stage-cloudflare-assets.js | 0 | Pass | Static assets staged into cloudflare/public. |
| npx wrangler deploy --dry-run --config cloudflare/wrangler.jsonc | 0 | Pass | Wrangler dry-run build succeeded (nothing deployed). |
| verify cloudflare/migrations file numbering | 0 | Pass | 4 migration(s), sequentially numbered. |
| npx wrangler d1 migrations apply bratliff-platform-db --local | 0 | Pass | All migrations applied cleanly to a local-only database. |
| custom secret scan over git ls-files | 1 | Fail | 72 tracked file(s) scanned, 1 potential secret(s) found. |
| custom static pattern scan (innerHTML, SQL concat, target=_blank, wildcard CORS) | 0 | Pass | 33 file(s) scanned. Hits: innerHTML=44, sql-concat=10, target-blank=12, wildcard-cors=0 |
| verify SPONSOR_PACKAGES.pagePal | 0 | Pass | Page Pal: $100.00 for 5 books (matches spec). |
| verify SPONSOR_PACKAGES.chapterChampion | 0 | Pass | Chapter Champion: $250.00 for 12 books (matches spec). |
| verify SPONSOR_PACKAGES.bookshelfBuilder | 0 | Pass | Bookshelf Builder: $500.00 for 25 books (matches spec). |
| verify SPONSOR_PACKAGES.literacyTrailblazer | 0 | Pass | Literacy Trailblazer: $20/book, 50-book minimum, 90 books = $1,800 (matches spec). |
| verify Square webhook signature check present | 0 | Pass | handleSquareWebhook() calls verifySquareSignature(). |
| verify Square webhook idempotency table usage | 0 | Pass | webhook_events table keyed by event_id used for idempotency. |
| check Square Sandbox credential availability (env) | 0 | Skipped | No Square credentials in environment — live/sandbox API checks skipped (optional). |
| custom internal-link + alt-text scan over tracked *.html | 0 | Pass | 19 HTML file(s), 29 <img> tag(s) (0 missing alt), 0 broken internal link(s). |
| verify robots.txt disallows /admin/ and /login/ | 0 | Pass | robots.txt disallows /admin/ and /login/. |
| verify sitemap.xml uses only the canonical production domain | 0 | Pass | sitemap.xml only references the canonical production domain. |

## Deferred Manual Review

- DEP-MAJOR-dotenv: dotenv has a major update available (16.6.1 -> 17.4.2).
- DEP-MAJOR-open-cli: open-cli has a major update available (8.0.0 -> 9.0.0).
- DEP-MAJOR-typescript: typescript has a major update available (5.9.3 -> 7.0.2).
- SEC-AUDIT-file-type: file-type has a reported moderate severity advisory (via 1 path(s)).
- SEC-AUDIT-open-cli: open-cli has a reported moderate severity advisory (via 1 path(s)).
- SECRET-.env.example-Square-access-signature-token: Possible Square access/signature token committed in .env.example.
- CODE-innerHTML-assets/admin.js-368: assets/admin.js:368 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-410: assets/admin.js:410 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-455: assets/admin.js:455 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-577: assets/admin.js:577 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-601: assets/admin.js:601 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-603: assets/admin.js:603 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-619: assets/admin.js:619 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-643: assets/admin.js:643 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-659: assets/admin.js:659 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-673: assets/admin.js:673 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-702: assets/admin.js:702 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-754: assets/admin.js:754 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1053: assets/admin.js:1053 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1055: assets/admin.js:1055 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1071: assets/admin.js:1071 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1116: assets/admin.js:1116 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1133: assets/admin.js:1133 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1139: assets/admin.js:1139 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1216: assets/admin.js:1216 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1226: assets/admin.js:1226 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1316: assets/admin.js:1316 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1328: assets/admin.js:1328 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1375: assets/admin.js:1375 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1490: assets/admin.js:1490 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1502: assets/admin.js:1502 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1566: assets/admin.js:1566 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1745: assets/admin.js:1745 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1754: assets/admin.js:1754 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1767: assets/admin.js:1767 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1781: assets/admin.js:1781 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-1786: assets/admin.js:1786 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-2045: assets/admin.js:2045 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-2065: assets/admin.js:2065 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/admin.js-2144: assets/admin.js:2144 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-sql-concat-assets/admin.js-619: assets/admin.js:619 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.
- CODE-sql-concat-assets/admin.js-659: assets/admin.js:659 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.
- CODE-sql-concat-assets/admin.js-710: assets/admin.js:710 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.
- CODE-sql-concat-assets/admin.js-1226: assets/admin.js:1226 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.
- CODE-sql-concat-assets/admin.js-1337: assets/admin.js:1337 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.
- CODE-sql-concat-assets/admin.js-1511: assets/admin.js:1511 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.
- CODE-innerHTML-assets/auth.js-108: assets/auth.js:108 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/site.js-126: assets/site.js:126 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/site.js-864: assets/site.js:864 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/site.js-898: assets/site.js:898 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-sql-concat-assets/site.js-295: assets/site.js:295 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.
- CODE-target-blank-assets/site.js-184: assets/site.js:184 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-target-blank-assets/site.js-194: assets/site.js:194 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-target-blank-assets/site.js-204: assets/site.js:204 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-innerHTML-assets/store.js-65: assets/store.js:65 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/store.js-69: assets/store.js:69 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/store.js-128: assets/store.js:128 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/store.js-129: assets/store.js:129 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/store.js-228: assets/store.js:228 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-innerHTML-assets/store.js-229: assets/store.js:229 — Direct .innerHTML assignment found (potential DOM XSS if the value includes untrusted input).
- CODE-target-blank-books.html-158: books.html:158 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-target-blank-books.html-184: books.html:184 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-target-blank-books.html-210: books.html:210 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-sql-concat-cloudflare/src/app.ts-1750: cloudflare/src/app.ts:1750 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.
- CODE-sql-concat-cloudflare/src/app.ts-1755: cloudflare/src/app.ts:1755 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.
- CODE-sql-concat-cloudflare/src/app.ts-2256: cloudflare/src/app.ts:2256 — SQL statement appears to be built with string concatenation/template interpolation instead of bound parameters.
- CODE-target-blank-coming-soon.html-46: coming-soon.html:46 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-target-blank-coming-soon.html-54: coming-soon.html:54 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-target-blank-coming-soon.html-62: coming-soon.html:62 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-target-blank-contact.html-79: contact.html:79 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-target-blank-contact.html-87: contact.html:87 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- CODE-target-blank-contact.html-95: contact.html:95 — target="_blank" link without a neighboring rel attribute (reverse-tabnabbing risk).
- Production D1 migrations (only applied to a local-only database this run).
- Production Cloudflare deploy (only a --dry-run build was performed).
- Square production configuration and live sandbox integration calls.
- Any major-version dependency upgrades (see Dependency Status).

## Recommendation

**Do not merge**

1 critical finding(s) require resolution before this branch should be merged or deployed.

## Next Actions

- [ ] Review every row in the Findings table, starting with Critical/High severity. _(owner: Repository owner)_
- [ ] Confirm npm ci and the Wrangler dry-run build both passed before merging. _(owner: Reviewer)_
- [ ] Do not merge the maintenance PR without reviewing Deferred Manual Review. _(owner: Repository owner)_
