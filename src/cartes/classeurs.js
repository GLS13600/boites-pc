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
//     couleur: teinte de la couverture et des pages (COULEURS),
//     logo:    extension dont le logo orne la couverture ('' : aucune),
//     set, mise : extension et disposition d'un classeur préparé (voir vues),
//     cartes:  [pochette],
//     prix:    { idCarte: prix } relevés à la préparation — la valeur « complète »,
//   }
//   pochette : null (vide) | 'idCarte' | 'idCarte|variante' | ['idCarte|variante', …]
//
// `localStorage` est la source de vérité, comme pour le reste ; l'écriture prévient la
// synchronisation, et la sauvegarde emporte les classeurs.

const CLE = 'pcbox.classeurs';
export const POCHES = [4, 9, 12];
export const COULEURS = ['nuit', 'rouge', 'vert', 'bleu', 'violet', 'or'];

let liste = lire();
let surEcriture = () => {};
const ecouteurs = new Set();

function lire() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE));
    return Array.isArray(v) ? (assainit(v) || []) : [];
  } catch { return []; }
}
function ecrire() {
  try { localStorage.setItem(CLE, JSON.stringify(liste)); } catch { /* quota */ }
  surEcriture();
  for (const f of ecouteurs) f();
}
export function brancheEcriture(f) { surEcriture = f; }
export function surChangement(f) { ecouteurs.add(f); }

export const tous = () => liste;
export const classeur = (id) => liste.find((c) => c.id === id) || null;

// Les clés d'une pochette, une par carte qu'elle contient.
export const clesPoche = (p) => (p == null ? [] : Array.isArray(p) ? p : [p]);
export const idDe = (cle) => String(cle).split('|')[0];
export const varianteDe = (cle) => String(cle).split('|')[1] || null;

export function cree({ nom, poches = 9, couleur = 'nuit', logo = '', set = '', mise = '', cartes = [], prix = {} }) {
  const c = {
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nom: String(nom || '').trim().slice(0, 60) || 'Classeur',
    poches: POCHES.includes(poches) ? poches : 9,
    couleur: COULEURS.includes(couleur) ? couleur : 'nuit',
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
  if (COULEURS.includes(patch.couleur)) c.couleur = patch.couleur;
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
export function range(id, depuis, cles) {
  const c = classeur(id);
  if (!c || !cles.length) return;
  let i = Math.max(0, depuis);
  for (const cle of cles) {
    while (c.cartes[i] != null) i++;
    while (c.cartes.length < i) c.cartes.push(null);
    c.cartes[i] = cle;
    i++;
  }
  ecrire();
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
export function ajouteTous(v) {
  const propres = assainit(v) || [];
  let n = 0;
  for (const c of propres) {
    if (classeur(c.id)) continue;
    liste.push(c);
    n++;
  }
  if (n) ecrire();
  return n;
}
export const exporte = () => liste;
export function remplace(v) {
  const propre = assainit(v);
  if (!propre) return false;
  liste = propre;
  ecrire();
  return true;
}

// Repris champ par champ : ce qui vient d'un fichier ou du compte finit dans des
// attributs HTML et des URL. Même règle que la collection.
const ID_CARTE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}(\|[a-z_]{1,24})?$/;
const ID_SET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const pocheSure = (p) => {
  if (p == null) return null;
  if (Array.isArray(p)) {
    const l = p.filter((x) => typeof x === 'string' && ID_CARTE.test(x)).slice(0, 8);
    return l.length ? l : null;
  }
  return typeof p === 'string' && ID_CARTE.test(p) ? p : null;
};
export function assainit(v) {
  if (!Array.isArray(v)) return null;
  const vus = new Set();
  const sortie = [];
  for (const c of v.slice(0, 200)) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(c.id) || vus.has(c.id)) continue;
    vus.add(c.id);
    const prix = {};
    if (c.prix && typeof c.prix === 'object') {
      for (const [k, p] of Object.entries(c.prix)) if (ID_SET.test(k) && p > 0 && p < 1e6) prix[k] = Math.round(p * 100) / 100;
    }
    sortie.push({
      id: c.id,
      nom: typeof c.nom === 'string' ? c.nom.slice(0, 60) : 'Classeur',
      poches: POCHES.includes(c.poches) ? c.poches : 9,
      couleur: COULEURS.includes(c.couleur) ? c.couleur : 'nuit',
      logo: typeof c.logo === 'string' && ID_SET.test(c.logo) ? c.logo : '',
      set: typeof c.set === 'string' && ID_SET.test(c.set) ? c.set : '',
      mise: ['simple', 'master', 'groupe'].includes(c.mise) ? c.mise : '',
      cartes: (Array.isArray(c.cartes) ? c.cartes : []).slice(0, 5000).map(pocheSure),
      prix,
    });
  }
  return sortie;
}
