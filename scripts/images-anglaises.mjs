// Les visuels ANGLAIS des cartes viennent de la base Pokémon TCG (pokemontcg.io), demandé
// le 28/10/2026 : ses scans couvrent aussi McDonald's, Trainer Gallery et Galarian
// Gallery. Ce script relève UNE fois, sur le PC, l'image de chaque carte et l'écrit dans
// src/data/images-anglaises.json : l'appli n'interroge pas cette API, elle ne charge que
// les images (images.pokemontcg.io, et images.scrydex.com pour les extensions récentes —
// l'API y renvoie désormais). Une carte absente garde l'image anglaise de TCGdex.
//
// Ses extensions ne portent pas les identifiants de TCGdex (« sv03.5 » chez TCGdex,
// « sv3pt5 » chez elle) : on les rapproche par le nom anglais (accents, ponctuation et
// « & » neutralisés, quelques ALIAS relevés à la main), puis par la date de sortie la plus
// proche. Une carte se retrouve par son numéro, sans les zéros de tête (« 045 » → « 45 »).
//
// Sortie : { idCarteTCGdex: '' (image au chemin attendu) | URL de la petite image }.
//   ''  → https://images.pokemontcg.io/<extension>/<numéro>.png, sous la clé de l'extension
//         dans `_` ({ _: { idExtensionTCGdex: idExtensionPTCG } }).
// La grande image se déduit de la petite (_hires.png, ou /large chez scrydex).
//
// Usage : npm run images-anglaises
//         SEULEMENT=sv05,sm6 npm run images-anglaises   (refait ces extensions, garde le reste)
import fs from 'node:fs';

const SORTIE = new URL('../src/data/images-anglaises.json', import.meta.url);
const json = async (url) => {
  for (let essai = 0; ; essai++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (essai >= 4) throw e;
      await new Promise((ok) => setTimeout(ok, 2000 * (essai + 1)));
    }
  }
};
const norme = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, 'and').replace(/pokemon/g, '').replace(/[^a-z0-9]/g, '');
const numero = (localId) => (/^\d+$/.test(String(localId)) ? String(Number(localId)) : String(localId));

// Noms qui diffèrent d'une base à l'autre (nom TCGdex en minuscules → nom pokemontcg.io).
const ALIAS = {
  'base set': 'Base',
  'heartgold soulsilver': 'HeartGold & SoulSilver',
  unleashed: 'HS—Unleashed',
  undaunted: 'HS—Undaunted',
  triumphant: 'HS—Triumphant',
  'svp black star promos': 'Scarlet & Violet Black Star Promos',
  'scarlet & violet energy': 'Scarlet & Violet Energies',
  'pokémon futsal 2020': 'Pokémon Futsal Collection',
  '30th classic collection': '30th Celebration: Classic Collection',
};

const [tcg, ptcg] = await Promise.all([
  json('https://api.tcgdex.net/v2/en/sets'),
  json('https://api.pokemontcg.io/v2/sets?pageSize=250&select=id,name,releaseDate'),
]);
const parNom = new Map();
for (const s of ptcg.data) {
  const k = norme(s.name);
  if (!parNom.has(k)) parNom.set(k, []);
  parNom.get(k).push(s);
}

// SEULEMENT : refaire quelques extensions (une page de leur API a échoué) sans tout relever.
const seulement = new Set((process.env.SEULEMENT || '').split(',').filter(Boolean));
const sortie = seulement.size && fs.existsSync(SORTIE) ? JSON.parse(fs.readFileSync(SORTIE, 'utf8')) : { _: {} };
const sans = [], vides = [];
let cartes = 0, chemin = 0, i = 0;
for (const s of tcg) {
  i++;
  if (seulement.size && !seulement.has(s.id)) continue;
  const d = await json(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(s.id)}`).catch(() => null);
  if (!d || d.serie?.id === 'tcgp') continue;   // Pocket : numérique
  const candidats = parNom.get(norme(ALIAS[String(s.name).toLowerCase()] || s.name)) || [];
  if (!candidats.length) { sans.push(s.id); continue; }
  const date = Date.parse(d.releaseDate || '') || 0;
  const choisi = candidats.slice().sort((a, b) =>
    Math.abs(Date.parse(a.releaseDate.replace(/\//g, '-')) - date) - Math.abs(Date.parse(b.releaseDate.replace(/\//g, '-')) - date))[0];
  // Les images de l'extension, page par page.
  const images = new Map();
  for (let page = 1; ; page++) {
    const r = await json(`https://api.pokemontcg.io/v2/cards?q=set.id:${choisi.id}&pageSize=250&page=${page}&select=number,images`).catch((e) => { console.log(`  ${choisi.id} page ${page} : ${e.message}`); return null; });
    for (const c of r?.data || []) if (c.images?.small) images.set(String(c.number), c.images.small);
    if (!r || page * 250 >= (r.totalCount || 0)) break;
  }
  let n = 0;
  for (const c of d.cards || []) {
    const url = images.get(numero(c.localId));
    if (!url) continue;
    const attendu = `https://images.pokemontcg.io/${choisi.id}/${numero(c.localId)}.png`;
    sortie[c.id] = url === attendu ? '' : url;
    if (url === attendu) chemin++;
    n++;
  }
  if (n) { sortie._[s.id] = choisi.id; cartes += n; } else vides.push(`${s.id}→${choisi.id}`);
  if (i % 25 === 0) console.log(`${i} / ${tcg.length} extensions…`);
}

fs.writeFileSync(SORTIE, JSON.stringify(sortie));
console.log(`${cartes} cartes, ${Object.keys(sortie._).length} extensions (${chemin} au chemin attendu) — ${(fs.statSync(SORTIE).size / 1e3).toFixed(0)} Ko`);
if (sans.length) console.log(`Sans équivalent (${sans.length}) : ${sans.join(', ')}`);
if (vides.length) console.log(`Rapprochées mais sans image (${vides.length}) : ${vides.join(', ')}`);
