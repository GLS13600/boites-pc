import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import basicSsl from '@vitejs/plugin-basic-ssl';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

// Le numéro affiché dans l'application vient d'ici, jamais d'une constante recopiée
// à la main : APP_VERSION le surcharge en CI pour qu'il colle EXACTEMENT à celui que
// porte l'IPA. C'est cette égalité qui permet à SideStore de comparer la version
// installée à celle du manifeste et de proposer la mise à jour.
const version = process.env.APP_VERSION || pkg.version;

// base './' : les chemins restent relatifs, indispensable quand Capacitor
// chargera le dossier dist/ depuis le système de fichiers de l'iPhone.
export default defineConfig({
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
  plugins: process.env.DEV_HTTPS ? [basicSsl()] : [],
  server: { host: true },
  define: {
    __APP_VERSION__: JSON.stringify(version),
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
});
