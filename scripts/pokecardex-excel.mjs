// Lecture des relevés Pokécardex de l'utilisateur (un .xlsx par série, sorti de son
// extension de scraping) et rattachement de chaque ligne à son identifiant de carte
// TCGdex. Commun à scripts/visuels-cartes.mjs (les scans) et scripts/versions-cartes.mjs
// (les versions propres à chaque carte : holo cosmos, tampon…).
//
// Rien n'est lu chez Pokécardex : seulement le fichier Excel, et l'API de TCGdex.
import fs from 'node:fs';
import zlib from 'node:zlib';

const API = 'https://api.tcgdex.net/v2';

// Code de série chez Pokécardex → extension hôte chez TCGdex, et les extensions que
// l'appli lui fusionne (src/cartes/api.js, FUSIONS). À compléter à chaque série déposée.
export const SERIES = {
  '30C': ['30th', '30th-c'],
  // McDonald's : codes relevés pour les logos (fetch-logos-cartes.mjs). 2018 et 2019 : les
  // éditions françaises de 40 cartes ; 2021 et 2022 : Pokécardex n'a que l'américaine.
  MC1: ['2011bw'], MC2: ['2012bw'], MC3: ['2013bw'], MC4: ['2014xy'], MC5: ['2015xy'],
  MC6: ['2016xy'], MC7: ['2017sm'], MC8: ['2018sm-fr'], MC9: ['2019sm-fr'],
  MC10US: ['2021swsh'], MC11US: ['2022swsh'], M23: ['2023sv'], M24: ['2024sv'],
  // Épée et Bouclier, avec leurs galeries et coffres ; Soleil et Lune ; les deux promos.
  BRS: ['swsh9', 'swsh9tg'], ASR: ['swsh10', 'swsh10tg'], PGO: ['swsh10.5'], LOR: ['swsh11', 'swsh11tg'],
  SIT: ['swsh12', 'swsh12tg'], CRZ: ['swsh12.5', 'swsh12.5gg'], CEL: ['cel25', 'cel25cc'],
  SWSH45: ['swsh4.5', 'swsh4.5sv'], PRSWSH: ['swshp'],
  SLE: ['sm3.5'], SM75: ['sm7.5'], SM115: ['sm115', 'sma'], DPK: ['det1'], PRSM: ['smp'],
  // Méga-Évolution : les promos, numérotées sans total ni préfixe (« 001 »).
  MEP: ['mep'],
  // Méga-Évolution : l'extension (« 001/132 »).
  MEG: ['me01'], PFL: ['me02'], ASC: ['me02.5'], POR: ['me03'], CRI: ['me04'],
  // Écarlate et Violet.
  SVI: ['sv01'], PAL: ['sv02'], OBF: ['sv03'], MEW: ['sv03.5'], PAR: ['sv04'], PAF: ['sv04.5'],
  TEF: ['sv05'], TWM: ['sv06'],
  SFA: ['sv06.5'], SCR: ['sv07'], SSP: ['sv08'],
  PRE: ['sv08.5'], JTG: ['sv09'], WHT: ['sv10.5w'], BLK: ['sv10.5b'],
  // Diamant et Perle, Platine-HeartGold : L'appel des Légendes (seule extension `col1`).
  DP: ['dp1'], MT: ['dp2'], SW: ['dp3'], GE: ['dp4'], MD: ['dp5'], LA: ['dp6'], SF: ['dp7'],
  PRDP: ['dpp'], CL: ['col1'],
};

