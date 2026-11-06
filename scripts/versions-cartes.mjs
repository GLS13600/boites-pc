// Les versions propres à chaque carte (holo cosmos, tampon, non holo…), d'après les relevés
// Pokécardex de l'utilisateur : un .xlsx par série, sorti de son extension de scraping, dans
// reference/visuels-cartes/excel/ — le même dossier et les mêmes relevés que pour les visuels
// (scripts/visuels-cartes.mjs) —, ou le dossier passé en argument.
//
// Dans ces relevés, la normale et la reverse sont des icônes à part (card_normale.svg,
// card_reverse.svg) : l'appli les déduit déjà de la rareté (src/cartes/regles.js). Les AUTRES
// versions sont des icônes numérotées (…/versions/version_26.png), le plus souvent dans la
// colonne « image2 » — mais la colonne bouge d'une série à l'autre, donc toute la ligne est lue.
// Une cellule qui porte le NOM de la version (si le relevé prend le titre de l'icône plutôt que
// son adresse) est lue telle quelle.
//
// Chaque ligne est rattachée à sa carte TCGdex comme pour les visuels (colonne « data » :
// « 3/130 », « SM01 », « 001 » ; scripts/pokecardex-excel.mjs), et ses versions vont dans
// src/data/versions-cartes.json, que lit regles.js : la fiche de la carte les propose à côté
// de la normale et de la reverse. Une série relue REMPLACE ce qu'on savait d'elle ; les autres
// restent.
//
// Un numéro d'icône dont on ignore le nom n'est pas deviné : il est listé, avec des exemples,
// dans reference/visuels-cartes/versions-inconnues.html (icônes affichées par le navigateur),
// et se nomme dans scripts/versions-pokecardex.json.
//
// Rien n'est téléchargé chez Pokécardex : seulement le fichier Excel, et l'API de TCGdex.
//
// Usage : node scripts/versions-cartes.mjs [dossier] [--essai]   (--essai : n'écrit rien)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rattacheSerie } from './pokecardex-excel.mjs';

const ESSAI = process.argv.includes('--essai');
const RACINE = fileURLToPath(new URL('../reference/visuels-cartes/', import.meta.url));
const DOSSIER = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(RACINE, 'excel');
const SORTIE = fileURLToPath(new URL('../src/data/versions-cartes.json', import.meta.url));
const RAPPORT = path.join(RACINE, 'versions-inconnues.html');

// Numéro d'icône Pokécardex → nom de la version. Un relevé qui porte le NOM à côté de
// l'icône (colonne « data2 » en mode galerie : « Holo Cosmos », « Reverse (Love Ball) »)
// l'apprend de lui-même, et ce qui est appris est gardé dans scripts/versions-pokecardex.json
// (versionné) : un relevé plus ancien, qui n'a que les icônes, en profite. On peut aussi y
// nommer un numéro à la main, d'après le rapport des versions inconnues.
const APPRIS = fileURLToPath(new URL('./versions-pokecardex.json', import.meta.url));
const NOMS = fs.existsSync(APPRIS) ? JSON.parse(fs.readFileSync(APPRIS, 'utf8')) : {};
const nomsAvant = JSON.stringify(NOMS);

// Nom → clé de variante de l'appli. Les noms reconnus prennent la variante existante (et
// donc sa traduction, sa couleur, sa lettre de pochette) ; tout autre nom devient une
// variante à lui (« x_… »), affichée sous ce nom dans toutes les langues.
const CONNUES = {
  'holo cosmos': 'cosmos', cosmos: 'cosmos', 'cosmos holo': 'cosmos',
  tampon: 'tampon', tamponnee: 'tampon', stamped: 'tampon',
  'non holo': 'normal', normale: 'normal', normal: 'normal',
  holo: 'holo', reverse: 'reverse',
  '1re edition': 'premiere', '1ere edition': 'premiere', 'premiere edition': 'premiere',
  'reverse pokeball': 'reverse_pokeball', 'reverse poke ball': 'reverse_pokeball',
  'reverse masterball': 'reverse_masterball', 'reverse master ball': 'reverse_masterball',
};
const plat = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Les clés de variante n'admettent que a-z et « _ », 24 au plus (collection.js, classeurs.js).
// Un nom trop long est coupé et suivi de quatre lettres tirées du nom entier : « Tampon
// (Master Ball League) » et « … League Judge » ne se confondent pas. Les chiffres tombent
// (« Top 8 (EUIC) » → x_top_euic) ; deux noms qui ne diffèrent QUE par eux (« Top 4 » et
// « Top 8 (Professor Program) ») prennent eux aussi l'empreinte. Les autres clés restent
// telles quelles : les exemplaires déjà rangés sous elles restent valides.
const empreinte = (t) => {
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: 4 }, (_, i) => String.fromCharCode(97 + (Math.floor(h / 26 ** i) % 26))).join('');
};
const slugDe = (p) => p.replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '');
let ambigus = new Set();   // les slugs portés par plusieurs noms, relevés avant de nommer
const cle = (nom) => {
  const p = plat(nom);
  if (CONNUES[p]) return CONNUES[p];
  const slug = slugDe(p);
  return `x_${slug.length <= 22 && !ambigus.has(slug) ? slug : `${slug.slice(0, 17)}_${empreinte(p)}`}`;
};

