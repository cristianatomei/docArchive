import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve('dist');
async function assets(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await assets(path));
    else if (!path.endsWith('.map') && entry.name !== 'service-worker.js') found.push(path);
  }
  return found.sort();
}
const files = await assets(root);
const digest = createHash('sha256');
for (const path of files) digest.update(relative(root, path)).update(await readFile(path));
const cacheName = `docarchive-shell-${digest.digest('hex').slice(0, 16)}`;
const urls = files.map(path => relative(root, path).split(sep).join('/'));
const worker = `
const CACHE = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(urls)};
const URLS = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...URLS])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('docarchive-shell-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => {
      const response = await caches.match(new URL('index.html', self.registration.scope).href);
      return response || Response.error();
    }));
  } else if (URLS.has(url.href)) {
    event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
  }
});
`;
await writeFile(join(root, 'service-worker.js'), worker.trimStart());
console.log(`Offline application shell generated: ${urls.length} assets (${cacheName}).`);
