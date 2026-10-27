// Le catalogue COMPLET des cartes du JCC, pour le scan des cartes (index d'empreintes).
//
// À la différence de fetch-cartes.mjs (cartes de Pokémon seulement, en anglais, pour
// apprendre les ESPÈCES), il faut ici chaque carte telle qu'on la tient en main : les
// Dresseurs et les Énergies compris, en français ET en anglais — une même carte n'a pas
// le même texte selon la langue, et l'on scanne les deux. Pokémon Pocket est exclu :
// ses cartes sont numériques, on ne les met pas devant une caméra.
//
// Images en basse définition (`low.webp`, ~245×337) : l'empreinte se calcule en 256 px.
// Rien de tout cela n'est embarqué dans l'appli. Le script reprend : un fichier déjà
// présent n'est pas retéléchargé.
//
// Usage : node ml/fetch-catalogue.mjs <dossier de données>
//   → <dossier>/catalogue/<langue>/<id>.webp et <dossier>/catalogue.json
import fs from 'node:fs';
import path from 'node:path';

const racine = process.argv[2];
if (!racine) { console.error('usage : node ml/fetch-catalogue.mjs <dossier>'); process.exit(1); }
const API = 'https://api.tcgdex.net/v2';
const LANGUES = ['fr', 'en'];
const PARALLELE = 6;

const json = async (url) => {
  for (let essai = 0; ; essai++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (essai >= 4) throw e;
      await new Promise((ok) => setTimeout(ok, 1000 * (essai + 1)));
    }
  }
};
const setDe = (id) => id.slice(0, id.lastIndexOf('-'));

const catalogue = [];
for (const lg of LANGUES) {
  const pocket = new Set((await json(`${API}/${lg}/series/tcgp`)).sets.map((s) => s.id));
  const cartes = (await json(`${API}/${lg}/cards`)).filter((c) => c.image && !pocket.has(setDe(c.id)));
  for (const c of cartes) catalogue.push({ id: c.id, lg, set: setDe(c.id), num: c.localId, nom: c.name, image: c.image });
  console.log(`${lg} : ${cartes.length} cartes avec image (Pocket exclu)`);
}
fs.writeFileSync(path.join(racine, 'catalogue.json'), JSON.stringify(catalogue));

let faits = 0, deja = 0, echecs = 0, i = 0;
const t0 = Date.now();
async function ouvrier() {
  while (i < catalogue.length) {
    const c = catalogue[i++];
    const dossier = path.join(racine, 'catalogue', c.lg);
    const fichier = path.join(dossier, `${c.id}.webp`);
    if (fs.existsSync(fichier)) { deja++; continue; }
    fs.mkdirSync(dossier, { recursive: true });
    try {
      let r;
      for (let essai = 0; ; essai++) {
        try { r = await fetch(`${c.image}/low.webp`); if (r.ok || r.status === 404) break; } catch { /* réseau */ }
        if (essai >= 3) break;
        await new Promise((ok) => setTimeout(ok, 1500 * (essai + 1)));
      }
      if (!r?.ok) { echecs++; continue; }
      fs.writeFileSync(fichier, Buffer.from(await r.arrayBuffer()));
      faits++;
      if (faits % 500 === 0) console.log(`${faits + deja} / ${catalogue.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
    } catch { echecs++; }
  }
}
await Promise.all(Array.from({ length: PARALLELE }, ouvrier));
console.log(`Fini : ${faits} téléchargées, ${deja} déjà là, ${echecs} échecs, sur ${catalogue.length}.`);
