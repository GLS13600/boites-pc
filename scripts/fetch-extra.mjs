// Génère src/data/evolutions.json et src/data/forms.json depuis PokéAPI.
// Usage : npm run fetch-extra          (tout)
//         npm run fetch-extra -- 1 151 (plage d'IDs d'espèces)
// Le script reprend là où il s'est arrêté, comme fetch-data.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const OUT_EVO = new URL('../src/data/evolutions.json', import.meta.url);
const OUT_FORMS = new URL('../src/data/forms.json', import.meta.url);
const [from = 1, to = 1025] = process.argv.slice(2).map(Number);
const CONCURRENCY = 6;

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
const idOf = (url) => Number(url.match(/\/(\d+)\/?$/)[1]);

// Libellé français d'une ressource citée par une condition (objet, capacité, lieu…).
const label = async (ref, kind) => (ref ? fr((await get(`${API}/${kind}/${ref.name}`))?.names, ref.name) : null);

const MOMENTS = { day: 'le jour', night: 'la nuit', dusk: 'au crépuscule' };
const GENRES = { 1: 'femelle', 2: 'mâle' };

// Traduit un bloc evolution_details en une phrase lisible.
async function condition(d) {
  const bouts = [];
  const t = d.trigger?.name;

  if (t === 'level-up') bouts.push(d.min_level ? `Niveau ${d.min_level}` : 'Montée de niveau');
  else if (t === 'use-item') bouts.push(`Utiliser ${await label(d.item, 'item')}`);
  else if (t === 'trade') bouts.push('Échange');
  else if (t === 'shed') bouts.push('Mue (place libre + Poké Ball)');
  else if (t === 'spin') bouts.push('Tourner sur soi-même');
  else if (t === 'tower-of-darkness') bouts.push('Tour des Ténèbres');
  else if (t === 'tower-of-waters') bouts.push("Tour de l'Eau");
  else if (t === 'three-critical-hits') bouts.push('3 coups critiques dans un combat');
  else if (t === 'take-damage') bouts.push('Subir des dégâts après un passage précis');
  else if (t === 'agile-style-move') bouts.push('Capacité en style Rapidité');
  else if (t === 'strong-style-move') bouts.push('Capacité en style Puissance');
  else if (t === 'recoil-damage') bouts.push('Dégâts de recul encaissés');
  else if (t === 'other') bouts.push('Condition particulière');
  else if (t) bouts.push(t);

  if (d.held_item) bouts.push(`en tenant ${await label(d.held_item, 'item')}`);
  if (d.known_move) bouts.push(`en connaissant ${await label(d.known_move, 'move')}`);
  if (d.known_move_type) bouts.push(`en connaissant une capacité ${await label(d.known_move_type, 'type')}`);
  if (d.min_happiness) bouts.push('avec un bonheur élevé');
  if (d.min_affection) bouts.push("avec beaucoup d'affection");
  if (d.min_beauty) bouts.push('avec beaucoup de beauté');
  if (d.location) bouts.push(`à ${await label(d.location, 'location')}`);
  if (d.time_of_day && MOMENTS[d.time_of_day]) bouts.push(MOMENTS[d.time_of_day]);
  if (d.gender) bouts.push(`(${GENRES[d.gender] ?? d.gender})`);
  if (d.needs_overworld_rain) bouts.push('sous la pluie');
  if (d.turn_upside_down) bouts.push('console retournée');
  if (d.party_species) bouts.push(`avec ${d.party_species.name} dans l'équipe`);
  if (d.party_type) bouts.push(`avec un Pokémon ${await label(d.party_type, 'type')} dans l'équipe`);
  if (d.trade_species) bouts.push(`contre ${d.trade_species.name}`);
  if (d.relative_physical_stats === 1) bouts.push('Attaque > Défense');
  if (d.relative_physical_stats === -1) bouts.push('Attaque < Défense');
  if (d.relative_physical_stats === 0) bouts.push('Attaque = Défense');

  return bouts.join(' ');
}

// Nature d'une forme. Le slug est le signal le plus fiable ; les drapeaux de
// PokéAPI (is_mega) sont incomplets selon les entrées.
const REGIONS = { alola: 'Alola', galar: 'Galar', hisui: 'Hisui', paldea: 'Paldea' };
function kindOf(slug, f) {
  if (/-mega(-|$)/.test(slug)) return 'mega';
  if (/-gmax(-|$)/.test(slug)) return 'gmax';
  for (const r of Object.keys(REGIONS)) if (new RegExp('-' + r + '(-|$)').test(slug)) return 'region';
  if (/-totem(-|$)/.test(slug)) return 'totem';
  if (/-cap(-|$)/.test(slug)) return 'event';
  if (f?.is_battle_only) return 'combat';
  return 'autre';
}

// Aplatit une chaîne d'évolution en liste { id, from, how }.
async function flatten(node, from, out) {
  const id = idOf(node.species.url);
  const hows = [];
  for (const d of node.evolution_details ?? []) {
    const c = await condition(d);
    if (c) hows.push(c);
  }
  out.push({ id, from, how: hows.length ? hows.join(' ou ') : null });
  for (const next of node.evolves_to ?? []) await flatten(next, id, out);
  return out;
}

// ---- état repris ----
let evo = { chains: [], of: {} };
let forms = {};
try { evo = JSON.parse(await readFile(OUT_EVO, 'utf8')); } catch { /* premier lancement */ }
try { forms = JSON.parse(await readFile(OUT_FORMS, 'utf8')); } catch { /* premier lancement */ }

