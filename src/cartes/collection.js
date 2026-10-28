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
//     typ:  types d'énergie de la carte (filtre de la collection),
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

import { cleEtat } from './regles.js';

const CLE = 'pcbox.cartes';
const CLE_VALEURS = 'pcbox.cartes.valeurs';

let cartes = lire();
let surEcriture = () => {};
const ecouteurs = new Set();
// Écritures différées le temps d'un lot (sélection multiple) : cent cartes ajoutées
// d'un coup font UNE écriture, pas cent sérialisations de toute la collection.
let differe = 0;
let sale = false;

function lire() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

function ecrire() {
  if (differe) { sale = true; return; }
  try { localStorage.setItem(CLE, JSON.stringify(cartes)); } catch { /* quota : rien à faire de plus ici */ }
  surEcriture();
  for (const f of ecouteurs) f();
}

// Exécute `f` en ne gardant qu'une écriture à la fin.
export function lot(f) {
  differe++;
  try { return f(); } finally {
    differe--;
    if (!differe && sale) { sale = false; ecrire(); }
  }
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
export const exemplairesVariante = (id, v) => cartes[id]?.ex?.filter((x) => x.v === v).length || 0;

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// `fiche` : ce que l'on sait de la carte au moment de l'ajout (TCGdex), recopié pour
// que la collection s'affiche HORS LIGNE — nom, image, extension — sans redemander.
export function ajoute(fiche, variante = 'normal', { langue = 'FR', etat = 'neuf' } = {}) {
  const id = fiche.id;
  const c = cartes[id] || (cartes[id] = { ex: [], fav: false });
  for (const k of ['n', 'img', 'set', 'setN', 'serie', 'num', 'rar', 'typ', 'dex']) {
    if (fiche[k] != null) c[k] = fiche[k];
  }
  c.ex.push({ v: variante, l: langue, e: etat, d: aujourdhui() });
  ecrire();
  return c;
}

// Retire UN exemplaire (le dernier ajouté) de cette variante — et, si on les précise,
// de cette langue et de cet état : la fiche regroupe les exemplaires identiques, et
// son « − » doit retirer dans le bon groupe. Une carte sans plus aucun exemplaire
// quitte la collection, sauf si elle est en favori : on peut vouloir garder un œil
// sur une carte qu'on n'a plus.
export function retire(id, variante, { langue, etat } = {}) {
  const c = cartes[id];
  if (!c) return;
  for (let i = c.ex.length - 1; i >= 0; i--) {
    const x = c.ex[i];
    // L'état se compare par sa CLÉ : les exemplaires repris de Cartodex l'écrivent en
    // toutes lettres (« Très Bon »), les nouveaux par sa clé (« tres_bon »).
    if ((!variante || x.v === variante) && (!langue || x.l === langue) && (!etat || cleEtat(x.e) === cleEtat(etat))) {
      c.ex.splice(i, 1);
      break;
    }
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

// Le prix d'une carte POSSÉDÉE, relevé à l'ouverture de sa fiche ou par la mise à
// jour de la collection. N'écrit que s'il a changé ou date de plus d'un jour : une
// écriture part vers le compte, inutile de renvoyer la collection pour rien.
export function notePrix(id, valeur, maj = new Date().toISOString()) {
  const c = cartes[id];
  if (!c || !(valeur > 0)) return;
  const v = Math.round(valeur * 100) / 100;
  if (c.prix && c.prix.t === v && Date.now() - Date.parse(c.prix.maj) < 864e5) return;
  c.prix = { t: v, maj };
  ecrire();
}

// Ce que la fiche apprend d'une carte déjà possédée (nom, rareté, Pokémon) est recopié :
// la collection s'affiche hors ligne, sans redemander. N'écrit que ce qui a changé.
export function complete(id, fiche) {
  const c = cartes[id];
  if (!c) return;
  let change = false;
  for (const k of ['n', 'img', 'set', 'setN', 'serie', 'num', 'rar', 'typ', 'dex']) {
    if (fiche[k] != null && JSON.stringify(c[k]) !== JSON.stringify(fiche[k])) { c[k] = fiche[k]; change = true; }
  }
  if (change) ecrire();
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
  const propre = assainit(v);
  if (!propre) return false;
  cartes = propre;
  ecrire();
  return true;
}

// Ajoute ce que l'on n'a pas encore, sans toucher à ce qu'on a : une carte déjà dans
// la collection garde ses exemplaires. Sert à reprendre une sauvegarde de Cartodex.
// Rend le nombre de cartes ajoutées.
export function fusionne(v) {
  const propre = assainit(v);
  if (!propre) return 0;
  let n = 0;
  for (const [id, c] of Object.entries(propre)) {
    if (cartes[id]) continue;
    cartes[id] = c;
    n++;
  }
  if (n) ecrire();
  return n;
}

// Ce qui vient d'un FICHIER (ou du compte) est repris champ par champ : une clé qui n'a
// pas la forme d'un identifiant TCGdex est écartée, une image qui ne vient pas de
// TCGdex aussi — elles finissent dans des attributs HTML et des URL. Même règle que
// `cleAdmise` pour les Pokémon.
// `!` et `%` : les Zarbi « ! » et « ? » de la Collection Zarbi s'appellent `exu-!` et
// `exu-%3F` chez TCGdex. Ni l'un ni l'autre ne sort d'un attribut HTML ; refusés, ces
// deux cartes ne pouvaient être ni sauvegardées ni rangées dans un classeur.
const ID = /^[A-Za-z0-9][A-Za-z0-9._!%-]{0,63}$/;
// L'image vient de TCGdex, ou des visuels embarqués (public/visuels-cartes/, chemin relatif).
const IMAGE = /^(https:\/\/assets\.tcgdex\.net\/[A-Za-z0-9._/-]+|visuels-cartes\/[A-Za-z0-9._-]+)$/;
const VARIANTE = /^[a-z_]{1,24}$/;
const texte = (x, n = 120) => (typeof x === 'string' ? x.slice(0, n) : undefined);
export function assainit(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const sortie = {};
  for (const [id, c] of Object.entries(v)) {
    if (!ID.test(id) || !c || typeof c !== 'object') continue;
    const ex = (Array.isArray(c.ex) ? c.ex : [])
      .filter((x) => x && typeof x === 'object' && VARIANTE.test(String(x.v)))
      .slice(0, 999)
      .map((x) => ({
        v: x.v,
        l: ['FR', 'EN', 'JP'].includes(x.l) ? x.l : 'FR',
        e: cleEtat(x.e),
        d: /^\d{4}-\d{2}-\d{2}/.test(String(x.d)) ? String(x.d).slice(0, 10) : aujourdhui(),
      }));
    const fav = c.fav === true;
    if (!ex.length && !fav) continue;
    const e = { ex, fav };
    for (const k of ['n', 'setN', 'serie', 'num', 'rar']) { const x = texte(c[k]); if (x !== undefined) e[k] = x; }
    if (typeof c.set === 'string' && ID.test(c.set)) e.set = c.set;
    if (typeof c.img === 'string' && IMAGE.test(c.img)) e.img = c.img;
    if (Array.isArray(c.dex)) e.dex = c.dex.filter((n) => Number.isInteger(n) && n > 0 && n <= 1025).slice(0, 4);
    if (Array.isArray(c.typ)) e.typ = c.typ.filter((x) => typeof x === 'string' && x.length <= 24).slice(0, 3);
    if (c.prix && c.prix.t > 0 && c.prix.t < 1e6) e.prix = { t: Math.round(c.prix.t * 100) / 100, maj: texte(c.prix.maj, 40) || new Date().toISOString() };
    sortie[id] = e;
  }
  return sortie;
}

// ---------------------------------------------------------------- historique de la valeur
// Une valeur par jour, relevée quand on regarde la page Valeur ou qu'on actualise les
// prix : c'est ce qui permet de tracer la courbe de la collection. Elle part avec le
// compte (28/10/2026 : « toutes les données ») : un relevé prévient la synchronisation.
export function historique() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_VALEURS));
    return Array.isArray(v) ? v.filter((x) => x && typeof x.d === 'string' && x.v >= 0) : [];
  } catch { return []; }
}
export function noteValeurDuJour(valeur) {
  if (!(valeur >= 0)) return;
  const h = historique();
  const d = aujourdhui();
  const v = Math.round(valeur * 100) / 100;
  if (h.length && h[h.length - 1].d === d) {
    if (h[h.length - 1].v === v) return;
    h[h.length - 1].v = v;
  } else h.push({ d, v });
  try { localStorage.setItem(CLE_VALEURS, JSON.stringify(h.slice(-400))); } catch { /* sans gravité */ }
  surEcriture();
}
// La courbe reprise du compte, point par point (une date, une valeur positive).
export function remetHistorique(v) {
  if (!Array.isArray(v)) return;
  const h = v.filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.d)) && Number(x.v) >= 0 && Number(x.v) < 1e8)
    .map((x) => ({ d: x.d, v: Math.round(Number(x.v) * 100) / 100 })).slice(-400);
  try { localStorage.setItem(CLE_VALEURS, JSON.stringify(h)); } catch { /* sans gravité */ }
}
