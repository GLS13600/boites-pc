// Unydex+ — l'abonnement.
//
// Ce qu'il débloque (décidé le 06/10/2026) :
//   - plus aucune publicité ;
//   - des boîtes PC en plus (le « + ») — les boîtes du Pokédex, elles, restent
//     gratuites : le Living Dex complet ne se paie pas ;
//   - une équipe de combat PAR VERSION de jeu, au lieu d'une seule en tout.
// Deux formules, mensuelle et annuelle.
//
// Deux variantes (vite.config.js) :
//   perso — « Unydex Dev » : une SIMULATION. Une appli installée par SideStore ne peut
//           pas acheter — Apple exige un compte développeur payant et une appli déclarée
//           dans App Store Connect. On simule donc l'achat pour éprouver l'expérience :
//           écran d'abonnement, déblocages, pubs coupées.
//   store — la version de l'App Store : l'achat passera par Apple (StoreKit), par un
//           fournisseur à brancher le jour où la compilation store existera. D'ici là,
//           `souscrire` y répond « indisponible » — jamais un faux succès.
//
// Le reste de l'appli ne lit que `estPremium()` et ne s'abonne qu'à `surChangement` :
// brancher le vrai paiement ne touchera que ce fichier.

const STORE = __VARIANTE__ === 'store';
const CLE_SIMULATION = 'pcbox.plus.simule';

let premiumStore = false; // l'état réel, que fournira le paiement Apple
const ecouteurs = new Set();

export const simulation = () => !STORE;

export function estPremium() {
  if (STORE) return premiumStore;
  try { return localStorage.getItem(CLE_SIMULATION) === '1'; } catch { return false; }
}

export function surChangement(f) { ecouteurs.add(f); }
const annonce = () => { for (const f of ecouteurs) f(estPremium()); };

// Les deux formules. En simulation les prix sont ceux prévus ; en store ils viendront
// d'Apple, déjà convertis dans la monnaie et au format du pays de l'utilisateur —
// afficher un prix recopié à la main serait faux hors de la zone euro.
export const FORMULES = [
  { cle: 'annuel', prix: 9.99, mois: 12 },
  { cle: 'mensuel', prix: 1.99, mois: 1 },
];

export async function souscrire(cle) {
  if (!FORMULES.some((f) => f.cle === cle)) return { ok: false, erreur: 'formule' };
  if (STORE) return { ok: false, erreur: 'indisponible' };
  try { localStorage.setItem(CLE_SIMULATION, '1'); } catch { return { ok: false, erreur: 'stockage' }; }
  annonce();
  return { ok: true, simule: true };
}

export async function restaurer() {
  if (STORE) return { ok: false, erreur: 'indisponible' };
  annonce();
  return { ok: estPremium() };
}

// Unydex Dev : revenir à la version gratuite, pour éprouver les limites.
export function arreteSimulation() {
  try { localStorage.setItem(CLE_SIMULATION, '0'); } catch { /* sans gravité */ }
  annonce();
}
