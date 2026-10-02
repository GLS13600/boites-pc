// Synchronisation de la collection avec le compte.
//
// PRINCIPE : `localStorage` est la SOURCE DE VÉRITÉ, le serveur n'est qu'une copie.
// Toute écriture va d'abord en local et prend effet tout de suite ; l'envoi est
// différé et peut échouer sans conséquence. Capturer un Pokémon dans le métro doit
// marcher exactement comme avant.
//
// Ce que ça implique, et qui est assumé :
//   - aucune écriture n'attend le réseau ; l'interface ne montre jamais de sablier ;
//   - un échec d'envoi est réessayé au prochain changement, pas signalé bruyamment ;
//   - deux appareils modifiés hors ligne en même temps ne fusionnent pas champ par
//     champ : c'est le DERNIER ÉCRIT qui gagne, et on le dit à l'utilisateur plutôt
//     que d'écraser en silence (voir `aLaConnexion`).
//
// Pourquoi pas une vraie fusion (CRDT, journal d'opérations) : la collection tient
// dans un objet que l'appli sait déjà produire et relire (`donneesCompletes` /
// `appliqueDonnees`), et le cas « deux appareils modifiés hors ligne simultanément »
// est rare pour un usage personnel. Un journal d'opérations coûterait un schéma, une
// rejouabilité et une migration des données existantes, pour un gain que personne ne
// verrait.
//
// Ce module ne connaît NI `state`, NI les clés de `localStorage`, NI la forme des
// données : main.js les lui fournit par `brancher`. Il transporte, il n'interprète
// pas — sauf pour compter captures et équipes, le minimum pour poser une question
// compréhensible.

import { sb, etat, configure, surChangement } from './compte.js';

const CLE_ENVOYE = 'pcbox.sync.envoye';   // ce qu'on a réussi à envoyer, pour ne pas renvoyer l'identique
const CLE_DATE = 'pcbox.sync.date';       // quand le dernier envoi a réussi
const ATTENTE = 2500;                     // on laisse retomber une rafale de captures

// Nom lisible de l'appareil, pour pouvoir dire « modifié sur iPhone » plutôt que
// d'afficher un identifiant. Rien de traçant : c'est le type d'appareil, pas son nom.
const appareil = () => (window.Capacitor?.isNativePlatform?.() ? 'iPhone' : 'Navigateur');

let minuteur = 0;
let enCours = false;
let derniereErreur = null;
let litEtat = null;    // fourni par main.js : rend l'objet à envoyer
let poseEtat = null;   // fourni par main.js : applique un objet reçu

// `brancher` garde main.js maître de la forme des données.
export function brancher({ lit, pose }) { litEtat = lit; poseEtat = pose; }

// L'interface se redessine quand l'envoi aboutit ou échoue : sans cela la ligne
// « envoyée il y a… » resterait figée sur l'état d'avant.
const abonnes = new Set();
export function surSync(f) { abonnes.add(f); return () => abonnes.delete(f); }
const previens = () => { for (const f of abonnes) { try { f(); } catch (e) { console.error(e); } } };

// Ce que l'interface a besoin de savoir, et rien de plus. Volontairement SANS
// « tout est-il à jour ? » : y répondre demanderait de sérialiser la collection
// entière à chaque rendu, pour une nuance de quelques secondes.
export const etatSync = () => ({
  actif: configure() && !!etat.user,
  enCours,
  envoyeLe: lis(CLE_DATE),
  erreur: derniereErreur,
});

// Appelée à CHAQUE modification locale. Elle programme un envoi ; elle ne parle
// jamais au réseau elle-même, et ne coûte rien quand il n'y a pas de compte.
export function marqueChange() {
  if (!configure() || !etat.user) return;
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { envoie().catch(() => {}); }, ATTENTE);
}

// Envoi immédiat, demandé par l'utilisateur. Il mérite une réponse, là où l'envoi
// automatique se tait : d'où le retour, que le bouton affiche.
export async function synchroniseMaintenant() {
  clearTimeout(minuteur);
  await envoie();
  return derniereErreur ? { erreur: derniereErreur } : { ok: true };
}