// L'icône d'une version, et ce qui peut être son NOM : du texte, pas une adresse ni un
// nombre, trois lettres au moins (« NV », mention de Pokécardex sur certaines lignes, n'en
// est pas une). Normale et reverse sont des .svg à part : l'appli les déduit.
const ICONE = /\/versions\/version_(\d+)\.\w+/;
const estUnNom = (v) => v.length >= 3 && !/^https?:\/\//i.test(v) && !/\.(svg|png|jpe?g|webp)(\?|$)/i.test(v) && !/^\d/.test(v);

const fichiers = fs.existsSync(DOSSIER) ? fs.readdirSync(DOSSIER).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$')) : [];
if (!fichiers.length) {
  console.log(`aucun .xlsx dans ${DOSSIER}`);
  process.exit(0);
}

const avant = fs.existsSync(SORTIE) ? JSON.parse(fs.readFileSync(SORTIE, 'utf8')) : {};
const cartes = { ...(avant.cartes ?? {}) };
const noms = { ...(avant.noms ?? {}) };
const inconnues = new Map();   // numéro d'icône → { n, exemples }
const extensionDe = (id) => id.slice(0, Math.max(0, id.lastIndexOf('-')));

// D'abord lire tout : les noms appris d'un fichier servent aux autres, et les clés
// ambiguës se décident sur l'ensemble des noms.
const lus = [];
for (const f of fichiers) {
  let serie;
  try { serie = await rattacheSerie(path.join(DOSSIER, f)); }
  catch (e) { console.log(`${f} : ${e.message}`); continue; }
  const { lignes, colNum, colUrl, rattache } = serie;
  // Ce que porte chaque ligne : ses icônes de version et les noms écrits en clair.
  const releves = [...rattache].map(([i, c]) => {
    const icones = [], textes = [];
    for (const [col, v] of Object.entries(lignes[i])) {
      if (col === 'A' || col === 'B' || col === colNum || col === colUrl) continue;
      const t = String(v ?? '').trim();
      const icone = ICONE.exec(t);
      if (icone) icones.push(icone[1]);
      else if (estUnNom(t)) textes.push(t);
    }
    // Une icône et un nom sur la même ligne : c'est le nom de l'icône.
    if (icones.length === 1 && textes.length === 1) NOMS[icones[0]] = textes[0];
    return { i, c, icones, textes };
  });
  lus.push({ f, serie, releves });
}

const parSlug = new Map();
for (const nom of new Set([...Object.values(NOMS), ...lus.flatMap((x) => x.releves.flatMap((r) => r.textes))])) {
  const p = plat(nom);
  if (CONNUES[p]) continue;
  const slug = slugDe(p);
  parSlug.set(slug, new Set([...(parSlug.get(slug) ?? []), p]));
}
ambigus = new Set([...parSlug].filter(([, ps]) => ps.size > 1).map(([slug]) => slug));

