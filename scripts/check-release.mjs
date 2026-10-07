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
assert.ok(['closed', 'open'].includes(vars.SITE_LAUNCH_STATE));
assert.ok(['unconfigured', 'none', 'fixed'].includes(vars.STORE_TAX_MODE));
if (vars.STORE_TAX_MODE === 'fixed') {
  assert.ok(/^\d{1,2}(\.\d{1,4})?$/.test(vars.STORE_TAX_PERCENTAGE || '') && Number(vars.STORE_TAX_PERCENTAGE) > 0 && Number(vars.STORE_TAX_PERCENTAGE) <= 25, 'Configure an approved fixed rate.');
  assert.ok(['true', 'false'].includes(vars.STORE_TAX_SHIPPING), 'Choose whether shipping is taxable.');
}
for (const file of readdirSync(root).filter(name => name.endsWith('.html'))) {
  const html = read(file);
  assert.doesNotMatch(html, /onloadTurnstileCallback|jppSiteUnlocked/);
  if (html.includes('assets/site.js')) {
    assert.ok(html.indexOf('assets/turnstile.js') < html.indexOf('assets/site.js'), file + ': load Turnstile helper first');
    assert.ok(html.indexOf('assets/dialogs.js') < html.indexOf('assets/site.js'), file + ': load dialog helper first');
  }
  for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(target)) continue;
    const pathname = target.split(/[?#]/)[0];
    if (!pathname) continue;
    const clean = pathname.replace(/^\//, '');
    const choices = clean ? [clean, clean + '.html', path.join(clean, 'index.html')] : ['index.html'];
    assert.ok(choices.some(file => { try { read(file); return true; } catch { return false; } }), file + ': missing local target ' + target);
  }
}
assert.doesNotMatch(read('sitemap.xml'), /\.html/);
assert.match(read('_headers'), /Strict-Transport-Security: max-age=[1-9]/);
console.log('Release configuration, helper ordering, clean URLs and local links passed. Remote acceptance checks remain separate.');
