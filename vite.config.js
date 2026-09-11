import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

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
