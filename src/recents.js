// Le journal des derniers ajouts — captures de Pokémon ET cartes, mêlées dans l'ordre
// où elles sont arrivées. C'est la rubrique « Récemment » de l'accueil : ce qu'on vient
// de faire, d'un monde comme de l'autre, sans avoir à se souvenir où on l'a fait.
//
// Il part avec le compte (28/10/2026 : « toutes les données ») : on retrouve
// « Récemment » sur un autre appareil. Un ajout puis un retrait laisse la ligne : le journal
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
  surEcriture();
}

// main.js branche ici sa synchronisation (marqueChange) : ce module n'en sait rien.
let surEcriture = () => {};
export function brancheEcriture(f) { surEcriture = f; }

// Pour la sauvegarde : le journal tel quel, et sa reprise. Ce qui revient du compte est
// repris champ par champ — l'identifiant finit dans une URL d'image ; l'accueil, lui,
// n'affiche de toute façon que ce qui est encore possédé.
export const tous = () => lire();
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export function remet(v) {
  if (!Array.isArray(v)) return;
  const l = v.filter((x) => x && (x.type === 'pokemon' || x.type === 'carte') && ID.test(String(x.id)) && Number(x.t) > 0)
    .slice(0, MAX)
    .map((x) => ({ type: x.type, id: typeof x.id === 'number' ? x.id : String(x.id), ...(x.shiny === true ? { shiny: true } : {}), t: Number(x.t) }));
  try { localStorage.setItem(CLE, JSON.stringify(l)); } catch { /* sans gravité */ }
}

export const derniers = (n = 12) => lire().slice(0, n);
