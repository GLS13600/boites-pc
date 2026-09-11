// Écrit dist/sw.js après le build de Vite. Usage : lancé par `npm run build`.
//
// Le service worker ne sert QUE la version web (GitHub Pages). Sous Capacitor tout
// est déjà embarqué dans l'app et la page n'est pas servie en HTTP : l'enregistrement
// est donc conditionné au protocole, côté main.js.
//
// Il est généré plutôt qu'écrit à la main parce que Vite empreinte les noms de
// fichiers : la liste à précharger n'est connue qu'après la compilation.

import { readdir, writeFile, stat } from 'node:fs/promises';

const DIST = new URL('../dist/', import.meta.url);
const chemin = (u) => u.pathname.replace(/^\/([A-Za-z]:)/, '$1');

// La coquille : la page, l'icône, et tous les fichiers produits par Vite. Ce sont
// eux qui font FONCTIONNER l'application ; sprites et fonds sont mis en cache au
// fil de la navigation, ils sont trop volumineux pour un préchargement d'un bloc.
// Le moteur du scan (onnxruntime-web, 14 Mo de WASM) est écarté du préchargement :
// il ne sert qu'à qui ouvre le scan, et doublerait l'installation pour tous les autres.
// Il se met en cache à la première analyse, comme les sprites.
const assets = (await readdir(new URL('assets/', DIST))).filter((f) => !f.endsWith('.wasm'));
const shell = ['./', './index.html', './icon.svg', ...assets.map((f) => `./assets/${f}`)];

let octets = 0;
for (const f of assets) octets += (await stat(new URL(`assets/${f}`, DIST))).size;

// La version change à chaque build : l'ancien cache est purgé à l'activation.
const version = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

const sw = `// Généré par scripts/build-sw.mjs — ne pas éditer à la main.
const CACHE = 'guiguidex-${version}';
const SHELL = ${JSON.stringify(shell, null, 2)};

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
`;

await writeFile(new URL('sw.js', DIST), sw);
console.log(`dist/sw.js écrit — coquille de ${shell.length} fichiers, ${(octets / 1048576).toFixed(1)} Mo préchargés`);
