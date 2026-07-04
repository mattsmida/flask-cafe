/**
 * Runs after `expo export --platform web` (see the build:web script).
 *
 * Expo's exporter doesn't emit PWA tags, so this stamps the manifest link
 * and the iOS install/standalone meta tags into dist/index.html. Without
 * the manifest the app can't be installed; without apple-touch-icon the
 * home-screen icon on iOS is a screenshot.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const INDEX = new URL('../dist/index.html', import.meta.url);

const TAGS = `
    <link rel="manifest" href="/manifest.json">
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Ember">
    <style>body { background-color: #171210; }</style>
  `;

let html = readFileSync(INDEX, 'utf8');
if (html.includes('rel="manifest"')) {
  console.log('dist/index.html already finalized');
} else {
  html = html.replace('</head>', `${TAGS}</head>`);
  writeFileSync(INDEX, html);
  console.log('PWA tags injected into dist/index.html');
}
