// Rapatrie les cartes du JCC Pokémon depuis TCGdex, pour entraîner et ÉVALUER le scan.
//
// Les cartes apportent ce qu'aucun sprite n'a : des centaines de styles d'illustration
// différents pour une même espèce, peints, dessinés ou en images de synthèse. Elles
// servent aussi de banc d'essai, puisqu'une carte réelle est l'un des objets scannés.
//
// Rien de tout cela n'est embarqué dans l'application : seules les images servent à
// l'entraînement, sur le PC. Usage : node ml/fetch-cartes.mjs <dossier de données>
import fs from 'node:fs';
import path from 'node:path';

const racine = process.argv[2];
if (!racine) { console.error('usage : node ml/fetch-cartes.mjs <dossier>'); process.exit(1); }
const dossier = path.join(racine, 'cartes');
fs.mkdirSync(dossier, { recursive: true });
const liste = path.join(racine, 'cartes.json');

const gql = async (query) => {
  for (let essai = 0; ; essai++) {
    try {
      const r = await fetch('https://api.tcgdex.net/v2/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const j = await r.json();
      if (j.errors) throw new Error(JSON.stringify(j.errors));
      return j.data;
    } catch (e) {
      if (essai >= 4) throw e;
      await new Promise((ok) => setTimeout(ok, 1000 * (essai + 1)));
    }
  }
};

// 1. La liste, page par page (100 cartes au plus par page).
let cartes = [];
if (fs.existsSync(liste)) {
  cartes = JSON.parse(fs.readFileSync(liste, 'utf8'));
} else {
  for (let page = 1; ; page++) {
    const d = await gql(`{ cards(filters:{category:"Pokemon"}, pagination:{page:${page},count:100}) { id image dexId set { id } illustrator } }`);
    if (!d.cards.length) break;
    cartes.push(...d.cards);
    if (page % 20 === 0) console.log(`page ${page} : ${cartes.length} cartes`);
  }
  // Une seule espèce par carte : les cartes duo (« Pikachu & Zekrom ») n'ont pas de
  // bonne réponse unique. Et sans image, rien à apprendre.
  cartes = cartes.filter((c) => c.image && c.dexId?.length === 1 && c.dexId[0] >= 1 && c.dexId[0] <= 1025)
    .map((c) => ({ id: c.id, image: c.image, num: c.dexId[0], set: c.set?.id ?? '', illustrateur: c.illustrator ?? '' }));
  fs.writeFileSync(liste, JSON.stringify(cartes));
}
console.log(`${cartes.length} cartes retenues, ${new Set(cartes.map((c) => c.num)).size} espèces`);

// 2. Les images, en reprise : un fichier déjà présent n'est pas retéléchargé.
let faits = 0, echecs = 0;
const file = cartes.filter((c) => !fs.existsSync(path.join(dossier, `${c.id}.webp`)));
console.log(`${file.length} images à télécharger`);
const ouvrier = async () => {
  while (file.length) {
    const c = file.shift();
    try {
      const r = await fetch(`${c.image}/high.webp`);
      if (!r.ok) throw new Error(r.status);
      fs.writeFileSync(path.join(dossier, `${c.id}.webp`), Buffer.from(await r.arrayBuffer()));
    } catch { echecs++; }
    if (++faits % 500 === 0) console.log(`${faits} images (${echecs} échecs)`);
  }
};
await Promise.all(Array.from({ length: 12 }, ouvrier));
console.log(`terminé : ${faits} traitées, ${echecs} échecs`);
