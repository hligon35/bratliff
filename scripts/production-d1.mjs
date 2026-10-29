import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'cloudflare/wrangler.jsonc');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const db = config.d1_databases.find(entry => entry.binding === 'DB');
const migrationsDir = path.resolve(path.dirname(configPath), db.migrations_dir);
const migrations = () => readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort();
const hash = value => createHash('sha256').update(value).digest('hex');
export const migrationHash = () => hash(migrations().map(name => name + '\n' + readFileSync(path.join(migrationsDir, name), 'utf8')).join('\n'));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || 'Command failed');
  return result.stdout.trim();
}
const revision = () => run('git', ['rev-parse', 'HEAD']);
const wrangler = args => run(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--env=', '--config', configPath]);

export function validateBackup(manifest, sql, now = Date.now()) {
  assert.equal(manifest.databaseId, db.database_id, 'Backup must target the configured production DB');
  assert.equal(manifest.sha256, hash(sql), 'Backup checksum mismatch');
  assert.ok(sql.length > 0, 'Backup must not be empty');
  const age = now - Date.parse(manifest.createdAt);
  assert.ok(age >= 0 && age < 24 * 3600000, 'Backup must be less than 24 hours old');
  assert.equal(manifest.migrationHash, migrationHash(), 'Migrations changed since backup');
}

export function rehearse(sql) {
  const local = new DatabaseSync(':memory:');
  try {
    local.exec(sql);
    const applied = local.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations'").get()
      ? new Set(local.prepare('SELECT name FROM d1_migrations').all().map(row => row.name)) : new Set();
    for (const name of applied) assert.ok(migrations().includes(name), 'Unknown applied migration: ' + name);
    const pending = migrations().filter(name => !applied.has(name));
    for (const name of pending) {
      local.exec('BEGIN');
      try { local.exec(readFileSync(path.join(migrationsDir, name), 'utf8')); local.exec('COMMIT'); }
      catch (error) { local.exec('ROLLBACK'); throw new Error(name + ': ' + error.message); }
    }
    assert.equal(local.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(local.prepare('PRAGMA foreign_key_check').all().length, 0, 'Foreign key violations after rehearsal');
    return pending;
  } finally { local.close(); }
}

export function main(args) {
  const [action, ...flags] = args;
  const option = name => { const index = flags.indexOf('--' + name); return index < 0 ? '' : flags[index + 1] || ''; };
  if (action === 'backup') {
    assert.equal(option('approve'), 'EXPORT_PRODUCTION_BACKUP', 'Explicit production export approval required');
    const folder = path.join(root, '.release-backups', new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(folder, { recursive: true });
    const file = path.join(folder, 'production.sql');
    wrangler(['d1', 'export', 'DB', '--remote', '--output', file]);
    const sql = readFileSync(file, 'utf8');
    assert.ok(statSync(file).size > 0, 'Export is empty');
    // Capture provider restore information for the release record; never restore here.
    const restoreInfo = wrangler(['d1', 'time-travel', 'info', 'DB', '--json']);
    const manifest = { databaseId: db.database_id, createdAt: new Date().toISOString(), revision: revision(), migrationHash: migrationHash(), sha256: hash(sql), restoreInfo };
    const pending = rehearse(sql);
    writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ ...manifest, rehearsed: true, pending }, null, 2));
    console.log('Export and local migration rehearsal succeeded. Review: ' + path.join(folder, 'manifest.json'));
  } else if (action === 'migrate') {
    assert.equal(option('approve'), 'APPLY_PRODUCTION_MIGRATIONS', 'Explicit production migration approval required');
    assert.ok(option('manifest'), 'Provide the reviewed backup manifest');
    const manifestPath = path.resolve(option('manifest'));
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const sql = readFileSync(path.join(path.dirname(manifestPath), 'production.sql'), 'utf8');
    validateBackup(manifest, sql);
    assert.equal(manifest.revision, revision(), 'Release commit changed since backup');
    assert.equal(manifest.rehearsed, true, 'Local rehearsal is required');
    assert.deepEqual(rehearse(sql), manifest.pending, 'Rehearsal differs from reviewed migrations');
    console.log(wrangler(['d1', 'migrations', 'apply', 'DB', '--remote']));
  } else throw new Error('Use backup or migrate with the explicit --approve value. See docs/production-prerequisites.md.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
