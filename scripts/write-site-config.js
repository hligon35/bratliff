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
  return !value || /your-deployment-id|your-domain|replace-with-|example\.(?:com|net|org)|\.example(?:\/|$)/i.test(value);
}

function joinUrl(base, pathName) {
  const cleanBase = pickPrimaryUrl(base);
  if (!cleanBase) return '';
  return cleanBase + pathName;
}

const exampleValues = readEnvFile(envExamplePath);
const envValues = readEnvFile(envPath);
const envLocalValues = readEnvFile(envLocalPath);
const values = { ...exampleValues, ...envValues, ...envLocalValues, ...process.env };

// A production build must never publish example credentials or a sandbox URL.
if (process.argv.includes('--production')) {
  const required = ['SITE_URL', 'GOOGLE_CLIENT_ID', 'TURNSTILE_SITE_KEY', 'ADMIN_NOTIFICATION_EMAIL'];
  for (const key of required) {
    if (!values[key] || /replace-with-|your-domain|your-google-account|example\.com/i.test(values[key])) {
      throw new Error(key + ' must be configured for the production build.');
    }
  }
  const configured = pickPrimaryUrl(values.SITE_URL);
  if (configured !== 'https://jackrabbitpunkinpublishing.com') {
    throw new Error('Production SITE_URL must be https://jackrabbitpunkinpublishing.com.');
  }
}

const PRODUCTION_SITE_URL = 'https://jackrabbitpunkinpublishing.com';
const configuredSiteUrl = pickPrimaryUrl(process.env.SITE_URL || values.SITE_URL);
const siteUrl = isPlaceholder(configuredSiteUrl) ? PRODUCTION_SITE_URL : configuredSiteUrl;
const publicApiUrl = '';
const formEndpoint = '/api/forms/submit';
const storeBooksEndpoint = '/api/store/books';
const storeCheckoutEndpoint = '/api/store/checkout';
const adminApiUrl = '/api/admin';
const adminUrl = '/admin/';
const loginUrl = '/login/';
const authGoogleEndpoint = '/api/auth/google';
const authSessionEndpoint = '/api/auth/session';
const authLogoutEndpoint = '/api/auth/logout';

const publicConfig = {
  siteUrl,
  publicApiUrl,
  formEndpoint,
  storeBooksEndpoint,
  storeCheckoutEndpoint,
  storeConfirmEndpoint: '/api/store/confirm-checkout',
  loginUrl,
  adminUrl,
  adminApiUrl,
  authGoogleEndpoint,
  authSessionEndpoint,
  authLogoutEndpoint,
  googleClientId: normalizeUrl(values.GOOGLE_CLIENT_ID),
  adminEmail: normalizeUrl(values.ADMIN_NOTIFICATION_EMAIL),
  turnstileSiteKey: normalizeUrl(values.TURNSTILE_SITE_KEY),
  squareLinks: {
    books: {
      battlesHardcover: normalizeUrl(values.SQUARE_BATTLES_HARDCOVER_URL),
      battlesPaperback: normalizeUrl(values.SQUARE_BATTLES_PAPERBACK_URL)
    },
    sponsorships: {
      pagePal: normalizeUrl(values.SQUARE_PAGE_PAL_URL),
      chapterChampion: normalizeUrl(values.SQUARE_CHAPTER_CHAMPION_URL),
      bookshelfBuilder: normalizeUrl(values.SQUARE_BOOKSHELF_BUILDER_URL),
      literacyTrailblazer: normalizeUrl(values.SQUARE_LITERACY_TRAILBLAZER_URL)
    }
  }
};

fs.writeFileSync(
  outputPath,
  'window.siteConfig = (function freeze(value) {\n' +
    '  Object.values(value).forEach(function (entry) {\n' +
    '    if (entry && typeof entry === "object") freeze(entry);\n' +
    '  });\n' +
    '  return Object.freeze(value);\n' +
    '})(' + JSON.stringify(publicConfig, null, 2) + ');\n',
  'utf8'
);

console.log('Wrote assets/site-config.js');
