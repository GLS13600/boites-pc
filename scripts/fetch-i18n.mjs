// Génère les surcouches de traduction : src/data/i18n/en.json et ja.json.
// Usage : npm run fetch-i18n            (tout, ~20–40 min selon la connexion)
//         npm run fetch-i18n -- 1 151   (plage d'IDs, pour tester)
//
// POURQUOI UNE SURCOUCHE plutôt que trois jeux de fichiers complets : le français
// reste la base (`src/data/*.json`), et chaque langue n'ajoute QUE les chaînes qui
// changent. Les nombres, types, générations, niveaux, stats et sprites ne sont pas
// traduisibles : les dupliquer aurait triplé 12 Mo de données pour rien.
//
// Le script reprend là où il s'est arrêté : les espèces déjà présentes sont conservées.
// Une seule requête sert aux DEUX langues — l'API rend tous ses libellés d'un coup.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const DOSSIER = new URL('../src/data/i18n/', import.meta.url);
const LANGUES = ['en', 'ja'];
const [from = 1, to = 1025] = process.argv.slice(2).map(Number);
const CONCURRENCE = 6;

const cache = new Map();
async function get(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    for (let essai = 1; essai <= 4; essai++) {
      const r = await fetch(url);
      if (r.ok) return r.json();
      if (r.status === 404) return null;
      await new Promise((res) => setTimeout(res, 800 * essai));
    }
    throw new Error(`Échec définitif : ${url}`);
  })();
  cache.set(url, p);
  return p;
}

// Le nom dans une langue, avec repli sur l'anglais puis sur la clé de l'API : mieux
// vaut un mot anglais qu'une case vide au milieu d'une fiche.
const nomEn = (noms, langue, defaut) =>
  noms?.find((n) => n.language.name === langue)?.name
  ?? noms?.find((n) => n.language.name === 'en')?.name
  ?? defaut;

