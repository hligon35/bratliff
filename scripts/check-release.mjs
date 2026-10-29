import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const config = JSON.parse(read('cloudflare/wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
const vars = config.vars;
assert.equal(vars.ADMIN_AUTH_MODE, 'google', 'Production must use Google sign-in, matching sandbox.');
assert.equal(vars.ADMIN_AUTH_MODE, config.env.sandbox.vars.ADMIN_AUTH_MODE, 'Production and sandbox auth modes must match.');
assert.ok(vars.GOOGLE_CLIENT_ID && vars.ADMIN_BOOTSTRAP_EMAILS);
assert.equal(new URL(vars.PUBLIC_ADMIN_URL).origin, new URL(vars.SITE_URL).origin);
assert.ok(Number.isFinite(Date.parse(vars.SITE_LAUNCH_AT || '')), 'Production must have a valid launch timestamp.');
assert.match(vars.SITE_LAUNCH_AT, /(?:Z|[+-]\d{2}:\d{2})$/i, 'The launch timestamp must include an explicit timezone.');
// Launch schedule can change; verify a valid, timezone-qualified instant rather than pinning a historical date.
assert.ok(Number.isFinite(Date.parse(config.env.sandbox.vars.SITE_LAUNCH_AT || '')), 'Sandbox must have a valid launch timestamp.');
for (const file of readdirSync(root).filter(name => name.endsWith('.html'))) {
  const html = read(file);
  assert.doesNotMatch(html, /onloadTurnstileCallback|jppSiteUnlocked/);
  if (html.includes('assets/site.js')) {
    assert.ok(html.indexOf('assets/turnstile.js') < html.indexOf('assets/site.js'), file + ': load Turnstile helper first');
    assert.ok(html.indexOf('assets/dialogs.js') < html.indexOf('assets/site.js'), file + ': load dialog helper first');
  }
  for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|tel:|data:|about:)/.test(target)) continue;
    const pathname = target.split(/[?#]/)[0];
    if (!pathname) continue;
    const clean = pathname.replace(/^\//, '');
    const choices = clean ? [clean, clean + '.html', path.join(clean, 'index.html')] : ['index.html'];
    assert.ok(choices.some(file => { try { read(file); return true; } catch { return false; } }), file + ': missing local target ' + target);
  }
}
assert.doesNotMatch(read('sitemap.xml'), /\.html/);
for (const match of read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const url = new URL(match[1]);
  assert.equal(url.origin, new URL(vars.SITE_URL).origin, 'Sitemap must use the canonical production origin');
  assert.ok(!url.pathname.startsWith('//'), 'Sitemap paths cannot begin with double slashes');
  assert.equal(url.search, '', 'Sitemap URLs must not include query parameters');
}
assert.match(read('_headers'), /Strict-Transport-Security: max-age=[1-9]/);
console.log('Release configuration, helper ordering, clean URLs and local links passed. Remote acceptance checks remain separate.');
