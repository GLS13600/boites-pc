// Prépare les sources que @capacitor/assets attend dans assets/ :
//   icon.png        1024x1024, l'icône de l'app, carrée et pleine (iOS masque lui-même)
//   splash.png      2732x2732, écran de lancement clair
//   splash-dark.png idem en sombre
//
// L'icône est rasterisée depuis public/icon.svg — source unique, pas de PNG à
// resynchroniser à la main. L'écran de lancement ne reprend QUE la lentille : la
// bande du bas et les voyants sont des signes d'icône, ils n'ont pas de sens
// étalés sur un plein écran.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const dossier = new URL('../assets/', import.meta.url);
await mkdir(dossier, { recursive: true });

const svg = await readFile(new URL('../public/icon.svg', import.meta.url));
await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile(new URL('icon.png', dossier).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const splash = (fond1, fond2) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${fond1}"/><stop offset="1" stop-color="${fond2}"/>
    </linearGradient>
    <linearGradient id="b" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#4cc3ec"/><stop offset="1" stop-color="#1c9bd1"/>
    </linearGradient>
  </defs>
  <rect width="2732" height="2732" fill="url(#f)"/>
  <circle cx="1366" cy="1366" r="440" fill="#ffffff"/>
  <circle cx="1366" cy="1366" r="363" fill="url(#b)"/>
  <circle cx="1238" cy="1250" r="100" fill="#ffffff" opacity="0.9"/>
  <circle cx="1489" cy="1512" r="46" fill="#ffffff" opacity="0.45"/>
</svg>`);

const chemin = (n) => new URL(n, dossier).pathname.replace(/^\/([A-Za-z]:)/, '$1');
await sharp(splash('#ef3b30', '#c4231b')).png().toFile(chemin('splash.png'));
await sharp(splash('#8e1a14', '#5d0f0b')).png().toFile(chemin('splash-dark.png'));

console.log('assets/icon.png, assets/splash.png, assets/splash-dark.png écrits.');
