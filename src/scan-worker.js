// Moteur du scan, dans son propre fil d'exécution : l'inférence occupe le processeur
// plusieurs centaines de millisecondes, et l'interface doit rester fluide pendant ce
// temps — l'aperçu de la caméra continue de tourner, le bouton réagit.
//
// onnxruntime-web n'est chargé qu'ICI, donc seulement à la première ouverture du
// scan : le démarrage de l'appli n'en paie rien.
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href };
// Le multi-fil demande une page « isolée » (en-têtes COOP/COEP), ce que ni GitHub
// Pages ni Capacitor ne fournissent. Un seul fil, déclaré pour éviter un essai inutile.
ort.env.wasm.numThreads = 1;

let session = null;

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'charge') {
      if (!session) {
        session = await ort.InferenceSession.create(data.url, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
      }
      self.postMessage({ type: 'pret' });
    } else if (data.type === 'analyse') {
      const t0 = performance.now();
      const entree = new ort.Tensor('float32', data.pixels, [data.n, 3, data.taille, data.taille]);
      const { logits } = await session.run({ image: entree });
      const sortie = new Float32Array(logits.data);
      self.postMessage({ type: 'resultat', id: data.id, logits: sortie, n: data.n, ms: performance.now() - t0 },
        [sortie.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'erreur', id: data.id, message: String(e?.message ?? e) });
  }
};
