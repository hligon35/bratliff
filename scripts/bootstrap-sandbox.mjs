import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const configPath = path.join(rootDir, 'cloudflare', 'wrangler.jsonc');
const envPath = path.join(rootDir, '.env.local');
const parsed = ts.parseConfigFileTextToJson(configPath, fs.readFileSync(configPath, 'utf8'));
if (parsed.error) throw new Error('Could not parse the Wrangler configuration.');

const values = dotenv.parse(fs.readFileSync(envPath));
if (values.SQUARE_ENVIRONMENT !== 'sandbox') {
  throw new Error('.env.local must contain sandbox Square credentials.');
}

const required = parsed.config.env.sandbox.secrets.required;
const missing = required.filter((name) => !values[name]);
if (missing.length) throw new Error(`Missing sandbox secrets: ${missing.join(', ')}`);

const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bratliff-sandbox-'));
try {
  const secretsPath = path.join(temporaryDir, 'secrets.json');
  fs.writeFileSync(secretsPath, JSON.stringify(Object.fromEntries(required.map((name) => [name, values[name]]))), { mode: 0o600 });
  const wranglerPath = path.join(path.dirname(fileURLToPath(import.meta.resolve('wrangler/package.json'))), 'bin', 'wrangler.js');
  const result = spawnSync(process.execPath, [wranglerPath, 'deploy', '--config', configPath, '--env', 'sandbox', '--secrets-file', secretsPath], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(temporaryDir, { recursive: true, force: true });
}