// Les rééditions que le nom ne rattache pas, vérifiées à la main : le Faux Professeur Chen
// s'appelle « Impostor » chez TCGdex et « Imposter » sur la carte du Set de Base, et le
// Pikachu de ____ porte chez Pokécardex un numéro (« 24/25 ») qui n'est celui d'aucune extension.
export const FORCES = {
  CEL: { '73/102': 'cel25cc-CC004', '24/25': 'cel25cc-CC008' },
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
export function lisExcel(fichier) {
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
// Rend les lignes (en-tête retirée), les colonnes du numéro et de l'URL du scan, le code
// Pokécardex de la série, les extensions TCGdex, et `rattache` : rang de ligne → carte.
export async function rattacheSerie(fichier) {
  const lignes = lisExcel(fichier);
  const entete = lignes.shift();
  const colUrl = Object.keys(entete).find((k) => lignes.some((l) => /pokecardex-scans[^/]*\/sets\//.test(l[k] ?? '')));
  // Le numéro imprimé : « 001/128 », ou celui d'une promo, sans total (« SM01 », « SWSH001 »,
  // ou nu chez les promos Méga-Évolution : « 001 »).
  const colNum = Object.keys(entete).find((k) => k !== colUrl && lignes.filter((l) => /^[A-Z0-9]+\/[A-Z0-9]+$|^[A-Z]*\d+[A-Z]?$/i.test(l[k] ?? '')).length > lignes.length / 2);
  if (!colUrl || !colNum) throw new Error('colonnes introuvables (numéro « 001/128 », « SM01 » ou « 001 », URL pokecardex-scans)');
  const code = /\/sets\/([^/]+)\//.exec(lignes.find((l) => l[colUrl])[colUrl])[1];
  const ids = SERIES[code];
  if (!ids) throw new Error(`série Pokécardex « ${code} » inconnue : l'ajouter à SERIES`);

  const [fr, en] = await Promise.all(['fr', 'en'].map((lg) => Promise.all(ids.map((id) => extension(lg, id).catch(() => null)))));
  const cartes = ids.flatMap((id, i) => (en[i]?.cards ?? fr[i]?.cards ?? []).map((c) => {
    const f = fr[i]?.cards?.find((x) => x.id === c.id);
    return { id: c.id, set: id, local: num(c.localId), nomEn: en[i]?.cards?.find((x) => x.id === c.id)?.name, nomFr: f?.name,
      images: [f?.image].filter(Boolean) };
  }));
  const libres = new Set(cartes.map((c) => c.id));
  const rattache = new Map();   // ligne → carte

  // 0. Les rattachements vérifiés à la main (FORCES).
  for (const [i, l] of lignes.entries()) {
    const c = cartes.find((x) => x.id === FORCES[code]?.[l[colNum]] && libres.has(x.id));
    if (c) { rattache.set(i, c); libres.delete(c.id); }
  }

  // 1. Par numéro, dans l'hôte puis dans les extensions fusionnées. Le total imprimé doit
  //    être celui de l'extension (« 129/128 » : 128) ou ne pas être un nombre (« R/RGB »,
  //    « TG05/TG30 ») : « 4/102 », une réédition, n'est pas la 004 de la Collection Classique.
  const officiel = Object.fromEntries(ids.map((id, i) => [id, Number((en[i] ?? fr[i])?.cardCount?.official)]));
  for (const [i, l] of lignes.entries()) {
    if (rattache.has(i)) continue;
    const [a, total = ''] = String(l[colNum] ?? '').split('/');
    const c = cartes.find((x) => libres.has(x.id) && x.local === num(a) && (!/^\d+$/.test(total) || Number(total) === officiel[x.set]));
    if (c) { rattache.set(i, c); libres.delete(c.id); }
  }
  // Relevé en mode GALERIE : une ligne par version, donc plusieurs lignes au même numéro.
  // Elles vont toutes à la carte de la première.
  const memes = () => {
    const parNumero = new Map([...rattache].map(([i, c]) => [lignes[i][colNum], c]));
    for (const [i, l] of lignes.entries()) if (!rattache.has(i) && parNumero.has(l[colNum])) rattache.set(i, parNumero.get(l[colNum]));
  };
  memes();
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

  memes();
  const sansLigne = cartes.filter((c) => libres.has(c.id));
  const sansCarte = lignes.map((l, i) => (rattache.has(i) ? null : `${l[colNum]}`)).filter(Boolean);
  return { lignes, colNum, colUrl, code, ids, cartes, rattache, sansLigne, sansCarte };
}
