// Convertit les dessins Dream World (SVG) en PNG, que l'entraînement lit directement.
// Usage : node ml/dessins.mjs <dossier de données>
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const racine = process.argv[2] ?? 'D:/Code/Jeu-scan';
const src = path.join(racine, 'pokeapi-sprites/sprites/pokemon/other/dream-world');
const dst = path.join(racine, 'dream-world-png');
fs.mkdirSync(dst, { recursive: true });
let faits = 0, echecs = 0;
for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.svg'))) {
  const out = path.join(dst, f.replace('.svg', '.png'));
  if (fs.existsSync(out)) continue;
  try {
    await sharp(path.join(src, f), { density: 300 }).resize(384, 384, { fit: 'inside' }).png().toFile(out);
    faits++;
  } catch { echecs++; }
}
console.log(`${faits} dessins convertis, ${echecs} échecs`);
