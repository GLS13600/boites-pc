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
// et se nomme dans NOMS ci-dessous.
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

// Numéro d'icône Pokécardex → nom de la version. À compléter d'après le rapport des
// versions inconnues : le nom est celui qu'affiche Pokécardex au survol de l'icône.
const NOMS = {
};

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
const cle = (nom) => CONNUES[plat(nom)]
  ?? `x_${plat(nom).replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 22)}`;

// Les cellules qui ne sont PAS une version : vide, numéro, scan, image d'attente, rareté,
// normale et reverse (déduites par l'appli), ou une adresse quelconque.
const ICONE = /\/versions\/version_(\d+)\.\w+/;
const pasUneVersion = (v) => !v || /^https?:\/\//i.test(v) || /\.(svg|png|jpe?g|webp)(\?|$)/i.test(v);

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

for (const f of fichiers) {
  let serie;
  try { serie = await rattacheSerie(path.join(DOSSIER, f)); }
  catch (e) { console.log(`${f} : ${e.message}`); continue; }
  const { lignes, colNum, colUrl, code, ids, rattache, sansCarte } = serie;

  // La série relue remplace ce qu'on en savait.
  for (const id of Object.keys(cartes)) if (ids.includes(extensionDe(id))) delete cartes[id];

  const compte = new Map();
  let avecVersion = 0;
  for (const [i, c] of rattache) {
    const l = lignes[i];
    const trouvees = [];
    for (const [col, v] of Object.entries(l)) {
      if (col === 'A' || col === 'B' || col === colNum || col === colUrl) continue;
      const icone = ICONE.exec(v ?? '');
      if (icone) {
        const nom = NOMS[icone[1]];
        if (nom) trouvees.push(nom);
        else {
          const x = inconnues.get(icone[1]) ?? { n: 0, exemples: [] };
          x.n++;
          if (x.exemples.length < 6) x.exemples.push(`${path.basename(f, '.xlsx')} ${l[colNum]} (${c.nomFr || c.nomEn || c.id})`);
          inconnues.set(icone[1], x);
        }
      } else if (!pasUneVersion(String(v ?? '').trim()) && !/^\d/.test(String(v))) {
        trouvees.push(String(v).trim());   // le nom de la version, relevé tel quel
      }
    }
    const cles = [...new Set(trouvees.map((nom) => {
      const k = cle(nom);
      if (k.startsWith('x_')) noms[k] = nom;
      compte.set(nom, (compte.get(nom) ?? 0) + 1);
      return k;
    }))];
    if (cles.length) { cartes[c.id] = cles; avecVersion++; }
  }

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
  console.log(`\n${inconnues.size} icônes de version sans nom (à nommer dans NOMS) :`);
  for (const [n, x] of tri) console.log(`  ${n} : ${x.n} cartes — ${x.exemples.slice(0, 3).join(' ; ')}`);
  const ligne = ([n, x]) => `<tr><td><img src="https://pokecardex.b-cdn.net/assets/images/versions/version_${n}.png" alt=""></td>`
    + `<td><b>${n}</b></td><td>${x.n}</td><td>${x.exemples.map((e) => e.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>')}</td></tr>`;
  if (!ESSAI) {
    fs.mkdirSync(RACINE, { recursive: true });
    fs.writeFileSync(RAPPORT, `<!doctype html><meta charset="utf-8"><title>Versions inconnues</title>
<style>body{font:15px system-ui;margin:24px}td{padding:6px 12px;border-bottom:1px solid #ddd;vertical-align:middle}img{height:28px}</style>
<h1>Icônes de version sans nom</h1><p>Donner à chaque numéro le nom affiché par Pokécardex (« Holo cosmos », « Tampon », « Non holo »…),
dans NOMS de scripts/versions-cartes.mjs, puis relancer le script.</p>
<table><tr><th>Icône</th><th>N°</th><th>Cartes</th><th>Exemples</th></tr>${tri.map(ligne).join('\n')}</table>`);
    console.log(`  rapport : ${RAPPORT}`);
  }
} else if (!ESSAI && fs.existsSync(RAPPORT)) fs.rmSync(RAPPORT);

if (ESSAI) console.log(`\n(essai) ${Object.keys(trie).length} cartes auraient une version en plus`);
else {
  fs.writeFileSync(SORTIE, `${JSON.stringify({ cartes: trie, noms })}\n`);
  console.log(`\n${Object.keys(trie).length} cartes avec une version en plus (src/data/versions-cartes.json)`);
}
