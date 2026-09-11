// Mesure la durée d'une analyse avec onnxruntime-web, moteur WASM sur UN fil — la
// configuration exacte du téléphone. Un cœur de Ryzen 5900X et celui d'un A18 sont du
// même ordre : c'est une estimation, pas une mesure sur l'iPhone.
// Usage : node ml/vitesse-web.mjs <modele.onnx> [lot]
import fs from 'node:fs';
import * as ort from 'onnxruntime-web';

ort.env.wasm.numThreads = 1;
const [chemin, lotTxt] = process.argv.slice(2);
const lot = Number(lotTxt ?? 2);
const t0 = performance.now();
const session = await ort.InferenceSession.create(fs.readFileSync(chemin), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
console.log(`chargement : ${Math.round(performance.now() - t0)} ms`);
const x = new ort.Tensor('float32', new Float32Array(lot * 3 * 256 * 256).map(() => Math.random()), [lot, 3, 256, 256]);
const temps = [];
for (let i = 0; i < 6; i++) {
  const t = performance.now();
  await session.run({ image: x });
  temps.push(performance.now() - t);
}
console.log(`lot de ${lot} : ${temps.map(Math.round).join(', ')} ms`);
