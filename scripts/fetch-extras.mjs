// Génère les talents et les objets tenables : npm run fetch-extras
//
//   src/data/abilities.json  les 374 talents + ceux de chaque espèce
//   src/data/items.json      les objets tenables en combat, avec leurs générations
//   public/items/*.png       leurs sprites réels
//
// **Piège : l'attribut `holdable` de PokéAPI est inexploitable.** Il rate toutes les
// gemmes Méga et les objets modernes (Veste de Combat, Casque Brut, Évoluroc) tout en
// incluant des Poké Balls, des potions et des vitamines. On passe donc par les
// CATÉGORIES d'objets, qui sont fiables et bien découpées.

import { writeFile, readFile, mkdir } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const CACHE = new URL('.cache/', import.meta.url);
const DATA = new URL('../src/data/', import.meta.url);
const SPRITES = new URL('../public/items/', import.meta.url);
await mkdir(CACHE, { recursive: true });
await mkdir(SPRITES, { recursive: true });

const j = async (u) => {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(u); if (r.ok) return r.json(); } catch {}
    await new Promise((s) => setTimeout(s, 400 * (i + 1)));
  }
  return null;
};
const fr = (arr, champ = 'name') =>
  arr?.find((e) => e.language?.name === 'fr')?.[champ] ??
  arr?.find((e) => e.language?.name === 'en')?.[champ] ?? null;
const propre = (t) => (t || '').replace(/[\n\f­]/g, ' ').replace(/\s+/g, ' ').trim() || null;

const cache = async (nom, produire) => {
  const f = new URL(nom, CACHE);
  try { return JSON.parse(await readFile(f, 'utf8')); } catch {}
  const v = await produire();
  await writeFile(f, JSON.stringify(v));
  return v;
};

async function enParallele(items, n, fn, libelle) {
  const out = new Array(items.length);
  let i = 0, faits = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
      if (++faits % 100 === 0) process.stdout.write(`\r  ${libelle} ${faits}/${items.length}   `);
    }
  }));
  process.stdout.write(`\r  ${libelle} ${items.length}/${items.length}   \n`);
  return out;
}

const NUM_GEN = { 'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3, 'generation-iv': 4,
  'generation-v': 5, 'generation-vi': 6, 'generation-vii': 7, 'generation-viii': 8, 'generation-ix': 9 };

// ---------- 1. Les talents ----------

console.log('1/4  talents');
const TALENTS = await cache('abilities.json', async () => {
  const liste = (await j(`${API}/ability?limit=1000`)).results;
  const res = await enParallele(liste, 20, (a) => j(a.url), 'talents');
  const out = {};
  for (const a of res) {
    if (!a) continue;
    out[a.name] = {
      n: fr(a.names) || a.name,
      // La description des jeux est plus parlante que l'effet technique.
      d: propre(fr(a.flavor_text_entries?.slice().reverse(), 'flavor_text')
        ?? fr(a.effect_entries, 'short_effect')),
      g: NUM_GEN[a.generation?.name] ?? 3,
    };
  }
  return out;
});
console.log(`  ${Object.keys(TALENTS).length} talents`);

// ---------- 2. Les talents de chaque espèce ----------

console.log('2/4  talents par espèce');
const ids = Array.from({ length: 1025 }, (_, i) => i + 1);
const PAR_ESPECE = await cache('species-abilities.json', async () => {
  const res = await enParallele(ids, 16, async (id) => {
    const p = await j(`${API}/pokemon/${id}`);
    if (!p) return null;
    return p.abilities.map((a) => [a.ability.name, a.is_hidden ? 1 : 0]);
  }, 'espèces');
  return Object.fromEntries(ids.map((id, k) => [id, res[k]]).filter(([, v]) => v && v.length));
});
console.log(`  ${Object.keys(PAR_ESPECE).length} espèces`);

// Les FORMES ont leurs propres talents, et ils font toute la différence : Kyurem
// Blanc a Turbo Brasier là où Kyurem a Pression, Méga-Dracaufeu X a Dur-à-Cuire là
// où Dracaufeu a Brasier. Sans elles, ces talents étaient inatteignables.
//
// Seules les formes à clé NUMÉRIQUE ont une entrée /pokemon propre. Les formes
// cosmétiques (clé en toutes lettres, « deerling-winter ») n'en ont pas et
// partagent de toute façon les talents de leur espèce : on les laisse de côté.
const formes = JSON.parse(await readFile(new URL('../src/data/forms.json', import.meta.url), 'utf8'));
const clesFormes = [];
for (const liste of Object.values(formes)) {
  for (const f of liste) if (typeof f.key === 'number') clesFormes.push(f.key);
}
console.log(`     + ${clesFormes.length} formes à clé numérique`);

const PAR_FORME = await cache('form-abilities.json', async () => {
  const res = await enParallele(clesFormes, 16, async (id) => {
    const p = await j(`${API}/pokemon/${id}`);
    if (!p) return null;
    return p.abilities.map((a) => [a.ability.name, a.is_hidden ? 1 : 0]);
  }, 'formes');
  return Object.fromEntries(clesFormes.map((id, k) => [id, res[k]]).filter(([, v]) => v && v.length));
});
console.log(`  ${Object.keys(PAR_FORME).length} formes renseignées`);
Object.assign(PAR_ESPECE, PAR_FORME);

