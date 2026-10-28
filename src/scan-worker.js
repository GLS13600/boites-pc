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
    } else if (data.type === 'charge-ia') {
      // Classifieur du mode IA (MobileCLIP2-S2, 147 Mo) : chargé seulement quand ce mode
      // sert, pour que le mode Auto n'en paie ni le téléchargement ni la mémoire.
      const t0 = performance.now();
      if (!sessions.ia) sessions.ia = await ouvre(data.url);
      self.postMessage({ type: 'resultat', id: data.id, ms: performance.now() - t0 });
    } else if (data.type === 'analyse') {
      const t0 = performance.now();
      const entree = new ort.Tensor('float32', data.pixels, [data.n, 3, data.taille, data.taille]);
      // `modele: 'ia'` vise S2 ; tout le reste — Auto, Manuel, bouton — reste sur S0.
      const session = (data.modele === 'ia' && sessions.ia) || sessions.classifieur;
      const { logits } = await session.run({ image: entree });
      const sortie = new Float32Array(logits.data);
      self.postMessage({ type: 'resultat', id: data.id, logits: sortie, n: data.n, ms: performance.now() - t0 },
        [sortie.buffer]);
    } else if (data.type === 'charge-cartes') {
      // Scan des cartes : le réseau de l'EMPREINTE VISUELLE (ml/cartes_empreinte.py) et
      // l'index des cartes du catalogue — une empreinte de 256 nombres par image, en
      // octets signés (int8, échelle 1/127), la liste des identifiants, et le nom de chaque
      // carte en anglais, en français et en japonais (ml/noms-cartes.mjs).
      const t0 = performance.now();
      if (!sessions.cartes) {
        const [s, bin, meta] = await Promise.all([
          ouvre(data.modele),
          fetch(data.index).then((r) => { if (!r.ok) throw new Error(`index ${r.status}`); return r.arrayBuffer(); }),
          fetch(data.meta).then((r) => { if (!r.ok) throw new Error(`liste ${r.status}`); return r.json(); }),
        ]);
        index = { vecteurs: new Int8Array(bin), dim: meta.dim, ids: meta.cartes, noms: meta.noms };
        sessions.cartes = s;
      }
      self.postMessage({ type: 'resultat', id: data.id, ms: performance.now() - t0, n: index.ids.length });
    } else if (data.type === 'carte') {
      const t0 = performance.now();
      const entree = new ort.Tensor('float32', data.pixels, [data.n, 3, data.taille, data.taille]);
      const { empreinte } = await sessions.cartes.run({ image: entree });
      self.postMessage({ type: 'resultat', id: data.id, cartes: cherche(empreinte.data, data.n, data.langue), ms: performance.now() - t0 });
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

// ------------------------------------------------------------ recherche dans l'index
let index = null;

// Les cartes les plus proches de l'image : moyenne des empreintes des cadrages,
// renormalisée, puis ressemblance (cosinus) avec chaque carte de l'index. Une carte a
// souvent DEUX images (française et anglaise) : on garde la meilleure par identifiant.
// ~9,4 millions de multiplications pour 36 772 cartes : une vingtaine de millisecondes.
// Le nom est rendu dans la langue demandée : fr et ja ne portent que ce qui diffère de en.
function cherche(e, n, langue) {
  const { vecteurs: V, dim: D, ids, noms } = index;
  const q = new Float32Array(D);
  for (let k = 0; k < n; k++) for (let j = 0; j < D; j++) q[j] += e[k * D + j];
  let norme = 0;
  for (let j = 0; j < D; j++) norme += q[j] * q[j];
  norme = Math.sqrt(norme) || 1;
  for (let j = 0; j < D; j++) q[j] /= norme * 127;
  // Les 24 meilleures entrées, tenues dans un petit tableau trié.
  const K = 24, meilleurs = [];
  for (let i = 0, base = 0; i < ids.length; i++, base += D) {
    let s = 0;
    for (let j = 0; j < D; j++) s += q[j] * V[base + j];
    if (meilleurs.length < K || s > meilleurs[meilleurs.length - 1].s) {
      let p = meilleurs.length;
      while (p > 0 && meilleurs[p - 1].s < s) p--;
      meilleurs.splice(p, 0, { i, s });
      if (meilleurs.length > K) meilleurs.pop();
    }
  }
  const vus = new Set(), sortie = [];
  for (const { i, s } of meilleurs) {
    if (vus.has(ids[i])) continue;
    vus.add(ids[i]);
    sortie.push({ id: ids[i], nom: noms?.[langue]?.[ids[i]] ?? noms?.en?.[ids[i]] ?? '', sim: Math.round(s * 1000) / 1000 });
    if (sortie.length >= 8) break;
  }
  return sortie;
}
