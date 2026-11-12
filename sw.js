// Généré par scripts/build-sw.mjs — ne pas éditer à la main.
const CACHE = 'unydex-20261112155623';
const SHELL = [
  "./",
  "./index.html",
  "./icon.svg",
  "./assets/compte-natif-C0YAcbMT.js",
  "./assets/index-D5bMjAqh.js",
  "./assets/index-DxN-1cWc.css",
  "./assets/index-Xyi9h_7l.js",
  "./assets/learnsets-vg-yNECzyJ5.js",
  "./assets/scan-worker-B3QWNv6j.js"
];

const abs = (r) => new URL(r, self.location).href;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Un fichier manquant ne doit pas faire échouer toute l'installation.
    await Promise.all(SHELL.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // La page elle-même : RÉSEAU D'ABORD, pour qu'un nouveau déploiement soit pris en
  // compte dès le rechargement suivant. Le cache prend le relais hors ligne.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        (await caches.open(CACHE)).put(abs('./index.html'), r.clone());
        return r;
      } catch {
        return (await caches.match(abs('./index.html'))) ?? Response.error();
      }
    })());
    return;
  }

  // Tout le reste : CACHE D'ABORD. Les noms portent une empreinte (assets) ou ne
  // changent jamais de contenu (sprites, fonds, objets, symboles de type) : un
  // cache périmé est donc impossible.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok) (await caches.open(CACHE)).put(req, r.clone());
      return r;
    } catch {
      return Response.error();
    }
  })());
});