// ---------- 3. Les objets tenables ----------
//
// Catégories retenues : tout ce qu'un Pokémon peut porter et qui agit en combat.
// On écarte volontairement les Poké Balls, les soins hors combat, les CT, les
// cristaux Dynamax et les ingrédients de cuisine.

console.log('3/4  objets tenables');
const CATEGORIES = [
  'mega-stones', 'held-items', 'choice', 'species-specific', 'type-enhancement',
  'type-protection', 'plates', 'jewels', 'memories', 'z-crystals', 'in-a-pinch',
  'bad-held-items', 'effort-training', 'effort-drop', 'picky-healing', 'training',
  'scarves',
];

const OBJETS = await cache('items.json', async () => {
  const noms = new Set();
  for (const c of CATEGORIES) {
    const d = await j(`${API}/item-category/${c}`);
    if (!d) { console.error(`catégorie inconnue : ${c}`); process.exit(1); }
    for (const it of d.items) noms.add(it.name);
  }
  const res = await enParallele([...noms], 20, (n) => j(`${API}/item/${n}`), 'objets');
  const out = {};
  for (const it of res) {
    if (!it) continue;
    const gens = [...new Set((it.game_indices ?? []).map((g) => NUM_GEN[g.generation?.name]).filter(Boolean))];
    out[it.name] = {
      n: fr(it.names) || it.name,
      c: it.category?.name ?? null,
      d: propre(fr(it.flavor_text_entries, 'text') ?? fr(it.effect_entries, 'short_effect')),
      g: gens.sort((a, b) => a - b),
      s: it.sprites?.default ?? null,
    };
  }
  return out;
});
console.log(`  ${Object.keys(OBJETS).length} objets`);
const sansGen = Object.values(OBJETS).filter((o) => !o.g.length).length;
console.log(`  dont ${sansGen} sans génération connue (affichés dans tous les jeux)`);

// ---------- 4. Leurs sprites ----------

console.log('4/4  sprites des objets');
let ecrits = 0, absents = 0, octets = 0;
const manquants = [];
await enParallele(Object.entries(OBJETS), 16, async ([nom, o]) => {
  if (!o.s) { absents++; manquants.push(nom); return; }
  const dest = new URL(`${nom}.png`, SPRITES);
  try { await readFile(dest); return; } catch {}
  const r = await fetch(o.s);
  if (!r.ok) { absents++; manquants.push(nom); return; }
  const b = Buffer.from(await r.arrayBuffer());
  await writeFile(dest, b);
  ecrits++; octets += b.length;
}, 'sprites');
console.log(`  ${ecrits} écrits (${(octets / 1024).toFixed(0)} Ko), ${absents} sans sprite`);
if (manquants.length) console.log(`  sans sprite : ${manquants.slice(0, 10).join(', ')}`);

// Les objets sans sprite sont écartés : ce sont presque tous des gemmes Méga
// présentes dans les données des jeux mais jamais distribuées (Mélofeenite,
// Empifloutite…). Les proposer donnerait une liste trouée d'entrées inobtenables.
for (const nom of manquants) delete OBJETS[nom];
// L'URL du sprite ne sert plus une fois le fichier rapatrié : on l'ôte du JSON.
for (const o of Object.values(OBJETS)) delete o.s;
console.log(`  ${Object.keys(OBJETS).length} objets conservés (avec sprite)`);

// ---------- 5. Les natures ----------
//
// 25 natures : 5 neutres, et 20 qui augmentent une stat de 10 % en en diminuant une
// autre d'autant. Sans elles, une stat relevée en jeu tombe presque toujours hors de
// la plage des IV — c'est le premier écart systématique, avant même les EV.

console.log('5/5  natures');
const CLE_STAT = { attack: 'att', defense: 'def', 'special-attack': 'atts',
  'special-defense': 'defs', speed: 'vit' };

const NATURES = await cache('natures.json', async () => {
  const liste = (await j(`${API}/nature?limit=100`)).results;
  const res = await enParallele(liste, 12, (n) => j(n.url), 'natures');
  return res.filter(Boolean).map((n) => ({
    k: n.name,
    n: fr(n.names) || n.name,
    p: CLE_STAT[n.increased_stat?.name] ?? null,
    m: CLE_STAT[n.decreased_stat?.name] ?? null,
  })).sort((x, y) => x.n.localeCompare(y.n, 'fr'));
});
const neutres = NATURES.filter((n) => !n.p || n.p === n.m).length;
console.log(`  ${NATURES.length} natures, dont ${neutres} neutres`);
if (NATURES.length !== 25) { console.error('25 natures attendues'); process.exit(1); }

await writeFile(new URL('natures.json', DATA), JSON.stringify(NATURES));

await writeFile(new URL('abilities.json', DATA), JSON.stringify({ list: TALENTS, of: PAR_ESPECE }));
await writeFile(new URL('items.json', DATA), JSON.stringify(OBJETS));

const ko = (o) => (Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(0);
console.log(`\nsrc/data/abilities.json  ${ko({ list: TALENTS, of: PAR_ESPECE })} Ko`);
console.log(`src/data/items.json      ${ko(OBJETS)} Ko`);
const ex = PAR_ESPECE[6];
if (ex) console.log(`\nexemple : Dracaufeu → ${ex.map(([a, h]) => TALENTS[a]?.n + (h ? ' (caché)' : '')).join(', ')}`);
