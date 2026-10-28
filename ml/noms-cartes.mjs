// Les noms des cartes du scan, dans les trois langues de l'appli.
//
// L'export de l'empreinte (ml/cartes_empreinte.py) écrit dans index.json le nom de
// chaque IMAGE, dans la langue de cette image : une carte reconnue sur son image
// anglaise s'affichait « Charizard » dans une appli en français. Ce script remplace ce
// champ par un nom par carte et par langue, d'après les listes de TCGdex :
//
// - en : le nom anglais de TCGdex (toutes les cartes de l'index en ont un) ;
// - fr : le nom français de TCGdex, et pour les ~1 200 cartes que TCGdex ne publie pas
//   en français (Gym Heroes, Base Set 2, Skyridge…), le nom anglais dont les noms de
//   Pokémon sont traduits par ceux de l'appli (« Blaine's Moltres » → « Blaine's
//   Sulfura ») ;
// - ja : le nom anglais, noms de Pokémon traduits — l'univers Cartes lit TCGdex en
//   anglais hors du français, mais le cadre du scan dit le Pokémon dans la langue de
//   l'appli.
//
// fr et ja ne gardent que ce qui diffère de en ; l'appli retombe sur en.
//
// Usage, APRÈS chaque export : node ml/noms-cartes.mjs public/scan-cartes/index.json
import fs from 'node:fs';

const fichier = process.argv[2];
if (!fichier) { console.error('usage : node ml/noms-cartes.mjs <index.json>'); process.exit(1); }
const lis = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const API = 'https://api.tcgdex.net/v2';
const liste = async (lg) => {
  const r = await fetch(`${API}/${lg}/cards`);
  if (!r.ok) throw new Error(`${lg} : HTTP ${r.status}`);
  return new Map((await r.json()).map((c) => [c.id, c.name]));
};

// Noms des espèces : le français est la base de pokedex.json, l'anglais et le japonais
// viennent des surcouches de traduction.
const pokedex = lis('../src/data/pokedex.json');
const en = lis('../src/data/i18n/en.json').especes;
const ja = lis('../src/data/i18n/ja.json').especes;
const especes = Object.keys(pokedex)
  .map((n) => ({ en: en[n]?.name, fr: pokedex[n].name, ja: ja[n]?.name ?? en[n]?.name }))
  .filter((e) => e.en)
  .sort((a, b) => b.en.length - a.en.length);  // « Mewtwo » avant « Mew »
const echappe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
const motif = new RegExp(`(?<![\\p{L}\\p{N}])(${especes.map((e) => echappe(e.en)).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
const parNom = new Map(especes.map((e) => [e.en.replace(/’/g, "'"), e]));
const traduit = (nom, lg) => nom.replace(motif, (m) => parNom.get(m.replace(/’/g, "'"))?.[lg] ?? m);

const index = JSON.parse(fs.readFileSync(fichier, 'utf8'));
const [tcgFr, tcgEn] = await Promise.all([liste('fr'), liste('en')]);
const noms = { en: {}, fr: {}, ja: {} };
let sansFr = 0;
for (const id of new Set(index.cartes)) {
  const nomEn = tcgEn.get(id) ?? tcgFr.get(id) ?? '';
  const nomFr = tcgFr.get(id) ?? (sansFr++, traduit(nomEn, 'fr'));
  const nomJa = traduit(nomEn, 'ja');
  noms.en[id] = nomEn;
  if (nomFr !== nomEn) noms.fr[id] = nomFr;
  if (nomJa !== nomEn) noms.ja[id] = nomJa;
}

// Contrôles avant d'écrire : un nom vide ou une traduction ratée ne se verrait qu'au scan.
const attendu = { 'base1-4': ['Dracaufeu', 'Charizard', 'リザードン'], 'sv03.5-006': ['Dracaufeu-ex', 'Charizard ex', 'リザードン ex'] };
const nomDe = (id, lg) => noms[lg][id] ?? noms.en[id];
for (const [id, [fr, enAttendu, jaAttendu]] of Object.entries(attendu)) {
  const vu = [nomDe(id, 'fr'), nomDe(id, 'en'), nomDe(id, 'ja')];
  if (vu[0] !== fr || vu[1] !== enAttendu || vu[2] !== jaAttendu) throw new Error(`${id} : ${vu.join(' / ')}`);
}
const vides = Object.entries(noms.en).filter(([, n]) => !n).length;
if (vides) throw new Error(`${vides} cartes sans nom`);

index.noms = noms;
fs.writeFileSync(fichier, JSON.stringify(index));
console.log(`${Object.keys(noms.en).length} cartes · ${sansFr} sans nom français chez TCGdex (Pokémon traduits) · `
  + `${Object.keys(noms.fr).length} noms fr, ${Object.keys(noms.ja).length} noms ja distincts · `
  + `${(fs.statSync(fichier).size / 1e6).toFixed(2)} Mo`);
console.log('base4-4 :', nomDe('base4-4', 'fr'), '·', nomDe('base4-4', 'ja'), '— gym1-1 :', nomDe('gym1-1', 'fr'), '·', nomDe('gym1-1', 'ja'));
