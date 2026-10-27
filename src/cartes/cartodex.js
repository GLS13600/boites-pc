// Reprendre une sauvegarde de Cartodex — l'appli de cartes fondue dans Unydex.
//
// Cartodex gardait sa collection sous `myFrenchPokeCollection` et ses classeurs sous
// `myPokeClasseurs`, et son compte les envoyait ensemble : { cards, classeurs,
// classeurFavorites }. On accepte les trois écritures — le paquet du compte, les deux
// clés de son stockage, ou la collection seule — et on les traduit dans le modèle
// d'Unydex. Le résultat repasse ensuite par `assainit` de collection.js et de
// classeurs.js, comme tout ce qui vient d'un fichier.
//
//   carte Cartodex : { name | nameFr | nameEn, image, exemplars: [{ variant, lang,
//                      state, dateAdded ('jj/mm/aaaa'), qty? }], isFavorite, trendPrice }
//   classeur       : { name, pocketsPerPage, logoId, presetSetId, presetLayout,
//                      cards: [null | 'id' | 'id:variante' | […]], prices }

import { cleEtat } from './regles.js';

// Les variantes de Cartodex, dans le vocabulaire d'Unydex.
const VARIANTE = {
  normal: 'normal', holo: 'holo', reverse: 'reverse', premiere: 'premiere', firstedition: 'premiere',
  pokeball: 'reverse_pokeball', reverse_pokeball: 'reverse_pokeball',
  masterball: 'reverse_masterball', reverse_masterball: 'reverse_masterball',
};
const LANGUES = new Set(['FR', 'EN', 'JP']);
const MISE = { fullset: 'simple', masterset: 'groupe', masterset_complet: 'master' };

// « 12/03/2025 » (date française de Cartodex) → « 2025-03-12 ».
function dateIso(x) {
  const s = String(x || '');
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

const ressembleCollection = (o) => o && typeof o === 'object' && !Array.isArray(o)
  && Object.values(o).some((c) => c && Array.isArray(c.exemplars));

// La collection et les classeurs d'un fichier Cartodex, ou null si ce n'en est pas un.
export function lisCartodex(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const cartesBrutes = ressembleCollection(data.cards) ? data.cards
    : ressembleCollection(data.myFrenchPokeCollection) ? data.myFrenchPokeCollection
    : ressembleCollection(data) ? data : null;
  const classeursBruts = data.classeurs && typeof data.classeurs === 'object' && !Array.isArray(data.classeurs) ? data.classeurs
    : data.myPokeClasseurs && typeof data.myPokeClasseurs === 'object' ? data.myPokeClasseurs : null;
  // Un fichier d'Unydex porte aussi `cartes` et `classeurs`, mais jamais d'`exemplars` :
  // on ne le prend pas pour un Cartodex.
  if (!cartesBrutes && !(classeursBruts && Object.values(classeursBruts).some((c) => c && Array.isArray(c.cards)))) return null;

  const cartes = {};
  for (const [id, c] of Object.entries(cartesBrutes || {})) {
    if (!c || typeof c !== 'object') continue;
    const ex = [];
    for (const x of Array.isArray(c.exemplars) ? c.exemplars : []) {
      const v = VARIANTE[String(x?.variant || 'normal').toLowerCase()] || 'normal';
      const l = LANGUES.has(String(x?.lang || '').toUpperCase()) ? String(x.lang).toUpperCase() : 'FR';
      const fois = Math.min(99, Math.max(1, Number(x?.qty) || 1));
      for (let k = 0; k < fois; k++) ex.push({ v, l, e: cleEtat(x?.state), d: dateIso(x?.dateAdded) });
    }
    const fav = c.isFavorite === true;
    if (!ex.length && !fav) continue;
    const i = String(id).lastIndexOf('-');
    const entree = {
      ex, fav,
      n: c.nameFr || c.name || c.nameEn || undefined,
      img: typeof c.image === 'string' ? c.image.replace(/\/(low|high)\.(webp|png|jpg)$/, '') : undefined,
      set: i > 0 ? String(id).slice(0, i) : undefined,
      num: i > 0 ? String(id).slice(i + 1) : undefined,
    };
    const p = parseFloat(c.trendPrice);
    if (p > 0) entree.prix = { t: Math.round(p * 100) / 100, maj: new Date().toISOString() };
    cartes[id] = entree;
  }

  const classeurs = [];
  for (const [cle, c] of Object.entries(classeursBruts || {})) {
    if (!c || typeof c !== 'object' || !Array.isArray(c.cards)) continue;
    const poche = (p) => {
      if (p == null || p === '') return null;
      if (Array.isArray(p)) { const l = p.map(poche).filter(Boolean).flat(); return l.length ? l : null; }
      const [idc, v] = String(p).split(':');
      const va = v ? VARIANTE[v.toLowerCase()] : null;
      return va ? `${idc}|${va}` : idc;
    };
    const ppp = Number(c.pocketsPerPage);
    classeurs.push({
      id: String(c.id || cle).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || `cdx${classeurs.length}`,
      nom: c.name || 'Classeur',
      poches: ppp === 4 || ppp === 9 || ppp === 12 ? ppp : ppp > 12 ? 12 : 9,
      couleur: 'nuit',
      logo: c.logoId || c.presetSetId || '',
      set: c.presetSetId || '',
      mise: MISE[c.presetLayout] || '',
      cartes: c.cards.map(poche),
      prix: c.prices && typeof c.prices === 'object' ? c.prices : {},
    });
  }
  return { cartes, classeurs };
}
