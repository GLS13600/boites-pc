// Génère src/data/typechart.json : l'efficacité des types, PAR GÉNÉRATION.
// Usage : npm run fetch-types
//
// Pourquoi par génération : la table a changé deux fois de façon majeure.
//   - gén. 1 : Spectre ne touchait pas Psy, Insecte battait Poison ;
//   - gén. 2 : refonte, séparation physique/spécial des types ;
//   - gén. 6 : arrivée de la Fée, et l'Acier cesse de résister au Spectre et aux
//     Ténèbres.
// L'application laisse choisir Rouge/Bleu : afficher la table actuelle pour une
// partie de gén. 1 donnerait des faiblesses fausses.
//
// PokéAPI expose `past_damage_relations` : chaque entrée dit « jusqu'à cette
// génération incluse, les relations étaient celles-ci ». On reconstruit donc une
// matrice complète pour chacune des 9 générations.

import { writeFile, mkdir } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const DATA = new URL('../src/data/', import.meta.url);
await mkdir(DATA, { recursive: true });

const j = async (u) => {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(u); if (r.ok) return r.json(); } catch {}
    await new Promise((s) => setTimeout(s, 400 * (i + 1)));
  }
  return null;
};

// Les 18 types de combat. On écarte `unknown` et `shadow`, qui ne sont pas jouables.
const TYPES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];
const NUM_GEN = { 'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3, 'generation-iv': 4,
  'generation-v': 5, 'generation-vi': 6, 'generation-vii': 7, 'generation-viii': 8, 'generation-ix': 9 };

console.log('rapatriement des 18 types…');
const brut = {};
for (const t of TYPES) {
  const d = await j(`${API}/type/${t}`);
  if (!d) { console.error(`échec sur ${t}`); process.exit(1); }
  brut[t] = d;
}

const nom = (x) => x.name;
// Une ligne de la matrice : ce que le type attaquant inflige à chaque défenseur.
function ligne(rel) {
  const l = {};
  for (const t of TYPES) l[t] = 1;
  for (const x of rel.double_damage_to) l[nom(x)] = 2;
  for (const x of rel.half_damage_to) l[nom(x)] = 0.5;
  for (const x of rel.no_damage_to) l[nom(x)] = 0;
  return l;
}

// Pour une génération donnée, on prend la plus ancienne entrée `past` dont la
// génération est >= à celle demandée ; sinon les relations actuelles.
function relationsPour(type, gen) {
  const d = brut[type];
  const passees = (d.past_damage_relations || [])
    .map((p) => ({ gen: NUM_GEN[p.generation.name] ?? 99, rel: p.damage_relations }))
    .sort((a, b) => a.gen - b.gen);
  for (const p of passees) if (gen <= p.gen) return p.rel;
  return d.damage_relations;
}

const chart = {};
for (let g = 1; g <= 9; g++) {
  chart[g] = {};
  for (const t of TYPES) chart[g][t] = ligne(relationsPour(t, g));
}

// Contrôle : trois faits bien connus, qui doivent ressortir de la table produite.
const verif = [
  ['gén. 1, Spectre → Psy vaut 0', chart[1].ghost.psychic === 0],
  ['gén. 6, Spectre → Psy vaut 2', chart[6].ghost.psychic === 2],
  ['gén. 5, Acier résiste au Spectre', chart[5].ghost.steel === 0.5],
  ['gén. 6, Acier ne résiste plus au Spectre', chart[6].ghost.steel === 1],
  ['gén. 6, Fée bat le Dragon', chart[6].fairy.dragon === 2],
  ['gén. 1, Insecte bat le Poison', chart[1].bug.poison === 2],
];
let ok = true;
for (const [libelle, vrai] of verif) { console.log(`  ${vrai ? '✓' : '✗'} ${libelle}`); if (!vrai) ok = false; }
if (!ok) { console.error('\nLa table produite contredit un fait connu — on n’écrit rien.'); process.exit(1); }

await writeFile(new URL('typechart.json', DATA), JSON.stringify({ types: TYPES, chart }));
const ko = (o) => (Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(0);
console.log(`\nsrc/data/typechart.json  ${ko({ types: TYPES, chart })} Ko · 9 générations × 18 × 18`);
