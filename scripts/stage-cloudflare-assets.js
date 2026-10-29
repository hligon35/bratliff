const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const targetDir = path.join(rootDir, 'cloudflare', 'public');

const { staticEntries } = require('./lib/static-assets.cjs');

fs.mkdirSync(targetDir, { recursive: true });

function clearDestinationEntry(destination) {
  if (!fs.existsSync(destination)) return;
  fs.rmSync(destination, { recursive: true, force: true });
}

for (const entry of staticEntries) {
  const source = path.join(rootDir, entry);
  if (!fs.existsSync(source)) continue;
  const destination = path.join(targetDir, entry);
  clearDestinationEntry(destination);
  fs.cpSync(source, destination, { recursive: true });
}

// Resource guides are served from private R2 only; publish just the documents the public pages and Worker fetch.
const publicDocuments = new Set([
  'JPP_Media_Press_Kit_v1.pdf',
  'JPP_Certificate_of_Appreciation_v1.pdf',
  'S2CEO.png'
]);
const stagedDocumentsDir = path.join(targetDir, 'assets', 'documents');
if (fs.existsSync(stagedDocumentsDir)) {
  for (const filename of fs.readdirSync(stagedDocumentsDir)) {
    if (!publicDocuments.has(filename)) clearDestinationEntry(path.join(stagedDocumentsDir, filename));
  }
}
clearDestinationEntry(path.join(targetDir, 'resources-blocked.html'));

console.log('Staged Cloudflare assets into cloudflare/public');
