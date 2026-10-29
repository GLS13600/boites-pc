// Les classeurs — l'héritage de Cartodex : des pages de pochettes où l'on range ses
// cartes comme dans un vrai classeur.
//
// Un classeur ne POSSÈDE rien : il range des emplacements, et la collection dit ce
// qu'on a. Une pochette dont on n'a pas la carte reste à sa place, en gris — c'est
// tout l'intérêt d'un classeur d'extension qu'on remplit peu à peu. Une pochette vide
// est une place libre.
//
//   {
//     id, nom,
//     poches:  4 | 9 | 12 par page,
//     couleur: teinte de la couverture et des pages — une des COULEURS dessinées, ou
//              une couleur libre de la roue chromatique (#rrggbb, 28/10/2026),
//     pages:   couleur des pages choisie à part (#rrggbb ; '' : celle du classeur),
//     logo:    extension dont le logo orne la couverture ('' : aucune),
//     set, mise : extension et disposition d'un classeur préparé (voir vues),
//     cartes:  [pochette],
//     prix:    { idCarte: prix } relevés à la préparation — la valeur « complète »,
//   }
//   pochette : null (vide) | 'idCarte' | 'idCarte|variante' | ['idCarte|variante', …]
//
// `localStorage` est la source de vérité, comme pour le reste ; l'écriture prévient la
// synchronisation, et la sauvegarde emporte les classeurs.

import { HEX } from './couleurs.js';

// Deux listes, française et anglaise (28/10/2026), comme les deux collections : une
// seule ACTIVE à la fois (`changeLangue`). Les couleurs favorites sont communes.
const CLES = { fr: 'pcbox.classeurs', en: 'pcbox.classeurs.en' };
const langueSure = (l) => (l === 'en' ? 'en' : 'fr');
let langue = 'fr';
const CLE_FAVORIS = 'pcbox.classeurs.couleurs';
export const POCHES = [4, 9, 12];
export const COULEURS = ['nuit', 'rouge', 'vert', 'bleu', 'violet', 'or'];
const couleurAdmise = (x) => COULEURS.includes(x) || (typeof x === 'string' && HEX.test(x));
const pagesAdmises = (x) => typeof x === 'string' && HEX.test(x);
// Les couleurs favorites, communes à tous les classeurs : une palette de couleurs de la
// roue, pour les retrouver d'un classeur à l'autre. Elles partent avec le compte.
const FAVORIS_MAX = 18;

// Le filtre de ce qui vient de l'extérieur (voir `assainit`), déclaré AVANT la lecture
// du stockage : `lire()` s'en sert dès le chargement du module. Déclaré en fin de
// fichier, il n'existait pas encore à ce moment-là — `assainit` levait une erreur que
// `lire()` avalait, et la liste repartait VIDE à chaque lancement (corrigé le
// 28/10/2026). La modification suivante écrasait alors les classeurs pour de bon, sur
// l'appareil comme dans le compte.
// Une carte : `!` et `%` compris, pour `exu-!` et `exu-%3F` (Zarbi « ! » et « ? »),
// comme dans collection.js. Une extension n'en a jamais.
const ID = /^[A-Za-z0-9][A-Za-z0-9._!%-]{0,63}$/;
const ID_CARTE = /^[A-Za-z0-9][A-Za-z0-9._!%-]{0,63}(\|[a-z_]{1,24})?$/;
const ID_SET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const pocheSure = (p) => {
  if (p == null) return null;
  if (Array.isArray(p)) {
    const l = p.filter((x) => typeof x === 'string' && ID_CARTE.test(x)).slice(0, 8);
    return l.length ? l : null;
  }
  return typeof p === 'string' && ID_CARTE.test(p) ? p : null;
};

let liste = lire('fr');
let surEcriture = () => {};
const ecouteurs = new Set();

function lire(l) {
  const CLE = CLES[langueSure(l)];
  let brut = null;
  try {
    brut = localStorage.getItem(CLE);
    const v = JSON.parse(brut);
    return Array.isArray(v) ? (assainit(v) || []) : [];
  } catch (e) {
    // Illisible : la prochaine écriture remplacerait le stockage. On met le contenu de
    // côté (`pcbox.classeurs.secours`) et on le DIT, plutôt que de repartir à vide en
    // silence — c'est ce silence qui a fait perdre des classeurs.
    console.error('classeurs illisibles, copie gardée dans pcbox.classeurs.secours', e);
    try { if (brut) localStorage.setItem(`${CLE}.secours`, brut); } catch { /* quota */ }
    return [];
  }
}
function ecrire() {
  try { localStorage.setItem(CLES[langue], JSON.stringify(liste)); } catch { /* quota */ }
  surEcriture();
  for (const f of ecouteurs) f();
}

