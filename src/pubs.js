// Publicités — AdMob, dans l'application iPhone seulement.
//
// Deux variantes (vite.config.js) :
//   perso — « Unydex Dev » : les pubs de TEST de Google, pour juger l'expérience avant
//           la sortie, avec un interrupteur dans les Réglages pour les couper. Elles ne
//           sont liées à aucun compte AdMob : aucun risque de « trafic invalide », et
//           rien à toucher sur un IPA sideloadé, qu'AdMob ne relie à aucun store.
//   store — la version de l'App Store : les identifiants réels, lus à la compilation
//           (VITE_ADMOB_*). Sans eux, aucune pub n'est demandée.
//
// Sur le web (site, serveur de dev), le greffon n'existe pas : tout ici rend la main
// sans rien faire. Le greffon est lu sur `window.Capacitor.Plugins`, comme Haptics ou
// Share : aucun import, rien dans le bundle du site.
//
// Ce que l'utilisateur voit :
//   - une BANNIÈRE en bas de l'écran, sauf sur les Boîtes — on y glisse les Pokémon
//     jusqu'au bord, une bannière y gênerait le geste — et sur le Scan, où l'écran
//     entier est la caméra ;
//   - un PLEIN ÉCRAN à une pause naturelle — en refermant une fiche, en revenant à
//     l'accueil —, jamais pendant un geste, au plus une fois toutes les 4 minutes et
//     jamais dans les 2 premières minutes.

import { estPremium } from './abonnement.js';

const DEMO = {
  banniere: 'ca-app-pub-3940256099942544/2435281174',     // bannière adaptative de démo
  interstitiel: 'ca-app-pub-3940256099942544/4411468910', // plein écran de démo
};
const STORE = __VARIANTE__ === 'store';
const IDS = STORE
  ? { banniere: import.meta.env.VITE_ADMOB_BANNIERE, interstitiel: import.meta.env.VITE_ADMOB_INTERSTITIEL }
  : DEMO;

const CLE = 'pcbox.pubs';
const ECART_MS = 4 * 60 * 1000;
const VUES_BANNIERE = new Set(['accueil', 'pokedex', 'attaques', 'combat', 'reglages']);

const plugin = () => window.Capacitor?.Plugins?.AdMob;

// Le greffon est là, et l'on sait quelles pubs demander.
export const pubsDisponibles = () => !!plugin() && !!IDS.banniere;

// L'interrupteur n'existe que dans Unydex Dev : la version store affiche toujours ses
// pubs (un achat pour les retirer viendra, le cas échéant, d'ailleurs).
export const interrupteurPubs = () => !STORE;
export function pubsActivees() {
  // Unydex+ : plus aucune pub, quelle que soit la variante.
  if (estPremium()) return false;
  if (STORE) return true;
  try { return localStorage.getItem(CLE) !== '0'; } catch { return true; }
}

let demarrage = null;
let banniereCreee = false;
let banniereVisible = false;
let hauteur = 0;
let interstitielPret = false;
// Daté comme si le dernier plein écran remontait à 2 minutes avant l'écart : le
// premier ne peut donc pas venir avant 2 minutes d'utilisation.
let dernierPleinEcran = Date.now() - ECART_MS + 2 * 60 * 1000;
let vueCourante = null;
let file = Promise.resolve();

// La bannière est posée par-dessus la vue web, au-dessus de la zone sûre : la page ne
// se décale pas d'elle-même. On réserve sa hauteur par `--nav-h`, que les panneaux
// lisent déjà et que la coquille de l'appli soustrait de la zone qui défile.
function reserve(h) {
  document.documentElement.style.setProperty('--nav-h', `${Math.max(0, Math.round(h))}px`);
}

// Consentement européen d'abord (formulaire de Google, s'il est requis), puis la
// demande de suivi d'iOS, puis le SDK. Une seule fois par lancement.
function demarre() {
  if (demarrage) return demarrage;
  demarrage = (async () => {
    const A = plugin();
    let c = await A.requestConsentInfo();
    if (c.isConsentFormAvailable && c.status === 'REQUIRED') c = await A.showConsentForm();
    try {
      const { status } = await A.trackingAuthorizationStatus();
      if (status === 'notDetermined') await A.requestTrackingAuthorization();
    } catch { /* hors iOS 14+ : rien à demander */ }
    await A.initialize({});
    A.addListener('bannerAdSizeChanged', (taille) => {
      if (taille?.height > 0) hauteur = taille.height;
      reserve(banniereVisible ? hauteur : 0);
    });
    A.addListener('interstitialAdDismissed', () => {
      dernierPleinEcran = Date.now();
      prepareInterstitiel();
    });
    prepareInterstitiel();
    return c.canRequestAds !== false;
  })().catch((e) => { console.warn('pubs', e); return false; });
  return demarrage;
}

async function prepareInterstitiel() {
  if (!IDS.interstitiel) return;
  try {
    await plugin().prepareInterstitial({ adId: IDS.interstitiel, isTesting: !STORE });
    interstitielPret = true;
  } catch { interstitielPret = false; }
}

// Les appels au greffon passent un par un : un changement de vue rapide ne doit pas
// croiser une bannière qu'on montre et une qu'on cache. Chaque passage relit l'état
// VOULU au moment où il s'exécute, donc seul le dernier compte.
function applique() {
  file = file.then(async () => {
    const voulu = pubsDisponibles() && pubsActivees() && VUES_BANNIERE.has(vueCourante);
    if (voulu === banniereVisible) return;
    if (voulu && !(await demarre())) return;
    const A = plugin();
    if (voulu) {
      if (!banniereCreee) {
        await A.showBanner({
          adId: IDS.banniere, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER',
          margin: 0, isTesting: !STORE,
        });
        banniereCreee = true;
      } else {
        await A.resumeBanner();
      }
      banniereVisible = true;
      reserve(hauteur);
    } else {
      await A.hideBanner();
      banniereVisible = false;
      reserve(0);
    }
  }).catch((e) => console.warn('pubs', e));
  return file;
}

// Appelé à chaque rendu : la bannière suit la vue affichée.
export function majPubs(vue) {
  vueCourante = vue;
  if (pubsDisponibles()) applique();
}

// Une pause naturelle : un plein écran, si l'écart est respecté et qu'il est prêt.
export function pauseNaturelle() {
  if (!pubsDisponibles() || !pubsActivees() || !interstitielPret) return;
  if (Date.now() - dernierPleinEcran < ECART_MS) return;
  interstitielPret = false;
  dernierPleinEcran = Date.now();
  plugin().showInterstitial().catch(() => prepareInterstitiel());
}

// À appeler quand l'abonnement change : la bannière part ou revient aussitôt.
export function rafraichitPubs() {
  if (pubsDisponibles()) applique();
}

// L'interrupteur des Réglages (Unydex Dev).
export function activePubs(on) {
  try { localStorage.setItem(CLE, on ? '1' : '0'); } catch { /* sans gravité */ }
  if (pubsDisponibles()) applique();
}