for (const { f, serie, releves } of lus) {
  const { lignes, colNum, code, ids, rattache, sansCarte } = serie;
  // La série relue remplace ce qu'on en savait.
  for (const id of Object.keys(cartes)) if (ids.includes(extensionDe(id))) delete cartes[id];

  const compte = new Map();
  const parCarte = new Map();   // une carte peut avoir plusieurs lignes (mode galerie)
  for (const { i, c, icones, textes } of releves) {
    const trouvees = [...textes];
    for (const n of icones) {
      if (NOMS[n]) trouvees.push(NOMS[n]);
      else {
        const x = inconnues.get(n) ?? { n: 0, exemples: [] };
        x.n++;
        if (x.exemples.length < 6) x.exemples.push(`${path.basename(f, '.xlsx')} ${lignes[i][colNum]} (${c.nomFr || c.nomEn || c.id})`);
        inconnues.set(n, x);
      }
    }
    const cles = parCarte.get(c.id) ?? new Set();
    for (const nom of new Set(trouvees)) {
      const k = cle(nom);
      if (k.startsWith('x_')) noms[k] = nom;
      if (!cles.has(k)) compte.set(nom, (compte.get(nom) ?? 0) + 1);
      cles.add(k);
    }
    parCarte.set(c.id, cles);
  }
  let avecVersion = 0;
  for (const [id, cles] of parCarte) if (cles.size) { cartes[id] = [...cles]; avecVersion++; }

  console.log(`${f} (${code} → ${ids.join(' + ')}) : ${rattache.size} / ${lignes.length} lignes rattachées, `
    + `${avecVersion} cartes avec une version en plus`);
  for (const [nom, n] of compte) console.log(`  ${nom} (${cle(nom)}) : ${n}`);
  if (sansCarte.length) console.log(`  lignes non rattachées : ${sansCarte.join(', ')}`);
}

// Les noms des variantes « x_… » encore utilisées.
const utilisees = new Set(Object.values(cartes).flat());
for (const k of Object.keys(noms)) if (!utilisees.has(k)) delete noms[k];
const trie = Object.fromEntries(Object.keys(cartes).sort().map((k) => [k, cartes[k]]));

if (inconnues.size) {
  const tri = [...inconnues].sort((a, b) => b[1].n - a[1].n);
  console.log(`\n${inconnues.size} icônes de version sans nom (à nommer dans scripts/versions-pokecardex.json) :`);
  for (const [n, x] of tri) console.log(`  ${n} : ${x.n} cartes — ${x.exemples.slice(0, 3).join(' ; ')}`);
  const ligne = ([n, x]) => `<tr><td><img src="https://pokecardex.b-cdn.net/assets/images/versions/version_${n}.png" alt=""></td>`
    + `<td><b>${n}</b></td><td>${x.n}</td><td>${x.exemples.map((e) => e.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>')}</td></tr>`;
  if (!ESSAI) {
    fs.mkdirSync(RACINE, { recursive: true });
    fs.writeFileSync(RAPPORT, `<!doctype html><meta charset="utf-8"><title>Versions inconnues</title>
<style>body{font:15px system-ui;margin:24px}td{padding:6px 12px;border-bottom:1px solid #ddd;vertical-align:middle}img{height:28px}</style>
<h1>Icônes de version sans nom</h1><p>Donner à chaque numéro le nom affiché par Pokécardex (« Holo cosmos », « Tampon », « Non holo »…),
dans scripts/versions-pokecardex.json, puis relancer le script.</p>
<table><tr><th>Icône</th><th>N°</th><th>Cartes</th><th>Exemples</th></tr>${tri.map(ligne).join('\n')}</table>`);
    console.log(`  rapport : ${RAPPORT}`);
  }
} else if (!ESSAI && fs.existsSync(RAPPORT)) fs.rmSync(RAPPORT);

const nomsTries = Object.fromEntries(Object.keys(NOMS).sort((a, b) => a - b).map((n) => [n, NOMS[n]]));
if (!ESSAI && JSON.stringify(NOMS) !== nomsAvant) {
  fs.writeFileSync(APPRIS, `${JSON.stringify(nomsTries, null, 1)}\n`);
  console.log(`${Object.keys(NOMS).length} icônes nommées (scripts/versions-pokecardex.json)`);
}
if (ESSAI) console.log(`\n(essai) ${Object.keys(trie).length} cartes auraient une version en plus`);
else {
  fs.writeFileSync(SORTIE, `${JSON.stringify({ cartes: trie, noms })}\n`);
  console.log(`\n${Object.keys(trie).length} cartes avec une version en plus (src/data/versions-cartes.json)`);
}
