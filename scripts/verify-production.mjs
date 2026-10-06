// Read-only checks: no login, provider transaction, email, migration or deployment.
const origin = 'https://jackrabbitpunkinpublishing.com';
const checks = [];
async function get(path, base = origin) {
  const response = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const hsts = response.headers.get('strict-transport-security') || '';
  checks.push({ check: 'HSTS ' + new URL(base).hostname + path, passed: /max-age=([1-9]\d*)/.test(hsts) });
  return response;
}
try {
  const health = await get('/healthz');
  checks.push({ check: 'Production Worker health', passed: health.ok && (await health.json()).ok === true });
  const auth = await get('/api/auth/config');
  checks.push({ check: 'Production expects Cloudflare Access', passed: auth.ok && (await auth.json()).mode === 'access' });
  const admin = await get('/admin/');
  checks.push({ check: 'Admin edge Access gate', passed: admin.status === 302 && new URL(admin.headers.get('location') || origin).hostname === 'jackrabbitpunkin.cloudflareaccess.com' });
  const www = await get('/admin/', 'https://www.jackrabbitpunkinpublishing.com');
  checks.push({ check: 'WWW admin uses canonical host', passed: [301, 302, 307, 308].includes(www.status) && new URL(www.headers.get('location') || '/', origin).origin === origin });
  const books = await get('/api/store/books');
  const catalog = books.ok ? await books.json() : {};
  checks.push({ check: 'Published native catalog', passed: catalog.ok === true && catalog.books?.length > 0 });
  checks.push({ check: 'Explicit native checkout configuration', passed: catalog.checkout?.available === true });
  const legacy = await get('/books.html');
  checks.push({ check: 'Legacy book URL redirects to canonical route', passed: [301, 302, 307, 308].includes(legacy.status) && new URL(legacy.headers.get('location') || '/', origin).pathname === '/books' });
} catch (error) { checks.push({ check: 'Read-only production responses available: ' + error.message, passed: false }); }
for (const check of checks) console.log((check.passed ? 'PASS ' : 'FAIL ') + check.check);
console.log('Still manually verify admin roles/login/logout, browser forms/mobile, reader account CPU budget, Square settlement/refunds, mailbox, email/unsubscribe, D1 backups/migrations and private R2 downloads.');
process.exitCode = checks.every(check => check.passed) ? 0 : 1;
