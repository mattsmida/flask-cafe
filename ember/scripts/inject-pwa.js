/**
 * Post-export step (runs from `npm run build`): Expo's metro web export
 * doesn't emit PWA tags, so stamp the manifest + iOS install/notification
 * meta into dist/index.html, and make sure the public/ assets made it.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const indexFile = path.join(dist, 'index.html');

// Belt and braces: expo export copies public/ into dist, but if that ever
// changes, copy it ourselves rather than shipping a broken PWA.
for (const entry of ['manifest.json', 'sw.js', 'icons']) {
  const src = path.join(root, 'public', entry);
  const dest = path.join(dist, entry);
  if (!fs.existsSync(dest)) {
    fs.cpSync(src, dest, { recursive: true });
  }
}

const tags = [
  '<link rel="manifest" href="/manifest.json"/>',
  '<meta name="theme-color" content="#171210"/>',
  '<link rel="apple-touch-icon" href="/icons/icon-180.png"/>',
  '<meta name="mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>',
  '<meta name="apple-mobile-web-app-title" content="Ember"/>',
].join('');

let html = fs.readFileSync(indexFile, 'utf8');
if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', `${tags}</head>`);
  fs.writeFileSync(indexFile, html);
}

for (const required of ['manifest.json', 'sw.js', path.join('icons', 'icon-192.png')]) {
  if (!fs.existsSync(path.join(dist, required))) {
    throw new Error(`PWA asset missing from dist: ${required}`);
  }
}
console.log('PWA tags injected; manifest, service worker, and icons in place.');
