import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { fixture, loadWorker, root } from './helpers/worker-harness.mjs';

const issuer = 'https://jackrabbitpunkin.cloudflareaccess.com';
const audience = 'bb67586ab532654928f7880d330d113cd16d969a1b8b73acc4ebfbcac9ba3119';
const keys = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(keys.publicKey), kid: 'offline-access-key', alg: 'RS256', use: 'sig' };
const keySet = createLocalJWKSet({ keys: [jwk] });

async function token(overrides = {}, signingKey = keys.privateKey) {
  return new SignJWT({ email: 'owner@example.org', type: 'app', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setSubject('offline-user').setIssuer(issuer).setAudience(audience)
    .setExpirationTime('5m').sign(signingKey);
}

function setup() {
  const f = fixture();
  Object.assign(f.env, { ADMIN_AUTH_MODE: 'access', CF_ACCESS_TEAM_DOMAIN: new URL(issuer).host, CF_ACCESS_AUD: audience, ADMIN_BOOTSTRAP_EMAILS: 'owner@example.org' });
  let jwksLoads = 0;
  const worker = loadWorker(undefined, undefined, {
    createRemoteJWKSet(url) { assert.equal(String(url), issuer + '/cdn-cgi/access/certs'); jwksLoads++; return keySet; },
    jwtVerify,
  });
  const request = (route, headers = {}) => worker.default.fetch(new Request(f.env.SITE_URL + route, { headers }), f.env, {});
  return { ...f, worker, request, jwksLoads: () => jwksLoads };
}

test('Access login reaches the session and admin API with a signed cookie when the edge omits its header', async () => {
  const f = setup(); const jwt = await token(); const headers = { Cookie: 'unrelated=1; CF_Authorization=' + jwt };
  for (const route of ['/api/auth/session', '/api/admin/session', '/api/admin/me']) {
    const response = await f.request(route, headers);
    assert.equal(response.status, 200, route);
    assert.equal((await response.json()).viewer.email, 'owner@example.org');
  }
  assert.equal(f.jwksLoads(), 1, 'reuse JWKS across admin requests');
  assert.equal((await f.request('/api/admin/session', { 'Cf-Access-Jwt-Assertion': jwt })).status, 200);
});

test('Access cookie verification rejects invalid signatures, expired tokens, wrong issuer/audience and unauthorized users', async () => {
  const f = setup();
  const otherKeys = await generateKeyPair('RS256');
  const wrongAudience = await new SignJWT({ email: 'owner@example.org' }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject('user').setIssuer(issuer).setAudience('wrong').setExpirationTime('5m').sign(keys.privateKey);
  const wrongIssuer = await new SignJWT({ email: 'owner@example.org' }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject('user').setIssuer('https://other.cloudflareaccess.com').setAudience(audience).setExpirationTime('5m').sign(keys.privateKey);
  const expired = await new SignJWT({ email: 'owner@example.org' }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject('user').setIssuer(issuer).setAudience(audience).setExpirationTime(1).sign(keys.privateKey);
  for (const jwt of ['forged', await token({}, otherKeys.privateKey), wrongAudience, wrongIssuer, expired, await token({ email: 'outsider@example.org' })]) {
    assert.equal((await f.request('/api/admin/session', { Cookie: 'CF_Authorization=' + jwt })).status, 403);
  }
  assert.equal((await f.request('/api/admin/session')).status, 401);
  assert.equal((await f.request('/api/admin/session', { 'Cf-Access-Authenticated-User-Email': 'owner@example.org' })).status, 401);
  // A bad assertion cannot be bypassed by supplying a different cookie.
  assert.equal((await f.request('/api/admin/session', { 'Cf-Access-Jwt-Assertion': 'forged', Cookie: 'CF_Authorization=' + await token() })).status, 403);
});

test('Access mode rejects direct Google cookie sign-in and protected logout clears the app cookie', async () => {
  const f = setup();
  const post = route => f.worker.default.fetch(new Request(f.env.SITE_URL + route, { method: 'POST', headers: { Origin: f.env.SITE_URL } }), f.env, {});
  assert.equal((await post('/api/auth/google')).status, 409);
  const logout = await post('/api/admin/logout');
  assert.equal(logout.status, 200);
  assert.equal((await logout.json()).logoutUrl, '/cdn-cgi/access/logout');
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  f.env.ADMIN_AUTH_MODE = 'google';
  const googleLogout = await post('/api/admin/logout');
  assert.equal((await googleLogout.json()).logoutUrl, '/login/?signedOut=1');
  assert.equal((await f.request('/api/admin/session')).status, 503);
});

test('www sign-in targets the configured protected apex and keeps the Access error visible', async () => {
  const f = setup();
  const config = await f.worker.default.fetch(new Request('https://www.jackrabbitpunkinpublishing.com/api/auth/config'), f.env, {});
  const configuration = await config.json();
  assert.equal(configuration.adminUrl, f.env.PUBLIC_ADMIN_URL);
  let button; const status = { style: {} }; const host = { replaceChildren(node) { button = node; } };
  let init;
  const location = new URL('https://www.jackrabbitpunkinpublishing.com/login/?returnTo=%2Fadmin%2Fnewsletter.html&message=Invalid%20Access%20token');
  const document = { body: { dataset: { page: 'login' } }, readyState: 'loading', addEventListener(_, fn) { init = fn; }, querySelector(selector) { return selector === '[data-login-status]' ? status : host; }, createElement() { return {}; } };
  vm.runInNewContext(readFileSync(path.join(root, 'assets/auth.js'), 'utf8'), { document, window: { siteConfig: {}, location }, URL, URLSearchParams, fetch: async () => Response.json(configuration) });
  await init();
  assert.equal(button.href, f.env.SITE_URL + '/admin/newsletter.html');
  assert.equal(status.textContent, 'Invalid Access token');
  assert.equal(status.style.color, '#a3382a');
});

test('sandbox Google sign-in still issues a cookie accepted by the protected session endpoint', async () => {
  const f = fixture();
  Object.assign(f.env, { ADMIN_AUTH_MODE: 'google', GOOGLE_CLIENT_ID: 'offline.apps.googleusercontent.com', ADMIN_BOOTSTRAP_EMAILS: 'owner@example.org' });
  const worker = loadWorker(undefined, undefined, { createRemoteJWKSet: () => keySet, jwtVerify });
  const credential = await new SignJWT({ email: 'owner@example.org', email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject('google-user')
    .setIssuer('https://accounts.google.com').setAudience(f.env.GOOGLE_CLIENT_ID).setExpirationTime('5m').sign(keys.privateKey);
  const login = await worker.default.fetch(new Request(f.env.SITE_URL + '/api/auth/google', {
    method: 'POST', headers: { Origin: f.env.SITE_URL, 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }),
  }), f.env, {});
  assert.equal(login.status, 200);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const session = await worker.default.fetch(new Request(f.env.SITE_URL + '/api/admin/session', { headers: { Cookie: cookie } }), f.env, {});
  assert.equal(session.status, 200);
  assert.equal((await session.json()).viewer.email, 'owner@example.org');
});
