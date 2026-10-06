import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import basicSsl from '@vitejs/plugin-basic-ssl';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

// Le numéro affiché dans l'application vient d'ici, jamais d'une constante recopiée
// à la main : APP_VERSION le surcharge en CI pour qu'il colle EXACTEMENT à celui que
// porte l'IPA. C'est cette égalité qui permet à SideStore de comparer la version
// installée à celle du manifeste et de proposer la mise à jour.
const version = process.env.APP_VERSION || pkg.version;

// ---------------------------------------------------------------- variantes
//
// DEUX VARIANTES de la même application, choisies à la compilation :
//   perso — le serveur de dev, le site, l'IPA sideloadé « Unydex Dev ». Sans pub.
//   store — la version de l'App Store, la seule qui portera des publicités.
// `perso` par défaut : seule une compilation qui le DEMANDE (APP_VARIANTE=store)
// produit la version store. Tout code de pub devra être écrit sous
// `if (__VARIANTE__ === 'store')` : Vite remplace la constante, la condition devient
// fausse et le code disparaît du bundle perso — rien n'y est téléchargé ni exécuté.
//
// Le schéma d'URL du retour OAuth suit la variante : deux applis installées côte à
// côte ne peuvent pas répondre au même `unydex://`, iOS n'en choisirait qu'une.
const variante = process.env.APP_VARIANTE === 'store' ? 'store' : 'perso';
const schemaUrl = variante === 'store' ? 'unydex' : 'unydexdev';

// ---------------------------------------------------------------- sécurité
//
// POLITIQUE DE SÉCURITÉ DE CONTENU, posée à la compilation dans une balise `meta` —
// GitHub Pages ne permet pas d'ajouter d'en-tête HTTP, et sous Capacitor il n'y a pas
// de serveur du tout.
//
// Ce qu'elle apporte RÉELLEMENT ici, et ce qu'elle n'apporte pas :
//
//   - `connect-src` est la directive qui compte. Elle énumère les seules destinations
//     joignables : l'origine de l'application et le projet Supabase. Un script injecté
//     ne peut donc pas expédier le jeton de session, qui vit dans `localStorage`, vers
//     un serveur tiers. C'est la mesure qui limite le dégât d'une faille d'injection.
//   - `object-src 'none'`, `base-uri 'self'` et `form-action 'self'` ferment trois
//     vecteurs classiques : greffon embarqué, détournement des URL relatives par une
//     balise `base` injectée, et redirection d'un formulaire vers un site tiers.
//   - `script-src` reste PERMISSIF, et c'est assumé : l'application pose son thème par
//     un script en ligne avant le premier rendu, ses images portent des gestionnaires
//     `onerror` en ligne, et le moteur du scan compile du WebAssembly. Interdire
//     l'exécution en ligne demanderait de réécrire ces trois mécanismes ; la politique
//     ne prétend donc pas bloquer une injection, elle en limite l'exploitation.
//   - `frame-ancestors` est volontairement ABSENTE : cette directive est ignorée dans
//     une balise `meta`, elle n'existe qu'en en-tête HTTP. La protection contre
//     l'inclusion dans un cadre tiers n'est donc pas atteignable sur GitHub Pages.
//
// L'origine Supabase est lue à la compilation : sans configuration, la directive se
// réduit à l'origine de l'application, et l'application fonctionne telle quelle, hors
// ligne et sans compte.
//
// L’URL est passée EN PARAMÈTRE, et non lue dans process.env : `npm run build` ne
// charge pas .env dans l’environnement du processus — seul `loadEnv` le fait. Sans
// cela, connect-src omettait Supabase et la politique aurait coupé les comptes sur
// le site publié, là où rien ne l’aurait signalé avant la première connexion.
function cspPlugin(url) {
  const sb = (url || '').trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
  const origineSb = /^https:\/\/[^./]+\.supabase\.(co|in|red)$/.test(sb) ? ` ${sb} ${sb.replace('https://', 'wss://')}` : '';
  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' et 'unsafe-eval' : voir la note ci-dessus. 'wasm-unsafe-eval'
    // ne suffit pas au moteur d'inférence, qui construit sa glu à l'exécution.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    // data: pour les dessins en ligne, blob: pour l'aperçu peint du scan.
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "worker-src 'self' blob:",
    `connect-src 'self' blob: data:${origineSb}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  return {
    name: 'unydex-csp',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
      );
    },
  };
}

// base './' : les chemins restent relatifs, indispensable quand Capacitor
// chargera le dossier dist/ depuis le système de fichiers de l'iPhone.
export default defineConfig(({ mode }) => {
  // loadEnv réunit les fichiers .env ET les variables du processus, ce qui couvre le
  // poste de développement comme la compilation en intégration continue.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
  base: './',
  // HTTPS sur le serveur de DÉVELOPPEMENT, avec un certificat auto-signé.
  //
  // `getUserMedia` exige un contexte sécurisé : ouvert depuis le téléphone par l'IP
  // réseau (http://192.168.x.x:5173), le serveur n'en est pas un — seul `localhost`,
  // sur la machine elle-même, y échappe. La vue Scan affichait donc « la caméra
  // demande une connexion sécurisée », et tester la caméra imposait de pousser puis
  // d'attendre le déploiement Pages à chaque essai.
  //
  // Le certificat est auto-signé : Safari affiche un avertissement au premier accès
  // (Afficher les détails → Visiter ce site web). Une fois accepté, l'origine est
  // sécurisée et la caméra fonctionne.
  //
  // OPTIONNEL, par `npm run dev:https` : un certificat auto-signé est refusé par
  // certains clients — le panneau de prévisualisation, entre autres — et `npm run dev`
  // doit rester en clair pour eux. Le build et les deux workflows n'en voient rien.
  plugins: [
    cspPlugin(env.VITE_SUPABASE_URL),
    ...(process.env.DEV_HTTPS ? [basicSsl()] : []),
  ],
  server: { host: true },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __VARIANTE__: JSON.stringify(variante),
    __SCHEMA_URL__: JSON.stringify(schemaUrl),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // Le Worker du scan est un module ES : onnxruntime-web s'appuie sur import.meta,
  // que le format par défaut des workers (iife) ne sait pas rendre.
  worker: {
    format: 'es',
  },
  };
});
