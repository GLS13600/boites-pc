// Les visuels de cartes que TCGdex n'a pas, d'après les relevés de Pokécardex faits par
// l'utilisateur : un fichier Excel par série dans reference/visuels-cartes/excel/, avec
// pour chaque carte son numéro tel qu'imprimé (« 001/128 », « R/RGB », « 58/102 ») et
// l'URL de son scan sur le CDN de Pokécardex.
//
// Chaque ligne est rattachée à son identifiant de carte TCGdex, qui devient le nom du
// fichier (reference/visuels-cartes/images/30th-c-014.webp) : l'appli les retrouvera sans
// table de correspondance. Trois façons de rattacher, dans l'ordre :
//   1. le numéro dans l'extension ou dans une extension que l'appli lui fusionne
//      (« 001/128 » → 30th-001, « R/RGB » → 30th-R, « TG05/TG30 » → swsh9tg-TG05) ;
//   2. une carte RÉÉDITÉE qui garde son numéro d'origine (Collection Classique : « 58/102 »)
//      : on cherche l'originale parmi les extensions de ce nombre de cartes, et son nom
//      chez les cartes de l'extension fusionnée qui restent à rattacher ;
//   3. sinon la ligne est signalée, jamais devinée.
//
// Seules les cartes SANS image chez TCGdex (ni en français ni en anglais) sont
// téléchargées, une à la fois, avec une pause : ce n'est pas notre serveur. Le script
// reprend : un fichier déjà présent n'est pas refait.
//
// Usage : node scripts/visuels-cartes.mjs [--essai]   (--essai : rattache sans télécharger)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const RACINE = new URL('../reference/visuels-cartes/', import.meta.url);
const EXCEL = new URL('excel/', RACINE), IMAGES = new URL('images/', RACINE);
const API = 'https://api.tcgdex.net/v2';
const ESSAI = process.argv.includes('--essai');
const PAUSE_MS = 400;
// La taille « hd » de Pokécardex : 444 × 620 en WebP, ~40 Ko (« md » ne fait que 214 × 298).
const TAILLE = 'hd';

// Code de série chez Pokécardex → extension hôte chez TCGdex, et les extensions que
// l'appli lui fusionne (src/cartes/api.js, FUSIONS). À compléter à chaque série déposée.
const SERIES = {
  '30C': ['30th', '30th-c'],
};

// ------------------------------------------------------------ lire un .xlsx
// Un .xlsx est un zip de XML : le répertoire central donne chaque fichier, que zlib
// décompresse. Les cellules sont lues en texte, chaînes partagées ou en ligne.
function dezippe(buf) {
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('pas un fichier Excel');
  const n = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const fichiers = {};
  for (let i = 0; i < n; i++) {
    const methode = buf.readUInt16LE(p + 10), taille = buf.readUInt32LE(p + 20);
    const lNom = buf.readUInt16LE(p + 28), lExtra = buf.readUInt16LE(p + 30), lCom = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nom = buf.toString('utf8', p + 46, p + 46 + lNom);
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const brut = buf.subarray(debut, debut + taille);
    fichiers[nom] = methode === 8 ? zlib.inflateRawSync(brut) : brut;
    p += 46 + lNom + lExtra + lCom;
  }
  return fichiers;
}
const texte = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function lisExcel(fichier) {
  const z = dezippe(fs.readFileSync(fichier));
  const partagees = [...(z['xl/sharedStrings.xml']?.toString('utf8') ?? '').matchAll(/<si>(.*?)<\/si>/gs)]
    .map((m) => texte([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join('')));
  const feuille = z['xl/worksheets/sheet1.xml'].toString('utf8');
  return [...feuille.matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map((r) => Object.fromEntries(
    [...r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)].map(([, col, attrs, corps = '']) => {
      const t = /t="s"/.test(attrs) ? partagees[Number(/<v>(.*?)<\/v>/s.exec(corps)?.[1])]
        : texte(/<t[^>]*>(.*?)<\/t>/s.exec(corps)?.[1] ?? /<v>(.*?)<\/v>/s.exec(corps)?.[1] ?? '');
      return [col, t];
    })));
}

// ------------------------------------------------------------ TCGdex
const json = async (url) => {
  for (let essai = 0; ; essai++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (essai >= 3) throw e;
      await new Promise((ok) => setTimeout(ok, 1000 * (essai + 1)));
    }
  }
};
const memo = new Map();
const extension = (lg, id) => memo.get(`${lg}:${id}`) ?? memo.set(`${lg}:${id}`, json(`${API}/${lg}/sets/${id}`)).get(`${lg}:${id}`);
let toutes = null;
const listeExtensions = async () => (toutes ??= await json(`${API}/en/sets`));
const num = (s) => String(s ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '');
const nom = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

