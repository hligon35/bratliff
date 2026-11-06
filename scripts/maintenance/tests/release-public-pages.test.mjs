import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import staticAssets from '../../lib/static-assets.cjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
function releaseFixture(t) {
  const parent = path.resolve(tmpdir());
  const folder = mkdtempSync(path.join(parent, 'jpp-release-pages-'));
  t.after(() => { assert.equal(path.dirname(folder), parent); rmSync(folder, {recursive:true, force:true}); });
  for (const file of ['scripts/check-release.mjs','scripts/stage-cloudflare-assets.js','scripts/lib/static-assets.cjs','cloudflare/wrangler.jsonc','cloudflare/wrangler.preview.jsonc','package.json','_headers','sitemap.xml']) {
    mkdirSync(path.dirname(path.join(folder,file)), {recursive:true});
    cpSync(path.join(root,file),path.join(folder,file));
  }
  for (const file of staticAssets.staticEntries.filter(name=>name.endsWith('.html'))) {
    writeFileSync(path.join(folder,file), '<!doctype html><html lang="en"><head><title>A published page</title></head><body><main><img alt="" /></main></body></html>');
  }
  const run = file => spawnSync(process.execPath, [path.join(folder,'scripts',file)], {cwd:folder,encoding:'utf8'});
  return {folder,run};
}

test('generated maintenance and review fragments neither block release checks nor become published pages', t => {
  const f=releaseFixture(t);
  for (const file of ['maintenance-summary.html','review-data-digest-local.html']) writeFileSync(path.join(f.folder,file), '<div>Email report fragment <a href="missing-report-only-link">details</a></div>');
  const check=f.run('check-release.mjs');
  assert.equal(check.status,0,check.stderr||check.stdout);
  const stage=f.run('stage-cloudflare-assets.js');
  assert.equal(stage.status,0,stage.stderr||stage.stdout);
  assert.equal(existsSync(path.join(f.folder,'cloudflare/public/maintenance-summary.html')),false);
  assert.equal(existsSync(path.join(f.folder,'cloudflare/public/review-data-digest-local.html')),false);
  assert.equal(existsSync(path.join(f.folder,'cloudflare/public/books.html')),true);
});

test('published pages still fail release validation when their language is missing', t => {
  const f=releaseFixture(t);
  writeFileSync(path.join(f.folder,'books.html'), '<html><head><title>Books</title></head><body><main>Books</main></body></html>');
  const check=f.run('check-release.mjs');
  assert.notEqual(check.status,0);
  assert.match(check.stderr,/books\.html: document language required/);
});
