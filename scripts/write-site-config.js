const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envLocalPath = path.join(rootDir, '.env.local');
const envExamplePath = path.join(rootDir, '.env.example');
const outputPath = path.join(rootDir, 'assets', 'site-config.js');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return dotenv.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeUrl(value) {
  return String(value || '').trim();
}

function isPlaceholder(value) {
  return !value || /your-deployment-id|example\.com/i.test(value);
}

const exampleValues = readEnvFile(envExamplePath);
const envValues = readEnvFile(envPath);
const envLocalValues = readEnvFile(envLocalPath);
const values = { ...exampleValues, ...envValues, ...envLocalValues };

const formEndpoint = normalizeUrl(values.GOOGLE_APPS_SCRIPT_WEB_APP_URL);
const adminUrl = normalizeUrl(values.GOOGLE_APPS_SCRIPT_ADMIN_URL) || (isPlaceholder(formEndpoint)
  ? ''
  : formEndpoint + (formEndpoint.includes('?') ? '&' : '?') + 'action=admin');

const publicConfig = {
  siteUrl: normalizeUrl(values.SITE_URL),
  formEndpoint,
  adminUrl,
  adminEmail: normalizeUrl(values.ADMIN_NOTIFICATION_EMAIL)
};

fs.writeFileSync(
  outputPath,
  'window.siteConfig = Object.freeze(' + JSON.stringify(publicConfig, null, 2) + ');\n',
  'utf8'
);

console.log('Wrote assets/site-config.js');