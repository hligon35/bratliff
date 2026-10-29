import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, loadWorker } from './helpers/worker-harness.mjs';

test('preview denies indexing and caching on static pages, API data, redirects and errors', async () => {
  const f = fixture();
  f.env.DEPLOYMENT_ENVIRONMENT = 'preview';
  f.env.SITE_LAUNCH_AT = '2000-01-01T00:00:00.000Z';
  f.env.ASSETS = { fetch: async () => new Response('preview', { headers: { 'Cache-Control': 'public, max-age=3600' } }) };
  const worker = loadWorker();
  for (const route of ['/assets/styles.css', '/books', '/books.html', '/api/store/books', '/api/admin/session']) {
    const response = await worker.default.fetch(new Request(f.env.SITE_URL + route), f.env, {});
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive', route);
    assert.equal(response.headers.get('Cache-Control'), 'no-store', route);
  }
  delete f.env.DEPLOYMENT_ENVIRONMENT;
  const response = await worker.default.fetch(new Request(f.env.SITE_URL + '/assets/styles.css'), f.env, {});
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=3600');
});
