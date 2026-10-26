// Le journal des derniers ajouts — captures de Pokémon ET cartes, mêlées dans l'ordre
// où elles sont arrivées. C'est la rubrique « Récemment » de l'accueil : ce qu'on vient
// de faire, d'un monde comme de l'autre, sans avoir à se souvenir où on l'a fait.
//
// Préférence d'appareil, hors de la sauvegarde : c'est un historique d'affichage, pas
// un morceau de la collection. Un ajout puis un retrait laisse la ligne : le journal
// dit ce qui s'est passé ; l'accueil, lui, filtre ce qui n'est plus possédé.

const CLE = 'pcbox.recents';
const MAX = 30;

function lire() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE));
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

// type : 'pokemon' ou 'carte' ; id : clé de capture ou identifiant TCGdex.
export function note(type, id, extra = {}) {
  const liste = lire().filter((r) => !(r.type === type && r.id === id && r.shiny === extra.shiny));
  liste.unshift({ type, id, ...extra, t: Date.now() });
  try { localStorage.setItem(CLE, JSON.stringify(liste.slice(0, MAX))); } catch { /* sans gravité */ }
}

export const derniers = (n = 12) => lire().slice(0, n);