export const langueActive = () => langue;
export function changeLangue(l) {
  l = langueSure(l);
  if (l === langue) return;
  langue = l;
  liste = lire(l);
  for (const f of ecouteurs) f();
}
// Pour la sauvegarde et le compte : les classeurs d'une langue, active ou non.
export const exporteLangue = (l) => (langueSure(l) === langue ? liste : lire(l));
export function remplaceLangue(l, v) {
  l = langueSure(l);
  if (l === langue) return remplace(v);
  const propre = assainit(v);
  if (!propre) return false;
  try { localStorage.setItem(CLES[l], JSON.stringify(propre)); } catch { /* quota */ }
  surEcriture();
  return true;
}
export function brancheEcriture(f) { surEcriture = f; }
export function surChangement(f) { ecouteurs.add(f); }

export const tous = () => liste;
export const classeur = (id) => liste.find((c) => c.id === id) || null;

// Les clés d'une pochette, une par carte qu'elle contient.
export const clesPoche = (p) => (p == null ? [] : Array.isArray(p) ? p : [p]);
export const idDe = (cle) => String(cle).split('|')[0];
export const varianteDe = (cle) => String(cle).split('|')[1] || null;

export function cree({ nom, poches = 9, couleur = 'nuit', pages = '', logo = '', set = '', mise = '', cartes = [], prix = {} }) {
  const c = {
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nom: String(nom || '').trim().slice(0, 60) || 'Classeur',
    poches: POCHES.includes(poches) ? poches : 9,
    couleur: couleurAdmise(couleur) ? couleur : 'nuit',
    pages: pagesAdmises(pages) ? pages : '',
    logo: logo || '',
    set: set || '',
    mise: mise || '',
    cartes,
    prix,
  };
  liste.push(c);
  ecrire();
  return c;
}

export function modifie(id, patch) {
  const c = classeur(id);
  if (!c) return;
  if (patch.nom != null) c.nom = String(patch.nom).trim().slice(0, 60) || c.nom;
  if (POCHES.includes(patch.poches)) c.poches = patch.poches;
  if (couleurAdmise(patch.couleur)) c.couleur = patch.couleur;
  if (patch.pages === '' || pagesAdmises(patch.pages)) c.pages = patch.pages;
  if (patch.logo != null) c.logo = patch.logo;
  ecrire();
}

export function supprime(id) {
  liste = liste.filter((c) => c.id !== id);
  ecrire();
}

// « Annuler » : un classeur supprimé revient à sa place, des pochettes vidées
// retrouvent leurs cartes.
export function restaure(c, index) {
  if (!c || classeur(c.id)) return;
  liste.splice(Math.min(Math.max(0, index), liste.length), 0, c);
  ecrire();
}
export function remetCartes(id, cartes) {
  const c = classeur(id);
  if (!c || !Array.isArray(cartes)) return;
  c.cartes = cartes;
  ecrire();
}

// Avance ou recule un classeur d'un rang dans la liste.
export function deplace(id, dir) {
  const i = liste.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= liste.length) return;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  ecrire();
}

// Range des cartes à partir d'une pochette : chacune prend la première pochette VIDE à
// partir de là, et le classeur s'allonge au besoin. On ne pousse jamais une carte déjà
// rangée — dans un vrai classeur, on ne décale pas toutes les pages pour en glisser une.
export function range(id, depuis, cles, prix = null) {
  const c = classeur(id);
  if (!c || !cles.length) return;
  let i = Math.max(0, depuis);
  for (const cle of cles) {
    while (c.cartes[i] != null) i++;
    while (c.cartes.length < i) c.cartes.push(null);
    c.cartes[i] = cle;
    i++;
  }
  // Une extension rangée dans un classeur déjà commencé apporte ses prix : la valeur
  // « complète » les compte, comme ceux relevés à la création.
  if (prix) {
    c.prix ||= {};
    for (const [k, p] of Object.entries(prix)) if (ID.test(k) && p > 0 && p < 1e6) c.prix[k] = Math.round(p * 100) / 100;
  }
  ecrire();
}

// Glisser-déposer (appui long, comme dans les boîtes) : la carte prend la pochette visée.
// Pleine, les deux échangent ; libre, la carte s'y installe et laisse sa place vide. Rien
// d'autre ne bouge — dans un vrai classeur, on ne décale pas les pages.
export function echange(id, i, j) {
  const c = classeur(id);
  if (!c || i === j || i < 0 || j < 0) return;
  while (c.cartes.length <= Math.max(i, j)) c.cartes.push(null);
  [c.cartes[i], c.cartes[j]] = [c.cartes[j], c.cartes[i]];
  while (c.cartes.length && c.cartes[c.cartes.length - 1] == null) c.cartes.pop();
  ecrire();
}

// Renomme des clés de pochette dans tous les classeurs (`fn` rend la clé neuve, ou la
// même) : une seule écriture pour tout. Sert à ranger les variantes (« holo » d'une
// carte spéciale → « normal », voir regles.js). Rend vrai si quelque chose a changé.
export function renommeCles(fn) {
  let change = false;
  for (const c of liste) {
    c.cartes = c.cartes.map((p) => {
      if (p == null) return p;
      const cles = clesPoche(p).map((k) => { const n = fn(k); if (n !== k) change = true; return n; });
      return Array.isArray(p) ? cles : cles[0];
    });
  }
  if (change) ecrire();
  return change;
}

