import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { main, rehearse, validateBackup, migrationHash } from '../../production-d1.mjs';
import { createHash } from 'node:crypto';

test('production operations reject missing explicit approvals before provider access', () => {
  assert.throws(() => main(['backup']), /approval required/);
  assert.throws(() => main(['migrate']), /approval required/);
  assert.throws(() => main(['migrate', '--approve', 'APPLY_PRODUCTION_MIGRATIONS']), /manifest/);
  const scripts = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url))).scripts;
  assert.doesNotMatch(scripts['worker:deploy'], /migrat/);
  assert.equal(scripts['d1:migrate:production'], 'node scripts/production-d1.mjs migrate');
});

test('backup gate rejects changed, stale, future and wrong-database exports', () => {
  const sql = 'CREATE TABLE example(id INTEGER PRIMARY KEY);';
  const manifest = { databaseId: '490e1480-46ca-4a06-88f7-994b7dc4acc4', sha256: createHash('sha256').update(sql).digest('hex'), createdAt: new Date().toISOString(), migrationHash: migrationHash() };
  validateBackup(manifest, sql);
  for (const patch of [{ databaseId: 'sandbox' }, { sha256: 'wrong' }, { createdAt: 'invalid' }, { createdAt: new Date(Date.now() - 86400001).toISOString() }, { createdAt: new Date(Date.now() + 86400000).toISOString() }, { migrationHash: 'changed' }]) {
    assert.throws(() => validateBackup({ ...manifest, ...patch }, sql));
  }
  assert.throws(() => validateBackup(manifest, sql + '-- changed'));
});

test('backup rehearsal executes the entire migration chain and rejects corrupt SQL', () => {
  assert.ok(rehearse('').length >= 20);
  assert.throws(() => rehearse('THIS IS NOT SQL'));
  assert.throws(() => rehearse("CREATE TABLE d1_migrations(name TEXT); INSERT INTO d1_migrations VALUES ('unknown.sql');"), /Unknown applied migration/);
});
