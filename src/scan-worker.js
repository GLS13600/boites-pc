// Moteur du scan, dans son propre fil d'exécution : l'inférence occupe le processeur,
// et l'interface doit rester fluide pendant ce temps — l'aperçu de la caméra continue
// de tourner, les cadres de suivi bougent, le bouton réagit.
//
// Deux réseaux : le DÉTECTEUR trouve où sont les Pokémon dans l'image (rapide, en
// continu), le CLASSIFIEUR dit lequel c'est, sur le carré qu'on lui donne.
//
// onnxruntime-web n'est chargé qu'ICI, donc seulement à la première ouverture du
// scan : le démarrage de l'appli n'en paie rien.
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href };
// Le multi-fil demande une page « isolée » (en-têtes COOP/COEP), ce que ni GitHub
// Pages ni Capacitor ne fournissent. Un seul fil, déclaré pour éviter un essai inutile.
ort.env.wasm.numThreads = 1;

const sessions = {};
const ouvre = (url) => ort.InferenceSession.create(url, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });

// Les messages sont traités l'un après l'autre : deux inférences simultanées sur le
// même moteur WASM à un fil ne feraient que se gêner.
let file = Promise.resolve();

self.onmessage = ({ data }) => {
  file = file.then(() => traite(data));
};

async function traite(data) {
  try {
    if (data.type === 'charge') {
      if (!sessions.classifieur) sessions.classifieur = await ouvre(data.classifieur);
      if (!sessions.detecteur && data.detecteur) {
        // Le suivi est un plus : un détecteur absent ou illisible ne doit pas priver
        // du scan au bouton.
        try { sessions.detecteur = await ouvre(data.detecteur); } catch { sessions.detecteur = null; }
      }
      self.postMessage({ type: 'pret', suivi: !!sessions.detecteur });
    } else if (data.type === 'analyse') {
      const t0 = performance.now();
      const entree = new ort.Tensor('float32', data.pixels, [data.n, 3, data.taille, data.taille]);
      const { logits } = await sessions.classifieur.run({ image: entree });
      const sortie = new Float32Array(logits.data);
      self.postMessage({ type: 'resultat', id: data.id, logits: sortie, n: data.n, ms: performance.now() - t0 },
        [sortie.buffer]);
    } else if (data.type === 'detecte') {
      const t0 = performance.now();
      const entree = new ort.Tensor('float32', data.pixels, [1, 3, data.hauteur, data.largeur]);
      const r = await sessions.detecteur.run({ image: entree });
      const chaleur = new Float32Array(r.chaleur.data);
      const taille = new Float32Array(r.taille.data);
      const decalage = new Float32Array(r.decalage.data);
      self.postMessage({ type: 'resultat', id: data.id, chaleur, taille, decalage, ms: performance.now() - t0 },
        [chaleur.buffer, taille.buffer, decalage.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'erreur', id: data.id, message: String(e?.message ?? e) });
  }
}
