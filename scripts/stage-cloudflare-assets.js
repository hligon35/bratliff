const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const targetDir = path.join(rootDir, 'cloudflare', 'public');

const staticEntries = [
  '.nojekyll',
  'about.html',
  'book-club.html',
  'books.html',
  'contact.html',
  'index.html',
  'media.html',
  'policies.html',
  'read-it-forward.html',
  'recognition.html',
  'speaking.html',
  'assets',
  'login',
  'admin'
];

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

console.log('Staged Cloudflare assets into cloudflare/public');