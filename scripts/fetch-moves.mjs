// Génère src/data/moves.json et src/data/learnsets.json : les attaques de chaque
// espèce et leur mode d'obtention. Usage : npm run fetch-moves
//
// Choix de conception :
//
//   - Une espèce apparaît dans jusqu'à 25 « version groups », avec un moveset
//     différent dans chacun. Tout embarquer ferait plusieurs dizaines de Mo pour une
//     information que personne ne lit. On ne garde que le jeu le PLUS RÉCENT où
//     l'espèce apparaît, et la fiche annonce lequel.
//   - CT et CS ne se distinguent pas dans `move_learn_method` : les deux valent
//     `machine`. Il faut passer par /machine, qui donne l'objet réel (`tm39`, `hm01`)
//     — c'est ce qui permet d'écrire « CT39 » plutôt qu'un vague « Machine ».
//   - Les attaques sont rattachées à l'ESPÈCE, pas à la forme : la fiche d'une forme
//     emprunte déjà l'entrée de son espèce pour les types et les lieux de capture.
//
// Le script met en cache chaque étape dans scripts/.cache/ : une reprise après
// coupure ne refait pas les 4 300 requêtes.

import { writeFile, readFile, mkdir } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const CACHE = new URL('.cache/', import.meta.url);
const DATA = new URL('../src/data/', import.meta.url);
await mkdir(CACHE, { recursive: true });
await mkdir(DATA, { recursive: true });

const j = async (u) => {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(u); if (r.ok) return r.json(); } catch {}
    await new Promise((s) => setTimeout(s, 400 * (i + 1)));
  }
  return null;
};

// PokéAPI fournit le français pour presque tout ; repli sur l'anglais sinon.
const fr = (arr, champ = 'name') =>
  arr?.find((e) => e.language?.name === 'fr')?.[champ] ??
  arr?.find((e) => e.language?.name === 'en')?.[champ] ?? null;

// Exécuteur à parallélisme borné, avec compteur de progression.
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

const cache = async (nom, produire) => {
  const f = new URL(nom, CACHE);
  try { return JSON.parse(await readFile(f, 'utf8')); } catch {}
  const v = await produire();
  await writeFile(f, JSON.stringify(v));
  return v;
};

// ---------- 1. Version groups : ordre chronologique et libellé français ----------

console.log('1/4  version groups');
const VG = await cache('vg.json', async () => {
  const liste = (await j(`${API}/version-group?limit=100`)).results;
  const out = {};
  for (const v of liste) {
    const d = await j(v.url);
    if (!d) continue;
    const noms = [];
    for (const ver of d.versions) {
      const dv = await j(ver.url);
      const n = dv && fr(dv.names);
      if (n) noms.push(n);
    }
    out[d.name] = { ordre: d.order ?? d.id, gen: d.generation.name, label: noms.join(' / ') || d.name };
  }
  return out;
});
console.log(`  ${Object.keys(VG).length} groupes de versions`);

// ---------- 2. Machines : quel objet apprend quoi, et dans quel jeu ----------

console.log('2/4  machines (CT / CS)');
const MACH = await cache('machines.json', async () => {
  const liste = (await j(`${API}/machine?limit=5000`)).results;
  const res = await enParallele(liste, 24, (m) => j(m.url), 'machines');
  const out = {};
  for (const m of res) {
    if (!m) continue;
    const id = Number(m.move.url.match(/\/(\d+)\/?$/)[1]);
    // « tm39 » -> CT39, « hm01 » -> CS01. C'est le seul endroit où l'info existe.
    const objet = m.item.name;
    const num = objet.replace(/^[a-z]+/, '');
    out[`${id}|${m.version_group.name}`] = objet.startsWith('hm') ? `CS${num}` : `CT${num}`;
  }
  return out;
});
console.log(`  ${Object.keys(MACH).length} entrées`);

// ---------- 3. Les attaques elles-mêmes ----------

console.log('3/4  attaques');
const MOVES = await cache('moves.json', async () => {
  const liste = (await j(`${API}/move?limit=2000`)).results;
  const res = await enParallele(liste, 24, (m) => j(m.url), 'attaques');
  const out = {};
  for (const m of res) {
    if (!m) continue;
    // La description des jeux est plus parlante que l'effet technique ; on prend la
    // plus récente en français, et on retombe sur l'effet court sinon.
    const flavor = fr(m.flavor_text_entries.slice().reverse(), 'flavor_text');
    const effet = fr(m.effect_entries, 'short_effect');
    out[m.id] = {
      n: fr(m.names) || m.name,
      t: m.type?.name ?? null,
      c: m.damage_class?.name ?? null,
      p: m.power, a: m.accuracy, pp: m.pp,
      d: (flavor || effet || '').replace(/[\n\f­]/g, ' ').replace(/\s+/g, ' ').trim() || null,
    };
  }
  return out;
});
console.log(`  ${Object.keys(MOVES).length} attaques`);

