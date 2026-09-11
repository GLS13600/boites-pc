// Mesure la durée d'une analyse avec onnxruntime-web, moteur WASM sur UN fil — la
// configuration exacte du téléphone. Un cœur de Ryzen 5900X et celui d'un A18 sont du
// même ordre : c'est une estimation, pas une mesure sur l'iPhone.
// Usage : node ml/vitesse-web.mjs <modele.onnx> [lot] [hauteur] [largeur]
import fs from 'node:fs';
import * as ort from 'onnxruntime-web';

ort.env.wasm.numThreads = 1;
const [chemin, lotTxt, hTxt, wTxt] = process.argv.slice(2);
const lot = Number(lotTxt ?? 2);
const H = Number(hTxt ?? 256), W = Number(wTxt ?? 256);
const t0 = performance.now();
const session = await ort.InferenceSession.create(fs.readFileSync(chemin), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
console.log(`chargement : ${Math.round(performance.now() - t0)} ms`);
const x = new ort.Tensor('float32', new Float32Array(lot * 3 * H * W).map(() => Math.random()), [lot, 3, H, W]);
const temps = [];
for (let i = 0; i < 6; i++) {
  const t = performance.now();
  await session.run({ image: x });
  temps.push(performance.now() - t);
}
console.log(`lot de ${lot} : ${temps.map(Math.round).join(', ')} ms`);