// Vide des pochettes : elles restent à leur place, libres.
export function vide(id, indices) {
  const c = classeur(id);
  if (!c) return;
  for (const i of indices) if (i >= 0 && i < c.cartes.length) c.cartes[i] = null;
  while (c.cartes.length && c.cartes[c.cartes.length - 1] == null) c.cartes.pop();
  ecrire();
}

// Déplace des pochettes vers une autre position : on les retire, puis on les range à
// partir de la pochette visée (sans écraser ce qui s'y trouve déjà).
export function deplacePoches(id, indices, vers) {
  const c = classeur(id);
  if (!c || !indices.length) return;
  const tries = [...indices].sort((a, b) => a - b);
  const contenus = tries.map((i) => c.cartes[i]).filter((p) => p != null);
  for (const i of tries) c.cartes[i] = null;
  let k = Math.max(0, vers);
  for (const p of contenus) {
    while (c.cartes[k] != null) k++;
    while (c.cartes.length < k) c.cartes.push(null);
    c.cartes[k] = p;
    k++;
  }
  while (c.cartes.length && c.cartes[c.cartes.length - 1] == null) c.cartes.pop();
  ecrire();
}

// ---------------------------------------------------------------- sauvegarde
// Ajoute des classeurs venus d'ailleurs (Cartodex) sans toucher aux siens : un
// identifiant déjà présent est laissé de côté. Rend le nombre de classeurs ajoutés.
export function ajouteTous(v, l = langue) {
  const propres = assainit(v) || [];
  const cible = langueSure(l) === langue ? liste : lire(l);
  let n = 0;
  for (const c of propres) {
    if (cible.some((x) => x.id === c.id)) continue;
    cible.push(c);
    n++;
  }
  if (!n) return 0;
  if (cible === liste) ecrire();
  else { try { localStorage.setItem(CLES[langueSure(l)], JSON.stringify(cible)); } catch { /* quota */ } surEcriture(); }
  return n;
}
export const exporte = () => liste;

// ---------------------------------------------------------------- couleurs favorites
export function favoris() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_FAVORIS));
    return Array.isArray(v) ? v.filter(pagesAdmises).slice(0, FAVORIS_MAX) : [];
  } catch { return []; }
}
function ecritFavoris(l) {
  try { localStorage.setItem(CLE_FAVORIS, JSON.stringify(l)); } catch { /* quota */ }
  surEcriture();
}
// Ajoute ou retire une couleur ; la plus récente en tête. Rend vrai si elle est favorite.
export function basculeFavori(hex) {
  if (!pagesAdmises(hex)) return false;
  const l = favoris();
  if (l.includes(hex)) { ecritFavoris(l.filter((x) => x !== hex)); return false; }
  ecritFavoris([hex, ...l].slice(0, FAVORIS_MAX));
  return true;
}
// Reprise depuis un fichier ou le compte : seules des couleurs #rrggbb passent.
export function remetFavoris(v) {
  if (!Array.isArray(v)) return;
  ecritFavoris([...new Set(v.filter(pagesAdmises))].slice(0, FAVORIS_MAX));
}
export function remplace(v) {
  const propre = assainit(v);
  if (!propre) return false;
  liste = propre;
  ecrire();
  return true;
}

// Repris champ par champ : ce qui vient d'un fichier ou du compte finit dans des
// attributs HTML et des URL. Même règle que la collection. (Le filtre est déclaré en
// tête du module : `lire()` s'en sert dès le chargement.)
export function assainit(v) {
  if (!Array.isArray(v)) return null;
  const vus = new Set();
  const sortie = [];
  for (const c of v.slice(0, 200)) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(c.id) || vus.has(c.id)) continue;
    vus.add(c.id);
    const prix = {};
    if (c.prix && typeof c.prix === 'object') {
      for (const [k, p] of Object.entries(c.prix)) if (ID.test(k) && p > 0 && p < 1e6) prix[k] = Math.round(p * 100) / 100;
    }
    sortie.push({
      id: c.id,
      nom: typeof c.nom === 'string' ? c.nom.slice(0, 60) : 'Classeur',
      poches: POCHES.includes(c.poches) ? c.poches : 9,
      couleur: couleurAdmise(c.couleur) ? c.couleur : 'nuit',
      pages: pagesAdmises(c.pages) ? c.pages : '',
      logo: typeof c.logo === 'string' && ID_SET.test(c.logo) ? c.logo : '',
      set: typeof c.set === 'string' && ID_SET.test(c.set) ? c.set : '',
      mise: ['simple', 'master', 'groupe'].includes(c.mise) ? c.mise : '',
      cartes: (Array.isArray(c.cartes) ? c.cartes : []).slice(0, 5000).map(pocheSure),
      prix,
    });
  }
  return sortie;
}
