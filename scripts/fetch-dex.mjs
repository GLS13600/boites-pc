// Génère src/data/dex-remakes.json : le Pokédex régional de chaque remake, dans son
// ordre de jeu. Usage : npm run fetch-dex
//
// Un remake ne suit pas l'ordre national : Or HeartGold classe les Johto avant les
// Kanto, Rubis Oméga a son propre ordre de Hoenn. C'est cet ordre-là qu'on veut dans
// les boîtes, sinon l'onglet n'aurait aucun intérêt par rapport à sa génération.

import { writeFile, mkdir } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';

// clé interne -> { pokédex PokéAPI, libellés }
const REMAKES = {
  frlg: { dex: 'kanto', name: 'Rouge Feu / Vert Feuille', court: 'RF/VF', region: 'Kanto', gen: 3 },
  hgss: { dex: 'updated-johto', name: 'Or HeartGold / Argent SoulSilver', court: 'HG/SS', region: 'Johto', gen: 4 },
  rosa: { dex: 'updated-hoenn', name: 'Rubis Oméga / Saphir Alpha', court: 'RO/SA', region: 'Hoenn', gen: 6 },
  lgpe: { dex: 'letsgo-kanto', name: "Let's Go Pikachu / Évoli", court: "Let's Go", region: 'Kanto', gen: 7 },
  deps: { dex: 'original-sinnoh', name: 'Diamant Étincelant / Perle Scintillante', court: 'DÉ/PS', region: 'Sinnoh', gen: 8 },
};

const idOf = (url) => Number(url.match(/\/(\d+)\/?$/)[1]);

const out = {};
for (const [cle, r] of Object.entries(REMAKES)) {
  const d = await (await fetch(`${API}/pokedex/${r.dex}`)).json();
  const liste = d.pokemon_entries
    .slice()
    .sort((a, b) => a.entry_number - b.entry_number)
    .map((e) => idOf(e.pokemon_species.url))
    // Quelques Pokédex régionaux citent des espèces hors des 1025 numéros nationaux.
    .filter((id) => id >= 1 && id <= 1025);
  out[cle] = { name: r.name, court: r.court, region: r.region, gen: r.gen, liste };
  console.log(`${r.court.padEnd(10)} ${r.dex.padEnd(16)} ${liste.length} espèces`);
}

await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../src/data/dex-remakes.json', import.meta.url), JSON.stringify(out));
console.log('\nsrc/data/dex-remakes.json écrit.');
