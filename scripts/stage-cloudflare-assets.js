const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const targetDir = path.join(rootDir, 'cloudflare', 'public');

const staticEntries = [
  '_headers',
  'about.html',
  'account.html',
  'book-club.html',
  'books.html',
  'contact.html',
  'coming-soon.html',
  'index.html',
  'media.html',
  'policies.html',
  'read-it-forward.html',
  'recognition.html',
  'resources.html',
  'speaking.html',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
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

for (const filename of [
  'JPP_Battles_Beyond_the_Waves_Discussion_Guide_2.0_09222026.pdf',
  'JPP_Publisher_Resource_Guide_Website_Edition.pdf'
]) {
  clearDestinationEntry(path.join(targetDir, 'assets', 'documents', filename));
}
clearDestinationEntry(path.join(targetDir, 'resources-blocked.html'));

console.log('Staged Cloudflare assets into cloudflare/public');
