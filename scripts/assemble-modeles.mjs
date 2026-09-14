// Ré-assemble les modèles trop gros pour GitHub avant la compilation.
//
// GitHub refuse tout fichier de plus de 100 Mo. Le classifieur du mode IA
// (MobileCLIP2-S2) en pèse 147 : il est versionné en morceaux de 95 Mo dans
// `modeles/scan-ia/classifieur.onnx.1`, `.2`…, et reconstitué ici dans
// `public/scan-ia/classifieur.onnx`, ignoré par git. Vite le copie ensuite dans dist/,
// donc l'appli et l'IPA ne voient qu'un seul fichier : rien ne change au runtime.
//
// Lancé par `npm run build` et `npm run dev` (predev). Il vérifie l'empreinte SHA-256
// enregistrée à côté des morceaux, et ne refait rien si le fichier est déjà bon.

import fs from 'node:fs';
import crypto from 'node:crypto';

const RACINE = new URL('../', import.meta.url);
const MODELES = [
  { morceaux: 'modeles/scan-ia/classifieur.onnx', sortie: 'public/scan-ia/classifieur.onnx' },
];

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

for (const { morceaux, sortie } of MODELES) {
  const attendu = fs.readFileSync(new URL(`${morceaux}.sha256`, RACINE), 'utf8').trim();
  const cible = new URL(sortie, RACINE);
  if (fs.existsSync(cible) && sha(fs.readFileSync(cible)) === attendu) {
    console.log(`${sortie} : déjà à jour`);
    continue;
  }
  const parties = [];
  for (let i = 1; fs.existsSync(new URL(`${morceaux}.${i}`, RACINE)); i++) {
    parties.push(fs.readFileSync(new URL(`${morceaux}.${i}`, RACINE)));
  }
  if (!parties.length) throw new Error(`aucun morceau pour ${morceaux}`);
  const tout = Buffer.concat(parties);
  if (sha(tout) !== attendu) throw new Error(`${sortie} : empreinte incorrecte après assemblage`);
  fs.mkdirSync(new URL('.', cible), { recursive: true });
  fs.writeFileSync(cible, tout);
  console.log(`${sortie} : assemblé depuis ${parties.length} morceaux, ${(tout.length / 1e6).toFixed(1)} Mo`);
}
