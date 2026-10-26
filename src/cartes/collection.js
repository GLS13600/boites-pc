// La collection de CARTES (JCC) — l'héritage de Cartodex, fondu dans Unydex.
//
// Une carte possédée = une entrée par identifiant TCGdex (« sv03.5-025 »), avec ses
// EXEMPLAIRES : on peut avoir trois Pikachu de la même extension, un normal et deux
// reverse. C'est le modèle de Cartodex, gardé parce qu'il est juste — un collectionneur
// compte des exemplaires, pas des cases cochées.
//
//   {
//     n:    nom (dans la langue de la carte),
//     img:  base de l'image TCGdex, sans qualité ni extension,
//     set, setN, serie : extension et série,
//     num:  numéro dans l'extension (« 025 »),
//     rar:  rareté, telle que TCGdex l'écrit,
//     dex:  numéros du Pokédex national représentés (passerelle vers la fiche),
//     ex:   [{ v: variante, l: langue, e: état, d: date d'ajout AAAA-MM-JJ }],
//     fav:  favori,
//     prix: { t: tendance Cardmarket en €, maj: date ISO du relevé },
//   }
//
// Variantes : 'normal', 'reverse', 'holo', 'premiere' (première édition), et les deux
// reverse « Poké Ball » et « Master Ball » des extensions qui en ont.
//
// `localStorage` est la source de vérité, comme pour le Living Dex ; le compte n'en
// est qu'une copie (sync.js), et l'écriture prévient la synchronisation.

const CLE = 'pcbox.cartes';

let cartes = lire();
let surEcriture = () => {};
const ecouteurs = new Set();

function lire() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

function ecrire() {
  try { localStorage.setItem(CLE, JSON.stringify(cartes)); } catch { /* quota : rien à faire de plus ici */ }
  surEcriture();
  for (const f of ecouteurs) f();
}

// main.js branche ici sa synchronisation (marqueChange) : ce module n'en sait rien.
export function brancheEcriture(f) { surEcriture = f; }
export function surChangement(f) { ecouteurs.add(f); }

export const toutes = () => cartes;
export const carte = (id) => cartes[id] || null;
export const exemplaires = (id) => cartes[id]?.ex?.length || 0;
export const possede = (id) => exemplaires(id) > 0;

// Une variante de cette carte est-elle possédée ? (master set)
export const possedeVariante = (id, v) => !!cartes[id]?.ex?.some((x) => x.v === v);

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// `fiche` : ce que l'on sait de la carte au moment de l'ajout (TCGdex), recopié pour
// que la collection s'affiche HORS LIGNE — nom, image, extension — sans redemander.
export function ajoute(fiche, variante = 'normal', { langue = 'FR', etat = 'Neuf' } = {}) {
  const id = fiche.id;
  const c = cartes[id] || (cartes[id] = { ex: [], fav: false });
  for (const k of ['n', 'img', 'set', 'setN', 'serie', 'num', 'rar', 'dex']) {
    if (fiche[k] != null) c[k] = fiche[k];
  }
  c.ex.push({ v: variante, l: langue, e: etat, d: aujourdhui() });
  ecrire();
  return c;
}

// Retire UN exemplaire de cette variante (le dernier ajouté). Une carte sans plus
// aucun exemplaire quitte la collection, sauf si elle est en favori : on peut vouloir
// garder un œil sur une carte qu'on n'a plus.
export function retire(id, variante) {
  const c = cartes[id];
  if (!c) return;
  for (let i = c.ex.length - 1; i >= 0; i--) {
    if (!variante || c.ex[i].v === variante) { c.ex.splice(i, 1); break; }
  }
  if (!c.ex.length && !c.fav) delete cartes[id];
  ecrire();
}

export function basculeFavori(fiche) {
  const c = cartes[fiche.id] || (cartes[fiche.id] = { ex: [], fav: false, n: fiche.n, img: fiche.img, set: fiche.set, setN: fiche.setN, num: fiche.num });
  c.fav = !c.fav;
  if (!c.fav && !c.ex.length) delete cartes[fiche.id];
  ecrire();
  return !!cartes[fiche.id]?.fav;
}

export function notePrix(id, tendance, maj = new Date().toISOString()) {
  const c = cartes[id];
  if (!c || !(tendance > 0)) return;
  c.prix = { t: Math.round(tendance * 100) / 100, maj };
  ecrire();
}

// Le résumé qu'affichent l'accueil et l'onglet Cartes.
export function stats() {
  let distinctes = 0, nbEx = 0, valeur = 0, favoris = 0;
  for (const c of Object.values(cartes)) {
    const n = c.ex?.length || 0;
    if (n) distinctes++;
    nbEx += n;
    if (c.fav) favoris++;
    if (c.prix?.t) valeur += c.prix.t * n;
  }
  return { distinctes, exemplaires: nbEx, valeur: Math.round(valeur * 100) / 100, favoris };
}

// Les dernières cartes ajoutées, de la plus récente à la plus ancienne.
export function dernieres(n = 10) {
  return Object.entries(cartes)
    .filter(([, c]) => c.ex?.length)
    .map(([id, c]) => ({ id, c, d: c.ex[c.ex.length - 1].d }))
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0))
    .slice(0, n);
}

// Pour la sauvegarde et la synchronisation : la collection telle quelle, et sa reprise.
export const exporte = () => cartes;
export function remplace(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  cartes = v;
  ecrire();
  return true;
}