const chainIndex = new Map(); // url de chaîne -> index dans evo.chains
evo.chains.forEach((c, i) => { if (c.url) chainIndex.set(c.url, i); });

const ids = [];
for (let id = from; id <= to; id++) if (evo.of[id] === undefined || forms[id] === undefined) ids.push(id);
console.log(`${ids.length} espèces à traiter (${from}–${to}).`);

let done = 0;
async function traite(id) {
  const sp = await get(`${API}/pokemon-species/${id}`);
  if (!sp) return;

  // --- chaîne d'évolution, mutualisée entre les membres d'une même famille ---
  const url = sp.evolution_chain?.url;
  if (url) {
    if (!chainIndex.has(url)) {
      const data = await get(url);
      if (data?.chain) {
        const liste = await flatten(data.chain, null, []);
        chainIndex.set(url, evo.chains.length);
        evo.chains.push({ url, membres: liste });
      }
    }
    if (chainIndex.has(url)) evo.of[id] = chainIndex.get(url);
  }

  // --- formes alternatives ---
  // Deux gisements distincts chez PokéAPI, il faut les deux :
  //  1. species.varieties  -> Méga, Gigamax, formes régionales… (vrais /pokemon)
  //  2. pokemon.forms[]    -> formes COSMÉTIQUES : saisons de Vivaldaim, lettres
  //     d'Zarbi, motifs de Prismillon. Elles n'apparaissent PAS dans varieties.
  const autres = [];

  const vus = new Set();
  for (const v of sp.varieties ?? []) {
    const pid = idOf(v.pokemon.url);
    // Les ids de /pokemon-form ne suivent PAS ceux de /pokemon : interroger
    // /pokemon-form/<id du pokémon> renvoie une tout autre forme. Il faut passer
    // par /pokemon/<id> et suivre forms[].url. Ne pas « simplifier » ceci.
    const mon = await get(`${API}/pokemon/${pid}`);
    if (!mon) continue;

    if (!v.is_default) {
      const f = mon.forms?.[0]?.url ? await get(mon.forms[0].url) : null;
      autres.push({
        key: pid,                       // clé de capture : l'id du /pokemon
        sprite: String(pid),            // sprites/pokemon/<id>.png
        name: fr(f?.form_names, null) ?? fr(f?.names, null) ?? v.pokemon.name,
        slug: v.pokemon.name,
        kind: kindOf(v.pokemon.name, f),
        combat: !!f?.is_battle_only,
      });
      vus.add(v.pokemon.name);
    }

    // Formes cosmétiques de cette variété (souvent plusieurs pour la forme par défaut).
    if ((mon.forms?.length ?? 0) > 1) {
      for (const ref of mon.forms) {
        const f = await get(ref.url);
        if (!f || vus.has(f.name)) continue;
        // PokéAPI modélise aussi le couple mâle/femelle en formes cosmétiques
        // (frillish-male, frillish-female…), mais les deux pointent le MÊME sprite :
        // la femelle y est donc fausse. On les ignore, la vraie femelle est ajoutée
        // plus bas depuis has_gender_differences, avec le sprite female/<id>.
        if (/-(male|female)$/.test(f.name)) continue;
        vus.add(f.name);
        // Le sprite d'une forme cosmétique est nommé « 585-summer », pas par id :
        // on relève donc le nom de fichier réel plutôt que de le reconstruire.
        const url = f.sprites?.front_default;
        const sprite = url ? url.split('/').pop().replace(/.png$/, '') : String(pid);
        autres.push({
          key: f.name,                  // clé de capture : le slug, jamais un id
          sprite,
          name: fr(f.form_names, null) ?? fr(f.names, null) ?? f.name,
          slug: f.name,
          kind: 'cosmetique',
          combat: !!f.is_battle_only,
        });
      }
    }
  }

  // --- différence mâle/femelle ---
  // Une trentaine d'espèces ont un sprite femelle distinct (Viskuse, Moyade,
  // Pikachu, Déflaisan…). PokéAPI le signale par has_gender_differences, et les
  // sprites vivent dans female/<id>.png et shiny/female/<id>.png. Le champ sprite
  // porte donc « female/<id> » : notre constructeur d'URL insère « shiny/ » devant,
  // ce qui donne les deux chemins corrects sans cas particulier.
  if (sp.has_gender_differences) {
    autres.push({
      key: `${id}-female`,      // chaîne : aucune collision avec les ids numériques
      sprite: `female/${id}`,
      name: 'Forme femelle',
      slug: `${id}-female`,
      kind: 'femelle',
      combat: false,
    });
  }

  forms[id] = autres;
}

async function worker() {
  while (ids.length) {
    const id = ids.shift();
    try { await traite(id); }
    catch (e) { console.error(`#${id} : ${e.message}`); }
    if (++done % 25 === 0) { await flush(); console.log(`${done} faits…`); }
  }
}
async function flush() {
  await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
  const of = Object.fromEntries(Object.entries(evo.of).sort((a, b) => a[0] - b[0]));
  await writeFile(OUT_EVO, JSON.stringify({ chains: evo.chains, of }));
  await writeFile(OUT_FORMS, JSON.stringify(Object.fromEntries(Object.entries(forms).sort((a, b) => a[0] - b[0]))));
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await flush();
const nbFormes = Object.values(forms).reduce((n, l) => n + l.length, 0);
console.log(`Terminé : ${evo.chains.length} familles, ${Object.keys(evo.of).length} espèces reliées, ${nbFormes} formes alternatives.`);
