// L'historique du prix d'une carte — le « suivi des prix » de Cartodex.
//
// Un point par JOUR au plus, relevé quand on regarde une carte qu'on possède ou qu'on
// actualise les prix de la collection, et gardé six mois. Le point du jour est la
// TENDANCE de Cardmarket : c'est le prix du moment, là où la valeur de la collection
// prend la moyenne sur 30 jours, plus stable.
//
// Une courbe a besoin de deux points, et Cardmarket en donne d'emblée plusieurs : ses
// moyennes sur 30, 7 et 1 jour. Cartodex les plaçait à J−30 et J−7 ; une moyenne
// sur 30 jours décrit pourtant le MILIEU de sa période, d'où J−15, J−4 et J−1 ici. Ces
// points sont marqués ESTIMÉS (`e`) et dessinés creux : les relevés réels les
// remplacent jour après jour.
//
// Donnée de marché, pas de collection : elle reste hors de la sauvegarde.

const CLE = 'pcbox.cartes.prix';
const JOUR = 864e5;
const GARDE_JOURS = 183;
const POINTS_MAX = 120;

let histo = lire();
function lire() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
function ecrire() {
  try { localStorage.setItem(CLE, JSON.stringify(histo)); } catch { /* plein : l'historique n'est qu'un confort */ }
}

const jour = (t) => new Date(t).toISOString().slice(0, 10);
const arrondi = (v) => Math.round(v * 100) / 100;
const positif = (v) => (typeof v === 'number' && v > 0 ? v : null);

// Le prix « du moment » d'un relevé Cardmarket, pour la variante voulue : la tendance,
// à défaut la moyenne d'un jour, puis de sept. Une reverse lit ses champs « -holo ».
export function prixDuJour(cm, variante) {
  if (!cm) return null;
  const s = variante && variante.startsWith('reverse') ? '-holo' : '';
  return positif(cm[`trend${s}`]) ?? positif(cm[`avg1${s}`]) ?? positif(cm[`avg7${s}`])
    ?? (s ? prixDuJour(cm) : null);
}

// Les moyennes du marché, posées au milieu de leur période : de quoi tracer une courbe
// dès la première fois qu'on regarde une carte, suivie ou non.
export function estimation(cm) {
  if (!cm) return [];
  const pts = [];
  for (const [k, j] of [['avg30', 15], ['avg7', 4], ['avg1', 1]]) {
    const v = positif(cm[k]);
    if (v) pts.push({ d: jour(Date.now() - j * JOUR), p: arrondi(v), e: 1, k });
  }
  const auj = prixDuJour(cm);
  if (auj) pts.push({ d: jour(Date.now()), p: arrondi(auj) });
  return pts;
}

// Relève le prix du jour d'une carte suivie. L'historique neuf est amorcé par les
// moyennes du marché ; le relevé du jour remplace celui du même jour.
export function notePoint(id, cm) {
  const p = prixDuJour(cm);
  if (!id || !p) return;
  const auj = jour(Date.now());
  let h = histo[id] ? histo[id].slice() : [];
  if (!h.length) h = estimation(cm).filter((x) => x.e).map(({ d, p: v, e }) => ({ d, p: v, e }));
  const dernier = h[h.length - 1];
  if (dernier && dernier.d === auj) {
    if (dernier.p === arrondi(p) && !dernier.e) return;
    h[h.length - 1] = { d: auj, p: arrondi(p) };
  } else {
    h.push({ d: auj, p: arrondi(p) });
  }
  const limite = jour(Date.now() - GARDE_JOURS * JOUR);
  histo[id] = h.filter((x) => x.d >= limite).slice(-POINTS_MAX);
  ecrire();
}

export const historique = (id) => histo[id] || [];

// Une carte qui quitte la collection garde son historique : la reprendre plus tard
// rend sa courbe. Il n'est retiré que si on le demande.
export function oublie(id) {
  if (!histo[id]) return;
  delete histo[id];
  ecrire();
}