// ---------- 4. Le moveset de chaque espèce, dans son jeu le plus récent ----------

console.log('4/4  movesets');
const ids = Array.from({ length: 1025 }, (_, i) => i + 1);
const LEARN = await cache('learn.json', async () => {
  const res = await enParallele(ids, 16, async (id) => {
    const p = await j(`${API}/pokemon/${id}`);
    if (!p) return null;
    return p.moves.map((m) => ({
      id: Number(m.move.url.match(/\/(\d+)\/?$/)[1]),
      d: m.version_group_details.map((v) => ({
        vg: v.version_group.name, lv: v.level_learned_at, me: v.move_learn_method.name,
      })),
    }));
  }, 'espèces');
  return Object.fromEntries(ids.map((id, k) => [id, res[k]]).filter(([, v]) => v));
});

const learnsets = {};
for (const [id, moves] of Object.entries(LEARN)) {
  // Le jeu le plus récent où l'espèce apparaît — mais seulement parmi ceux qui
  // apprennent vraiment des attaques par niveau.
  //
  // Sans ce filtre, 207 espèces tombaient sur « Champions », dont PokéAPI ne connaît
  // les attaques que par la méthode `train` : les quatre catégories ressortaient
  // vides et Dracaufeu s'affichait sans une seule attaque. On retient donc le jeu le
  // plus récent qui donne un moveset exploitable, et on retombe sur le plus récent
  // tout court si aucun ne convient.
  let meilleur = null, ordre = -1, repli = null, ordreRepli = -1;
  const parNiveau = new Set();
  for (const m of moves) for (const d of m.d) {
    if (d.me === 'level-up') parNiveau.add(d.vg);
  }
  for (const m of moves) for (const d of m.d) {
    const o = VG[d.vg]?.ordre ?? -1;
    if (o > ordreRepli) { ordreRepli = o; repli = d.vg; }
    if (parNiveau.has(d.vg) && o > ordre) { ordre = o; meilleur = d.vg; }
  }
  meilleur = meilleur || repli;
  if (!meilleur) continue;

  const niveau = [], machine = [], oeuf = [], tuteur = [];
  for (const m of moves) {
    for (const d of m.d) {
      if (d.vg !== meilleur) continue;
      if (d.me === 'level-up') niveau.push([m.id, d.lv]);
      else if (d.me === 'machine') machine.push([m.id, MACH[`${m.id}|${meilleur}`] || 'CT']);
      else if (d.me === 'egg') oeuf.push(m.id);
      else if (d.me === 'tutor') tuteur.push(m.id);
    }
  }
  const nom = (x) => MOVES[x]?.n ?? '';
  niveau.sort((a, b) => a[1] - b[1] || nom(a[0]).localeCompare(nom(b[0]), 'fr'));
  machine.sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'fr', { numeric: true }));
  oeuf.sort((a, b) => nom(a).localeCompare(nom(b), 'fr'));
  tuteur.sort((a, b) => nom(a).localeCompare(nom(b), 'fr'));

  learnsets[id] = { j: VG[meilleur]?.label || meilleur, n: niveau, m: machine, o: oeuf, t: tuteur };
}

// On ne garde que les attaques réellement citées : inutile d'embarquer les autres.
const utilisees = new Set();
for (const l of Object.values(learnsets)) {
  for (const [i] of l.n) utilisees.add(i);
  for (const [i] of l.m) utilisees.add(i);
  for (const i of l.o) utilisees.add(i);
  for (const i of l.t) utilisees.add(i);
}
const dict = Object.fromEntries(
  [...utilisees].sort((a, b) => a - b).map((i) => [i, MOVES[i]]).filter(([, v]) => v)
);

await writeFile(new URL('moves.json', DATA), JSON.stringify(dict));
await writeFile(new URL('learnsets.json', DATA), JSON.stringify(learnsets));

const ko = (o) => (Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(0);
console.log(`\nsrc/data/moves.json      ${Object.keys(dict).length} attaques, ${ko(dict)} Ko`);
console.log(`src/data/learnsets.json  ${Object.keys(learnsets).length} espèces, ${ko(learnsets)} Ko`);
const ex = learnsets[6];
if (ex) console.log(`\nexemple (Dracaufeu, ${ex.j}) : ${ex.n.length} par niveau, ${ex.m.length} par CT/CS, ${ex.o.length} par œuf, ${ex.t.length} par maître`);
