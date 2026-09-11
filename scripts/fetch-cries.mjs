// Rapatrie le cri de chaque Pokémon depuis PokéAPI et le convertit en MP3.
// Usage : npm run fetch-cries
//
// Source : github.com/PokeAPI/cries, le dépôt de PokéAPI qui publie les cris comme
// son dépôt de sprites publie les images. L'appli ne fait AUCUNE requête au runtime :
// les cris sont embarqués dans public/cries/, comme les sprites.
//
// PokéAPI les fournit en OGG Vorbis, format que Safari sur iPhone ne lit pas de façon
// fiable : on les convertit en MP3 (mono, 64 kb/s), lu partout. La conversion passe
// par ffmpeg-static, dépendance de DÉVELOPPEMENT seulement : rien n'est embarqué.
//
// Pour chaque clé : le cri « latest » (celui des jeux récents), à défaut « legacy ».
// Les espèces (1 à 1025) et les formes à clé NUMÉRIQUE, qui ont leur propre entrée
// /pokemon chez PokéAPI (Méga, régionales…) et parfois leur propre cri. Les formes
// cosmétiques, à clé slug, n'en ont pas : l'appli retombe sur le cri de l'espèce.
//
// Le script REPREND comme les autres : un MP3 déjà présent n'est pas refait.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';

const executer = promisify(execFile);
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SORTIE = path.join(RACINE, 'public', 'cries');
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cris-'));
const BASE = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon';
fs.mkdirSync(SORTIE, { recursive: true });

const forms = JSON.parse(fs.readFileSync(path.join(RACINE, 'src', 'data', 'forms.json'), 'utf8'));
const cles = [];
for (let id = 1; id <= 1025; id++) cles.push(id);
for (const liste of Object.values(forms)) for (const f of liste) if (typeof f.key === 'number') cles.push(f.key);

async function telecharge(cle) {
  for (const variante of ['latest', 'legacy']) {
    const r = await fetch(`${BASE}/${variante}/${cle}.ogg`);
    if (r.ok) return { donnees: Buffer.from(await r.arrayBuffer()), variante };
  }
  return null;
}

const bilan = { faits: 0, deja: 0, absents: [], legacy: 0, echecs: [] };
const file = cles.filter((cle) => {
  if (fs.existsSync(path.join(SORTIE, `${cle}.mp3`))) { bilan.deja++; return false; }
  return true;
});
console.log(`${cles.length} clés, ${bilan.deja} cris déjà présents, ${file.length} à traiter`);

async function ouvrier() {
  while (file.length) {
    const cle = file.shift();
    try {
      const ogg = await telecharge(cle);
      if (!ogg) { bilan.absents.push(cle); continue; }
      if (ogg.variante === 'legacy') bilan.legacy++;
      const source = path.join(TEMP, `${cle}.ogg`);
      fs.writeFileSync(source, ogg.donnees);
      await executer(ffmpeg, ['-y', '-loglevel', 'error', '-i', source, '-ac', '1', '-b:a', '64k', path.join(SORTIE, `${cle}.mp3`)]);
      fs.unlinkSync(source);
      if (++bilan.faits % 200 === 0) console.log(`${bilan.faits} cris convertis`);
    } catch (e) {
      bilan.echecs.push(`${cle} (${e.message.split('\n')[0]})`);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, ouvrier));
fs.rmSync(TEMP, { recursive: true, force: true });

const taille = fs.readdirSync(SORTIE).reduce((s, f) => s + fs.statSync(path.join(SORTIE, f)).size, 0);
console.log(`terminé : ${bilan.faits} convertis, ${bilan.deja} déjà là, ${bilan.legacy} en version legacy`);
console.log(`sans cri chez PokéAPI (${bilan.absents.length}) : ${bilan.absents.join(', ') || 'aucun'}`);
if (bilan.echecs.length) console.log(`échecs (${bilan.echecs.length}) : ${bilan.echecs.join(' ; ')}`);
console.log(`public/cries : ${fs.readdirSync(SORTIE).length} fichiers, ${(taille / 1e6).toFixed(1)} Mo`);
