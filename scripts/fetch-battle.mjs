// Génère les données de la BOÎTE DE COMBAT : npm run fetch-battle
//
//   src/data/stats.json        stats de base des 1025 espèces (PV, Att, Déf, ...)
//   src/data/versions.json     les jeux jouables, dans l'ordre chronologique
//   src/data/learnsets-vg.json le moveset de chaque espèce DANS CHAQUE JEU
//
// Pourquoi un second fichier de movesets : learnsets.json ne garde qu'un seul jeu
// par espèce (le plus récent), ce qui suffit à la fiche du Pokédex. La boîte de
// combat doit pouvoir changer de version, donc il lui faut les 11 jeux moyens par
// espèce — 6 Mo, chargés à la demande par import() et non au démarrage.
//
// Réutilise scripts/.cache/ produit par fetch-moves : pas de nouvelle requête pour
// les movesets, seules les stats de base sont à aspirer.

import { writeFile, readFile, mkdir } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const CACHE = new URL('.cache/', import.meta.url);
const DATA = new URL('../src/data/', import.meta.url);
await mkdir(CACHE, { recursive: true });

const j = async (u) => {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(u); if (r.ok) return r.json(); } catch {}
    await new Promise((s) => setTimeout(s, 400 * (i + 1)));
  }
  return null;
};
const cache = async (nom, produire) => {
  const f = new URL(nom, CACHE);
  try { return JSON.parse(await readFile(f, 'utf8')); } catch {}
  const v = await produire();
  await writeFile(f, JSON.stringify(v));
  return v;
};

const LEARN = JSON.parse(await readFile(new URL('learn.json', CACHE), 'utf8'));
const VG = JSON.parse(await readFile(new URL('vg.json', CACHE), 'utf8'));
const MACH = JSON.parse(await readFile(new URL('machines.json', CACHE), 'utf8'));

// ---------- 1. Stats de base ----------
// PokéAPI ne publie pas l'historique des stats de base (certaines ont changé en
// gén. 6) : on prend les valeurs actuelles, quelle que soit la version choisie.

console.log('1/3  stats de base');
const ids = Array.from({ length: 1025 }, (_, i) => i + 1);
const CLE = { hp: 'pv', attack: 'att', defense: 'def', 'special-attack': 'atts', 'special-defense': 'defs', speed: 'vit' };

const STATS = await cache('stats.json', async () => {
  const out = {};
  let i = 0, faits = 0;
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (i < ids.length) {
      const id = ids[i++];
      const p = await j(`${API}/pokemon/${id}`);
      if (p) {
        const s = {};
        for (const st of p.stats) { const k = CLE[st.stat.name]; if (k) s[k] = st.base_stat; }
        out[id] = s;
      }
      if (++faits % 100 === 0) process.stdout.write(`\r  ${faits}/${ids.length}   `);
    }
  }));
  process.stdout.write(`\r  ${ids.length}/${ids.length}   \n`);
  return out;
});
console.log(`  ${Object.keys(STATS).length} espèces`);

// Les FORMES ont leurs propres stats de base, et l'écart est parfois énorme :
// Kyurem Blanc monte à 170 en Atq. Spé. là où Kyurem plafonne à 130. Sans elles,
// une stat relevée en jeu sur une forme ressortait « hors plage » sans raison.
//
// Seules les formes à clé NUMÉRIQUE ont une entrée /pokemon propre ; les formes
// cosmétiques partagent les stats de leur espèce.
const formes = JSON.parse(await readFile(new URL('../src/data/forms.json', import.meta.url), 'utf8'));
const clesFormes = [];
for (const liste of Object.values(formes)) {
  for (const f of liste) if (typeof f.key === 'number') clesFormes.push(f.key);
}

const STATS_FORMES = await cache('form-stats.json', async () => {
  const out = {};
  let i = 0, faits = 0;
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (i < clesFormes.length) {
      const id = clesFormes[i++];
      const p = await j(`${API}/pokemon/${id}`);
      if (p) {
        const st = {};
        for (const x of p.stats) { const k = CLE[x.stat.name]; if (k) st[k] = x.base_stat; }
        out[id] = st;
      }
      if (++faits % 100 === 0) process.stdout.write(`  formes ${faits}/${clesFormes.length}   `);
    }
  }));
  process.stdout.write(`  formes ${clesFormes.length}/${clesFormes.length}   
`);
  return out;
});
Object.assign(STATS, STATS_FORMES);
console.log(`  + ${Object.keys(STATS_FORMES).length} formes`);

// ---------- 2. Les jeux jouables ----------
// On écarte les exclusivités japonaises (doublons de Rouge/Bleu), les spin-off
// GameCube, et tout groupe sans une seule attaque par niveau — DLC et jeux dont
// PokéAPI ne connaît pas encore les movesets ressortiraient vides.

console.log('2/3  jeux');
const ECARTES = new Set(['red-green-japan', 'blue-japan', 'colosseum', 'xd']);

const utilisables = new Set();
for (const moves of Object.values(LEARN)) {
  for (const m of moves) for (const d of m.d) if (d.me === 'level-up') utilisables.add(d.vg);
}
const jeux = Object.keys(VG)
  .filter((k) => utilisables.has(k) && !ECARTES.has(k))
  .sort((a, b) => VG[a].ordre - VG[b].ordre)
  .map((k) => ({ k, nom: VG[k].label, gen: VG[k].gen }));
console.log(`  ${jeux.length} jeux retenus`);

// ---------- 3. Movesets par version ----------

console.log('3/3  movesets par version');
const dispo = new Set(jeux.map((v) => v.k));
const out = {};
let couples = 0;
for (const [id, moves] of Object.entries(LEARN)) {
  const parJeu = {};
  for (const m of moves) for (const d of m.d) {
    if (!dispo.has(d.vg)) continue;
    const g = (parJeu[d.vg] ??= { n: [], m: [], o: [], t: [] });
    if (d.me === 'level-up') g.n.push([m.id, d.lv]);
    else if (d.me === 'machine') g.m.push([m.id, MACH[`${m.id}|${d.vg}`] || 'CT']);
    else if (d.me === 'egg') g.o.push(m.id);
    else if (d.me === 'tutor') g.t.push(m.id);
  }
  for (const [vg, g] of Object.entries(parJeu)) {
    if (!g.n.length) { delete parJeu[vg]; continue; }
    g.n.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    g.m.sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'fr', { numeric: true }));
    g.o.sort((a, b) => a - b);
    g.t.sort((a, b) => a - b);
    couples++;
  }
  if (Object.keys(parJeu).length) out[id] = parJeu;
}

await writeFile(new URL('stats.json', DATA), JSON.stringify(STATS));
await writeFile(new URL('versions.json', DATA), JSON.stringify(jeux));
await writeFile(new URL('learnsets-vg.json', DATA), JSON.stringify(out));

const ko = (o) => (Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(0);
console.log(`\nstats.json         ${ko(STATS)} Ko`);
console.log(`versions.json      ${ko(jeux)} Ko`);
console.log(`learnsets-vg.json  ${(Buffer.byteLength(JSON.stringify(out)) / 1048576).toFixed(2)} Mo · ${couples} couples espèce×jeu`);
