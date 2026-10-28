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
//     champ : c'est le DERNIER ÉCRIT qui gagne ;
//   - à la connexion, LE COMPTE GAGNE (28/10/2026, à la demande) : s'il porte une
//     collection, elle remplace celle de l'appareil, sans rien demander. L'appareil
//     n'envoie la sienne que si le compte est vide (voir `aLaConnexion`).
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
// pas — sauf pour savoir si une collection est vide.

import { sb, etat, configure, surChangement } from './compte.js';
import { lisCartodex } from './cartes/cartodex.js';

// La table d'Unydex dans le projet Supabase de Cartodex, repris pour l'appli fusionnée :
// `public.collections` y est déjà prise par les sauvegardes de Cartodex (voir la
// migration 20261028000000_projet_cartodex.sql).
const TABLE = 'collections_unydex';

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
    const { error } = await c.from(TABLE).upsert({
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
// Le seul moment où les deux côtés peuvent diverger. Deux cas, sans jamais rien
// demander (un panneau demandait autrefois laquelle garder ; retiré à la demande) :
//
//   - le compte porte une collection → elle REMPLACE celle de l'appareil ;
//   - le compte est vide             → l'appareil envoie la sienne (premier compte,
//                                       ou mode invité qui devient un compte).
export async function aLaConnexion() {
  if (!configure() || !etat.user || !litEtat) return;
  const c = await sb();
  if (!c) return;

  const { data, error } = await c
    .from(TABLE)
    .select('donnees, modifie_le, appareil')
    .eq('id', etat.user.id)
    .maybeSingle();
  if (error) { console.warn('sync', error.message); return; }

  // Premier passage de ce compte dans Unydex : s'il vient de Cartodex, sa sauvegarde
  // REJOINT la collection de l'appareil (même chemin que l'import d'un fichier), puis
  // tout part dans la table d'Unydex. Une seule fois : ensuite la ligne d'Unydex existe.
  if (!data) await repriseCartodex(c);

  // Une exception, qui n'en est pas une : l'appli démarre sur une session DÉJÀ ouverte
  // et l'appareil porte des changements faits sous ce compte mais pas encore partis
  // (fermée avant l'envoi, hors ligne). Ce sont les plus récents du compte : on les
  // envoie au lieu de les écraser. Après une connexion, `CLE_ENVOYE` est vide (la
  // déconnexion l'efface) : le compte gagne toujours.
  //
  // Un envoi d'AVANT le 28/10/2026 n'a pas encore les champs ajoutés ce jour-là
  // (`recents`…) : il diffère forcément de l'état d'aujourd'hui, sans rien d'en attente.
  // On ne le prend donc pas pour un changement local — le compte fait foi.
  const envoye = lis(CLE_ENVOYE);
  const enAttente = !!envoye && envoye.includes('"recents":') && envoye !== JSON.stringify(litEtat());
  if (enAttente) await envoie();
  else if (rempli(data?.donnees)) await prend(data.donnees);
  else await envoie();
}

// La sauvegarde de Cartodex (`collections.data`, lue seulement, jamais écrite), fondue
// dans la collection locale. Un échec ne bloque rien : le compte repart sans elle.
async function repriseCartodex(c) {
  try {
    const { data, error } = await c.from('collections').select('data').eq('user_id', etat.user.id).maybeSingle();
    if (error || !data?.data || !lisCartodex(data.data)) return;
    await poseEtat(data.data);
  } catch (e) {
    // « vide » : rien de nouveau à reprendre, la collection l'avait déjà.
    if (e?.message !== 'vide') console.warn('reprise Cartodex', e?.message ?? e);
  }
}

// On applique, PUIS on relit l'état réel pour marquer ce qui est « déjà envoyé ».
// Recopier l'objet du serveur ne suffirait pas : `jsonb` réordonne les clés, et le
// texte comparé par `envoie()` ne correspondrait jamais — on renverrait la même
// collection à chaque changement.
async function prend(donnees) {
  await poseEtat(donnees, { compte: true });
  // Des classeurs de l'appareil gardés face à un compte qui n'en a aucun (main.js,
  // `appliqueDonnees`) : l'état local n'est PAS celui du compte, on l'envoie.
  if (litEtat().classeurs?.length && !donnees?.classeurs?.length) { await envoie(); return; }
  ecris(CLE_ENVOYE, JSON.stringify(litEtat()));
  ecris(CLE_DATE, new Date().toISOString());
  previens();
}

const rempli = (d) => !!(d?.caught?.length || d?.caughtShiny?.length
  || Object.keys(d?.boxes ?? {}).length || Object.keys(d?.order ?? {}).length
  || Object.values(d?.equipes ?? {}).some((e) => e?.some?.(Boolean))
  // Depuis la fusion avec Cartodex, une collection de cartes seule est une collection.
  || Object.values(d?.cartes ?? {}).some((c) => c?.ex?.length || c?.fav)
  || (Array.isArray(d?.classeurs) && d.classeurs.length > 0)
  // Et, depuis le 28/10/2026, la collection et les classeurs anglais.
  || Object.values(d?.cartesEn ?? {}).some((c) => c?.ex?.length || c?.fav)
  || (Array.isArray(d?.classeursEn) && d.classeursEn.length > 0));

// ---------------------------------------------------------------- suivi du compte
//
// La reprise n'a lieu qu'au PASSAGE à un compte connecté. `surChangement` est aussi
// émis quand le jeton se rafraîchit, toutes les heures : relire le compte à chaque fois
// remplacerait des changements pas encore envoyés, d'où la comparaison d'identifiant.
let dernierUser = null;
export function suitLeCompte() {
  surChangement(() => {
    const id = etat.user?.id ?? null;
    if (id === dernierUser) return;
    dernierUser = id;
    if (!id) {
      // Déconnexion : on oublie ce qu'on croyait envoyé. Se reconnecter doit
      // relire le compte, et non repartir d'une certitude périmée.
      try { localStorage.removeItem(CLE_ENVOYE); } catch { /* quota */ }
      previens();
      return;
    }
    // Cas le plus courant : l'appli démarre avec une session déjà en place. Le compte
    // est relu, et il fait foi.
    aLaConnexion().catch((e) => console.warn('sync', e?.message ?? e));
  });
}
