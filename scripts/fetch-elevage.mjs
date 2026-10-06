// Données d'ÉLEVAGE et de CAPTURE de chaque espèce : npm run fetch-elevage
//
//   src/data/elevage.json
//
// Ce que les joueurs viennent chercher en cours de partie et que la fiche ne disait
// pas : taux de capture, groupes d'œufs, répartition des sexes, cycles d'éclosion,
// EV rapportés au K.O., expérience de base, courbe d'expérience, bonheur de départ.
// Tout vient de PokéAPI (/pokemon-species et /pokemon), aspiré une fois et embarqué.
//
// Format compact, une entrée par espèce :
//   c  taux de capture (3 à 255)
//   b  bonheur de base (peut être null)
//   s  taux de femelles en HUITIÈMES, -1 = asexué
//   e  cycles d'éclosion (hatch_counter)
//   o  groupes d'œufs (slugs)
//   r  courbe d'expérience (slug)
//   v  EV rapportés : [PV, Att, Déf, Atq.Spé, Déf.Spé, Vit]
//   x  expérience de base (peut être null)
//   l  'L' légendaire, 'M' fabuleux, 'B' bébé — absent sinon
// Plus `groupes` : le nom des groupes d'œufs dans les trois langues de l'appli.
//
// Le script REPREND comme les autres : un cache par requête dans scripts/.cache/.

import { writeFile, readFile, mkdir } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const CACHE = new URL('.cache/elevage/', import.meta.url);
const DATA = new URL('../src/data/', import.meta.url);
await mkdir(CACHE, { recursive: true });

const j = async (u) => {
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(u); if (r.ok) return r.json(); } catch {}
    await new Promise((s) => setTimeout(s, 500 * (i + 1)));
  }
  return null;
};
const enCache = async (nom, url) => {
  const f = new URL(nom, CACHE);
  try { return JSON.parse(await readFile(f, 'utf8')); } catch {}
  const v = await j(url);
  if (v) await writeFile(f, JSON.stringify(v));
  return v;
};

async function enParallele(items, n, fn) {
  const out = new Array(items.length);
  let i = 0, faits = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
      if (++faits % 100 === 0) process.stdout.write(`  ${faits}/${items.length}\n`);
    }
  }));
  return out;
}

const ORDRE_STATS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
const ids = Array.from({ length: 1025 }, (_, i) => i + 1);

const sortie = {};
const manquants = [];
await enParallele(ids, 12, async (id) => {
  const [sp, po] = await Promise.all([
    enCache(`species-${id}.json`, `${API}/pokemon-species/${id}`),
    enCache(`pokemon-${id}.json`, `${API}/pokemon/${id}`),
  ]);
  if (!sp || !po) { manquants.push(id); return; }
  const v = ORDRE_STATS.map((n) => po.stats.find((s) => s.stat.name === n)?.effort ?? 0);
  sortie[id] = {
    c: sp.capture_rate,
    b: sp.base_happiness,
    s: sp.gender_rate,
    e: sp.hatch_counter,
    o: sp.egg_groups.map((g) => g.name),
    r: sp.growth_rate?.name ?? null,
    v,
    x: po.base_experience,
    ...(sp.is_legendary ? { l: 'L' } : sp.is_mythical ? { l: 'M' } : sp.is_baby ? { l: 'B' } : {}),
  };
});
if (manquants.length) {
  console.error(`Espèces sans réponse : ${manquants.join(', ')} — relancer le script.`);
  process.exit(1);
}

// Noms des groupes d'œufs, dans les trois langues de l'appli.
const groupes = {};
const tous = [...new Set(Object.values(sortie).flatMap((e) => e.o))].sort();
for (const g of tous) {
  const d = await enCache(`egg-group-${g}.json`, `${API}/egg-group/${g}`);
  const nom = (l) => d?.names.find((n) => n.language.name === l)?.name;
  groupes[g] = { fr: nom('fr') ?? g, en: nom('en') ?? g, ja: nom('ja-hrkt') ?? nom('ja') ?? nom('en') ?? g };
}

// Garde-fous sur des faits connus : une lecture fausse donnerait des valeurs
// plausibles, impossibles à repérer à l'œil.
const verifie = (nom, ok) => { if (!ok) { console.error(`ÉCHEC du contrôle : ${nom}`); process.exit(1); } };
verifie('Bulbizarre : capture 45, 1/8 de femelles, Monstrueux + Végétal',
  sortie[1].c === 45 && sortie[1].s === 1 && sortie[1].o.join() === 'monster,plant');
verifie('Bulbizarre rapporte 1 EV en Atq. Spé.', sortie[1].v.join() === '0,0,0,1,0,0');
verifie('Magnéti asexué', sortie[81].s === -1);
verifie('Mewtwo légendaire, capture 3', sortie[150].l === 'L' && sortie[150].c === 3);
verifie('Mew fabuleux', sortie[151].l === 'M');
verifie('Pichu bébé, sans œuf', sortie[172].l === 'B' && sortie[172].o.includes('no-eggs'));
verifie('Métamorph : groupe Métamorph', sortie[132].o.join() === 'ditto');

await writeFile(new URL('elevage.json', DATA), JSON.stringify({ especes: sortie, groupes }));
const ko = (Buffer.byteLength(JSON.stringify({ especes: sortie, groupes })) / 1024).toFixed(0);
console.log(`elevage.json : ${Object.keys(sortie).length} espèces, ${tous.length} groupes d'œufs, ${ko} Ko`);
