// Complète src/data/moves.json pour le menu des attaques de la boîte de combat :
//   - TOUTES les attaques apprenables dans les 21 jeux (learnsets-vg.json), et non plus
//     les seules citées par learnsets.json — il en manquait 102, surtout celles retirées
//     d'Écarlate / Violet (Coupe-Vent, Draco-Rage…) ;
//   - `g` : la génération où l'attaque apparaît ;
//   - `h` : ses valeurs PAR GÉNÉRATION quand elles diffèrent d'aujourd'hui — puissance,
//     précision, PP, type. Charge valait 35 de puissance et 95 de précision jusqu'à la
//     gén. 4, Morsure était de type Normal en gén. 1, Charme Normal jusqu'à la gén. 5.
//
// Usage : npm run fetch-moves-gen — APRÈS fetch-moves et fetch-battle, dont il relit
// le cache (scripts/.cache/moves.json, vg.json) et les fichiers produits. Relancer
// fetch-moves seul ramènerait moves.json à ses seules attaques citées.
//
// Lecture de `past_values` chez PokéAPI (vérifiée sur Charge, Morsure, Charme) : chaque
// entrée porte les valeurs EN VIGUEUR AVANT son version group ; un champ `null` n'a pas
// changé à cette étape. On part donc des valeurs actuelles, et on remonte le temps.

import { writeFile, readFile } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const CACHE = new URL('.cache/', import.meta.url);
const DATA = new URL('../src/data/', import.meta.url);

const lis = async (url) => JSON.parse(await readFile(url, 'utf8'));
const j = async (u) => {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(u); if (r.ok) return r.json(); } catch {}
    await new Promise((s) => setTimeout(s, 400 * (i + 1)));
  }
  return null;
};

const NUM = {
  'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3, 'generation-iv': 4, 'generation-v': 5,
  'generation-vi': 6, 'generation-vii': 7, 'generation-viii': 8, 'generation-ix': 9,
};

const BASE = await lis(new URL('moves.json', CACHE));          // 937 attaques, champs actuels
const VG = await lis(new URL('vg.json', CACHE));               // ordre et génération des version groups
const JEUX = await lis(new URL('versions.json', DATA));
const LEARN = await lis(new URL('learnsets.json', DATA));
const LEARN_VG = await lis(new URL('learnsets-vg.json', DATA));

// Les attaques à embarquer : citées par la fiche du Pokédex OU par un jeu jouable.
const ids = new Set();
const cite = (l) => {
  for (const [i] of l.n) ids.add(i);
  for (const [i] of l.m) ids.add(i);
  for (const i of l.o) ids.add(i);
  for (const i of l.t) ids.add(i);
};
for (const l of Object.values(LEARN)) cite(l);
for (const jeux of Object.values(LEARN_VG)) for (const l of Object.values(jeux)) cite(l);
const liste = [...ids].filter((i) => BASE[i]).sort((a, b) => a - b);
console.log(`${liste.length} attaques à embarquer (${ids.size - liste.length} inconnues du cache)`);

// Historique : un cache à part, pour ne pas refaire les requêtes à la relance.
const fichierHisto = new URL('moves-histoire.json', CACHE);
let HISTO = {};
try { HISTO = await lis(fichierHisto); } catch {}
const aFaire = liste.filter((i) => !HISTO[i]);
let i = 0, faits = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (i < aFaire.length) {
    const id = aFaire[i++];
    const m = await j(`${API}/move/${id}`);
    if (m) {
      HISTO[id] = {
        g: NUM[m.generation?.name] ?? null,
        past: (m.past_values || []).map((p) => ({
          vg: p.version_group.name, p: p.power, a: p.accuracy, pp: p.pp, t: p.type?.name ?? null,
        })),
      };
    }
    if (++faits % 100 === 0) process.stdout.write(`\r  historique ${faits}/${aFaire.length}   `);
  }
}));
if (aFaire.length) process.stdout.write(`\r  historique ${aFaire.length}/${aFaire.length}   \n`);
await writeFile(fichierHisto, JSON.stringify(HISTO));

// Ordre représentatif de chaque génération : son DERNIER jeu jouable.
const ordreGen = {};
for (const v of JEUX) {
  const g = NUM[v.gen], o = VG[v.k]?.ordre ?? 0;
  if (g && (ordreGen[g] ?? -1) < o) ordreGen[g] = o;
}

const sortie = {};
let historiques = 0;
for (const id of liste) {
  const b = BASE[id];
  const histo = HISTO[id] || { g: null, past: [] };
  const passes = histo.past
    .map((p) => ({ ...p, ordre: VG[p.vg]?.ordre ?? Infinity }))
    .sort((x, y) => y.ordre - x.ordre); // du plus récent au plus ancien
  const h = {};
  for (let g = histo.g || 1; g <= 9; g++) {
    if (ordreGen[g] == null) continue;
    const v = { p: b.p, a: b.a, pp: b.pp, t: b.t };
    // Chaque entrée postérieure au jeu vaut « avant ce changement » : la plus ancienne
    // qui s'applique l'emporte, d'où l'application du plus récent au plus ancien.
    for (const x of passes) {
      if (ordreGen[g] >= x.ordre) continue;
      for (const k of ['p', 'a', 'pp', 't']) if (x[k] != null) v[k] = x[k];
    }
    const diff = {};
    for (const k of ['p', 'a', 'pp', 't']) if (v[k] !== b[k]) diff[k] = v[k];
    if (Object.keys(diff).length) h[g] = diff;
  }
  if (Object.keys(h).length) historiques++;
  sortie[id] = { ...b, ...(histo.g ? { g: histo.g } : {}), ...(Object.keys(h).length ? { h } : {}) };
}

// Garde-fous sur des faits connus : une lecture fausse de past_values donnerait des
// valeurs plausibles, impossibles à repérer à l'œil.
const verifie = (nom, ok) => { if (!ok) { console.error(`ÉCHEC du contrôle : ${nom}`); process.exit(1); } };
verifie('Charge 35 / 95 en gén. 1', sortie[33]?.h?.[1]?.p === 35 && sortie[33]?.h?.[1]?.a === 95);
verifie('Charge 50 en gén. 6', sortie[33]?.h?.[6]?.p === 50 && sortie[33]?.h?.[6]?.a === undefined);
verifie('Charge actuelle en gén. 9', !sortie[33]?.h?.[9]);
verifie('Morsure Normal en gén. 1, Ténèbres en gén. 2', sortie[44]?.h?.[1]?.t === 'normal' && !sortie[44]?.h?.[2]);
verifie('Charme Normal en gén. 5, Fée en gén. 6', sortie[204]?.h?.[5]?.t === 'normal' && !sortie[204]?.h?.[6]);
verifie('Charme apparaît en gén. 2', sortie[204]?.g === 2);

await writeFile(new URL('moves.json', DATA), JSON.stringify(sortie));
const ko = (Buffer.byteLength(JSON.stringify(sortie)) / 1024).toFixed(0);
console.log(`moves.json : ${liste.length} attaques, ${historiques} avec un historique, ${ko} Ko`);
