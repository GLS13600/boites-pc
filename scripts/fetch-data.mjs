// Génère src/data/pokedex.json depuis PokéAPI.
// Usage : npm run fetch-data          (tous les Pokémon, ~10–20 min selon la connexion)
//         npm run fetch-data -- 1 151 (plage d'IDs, pratique pour tester)
// Le script reprend là où il s'était arrêté : les entrées déjà présentes sont conservées.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const OUT = new URL('../src/data/pokedex.json', import.meta.url);
const [from = 1, to = 1025] = process.argv.slice(2).map(Number);
const CONCURRENCY = 6;

// ---- cache mémoire pour les ressources partagées (lieux, versions, méthodes) ----
const COLORS = {
  black: 'Noir', blue: 'Bleu', brown: 'Brun', gray: 'Gris', green: 'Vert',
  pink: 'Rose', purple: 'Violet', red: 'Rouge', white: 'Blanc', yellow: 'Jaune',
};

const cache = new Map();
async function get(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const r = await fetch(url);
      if (r.ok) return r.json();
      if (r.status === 404) return null;
      await new Promise((res) => setTimeout(res, 800 * attempt));
    }
    throw new Error(`Échec définitif : ${url}`);
  })();
  cache.set(url, p);
  return p;
}
const fr = (names, fallback) =>
  names?.find((n) => n.language.name === 'fr')?.name ?? names?.find((n) => n.language.name === 'en')?.name ?? fallback;

// ---- versions (jeux) avec nom FR et ordre chronologique ----
async function loadVersions() {
  const list = await get(`${API}/version?limit=100`);
  const versions = {};
  let order = 0;
  for (const v of list.results) {
    const d = await get(v.url);
    versions[d.name] = { fr: fr(d.names, d.name), order: order++ };
  }
  return versions;
}

// ---- habitats (noms FR) ----
async function loadHabitats() {
  const list = await get(`${API}/pokemon-habitat?limit=50`);
  const out = {};
  for (const hb of list.results) {
    const d = await get(hb.url);
    out[hb.name] = fr(d?.names, hb.name);
  }
  return out;
}

// ---- un Pokémon ----
async function loadPokemon(id, versions, habitats) {
  const [pokemon, species, encounters] = await Promise.all([
    get(`${API}/pokemon/${id}`),
    get(`${API}/pokemon-species/${id}`),
    get(`${API}/pokemon/${id}/encounters`),
  ]);
  if (!pokemon || !species) return null;

  // Regroupe : jeu -> lieu -> méthodes
  const byGame = new Map();
  for (const area of encounters ?? []) {
    const areaData = await get(area.location_area.url);
    const locData = areaData ? await get(areaData.location.url) : null;
    const location = fr(locData?.names, area.location_area.name);
    const areaName = fr(areaData?.names, '');
    // La zone répète souvent le lieu (« Route 2 » + « Route 2 (sud) ») : on évite « Route 2 (Route 2 (sud)) ».
    const label = !areaName || areaName === location ? location
      : areaName.includes(location) ? areaName
      : `${location} (${areaName})`;

    for (const vd of area.version_details) {
      const game = vd.version.name;
      if (!byGame.has(game)) byGame.set(game, new Map());
      const places = byGame.get(game);
      if (!places.has(label)) places.set(label, { location: label, min: 100, max: 0, chance: 0, methods: new Set() });
      const pl = places.get(label);
      for (const ed of vd.encounter_details) {
        pl.min = Math.min(pl.min, ed.min_level);
        pl.max = Math.max(pl.max, ed.max_level);
        pl.chance = Math.min(100, pl.chance + ed.chance);
        pl.methods.add(ed.method.name);
      }
    }
  }

  const enc = [...byGame.entries()]
    .sort((a, b) => (versions[a[0]]?.order ?? 999) - (versions[b[0]]?.order ?? 999))
    .map(([game, places]) => ({
      game: versions[game]?.fr ?? game,
      places: [...places.values()].map((p) => ({
        ...p,
        chance: Math.min(p.chance, 100),
        methods: [...p.methods].map((method) => ({ method })),
      })),
    }));

  const flavor = species.flavor_text_entries
    ?.filter((f) => f.language.name === 'fr')
    .at(-1)?.flavor_text.replace(/[\n\f\r]/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    name: fr(species.names, pokemon.name),
    genus: fr(species.genera?.map((g) => ({ ...g, name: g.genus })), ''),
    generation: Number(species.generation.url.match(/\/(\d+)\/?$/)[1]),
    types: pokemon.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    height: pokemon.height / 10,
    weight: pokemon.weight / 10,
    habitat: species.habitat ? (habitats[species.habitat.name] ?? species.habitat.name) : null,
    color: species.color ? COLORS[species.color.name] ?? species.color.name : null,
    flavor: flavor || null,
    encounters: enc,
  };
}

// ---- boucle principale avec reprise ----
let data = {};
try { data = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* premier lancement */ }

console.log('Chargement des versions et des habitats…');
const versions = await loadVersions();
const habitats = await loadHabitats();

const ids = [];
for (let id = from; id <= to; id++) if (!data[id]) ids.push(id);
console.log(`${ids.length} Pokémon à récupérer (${from}–${to}).`);

let done = 0;
async function worker() {
  while (ids.length) {
    const id = ids.shift();
    try {
      const p = await loadPokemon(id, versions, habitats);
      if (p) data[id] = p;
    } catch (e) {
      console.error(`#${id} : ${e.message}`);
    }
    if (++done % 25 === 0) {
      await flush();
      console.log(`${done} faits…`);
    }
  }
}
async function flush() {
  await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(data).sort((a, b) => a[0] - b[0]));
  await writeFile(OUT, JSON.stringify(sorted));
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await flush();
console.log(`Terminé : ${Object.keys(data).length} Pokémon dans src/data/pokedex.json`);
