// TCGdex — la base de données des cartes, la même que celle de Cartodex.
//
// Le monde des jeux est entièrement embarqué ; celui des cartes ne peut pas l'être :
// plus de 20 000 cartes et leurs images. On interroge donc TCGdex, mais tout ce qui
// revient est GARDÉ (IndexedDB) : une extension déjà ouverte se rouvre instantanément,
// et se rouvre HORS LIGNE avec ce qu'on en savait. Une donnée périmée vaut mieux
// qu'une erreur : sans réseau, on rend la copie, même ancienne.
//
// Une requête en cours n'est jamais doublée (`enVol`), et le détail des cartes passe
// par une file de quatre requêtes à la fois — TCGdex est un service gratuit, on y va
// poliment.

// La langue des DONNÉES suit celle de l'appli : français en français, anglais sinon —
// TCGdex japonais décrit d'autres extensions, sous d'autres identifiants, et la
// collection ne se retrouverait plus. Les identifiants des cartes internationales sont
// les mêmes en français et en anglais : changer de langue ne perd rien.
let LANGUE = 'fr';
export function poseLangue(l) { LANGUE = l === 'fr' ? 'fr' : 'en'; }
export const langueDonnees = () => LANGUE;
const base = () => `https://api.tcgdex.net/v2/${LANGUE}`;
// La clé de cache porte la langue : un nom français ne doit pas ressortir en anglais.
const cleDe = (chemin) => `${LANGUE}${chemin}`;
const JOUR = 864e5;

// ---------------------------------------------------------------- cache IndexedDB
const BD = 'unydex-cartes';
const MAGASIN = 'cache';
let bdPromesse = null;
function bd() {
  if (!bdPromesse) {
    bdPromesse = new Promise((ok, ko) => {
      const r = indexedDB.open(BD, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    }).catch(() => null); // navigation privée, stockage refusé : on vit sans cache disque
  }
  return bdPromesse;
}
async function litCache(cle) {
  const d = await bd();
  if (!d) return null;
  return new Promise((ok) => {
    try {
      const q = d.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).get(cle);
      q.onsuccess = () => ok(q.result || null);
      q.onerror = () => ok(null);
    } catch { ok(null); }
  });
}
async function ecritCache(cle, v) {
  const d = await bd();
  if (!d) return;
  try { d.transaction(MAGASIN, 'readwrite').objectStore(MAGASIN).put({ t: Date.now(), v }, cle); } catch { /* plein : tant pis */ }
}

const memoire = new Map();   // cle -> { t, v }
const enVol = new Map();     // cle -> promesse

// Lit un chemin de l'API, en le gardant. `age` : au-delà, on retente le réseau (mais
// on rend l'ancienne copie s'il ne répond pas).
async function lis(chemin, age) {
  const cle = cleDe(chemin);
  const frais = (e) => e && Date.now() - e.t < age;
  const m = memoire.get(cle);
  if (frais(m)) return m.v;
  if (enVol.has(cle)) return enVol.get(cle);
  const p = (async () => {
    const disque = m || await litCache(cle);
    if (frais(disque)) { memoire.set(cle, disque); return disque.v; }
    try {
      const r = await fetch(base() + chemin);
      if (!r.ok) throw new Error(String(r.status));
      const v = await r.json();
      const e = { t: Date.now(), v };
      memoire.set(cle, e);
      ecritCache(cle, v);
      return v;
    } catch (err) {
      if (disque) { memoire.set(cle, disque); return disque.v; }
      throw err;
    }
  })().finally(() => enVol.delete(cle));
  enVol.set(cle, p);
  return p;
}

// Ce qu'on sait déjà, SANS réseau (ou null) : pour afficher tout de suite.
export async function dejaConnu(chemin) {
  const cle = cleDe(chemin);
  const m = memoire.get(cle) || await litCache(cle);
  if (m) memoire.set(cle, m);
  return m ? m.v : null;
}
export const connuEnMemoire = (chemin) => memoire.get(cleDe(chemin))?.v ?? null;

// ---------------------------------------------------------------- l'API
export const series = () => lis('/series', 7 * JOUR);
export const serie = (id) => lis(`/series/${encodeURIComponent(id)}`, 7 * JOUR);
export const extension = (id) => lis(`/sets/${encodeURIComponent(id)}`, 3 * JOUR);
// Le détail d'une carte : rareté, variantes, Pokémon représentés, prix. Le prix bouge
// chaque jour, le reste jamais : `pourPrix` raccourcit la durée de garde à un jour.
export const carte = (id, { pourPrix = false } = {}) =>
  lis(`/cards/${encodeURIComponent(id)}`, pourPrix ? JOUR : 30 * JOUR);
export const cherche = (nom) => lis(`/cards?name=${encodeURIComponent(nom)}`, JOUR / 24);
export const parPokedex = (num) => lis(`/cards?dexId=eq:${Number(num)}`, 7 * JOUR);
export const cheminCarte = (id) => `/cards/${encodeURIComponent(id)}`;

// ---------------------------------------------------------------- file des détails
// Quatre requêtes à la fois au plus ; les demandes en trop attendent leur tour.
const file = [];
let actives = 0;
function suivant() {
  while (actives < 4 && file.length) {
    const { id, pourPrix, ok, ko } = file.shift();
    actives++;
    carte(id, { pourPrix }).then(ok, ko).finally(() => { actives--; suivant(); });
  }
}
// `pourPrix` : le relevé du jour est voulu (actualisation des prix) — un détail déjà en
// mémoire mais vieux de plus d'un jour repasse alors par le réseau.
export function carteEnFile(id, { pourPrix = false } = {}) {
  const connu = connuEnMemoire(cheminCarte(id));
  if (connu && !pourPrix) return Promise.resolve(connu);
  return new Promise((ok, ko) => { file.push({ id, pourPrix, ok, ko }); suivant(); });
}
// Abandonner ce qui attend encore (on a quitté l'extension).
export function videFile() { file.length = 0; }

// ---------------------------------------------------------------- images
// TCGdex publie l'image sans extension : on choisit la qualité et le format.
// Sans image (cartes très anciennes, promos), un dos de carte dessiné.
export const DOS = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140">'
  + '<rect width="100" height="140" rx="7" fill="#1a2336"/>'
  + '<rect x="5" y="5" width="90" height="130" rx="5" fill="none" stroke="#34497e" stroke-width="2"/>'
  + '<circle cx="50" cy="70" r="20" fill="#fff"/><path d="M30 70a20 20 0 0 1 40 0z" fill="#dc2626"/>'
  + '<path d="M30 70h40" stroke="#1a2336" stroke-width="4"/>'
  + '<circle cx="50" cy="70" r="6" fill="#fff" stroke="#1a2336" stroke-width="3"/></svg>');
export const image = (base, qualite = 'low') => (base ? `${base}/${qualite}.webp` : DOS);
// Logos et symboles d'extension : TCGdex les sert aussi sans extension. Les logos
// existent en WebP ; les symboles n'existent QU'EN PNG (le WebP répond 400).
export const logo = (base) => (base ? `${base}.webp` : '');
export const symbole = (base) => (base ? `${base}.png` : '');