// Le japonais a deux écritures chez PokéAPI : `ja` (kanji et katakana, celle des jeux)
// et `ja-hrkt` (tout en kana). On prend `ja`, avec repli sur `ja-hrkt`.
const langueApi = (l) => (l === 'ja' ? ['ja', 'ja-hrkt'] : [l]);
// Première lettre en capitale : PokéAPI rend certains libellés anglais en minuscules
// (« grassland »), et ils s'affichent tels quels dans la fiche.
const capitale = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const nom = (noms, langue, defaut) => {
  for (const l of langueApi(langue)) {
    const n = noms?.find((x) => x.language.name === l)?.name;
    if (n) return langue === 'ja' ? n : capitale(n);
  }
  // Pas de japonais chez PokéAPI pour les lieux et quelques listes : on retombe sur
  // l'anglais plutôt que d'afficher une case vide.
  return capitale(nomEn(noms, 'en', defaut));
};
const texte = (entrees, langue, champ) => {
  for (const l of langueApi(langue)) {
    const e = entrees?.filter((x) => x.language.name === l).at(-1)?.[champ];
    if (e) return e.replace(/[\n\f\r­]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return null;
};

// ---- Dictionnaires courts : une passe, toutes les langues ----
async function listeNommee(chemin, limite = 1000) {
  const liste = await get(`${API}/${chemin}?limit=${limite}`);
  const out = Object.fromEntries(LANGUES.map((l) => [l, {}]));
  for (const e of liste.results) {
    const d = await get(e.url);
    for (const l of LANGUES) out[l][e.name] = nom(d?.names, l, e.name);
  }
  return out;
}

// Attaques et talents portent en plus un texte : on les traite à part.
async function listeAvecTexte(chemin, champTexte) {
  const liste = await get(`${API}/${chemin}?limit=2000`);
  const out = Object.fromEntries(LANGUES.map((l) => [l, {}]));
  let n = 0;
  const file = [...liste.results];
  const ouvrier = async () => {
    while (file.length) {
      const e = file.shift();
      const d = await get(e.url);
      if (!d) continue;
      const id = chemin === 'move' ? String(d.id) : e.name;
      for (const l of LANGUES) {
        out[l][id] = {
          n: nom(d.names, l, e.name),
          d: texte(d.flavor_text_entries, l, champTexte)
             ?? texte(d.effect_entries, l, 'short_effect') ?? null,
        };
      }
      if (++n % 100 === 0) console.log(`  ${chemin} : ${n}/${liste.results.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier));
  return out;
}

// ---- Une espèce : nom, catégorie, description, habitat, couleur, rencontres ----
async function espece(id, jeux, habitats, couleurs) {
  const [species, rencontres] = await Promise.all([
    get(`${API}/pokemon-species/${id}`),
    get(`${API}/pokemon/${id}/encounters`),
  ]);
  if (!species) return null;

  // MÊME regroupement que fetch-data.mjs : jeu → lieu → méthodes, dans le même ordre.
  // C'est ce qui permet à l'appli de superposer la traduction sur la base française
  // sans rien réapparier — voir `traduitRencontres` dans main.js.
  const parJeu = new Map();
  for (const zone of rencontres ?? []) {
    const z = await get(zone.location_area.url);
    const lieu = z ? await get(z.location.url) : null;
    for (const vd of zone.version_details) {
      const jeu = vd.version.name;
      if (!parJeu.has(jeu)) parJeu.set(jeu, new Map());
      const lieux = parJeu.get(jeu);
      // La clé d'unicité reste le libellé FRANÇAIS : c'est lui qui a formé les groupes
      // du fichier de base, donc lui qui garantit le même nombre de lieux.
      const cleFr = etiquette(lieu?.names, z?.names, zone.location_area.name, 'fr');
      if (!lieux.has(cleFr)) {
        lieux.set(cleFr, Object.fromEntries(LANGUES.map((l) =>
          [l, etiquette(lieu?.names, z?.names, zone.location_area.name, l)])));
      }
    }
  }

  const ordre = [...parJeu.entries()].sort((a, b) => (jeux.ordre[a[0]] ?? 999) - (jeux.ordre[b[0]] ?? 999));
  const out = {};
  for (const l of LANGUES) {
    out[l] = {
      name: nom(species.names, l, String(id)),
      genus: nom(species.genera?.map((g) => ({ ...g, name: g.genus })), l, ''),
      flavor: texte(species.flavor_text_entries, l, 'flavor_text'),
      habitat: species.habitat ? habitats[l][species.habitat.name] ?? null : null,
      color: species.color ? couleurs[l][species.color.name] ?? null : null,
      encounters: ordre.map(([jeu, lieux]) => ({
        game: jeux.noms[l][jeu] ?? jeu,
        places: [...lieux.values()].map((p) => p[l]),
      })),
    };
  }
  return out;
}

// Même composition que fetch-data : « Lieu (zone) », sans répéter le lieu dans la zone.
function etiquette(nomsLieu, nomsZone, defaut, langue) {
  const lieu = nom(nomsLieu, langue, defaut);
  const zone = nom(nomsZone, langue, '');
  if (!zone || zone === lieu) return lieu;
  return zone.includes(lieu) ? zone : `${lieu} (${zone})`;
}

// ---- Programme ----
await mkdir(DOSSIER, { recursive: true });
const fichier = (l) => new URL(`${l}.json`, DOSSIER);

const data = {};
for (const l of LANGUES) {
  try { data[l] = JSON.parse(await readFile(fichier(l), 'utf8')); } catch { data[l] = {}; }
  data[l].especes ??= {};
}

console.log('Dictionnaires : jeux, habitats, couleurs, types, régions, natures, objets…');
const versions = await get(`${API}/version?limit=100`);
const jeux = { noms: Object.fromEntries(LANGUES.map((l) => [l, {}])), ordre: {} };
let rang = 0;
for (const v of versions.results) {
  const d = await get(v.url);
  jeux.ordre[v.name] = rang++;
  for (const l of LANGUES) jeux.noms[l][v.name] = nom(d?.names, l, v.name);
}
const habitats = await listeNommee('pokemon-habitat', 50);
const couleurs = await listeNommee('pokemon-color', 20);
const types = await listeNommee('type', 30);
const regions = await listeNommee('region', 30);
const natures = await listeNommee('nature', 40);

console.log('Attaques…');
const attaques = await listeAvecTexte('move', 'flavor_text');
console.log('Talents…');
const talents = await listeAvecTexte('ability', 'flavor_text');

// Les objets tenables : on ne traduit que ceux que l'appli propose.
console.log('Objets…');
const listeObjets = JSON.parse(await readFile(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const clesObjets = Object.keys(listeObjets);
const nomsObjets = Object.fromEntries(LANGUES.map((l) => [l, {}]));
for (const cle of clesObjets) {
  const d = await get(`${API}/item/${cle}`);
  for (const l of LANGUES) {
    nomsObjets[l][cle] = { n: nom(d?.names, l, cle), d: texte(d?.flavor_text_entries, l, 'text') };
  }
}

for (const l of LANGUES) {
  Object.assign(data[l], {
    jeux: jeux.noms[l], types: types[l], regions: regions[l], natures: natures[l],
    attaques: attaques[l], talents: talents[l], objets: nomsObjets[l],
  });
}

// ---- Les espèces, avec reprise ----
const ids = [];
for (let id = from; id <= to; id++) if (!data.en.especes[id]) ids.push(id);
console.log(`${ids.length} espèces à traduire (${from}–${to}).`);

let faits = 0;
async function ouvrier() {
  while (ids.length) {
    const id = ids.shift();
    try {
      const e = await espece(id, jeux, habitats, couleurs);
      if (e) for (const l of LANGUES) data[l].especes[id] = e[l];
    } catch (err) {
      console.error(`n° ${id} : ${err.message}`);
    }
    if (++faits % 25 === 0) {
      for (const l of LANGUES) await writeFile(fichier(l), JSON.stringify(data[l]));
      console.log(`  ${faits} espèces`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier));
// ---- Formes alternatives et conditions d'évolution ----
//
// Ces deux-là ne vivent pas dans /pokemon-species : elles sont produites par
// `fetch-extra.mjs` et rédigées en français côté script. On les refait donc ici dans
// les deux autres langues, en relisant les MÊMES fichiers pour garder exactement les
// mêmes clés — l'appli superpose, elle ne réapparie rien.

// Les phrases d'une condition d'évolution, par langue. Le français reste dans
// fetch-extra.mjs : c'est lui qui écrit la base.
const PHRASES = {
  en: {
    niveau: (n) => `Level ${n}`, montee: 'Level up', objet: (x) => `Use ${x}`,
    echange: 'Trade', mue: 'Shed (empty slot + Poké Ball)', tourne: 'Spin around',
    tourTenebres: 'Tower of Darkness', tourEau: 'Tower of Waters',
    critiques: '3 critical hits in one battle', degats: 'Take damage after a specific passage',
    agile: 'Move in Agile Style', puissance: 'Move in Strong Style',
    recul: 'Recoil damage taken', autre: 'Special condition',
    tenant: (x) => `holding ${x}`, connaissant: (x) => `knowing ${x}`,
    typeConnu: (x) => `knowing a ${x}-type move`,
    bonheur: 'with high friendship', affection: 'with high affection', beaute: 'with high beauty',
    lieu: (x) => `at ${x}`, jour: 'during the day', nuit: 'at night', crepuscule: 'at dusk',
    femelle: '(female)', male: '(male)', pluie: 'in the rain', retourne: 'console upside down',
    equipe: (x) => `with ${x} in the party`, equipeType: (x) => `with a ${x}-type Pokémon in the party`,
    contre: (x) => `for ${x}`,
    attSup: 'Attack > Defense', attInf: 'Attack < Defense', attEgal: 'Attack = Defense',
    ou: ' or ', formeFemelle: 'Female form',
  },
  ja: {
    niveau: (n) => `レベル${n}`, montee: 'レベルアップ', objet: (x) => `${x}を つかう`,
    echange: 'つうしん こうかん', mue: 'ぬけがら（手持ちに空き＋モンスターボール）',
    tourne: 'その場で 回る', tourTenebres: 'あくのとう', tourEau: 'みずのとう',
    critiques: '1回の戦闘で 急所に 3回 当てる', degats: '特定の場所を 通ったあと ダメージを 受ける',
    agile: 'はやわざで 技を 使う', puissance: 'つよわざで 技を 使う',
    recul: '反動ダメージを 受ける', autre: '特殊な 条件',
    tenant: (x) => `${x}を 持たせて`, connaissant: (x) => `${x}を 覚えて`,
    typeConnu: (x) => `${x}タイプの 技を 覚えて`,
    bonheur: 'なつき度が 高い状態で', affection: '仲良し度が 高い状態で',
    beaute: 'うつくしさが 高い状態で', lieu: (x) => `${x}で`,
    jour: '昼に', nuit: '夜に', crepuscule: '夕方に',
    femelle: '（メス）', male: '（オス）', pluie: '雨の中で', retourne: '本体を さかさまにして',
    equipe: (x) => `手持ちに ${x}が いる状態で`, equipeType: (x) => `手持ちに ${x}タイプが いる状態で`,
    contre: (x) => `${x}と 交換`,
    attSup: 'こうげき ＞ ぼうぎょ', attInf: 'こうげき ＜ ぼうぎょ', attEgal: 'こうげき ＝ ぼうぎょ',
    ou: ' または ', formeFemelle: 'メスのすがた',
  },
};

// Le libellé traduit d'une ressource citée par une condition (objet, capacité, lieu…).
const libelle = async (ref, genre, langue) =>
  (ref ? nom((await get(`${API}/${genre}/${ref.name}`))?.names, langue, ref.name) : null);

async function condition(d, langue) {
  const P = PHRASES[langue];
  const bouts = [];
  const t = d.trigger?.name;

  if (t === 'level-up') bouts.push(d.min_level ? P.niveau(d.min_level) : P.montee);
  else if (t === 'use-item') bouts.push(P.objet(await libelle(d.item, 'item', langue)));
  else if (t === 'trade') bouts.push(P.echange);
  else if (t === 'shed') bouts.push(P.mue);
  else if (t === 'spin') bouts.push(P.tourne);
  else if (t === 'tower-of-darkness') bouts.push(P.tourTenebres);
  else if (t === 'tower-of-waters') bouts.push(P.tourEau);
  else if (t === 'three-critical-hits') bouts.push(P.critiques);
  else if (t === 'take-damage') bouts.push(P.degats);
  else if (t === 'agile-style-move') bouts.push(P.agile);
  else if (t === 'strong-style-move') bouts.push(P.puissance);
  else if (t === 'recoil-damage') bouts.push(P.recul);
  else if (t === 'other') bouts.push(P.autre);
  else if (t) bouts.push(t);

  if (d.held_item) bouts.push(P.tenant(await libelle(d.held_item, 'item', langue)));
  if (d.known_move) bouts.push(P.connaissant(await libelle(d.known_move, 'move', langue)));
  if (d.known_move_type) bouts.push(P.typeConnu(await libelle(d.known_move_type, 'type', langue)));
  if (d.min_happiness) bouts.push(P.bonheur);
  if (d.min_affection) bouts.push(P.affection);
  if (d.min_beauty) bouts.push(P.beaute);
  if (d.location) bouts.push(P.lieu(await libelle(d.location, 'location', langue)));
  if (d.time_of_day === 'day') bouts.push(P.jour);
  if (d.time_of_day === 'night') bouts.push(P.nuit);
  if (d.time_of_day === 'dusk') bouts.push(P.crepuscule);
  if (d.gender === 1) bouts.push(P.femelle);
  if (d.gender === 2) bouts.push(P.male);
  if (d.needs_overworld_rain) bouts.push(P.pluie);
  if (d.turn_upside_down) bouts.push(P.retourne);
  if (d.party_species) bouts.push(P.equipe(await libelle(d.party_species, 'pokemon-species', langue)));
  if (d.party_type) bouts.push(P.equipeType(await libelle(d.party_type, 'type', langue)));
  if (d.trade_species) bouts.push(P.contre(await libelle(d.trade_species, 'pokemon-species', langue)));
  if (d.relative_physical_stats === 1) bouts.push(P.attSup);
  if (d.relative_physical_stats === -1) bouts.push(P.attInf);
  if (d.relative_physical_stats === 0) bouts.push(P.attEgal);

  // Le déclencheur est rendu à part : quand une évolution a trop de combinaisons
  // (Charmilly en a 21, une par bonbon et par moment de la journée), les lister
  // toutes noierait la fiche — on ne garde alors que le déclencheur, comme le fait
  // déjà la base française.
  return { tete: bouts[0] ?? '', phrase: bouts.join(' ') };
}

async function traduitEvolutions() {
  const base = JSON.parse(await readFile(new URL('../src/data/evolutions.json', import.meta.url), 'utf8'));
  const out = Object.fromEntries(LANGUES.map((l) => [l, {}]));
  let n = 0;
  const file = base.chains.filter((c) => c.url);
  const total = file.length;
  const ouvrier = async () => {
    while (file.length) {
      const c = file.shift();
      const d = await get(c.url);
      if (!d?.chain) continue;
      // Même parcours que fetch-extra : on retrouve donc les mêmes membres, dans l'ordre.
      const parcours = async (noeud) => {
        const id = Number(noeud.species.url.match(/\/(\d+)\/?$/)[1]);
        for (const l of LANGUES) {
          const têtes = [], phrases = [];
          for (const det of noeud.evolution_details ?? []) {
            const { tete, phrase } = await condition(det, l);
            // PokéAPI répète la même condition une fois par motif cosmétique :
            // Prismillon en a 20 identiques. On dédoublonne, sinon la fiche
            // afficherait « Niveau 12 » vingt fois de suite.
            if (phrase && !phrases.includes(phrase)) { phrases.push(phrase); }
            if (tete && !têtes.includes(tete)) têtes.push(tete);
          }
          const retenues = phrases.length > 3 ? têtes : phrases;
          if (retenues.length) out[l][id] = retenues.join(PHRASES[l].ou);
        }
        for (const suivant of noeud.evolves_to ?? []) await parcours(suivant);
      };
      await parcours(d.chain);
      if (++n % 100 === 0) console.log(`  familles : ${n}/${total}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier));
  return out;
}

async function traduitFormes() {
  const base = JSON.parse(await readFile(new URL('../src/data/forms.json', import.meta.url), 'utf8'));
  // On indexe par CLÉ de capture, celle de l'appli : numérique pour les formes issues
  // de varieties, slug pour les cosmétiques. Le nom, lui, se relève sur /pokemon-form
  // interrogé par SLUG — les ids de /pokemon-form ne suivent pas ceux de /pokemon.
  const out = Object.fromEntries(LANGUES.map((l) => [l, {}]));
  const toutes = [];
  for (const liste of Object.values(base)) for (const f of liste) toutes.push(f);
  let n = 0;
  const ouvrier = async () => {
    while (toutes.length) {
      const f = toutes.shift();
      if (f.kind === 'femelle') {
        for (const l of LANGUES) out[l][f.key] = PHRASES[l].formeFemelle;
        continue;
      }
      const d = await get(`${API}/pokemon-form/${f.slug}`);
      for (const l of LANGUES) {
        const trouve = nom(d?.form_names?.length ? d.form_names : d?.names, l, null);
        out[l][f.key] = trouve ?? f.name;
      }
      if (++n % 100 === 0) console.log(`  formes : ${n}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier));
  return out;
}

// ---- Noms des GROUPES de versions ----
//
// versions.json est indexé par version group (« scarlet-violet »), pas par version,
// et PokéAPI ne nomme PAS les groupes : /version-group n'a pas de champ « names ».
// On compose donc le nom du groupe en joignant celui de ses versions, comme le fait
// fetch-battle.mjs pour le français (« Écarlate / Violet »).
console.log('Groupes de versions…');
const groupesBruts = await get(`${API}/version-group?limit=100`);
const groupes = Object.fromEntries(LANGUES.map((l) => [l, {}]));
for (const g of groupesBruts.results) {
  const d = await get(g.url);
  if (!d) continue;
  for (const l of LANGUES) {
    const noms = [];
    for (const v of d.versions ?? []) {
      const vd = await get(v.url);
      noms.push(nom(vd?.names, l, v.name));
    }
    // Le japonais colle ses titres, l'occidental les sépare par une barre.
    groupes[l][g.name] = noms.join(l === 'ja' ? '・' : ' / ');
  }
}
for (const l of LANGUES) data[l].groupes = groupes[l];

console.log('Formes alternatives…');
const formes = await traduitFormes();
console.log("Conditions d'évolution…");
const evolutions = await traduitEvolutions();
for (const l of LANGUES) Object.assign(data[l], { formes: formes[l], evolutions: evolutions[l] });

// Les 127 espèces sans description japonaise chez PokéAPI (Écarlate / Violet n'y est
// publié qu'en anglais) reçoivent la description ANGLAISE : mieux qu'une case vide, et
// c'est déjà ce que le script fait pour les lieux, que PokéAPI n'a pas non plus en
// japonais.
let repliees = 0;
for (const id of Object.keys(data.ja.especes)) {
  if (!data.ja.especes[id].flavor && data.en.especes[id]?.flavor) {
    data.ja.especes[id].flavor = data.en.especes[id].flavor;
    repliees++;
  }
}
console.log(`${repliees} descriptions japonaises repliées sur l'anglais.`);

for (const l of LANGUES) await writeFile(fichier(l), JSON.stringify(data[l]));
console.log('Terminé :', LANGUES.map((l) => `${l}.json (${Object.keys(data[l].especes).length} espèces)`).join(', '));
