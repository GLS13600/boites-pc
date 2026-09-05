import { defineConfig } from 'vite';

// base './' : les chemins restent relatifs, indispensable quand Capacitor
// chargera le dossier dist/ depuis le système de fichiers de l'iPhone.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
