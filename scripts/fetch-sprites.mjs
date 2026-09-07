// Rapatrie TOUS les sprites dans public/sprites/, pour que l'app tourne sans réseau.
// Usage : npm run fetch-sprites
//
// Deux traitements, parce que les deux familles d'images n'ont rien à voir :
//
//   - sprites fixes (grille, formes, évolutions) : du pixel art de 96x96 à 1,8 Ko.
//     Recopiés tels quels, en PNG. Les recompresser ne gagnerait rien et abîmerait
//     des aplats de quelques pixels.
//   - artwork officiel (portrait de la fiche) : 475x475 et 129 Ko en moyenne, soit
//     260 Mo pour les 2050 fichiers — impossible dans un IPA. Converti en WebP à
//     384 px : le portrait s'affiche en 108 px CSS, donc 324 px sur un écran ×3, et
//     384 laisse de la marge. On tombe à ~18 Ko l'unité.
//
// Le script REPREND : un fichier déjà présent n'est pas retéléchargé. Les absents de
// l'amont (quelques formes n'ont pas de sprite) sont listés en fin de course — le
// repli onerror de l'appli vise le sprite de l'espèce, qui lui existe.

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const REPO = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const DEST = new URL('../public/sprites/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ART_PX = 384;
const ART_Q = 78;
const PARALLELE = 20;

const existe = async (p) => { try { await access(p); return true; } catch { return false; } };

// ---------- Ce dont l'appli a besoin, exactement ----------

const forms = JSON.parse(await readFile(new URL('../src/data/forms.json', import.meta.url), 'utf8'));

const taches = [];
for (let id = 1; id <= 1025; id++) {
  for (const sh of ['', 'shiny/']) {
    taches.push({ type: 'still', url: `${sh}${id}.png`, sortie: `${sh}${id}.png` });
    taches.push({
      type: 'art',
      url: `other/official-artwork/${sh}${id}.png`,
      sortie: `other/official-artwork/${sh}${id}.webp`,
    });
  }
}
for (const liste of Object.values(forms)) {
  for (const f of liste) {
    for (const sh of ['', 'shiny/']) {
      taches.push({ type: 'still', url: `${sh}${f.sprite}.png`, sortie: `${sh}${f.sprite}.png` });
      // L'artwork officiel EXISTE aussi pour les formes à clé numérique
      // (Méga, Gigamax, régionales) : la fiche les montre donc en grand,
      // comme les espèces. Les formes cosmétiques, elles, n'en ont pas —
      // leur clé est un slug, on ne tente même pas.
      if (typeof f.key === 'number') {
        taches.push({
          type: 'art',
          url: `other/official-artwork/${sh}${f.key}.png`,
          sortie: `other/official-artwork/${sh}${f.key}.webp`,
        });
      }
    }
  }
}
// female/3 apparaît deux fois si deux formes le citent : on dédoublonne.
const vues = new Set();
const liste = taches.filter((t) => !vues.has(t.sortie) && vues.add(t.sortie));

console.log(`${liste.length} fichiers visés (${liste.filter((t) => t.type === 'still').length} fixes, ${liste.filter((t) => t.type === 'art').length} artworks)`);

// ---------- Téléchargement ----------

let fait = 0, saute = 0, absent = 0, octets = 0;
const manquants = [];

async function traite(t) {
  const chemin = join(DEST, t.sortie);
  if (await existe(chemin)) { saute++; return; }

  let rep;
  for (let essai = 0; essai < 3; essai++) {
    try { rep = await fetch(`${REPO}/${t.url}`); break; }
    catch { await new Promise((r) => setTimeout(r, 400 * (essai + 1))); }
  }
  if (!rep || !rep.ok) { absent++; manquants.push(t.url); return; }

  let data = Buffer.from(await rep.arrayBuffer());
  if (t.type === 'art') {
    data = await sharp(data)
      .resize(ART_PX, ART_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: ART_Q, effort: 5 })
      .toBuffer();
  }
  await mkdir(dirname(chemin), { recursive: true });
  await writeFile(chemin, data);
  fait++; octets += data.length;
}

let curseur = 0;
await Promise.all(
  Array.from({ length: PARALLELE }, async () => {
    while (curseur < liste.length) {
      const t = liste[curseur++];
      await traite(t);
      const n = fait + saute + absent;
      if (n % 200 === 0) process.stdout.write(`\r  ${n}/${liste.length}  (${(octets / 1048576).toFixed(1)} Mo écrits)   `);
    }
  })
);

console.log(`\n\nécrits   : ${fait}  (${(octets / 1048576).toFixed(1)} Mo)`);
console.log(`déjà là  : ${saute}`);
console.log(`absents  : ${absent}`);
if (manquants.length) {
  console.log(`\nAbsents de l'amont (repli onerror vers le sprite de l'espèce) :`);
  console.log(manquants.slice(0, 40).join('\n') + (manquants.length > 40 ? `\n… et ${manquants.length - 40} autres` : ''));
}
