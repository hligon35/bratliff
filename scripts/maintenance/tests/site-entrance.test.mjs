import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fixture, loadWorker, root } from './helpers/worker-harness.mjs';

const production = 'https://jackrabbitpunkinpublishing.com';
const sandbox = 'https://sandbox.jackrabbitpunkinpublishing.com';
const source = readFileSync(path.join(root, 'assets', 'coming-soon.js'), 'utf8');

test('the logo enters only on the fifth activation and stays on the current host', () => {
  let activate;
  const destinations = [];
  const entrance = {
    disabled: false,
    addEventListener(event, handler) {
      assert.equal(event, 'click');
      activate = handler;
    },
  };
  vm.runInNewContext(source, {
    document: { querySelector: () => entrance },
    window: { location: { assign: value => destinations.push(value) } },
  });
  for (let i = 0; i < 4; i++) activate();
  assert.deepEqual(destinations, []);
  assert.equal(entrance.disabled, false);
  activate();
  assert.deepEqual(destinations, ['/?site-preview=1']);
  assert.equal(entrance.disabled, true);
  activate();
  assert.equal(destinations.length, 1);
});

test('the entrance script tolerates pages without the logo control', () => {
  vm.runInNewContext(source, { document: { querySelector: () => null } });
});

test('the entrance uses a keyboard-accessible button and an external script', () => {
  const html = readFileSync(path.join(root, 'coming-soon.html'), 'utf8');
  assert.match(html, /<button[^>]*type="button"[^>]*data-site-entrance[^>]*aria-label=/);
  assert.match(html, /<script src="\/assets\/coming-soon\.js" defer><\/script>/);
  assert.doesNotMatch(html, /class="launch-art" aria-hidden="true"/);
});

for (const [origin, launchState] of [[production, 'closed'], [sandbox, 'open']]) {
  test(`five-click destination enables a host-only preview session on ${origin}`, async () => {
    const worker = loadWorker();
    const env = {
      SITE_LAUNCH_STATE: launchState,
      ASSETS: { fetch: async () => new Response('homepage', { headers: { 'Cache-Control': 'public, max-age=3600' } }) },
    };
    const fetchPage = (pathname, cookie) => worker.default.fetch(
      new Request(origin + pathname, { headers: cookie ? { Cookie: cookie } : {} }), env, {},
    );
    const entrance = await fetchPage('/?site-preview=1');
    assert.equal(entrance.status, 302);
    assert.equal(entrance.headers.get('location'), origin + '/');
    assert.equal(entrance.headers.get('cache-control'), 'no-store');
    const setCookie = entrance.headers.get('set-cookie');
    assert.match(setCookie, /^__Host-jrpp_site_preview=1; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
    const cookie = setCookie.split(';')[0];
    for (let i = 0; i < 2; i++) {
      const home = await fetchPage('/', cookie);
      assert.equal(home.status, 200);
      assert.equal(await home.text(), 'homepage');
      assert.equal(home.headers.get('cache-control'), 'no-store');
      assert.equal(home.headers.get('x-robots-tag'), launchState === 'closed' ? 'noindex, nofollow' : null);
    }
    const visitor = await fetchPage('/');
    assert.equal(visitor.status, launchState === 'closed' ? 302 : 200);
    if (launchState === 'closed') {
      assert.equal(visitor.headers.get('location'), origin + '/coming-soon');
      for (const invalidCookie of ['__Host-jrpp_site_preview=0', 'unrelated=1', '__Host-jrpp_site_preview_extra=1']) {
        assert.equal((await fetchPage('/', invalidCookie)).status, 302);
      }
      assert.equal((await fetchPage('/?site-preview=0')).status, 302);
    }
  });
}

test('preview access does not grant an admin or reader session', async () => {
  const worker = loadWorker();
  const { env } = fixture();
  env.SITE_LAUNCH_STATE = 'closed';
  env.GOOGLE_CLIENT_ID = 'offline.apps.googleusercontent.com';
  const headers = { Cookie: '__Host-jrpp_site_preview=1' };
  const admin = await worker.default.fetch(new Request(production + '/api/admin/session', { headers }), env, {});
  assert.equal(admin.status, 401);
  const customer = await worker.default.fetch(new Request(production + '/api/customer/auth/session', { headers }), env, {});
  assert.equal((await customer.json()).authenticated, false);
});
