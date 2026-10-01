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
// dans un objet que l'appli sait déjà produire et relire (`exportTout`/`importTout`),
// et le cas « deux appareils modifiés hors ligne simultanément » est rare pour un
// usage personnel. Un journal d'opérations coûterait un schéma, une rejouabilité et
// une migration des données existantes, pour un gain que personne ne verrait.

import { sb, etat, configure } from './compte.js';

const CLE_HORODATAGE = 'pcbox.sync.local';   // quand le local a changé pour la dernière fois
const CLE_ENVOYE = 'pcbox.sync.envoye';      // ce qu'on a réussi à envoyer, pour ne pas renvoyer l'identique
const ATTENTE = 2500;                        // on laisse retomber une rafale de captures

// Nom lisible de l'appareil, pour pouvoir dire « modifié sur iPhone » plutôt que
// d'afficher un identifiant. Rien de traçant : c'est le type d'appareil, pas son nom.
const appareil = () => (window.Capacitor?.isNativePlatform?.() ? 'iPhone' : 'Navigateur');

let minuteur = 0;
let enCours = false;
let litEtat = null;   // fourni par main.js : rend l'objet à envoyer
let poseEtat = null;  // fourni par main.js : applique un objet reçu

// `brancher` garde main.js maître de la forme des données : sync.js ne connaît ni
// `state`, ni `localStorage`, ni les clés. Il transporte, il n'interprète pas.
export function brancher({ lit, pose }) { litEtat = lit; poseEtat = pose; }

// Appelée à CHAQUE modification locale. Elle marque l'heure et programme un envoi ;
// elle ne parle jamais au réseau elle-même.
export function marqueChange() {
  try { localStorage.setItem(CLE_HORODATAGE, new Date().toISOString()); } catch { /* quota */ }
  programme();
}

function programme() {
  if (!configure() || !etat.user) return;
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { envoie().catch(() => {}); }, ATTENTE);
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
  try {
    const { error } = await c.from('collections').upsert({
      id: etat.user.id,
      donnees,
      modifie_le: new Date().toISOString(),
      appareil: appareil(),
    });
    if (error) throw error;
    try { localStorage.setItem(CLE_ENVOYE, texte); } catch { /* quota */ }
  } catch (e) {
    // Hors ligne, serveur éteint, jeton périmé : on réessaiera au prochain changement.
    // Surtout ne rien casser côté local, et ne pas inquiéter l'utilisateur.
    console.warn('sync', e?.message ?? e);
  } finally {
    enCours = false;
  }
}

const lis = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// ---------------------------------------------------------------- à la connexion
//
// Le seul moment où les deux côtés peuvent diverger. Trois cas :
//
//   - rien sur le serveur  → on envoie le local, sans rien demander ;
//   - rien en local        → on prend le serveur, sans rien demander ;
//   - les deux existent    → on demande, en montrant les DATES. Écraser la collection
//                            de quelqu'un sans le lui dire serait impardonnable : ce
//                            sont des centaines d'heures de jeu.
//
// `demande` est fourni par main.js et rend 'local' | 'serveur' | 'rien'.
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

  const distant = data?.donnees && Object.keys(data.donnees).length ? data : null;
  const local = litEtat();
  const localRempli = !!(local?.caught?.length || local?.caughtShiny?.length
    || Object.keys(local?.boxes ?? {}).length || Object.keys(local?.equipes ?? {}).length);

  if (!distant) { await envoie(); return; }
  if (!localRempli) { poseEtat(distant.donnees); marqueEnvoye(distant.donnees); return; }

  // Les deux portent quelque chose : c'est à l'utilisateur de trancher.
  const choix = await demande({
    quand: data.modifie_le,
    appareil: data.appareil,
    local: compte(local),
    serveur: compte(distant.donnees),
  });
  if (choix === 'serveur') { poseEtat(distant.donnees); marqueEnvoye(distant.donnees); }
  else if (choix === 'local') { await envoie(); }
  // 'rien' : on ne touche à rien, et on ne synchronise pas tant qu'il n'a pas choisi.
}

function marqueEnvoye(donnees) {
  try { localStorage.setItem(CLE_ENVOYE, JSON.stringify(donnees)); } catch { /* quota */ }
}

// De quoi présenter un choix compréhensible : « 342 capturés, 2 équipes » parle,
// « modifié le 12/03 » tout seul ne dit pas ce qu'on risque de perdre.
function compte(d) {
  return {
    captures: (d?.caught?.length ?? 0) + (d?.caughtShiny?.length ?? 0),
    equipes: Object.values(d?.equipes ?? {}).filter((e) => e?.some?.(Boolean)).length,
  };
}
