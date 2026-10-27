// Logos des extensions que TCGdex ne fournit pas, repris de Pokécardex (28/10/2026, à
// la demande). Ce sont les logos officiels de The Pokémon Company — Pokécardex le dit
// lui-même : « les images et illustrations utilisées sont la propriété de leurs auteurs
// respectifs » —, au même titre que ceux que TCGdex sert déjà.
//
// Téléchargés UNE fois, réduits en WebP et embarqués dans `public/logos-cartes/` : on ne
// charge pas leurs serveurs à chaque affichage. `src/data/logos-cartes.json` liste les
// identifiants couverts ; api.js complète le champ `logo` des extensions qui en manquent.
//
// La table relie l'identifiant TCGdex au code Pokécardex (relevé sur /series). Un
// sous-ensemble sans logo propre (Galerie de Dresseurs, Coffre Étincelant…) prend celui
// de son extension mère, comme Pokécardex les range. Pokémon Pocket n'existe pas chez
// Pokécardex. Usage : `npm run fetch-logos-cartes` ; un fichier déjà présent est gardé.

import { mkdir, writeFile, access } from 'node:fs/promises';
import sharp from 'sharp';

const SOURCE = 'https://pokecardex.b-cdn.net/assets/images/logos';
const SORTIE = new URL('../public/logos-cartes/', import.meta.url);
const LISTE = new URL('../src/data/logos-cartes.json', import.meta.url);

const TABLE = {
  // Wizards, EX, Nintendo
  base1: 'BS', basep: 'PRWC', np: 'PRNI', jumbo: 'JUMBO',
  // Ligue Pokémon
  pop1: 'POP1', pop2: 'POP2', pop3: 'POP3', pop4: 'POP4', pop7: 'POP7', pop9: 'POP9',
  // Kits du dresseur
  'tk-ex-latio': 'TK1-LO', 'tk-ex-latia': 'TK1-LA', 'tk-ex-m': 'TK2-N', 'tk-ex-p': 'TK2-P',
  'tk-dp-m': 'TK3-M', 'tk-dp-l': 'TK3-L', 'tk-hs-g': 'TK4-L', 'tk-hs-r': 'TK4-R',
  'tk-bw-z': 'TK5-Z', 'tk-bw-e': 'TK5-M', 'tk-xy-n': 'TK6-B', 'tk-xy-sy': 'TK6-N',
  'tk-xy-w': 'TK7-G', 'tk-xy-b': 'TK7-S', 'tk-xy-latio': 'TK8-LO', 'tk-xy-latia': 'TK8-LA',
  'tk-xy-p': 'TK9-P', 'tk-xy-su': 'TK9-S', 'tk-sm-r': 'TK10-R', 'tk-sm-l': 'TK10-L',
  // Promos des blocs
  dpp: 'PRDP', hgssp: 'PRHS', bwp: 'PRBW', xyp: 'PRXY', smp: 'PRSM', svp: 'SVP', mep: 'MEP',
  // Énergies
  sve: 'SVE', mee: 'MEE',
  // Annoncés par TCGdex mais absents en français (le fichier répond 404)
  me05: 'PBL',
  // McDonald's (2021 et 2022 : Pokécardex n'a que l'édition américaine)
  '2011bw': 'MC1', '2012bw': 'MC2', '2013bw': 'MC3', '2014xy': 'MC4', '2015xy': 'MC5',
  '2016xy': 'MC6', '2017sm': 'MC7', '2018sm-fr': 'MC8', '2019sm-fr': 'MC9',
  '2021swsh': 'MC10US', '2022swsh': 'MC11US', '2023sv': 'M23', '2024sv': 'M24',
  // Sous-ensembles : le logo de l'extension mère
  sma: 'SM115', 'swsh4.5sv': 'SWSH45', cel25cc: 'CEL', swsh9tg: 'BRS', swsh10tg: 'ASR',
  swsh11tg: 'LOR', swsh12tg: 'SIT', 'swsh12.5gg': 'CRZ', '30th': '30C', '30th-c': '30C',
};

await mkdir(SORTIE, { recursive: true });
const faits = [];
for (const [id, code] of Object.entries(TABLE)) {
  const fichier = new URL(`${id}.webp`, SORTIE);
  try { await access(fichier); faits.push(id); continue; } catch { /* à télécharger */ }
  const r = await fetch(`${SOURCE}/${encodeURIComponent(code)}.png`);
  if (!r.ok) { console.warn(`${id} (${code}) : HTTP ${r.status}`); continue; }
  const brut = Buffer.from(await r.arrayBuffer());
  // 300 px de large au plus : le logo s'affiche sur 96 px CSS, soit 288 sur un écran ×3.
  const webp = await sharp(brut).resize({ width: 300, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  await writeFile(fichier, webp);
  faits.push(id);
  console.log(`${id} ← ${code} (${Math.round(webp.length / 1024)} Ko)`);
}
await writeFile(LISTE, JSON.stringify(faits.sort()) + '\n');
console.log(`${faits.length} / ${Object.keys(TABLE).length} logos.`);