// ------------------------------------------------------------ une série
async function traite(fichier) {
  const lignes = lisExcel(fichier);
  const entete = lignes.shift();
  const colUrl = Object.keys(entete).find((k) => lignes.some((l) => /pokecardex-scans[^/]*\/sets\//.test(l[k] ?? '')));
  const colNum = Object.keys(entete).find((k) => k !== colUrl && lignes.filter((l) => /^[A-Z0-9]+\/[A-Z0-9]+$/i.test(l[k] ?? '')).length > lignes.length / 2);
  if (!colUrl || !colNum) throw new Error('colonnes introuvables (numéro « 001/128 », URL pokecardex-scans)');
  const code = /\/sets\/([^/]+)\//.exec(lignes.find((l) => l[colUrl])[colUrl])[1];
  const ids = SERIES[code];
  if (!ids) throw new Error(`série Pokécardex « ${code} » inconnue : l'ajouter à SERIES`);

  const [fr, en] = await Promise.all(['fr', 'en'].map((lg) => Promise.all(ids.map((id) => extension(lg, id).catch(() => null)))));
  const cartes = ids.flatMap((id, i) => (en[i]?.cards ?? fr[i]?.cards ?? []).map((c) => {
    const f = fr[i]?.cards?.find((x) => x.id === c.id);
    return { id: c.id, set: id, local: num(c.localId), nomEn: en[i]?.cards?.find((x) => x.id === c.id)?.name, nomFr: f?.name,
      image: !!(f?.image || en[i]?.cards?.find((x) => x.id === c.id)?.image) };
  }));
  const libres = new Set(cartes.map((c) => c.id));
  const rattache = new Map();   // ligne → carte

  // 1. Par numéro, dans l'hôte puis dans les extensions fusionnées. Le total imprimé doit
  //    être celui de l'extension (« 129/128 » : 128) ou ne pas être un nombre (« R/RGB »,
  //    « TG05/TG30 ») : « 4/102 », une réédition, n'est pas la 004 de la Collection Classique.
  const officiel = Object.fromEntries(ids.map((id, i) => [id, Number((en[i] ?? fr[i])?.cardCount?.official)]));
  for (const [i, l] of lignes.entries()) {
    const [a, total = ''] = String(l[colNum] ?? '').split('/');
    const c = cartes.find((x) => libres.has(x.id) && x.local === num(a) && (!/^\d+$/.test(total) || Number(total) === officiel[x.set]));
    if (c) { rattache.set(i, c); libres.delete(c.id); }
  }
  // 2. Rééditions au numéro d'origine : l'originale, puis son nom chez les cartes restantes.
  for (const [i, l] of lignes.entries()) {
    if (rattache.has(i)) continue;
    const [a, total] = String(l[colNum] ?? '').split('/');
    const candidates = (await listeExtensions()).filter((s) => String(s.cardCount?.official) === num(total));
    const noms = [];
    for (const s of candidates) {
      const c = (await extension('en', s.id).catch(() => null))?.cards?.find((x) => num(x.localId) === num(a));
      if (c) noms.push(nom(c.name));
    }
    const c = cartes.find((x) => libres.has(x.id) && x.set !== ids[0] && noms.includes(nom(x.nomEn)));
    if (c) { rattache.set(i, c); libres.delete(c.id); }
  }

  const sansLigne = cartes.filter((c) => libres.has(c.id));
  const sansCarte = lignes.map((l, i) => (rattache.has(i) ? null : `${l[colNum]}`)).filter(Boolean);
  const aTelecharger = [...rattache].filter(([, c]) => !c.image);
  console.log(`${path.basename(fichier)} (${code} → ${ids.join(' + ')}) : ${rattache.size} / ${lignes.length} lignes rattachées, `
    + `${aTelecharger.length} sans image chez TCGdex`);
  if (sansCarte.length) console.log(`  lignes non rattachées : ${sansCarte.join(', ')}`);
  if (sansLigne.length) console.log(`  cartes TCGdex sans ligne : ${sansLigne.map((c) => c.id).join(', ')}`);

  const rapport = [...rattache].map(([i, c]) => ({ numero: lignes[i][colNum], url: lignes[i][colUrl], carte: c.id, nom: c.nomFr || c.nomEn, imageTcgdex: c.image }));
  fs.writeFileSync(new URL(`${path.basename(fichier, '.xlsx')}.correspondance.json`, RACINE), JSON.stringify(rapport, null, 1));
  if (ESSAI) return;

  fs.mkdirSync(IMAGES, { recursive: true });
  let faits = 0, deja = 0, echecs = 0;
  for (const [i, c] of aTelecharger) {
    const sortie = new URL(`${c.id}.webp`, IMAGES);
    if (fs.existsSync(sortie)) { deja++; continue; }
    const url = new URL(lignes[i][colUrl]);
    url.searchParams.set('class', TAILLE);
    try {
      const r = await fetch(url);
      if (!r.ok || !/image\//.test(r.headers.get('content-type') ?? '')) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(sortie, Buffer.from(await r.arrayBuffer()));
      faits++;
    } catch (e) { echecs++; console.log(`  échec ${c.id} : ${e.message}`); }
    await new Promise((ok) => setTimeout(ok, PAUSE_MS));
  }
  console.log(`  images : ${faits} téléchargées, ${deja} déjà là, ${echecs} échecs`);
}

const fichiers = fs.readdirSync(EXCEL).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'));
if (!fichiers.length) console.log(`aucun .xlsx dans ${EXCEL.pathname}`);
for (const f of fichiers) {
  try { await traite(path.join(EXCEL.pathname.replace(/^\/([A-Za-z]:)/, '$1'), f)); }
  catch (e) { console.log(`${f} : ${e.message}`); }
}
