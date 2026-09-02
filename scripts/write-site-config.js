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

function pickPrimaryUrl(value) {
  const candidates = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    try {
      return new URL(candidate).toString().replace(/\/$/, '');
    } catch {}
  }
  return normalizeUrl(value).replace(/\/$/, '');
}

function isPlaceholder(value) {
  return !value || /your-deployment-id|example\.com/i.test(value);
}

function joinUrl(base, pathName) {
  const cleanBase = pickPrimaryUrl(base);
  if (!cleanBase) return '';
  return cleanBase + pathName;
}

const exampleValues = readEnvFile(envExamplePath);
const envValues = readEnvFile(envPath);
const envLocalValues = readEnvFile(envLocalPath);
const values = { ...exampleValues, ...envValues, ...envLocalValues };

const siteUrl = pickPrimaryUrl(values.SITE_URL);
const publicApiUrl = isPlaceholder(values.PUBLIC_API_URL) ? '' : normalizeUrl(values.PUBLIC_API_URL).replace(/\/$/, '');
const publicAdminUrl = isPlaceholder(values.PUBLIC_ADMIN_URL)
  ? ''
  : normalizeUrl(values.PUBLIC_ADMIN_URL);
const legacyFormEndpoint = normalizeUrl(values.GOOGLE_APPS_SCRIPT_WEB_APP_URL);

const formEndpoint = publicApiUrl ? joinUrl(publicApiUrl, '/api/forms/submit') : legacyFormEndpoint;
const storeBooksEndpoint = publicApiUrl ? joinUrl(publicApiUrl, '/api/store/books') : (legacyFormEndpoint ? legacyFormEndpoint + (legacyFormEndpoint.includes('?') ? '&' : '?') + 'action=store-books' : '');
const storeCheckoutEndpoint = publicApiUrl ? joinUrl(publicApiUrl, '/api/store/checkout') : legacyFormEndpoint;
const adminApiUrl = publicApiUrl ? joinUrl(publicApiUrl, '/api/admin') : legacyFormEndpoint;
const adminUrl = publicAdminUrl || (siteUrl ? joinUrl(siteUrl, '/admin/') : 'admin/');
const loginUrl = siteUrl ? joinUrl(siteUrl, '/login/') : 'login/';
const authApiRoot = publicApiUrl || '';

const publicConfig = {
  siteUrl,
  publicApiUrl,
  formEndpoint,
  storeBooksEndpoint,
  storeCheckoutEndpoint,
  loginUrl,
  adminUrl,
  adminApiUrl,
  authGoogleEndpoint: authApiRoot ? joinUrl(authApiRoot, '/api/auth/google') : '',
  authSessionEndpoint: authApiRoot ? joinUrl(authApiRoot, '/api/auth/session') : '',
  authLogoutEndpoint: authApiRoot ? joinUrl(authApiRoot, '/api/auth/logout') : '',
  googleClientId: normalizeUrl(values.GOOGLE_CLIENT_ID),
  adminEmail: normalizeUrl(values.ADMIN_NOTIFICATION_EMAIL),
  spreadsheetId: normalizeUrl(values.SHEETS_EXPORT_SPREADSHEET_ID || values.GOOGLE_SPREADSHEET_ID)
};

fs.writeFileSync(
  outputPath,
  'window.siteConfig = Object.freeze(' + JSON.stringify(publicConfig, null, 2) + ');\n',
  'utf8'
);

console.log('Wrote assets/site-config.js');