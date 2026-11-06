// Les visuels de cartes que TCGdex n'a pas, d'après les relevés de Pokécardex faits par
// l'utilisateur : un fichier Excel par série dans reference/visuels-cartes/excel/, avec
// pour chaque carte son numéro tel qu'imprimé (« 001/128 », « R/RGB », « 58/102 ») et
// l'URL de son scan sur le CDN de Pokécardex.
//
// Chaque ligne est rattachée à son identifiant de carte TCGdex, qui devient le nom du
// fichier, à la place du rang de Pokécardex (« 1.jpg ») : public/visuels-cartes/30th-c-014.webp,
// embarqué dans le site et l'IPA. src/data/visuels-cartes.json en tient la liste, que lit
// src/cartes/api.js : l'appli les retrouve sans table de correspondance. Quatre façons de rattacher, dans l'ordre :
//   0. les cas vérifiés à la main (FORCES) ;
//   1. le numéro dans l'extension ou dans une extension que l'appli lui fusionne
//      (« 001/128 » → 30th-001, « R/RGB » → 30th-R, « TG05/TG30 » → swsh9tg-TG05) ;
//   2. une carte RÉÉDITÉE qui garde son numéro d'origine (Collection Classique : « 58/102 »)
//      : on cherche l'originale parmi les extensions de ce nombre de cartes, et son nom
//      chez les cartes de l'extension fusionnée qui restent à rattacher ;
//   3. sinon la ligne est signalée, jamais devinée.
//
// Seules les cartes sans image FRANÇAISE chez TCGdex (fichier vérifié) sont téléchargées, une
// à la fois, avec une pause : ce n'est pas notre serveur. Le script reprend : un fichier déjà
// présent n'est pas refait. Depuis que les cartes anglaises ont leur collection (28/10/2026),
// une carte qui n'a chez TCGdex que l'image anglaise prend elle aussi son scan français :
// la collection française montrait sinon la carte en anglais. Les visuels ne servent qu'à
// la collection française (src/cartes/api.js).
//
// Usage : node scripts/visuels-cartes.mjs [--essai]   (--essai : rattache sans télécharger)
import fs from 'node:fs';
import path from 'node:path';
import { rattacheSerie } from './pokecardex-excel.mjs';

const RACINE = new URL('../reference/visuels-cartes/', import.meta.url);
const EXCEL = new URL('excel/', RACINE);
const IMAGES = new URL('../public/visuels-cartes/', import.meta.url);
const LISTE = new URL('../src/data/visuels-cartes.json', import.meta.url);
const ESSAI = process.argv.includes('--essai');
const PAUSE_MS = 400;
// La taille « hd » de Pokécardex : 444 × 620 en WebP, ~40 Ko (« md » ne fait que 214 × 298).
const TAILLE = 'hd';

// Lecture des Excel, séries connues (SERIES) et rattachement : scripts/pokecardex-excel.mjs.

// ------------------------------------------------------------ une série
async function traite(fichier) {
  const { lignes, colNum, colUrl, code, ids, rattache, sansLigne, sansCarte } = await rattacheSerie(fichier);
  // TCGdex annonce parfois une image dont le fichier n'existe pas (Mew B, G et R du 30ᵉ :
  // 404 en français comme en anglais) : on vérifie le fichier, pas l'annonce. Seule l'image
  // FRANÇAISE compte.
  for (const [, c] of rattache) {
    c.image = false;
    for (const base of c.images) {
      // Relancé sur une erreur de réseau ou de serveur : un échec passager ferait télécharger
      // une carte que TCGdex a bel et bien (115 promos d'Épée et Bouclier au premier essai).
      for (let essai = 0; essai < 4 && !c.image; essai++) {
        const r = await fetch(`${base}/low.webp`, { method: 'HEAD' }).catch(() => null);
        if (r?.ok) c.image = true;
        else if (r && r.status < 500 && r.status !== 429) break;
        else await new Promise((ok) => setTimeout(ok, 800 * (essai + 1)));
      }
      if (c.image) break;
    }
  }
  // Un relevé en mode galerie donne le scan de chaque VERSION (…/sets/ASC/FR/94/1.jpg) : ce
  // n'est pas le visuel de la carte, il ne sert pas ici.
  const versionScan = (i) => /\/[A-Z]{2}\/\d+\/[^/]+$/.test(String(lignes[i][colUrl] ?? '').split('?')[0]);
  const aTelecharger = [...rattache].filter(([i, c]) => !c.image && !versionScan(i));
  console.log(`${path.basename(fichier)} (${code} → ${ids.join(' + ')}) : ${rattache.size} / ${lignes.length} lignes rattachées, `
    + `${aTelecharger.length} sans image française chez TCGdex`);
  if (sansCarte.length) console.log(`  lignes non rattachées : ${sansCarte.join(', ')}`);
  if (sansLigne.length) console.log(`  cartes TCGdex sans ligne : ${sansLigne.map((c) => c.id).join(', ')}`);

  const rapport = [...rattache].map(([i, c]) => ({ numero: lignes[i][colNum], url: lignes[i][colUrl], carte: c.id, nom: c.nomFr || c.nomEn, imageTcgdex: c.image }));
  fs.writeFileSync(new URL(`${path.basename(fichier, '.xlsx')}.correspondance.json`, RACINE), JSON.stringify(rapport, null, 1));
  if (ESSAI) return;

  fs.mkdirSync(IMAGES, { recursive: true });
  let faits = 0, deja = 0, echecs = 0;
  const sansUrl = [];
  for (const [i, c] of aTelecharger) {
    const sortie = new URL(`${c.id}.webp`, IMAGES);
    if (fs.existsSync(sortie)) { deja++; continue; }
    // Une ligne sans URL (image pas encore chargée au moment du relevé) est sautée : levée
    // ici, hors du `try`, l'erreur abandonnait tout le reste de la série (SV51, GG51).
    if (!lignes[i][colUrl]) { sansUrl.push(lignes[i][colNum]); continue; }
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
  if (sansUrl.length) console.log(`  sans URL dans le relevé : ${sansUrl.join(', ')}`);
}

// La liste des visuels embarqués, refaite d'après le dossier : ce qui est sur le disque fait foi.
function ecrisListe() {
  const ids = fs.existsSync(IMAGES) ? fs.readdirSync(IMAGES).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort() : [];
  fs.writeFileSync(LISTE, JSON.stringify(ids));
  console.log(`${ids.length} visuels embarqués (src/data/visuels-cartes.json)`);
}

const fichiers = fs.readdirSync(EXCEL).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'));
if (!fichiers.length) console.log(`aucun .xlsx dans ${EXCEL.pathname}`);
for (const f of fichiers) {
  try { await traite(path.join(EXCEL.pathname.replace(/^\/([A-Za-z]:)/, '$1'), f)); }
  catch (e) { console.log(`${f} : ${e.message}`); }
}
if (!ESSAI) ecrisListe();