async function envoie() {
  if (enCours || !etat.user || !litEtat) return;
  const c = await sb();
  if (!c) return;

  const donnees = litEtat();
  const texte = JSON.stringify(donnees);
  // Rien n'a bougé depuis le dernier envoi réussi : on ne réveille pas le réseau.
  if (texte === lis(CLE_ENVOYE)) return;

  enCours = true;
  previens();
  try {
    const { error } = await c.from('collections').upsert({
      id: etat.user.id,
      donnees,
      modifie_le: new Date().toISOString(),
      appareil: appareil(),
    });
    if (error) throw error;
    ecris(CLE_ENVOYE, texte);
    ecris(CLE_DATE, new Date().toISOString());
    derniereErreur = null;
  } catch (e) {
    // Hors ligne, serveur éteint, jeton périmé : on réessaiera au prochain changement.
    // Surtout ne rien casser côté local, et ne pas inquiéter l'utilisateur.
    derniereErreur = String(e?.message ?? e);
    console.warn('sync', derniereErreur);
  } finally {
    enCours = false;
    previens();
  }
}

const lis = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ecris = (k, v) => { try { localStorage.setItem(k, v); } catch { /* quota */ } };

// ---------------------------------------------------------------- à la connexion
//
// Le seul moment où les deux côtés peuvent diverger. Trois cas :
//
//   - rien sur le serveur  → on envoie le local, sans rien demander ;
//   - rien en local        → on prend le serveur, sans rien demander ;
//   - les deux existent    → on demande, en montrant les DATES et le contenu. Écraser
//                            la collection de quelqu'un sans le lui dire serait
//                            impardonnable : ce sont des centaines d'heures de jeu.
//
// `demande` est fourni par l'interface et rend 'local' | 'serveur' | 'rien'.
export async function aLaConnexion(demande) {
  if (!configure() || !etat.user || !litEtat) return;
  const c = await sb();
  if (!c) return;

  const { data, error } = await c
    .from('collections')
    .select('donnees, modifie_le, appareil')
    .eq('id', etat.user.id)
    .maybeSingle();
  if (error) { console.warn('sync', error.message); return; }

  const distant = rempli(data?.donnees) ? data : null;
  const local = litEtat();

  if (!distant) { await envoie(); return; }
  if (!rempli(local)) { await prend(distant.donnees); return; }

  // Les deux portent quelque chose : c'est à l'utilisateur de trancher.
  const choix = await demande({
    quand: data.modifie_le,
    appareil: data.appareil,
    local: compte(local),
    serveur: compte(distant.donnees),
  });
  if (choix === 'serveur') await prend(distant.donnees);
  else if (choix === 'local') await envoie();
  // 'rien' : on ne touche à rien. Le prochain changement local repartira, et la
  // question se reposera à la prochaine connexion.
}

// On applique, PUIS on relit l'état réel pour marquer ce qui est « déjà envoyé ».
// Recopier l'objet du serveur ne suffirait pas : `jsonb` réordonne les clés, et le
// texte comparé par `envoie()` ne correspondrait jamais — on renverrait la même
// collection à chaque changement.
async function prend(donnees) {
  await poseEtat(donnees);
  ecris(CLE_ENVOYE, JSON.stringify(litEtat()));
  ecris(CLE_DATE, new Date().toISOString());
  previens();
}

const rempli = (d) => !!(d?.caught?.length || d?.caughtShiny?.length
  || Object.keys(d?.boxes ?? {}).length || Object.keys(d?.order ?? {}).length
  || Object.values(d?.equipes ?? {}).some((e) => e?.some?.(Boolean)));

// De quoi présenter un choix compréhensible : « 342 capturés, 2 équipes » parle,
// « modifié le 12/03 » tout seul ne dit pas ce qu'on risque de perdre.
function compte(d) {
  return {
    captures: (d?.caught?.length ?? 0) + (d?.caughtShiny?.length ?? 0),
    equipes: Object.values(d?.equipes ?? {}).filter((e) => e?.some?.(Boolean)).length,
  };
}

// ---------------------------------------------------------------- suivi du compte
//
// La confrontation n'a lieu qu'au PASSAGE à un compte connecté. `surChangement` est
// aussi émis quand le jeton se rafraîchit, toutes les heures : relancer la question
// à chaque fois serait insupportable, d'où la comparaison d'identifiant.
let dernierUser = null;
export function suitLeCompte(demande) {
  surChangement(() => {
    const id = etat.user?.id ?? null;
    if (id === dernierUser) return;
    dernierUser = id;
    if (!id) {
      // Déconnexion : on oublie ce qu'on croyait envoyé. Se reconnecter doit
      // reconfronter les deux côtés, et non repartir d'une certitude périmée.
      try { localStorage.removeItem(CLE_ENVOYE); } catch { /* quota */ }
      previens();
      return;
    }
    // Cas le plus courant : l'appli démarre avec une session déjà en place. C'est
    // exactement le moment de confronter les deux côtés.
    aLaConnexion(demande).catch((e) => console.warn('sync', e?.message ?? e));
  });
}
