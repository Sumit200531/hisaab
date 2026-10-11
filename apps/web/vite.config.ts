import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Emit sw.js with the exact list of built files, so the whole app (and the
 * fonts, once seen) works offline. Bumping any file changes the cache name.
 */
function serviceWorker(): Plugin {
  return {
    name: 'hisaab-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter(f => !f.endsWith('.map'));
      const assets = ['./', ...files.map(f => './' + f), './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
      const version = files.filter(f => f.startsWith('assets/')).sort().join('|');
      let h = 0; for (const c of version) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
      const source = `// generated at build time
const CACHE = 'hisaab-${h.toString(36)}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('hisaab-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // the sync relay is always live; everything else is cache-first
  if (url.pathname.startsWith('/v1/')) return;
  const isFont = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;
  e.respondWith(caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => req.mode === 'navigate' ? caches.match('./') : Response.error())));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [] : [serviceWorker()])],
  base: './',
  server: { port: 5174, proxy: { '/v1': { target: process.env.HISAAB_RELAY ?? 'http://127.0.0.1:8788', changeOrigin: true } } },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    cssCodeSplit: false
  }
}));
