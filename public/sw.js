/* Service worker de Geocraft : le jeu fonctionne hors ligne après la première visite.
   - pages et manifeste : réseau d'abord (mises à jour visibles), cache en secours
   - /assets/ (noms hachés) : cache d'abord, immuables */
const VERSION = 'geocraft-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// La page transmet la liste de ses ressources : le jeu devient disponible hors ligne dès la première visite.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'cache' && Array.isArray(e.data.urls)) {
    e.waitUntil(caches.open(VERSION).then(async (c) => {
      const urls = new Set(e.data.urls);
      // le script du worker de maillage est référencé dans le code principal
      for (const u of e.data.urls) {
        if (!/\/assets\/index-[^/]*\.js$/.test(u)) continue;
        try {
          const txt = await (await c.match(u, { ignoreVary: true }) || await fetch(u)).clone().text();
          for (const m of txt.matchAll(/worker-[\w-]+\.js/g)) urls.add(new URL(m[0], u).href);
        } catch { /* ignoré */ }
      }
      await Promise.all([...urls].map((u) => c.add(u).catch(() => undefined)));
    }));
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreVary: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
