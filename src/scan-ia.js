// ---------- Mode IA du scan : BONUS, en essai sur la branche mode-ia ----------
//
// Troisième position du bouton de mode, après Auto et Manuel, qu'il ne modifie pas.
// Même principe que le suivi Auto — un détecteur trouve les Pokémon, un classifieur
// dit lesquels —, mais pensé pour « 6 Pokémon et plus » :
//   - le calcul tourne sur la PUCE de l'iPhone (Neural Engine, carte graphique), par
//     le module natif `plugins/scan-ia` : ONNX Runtime + Core ML, aucun réseau ;
//   - jusqu'à 12 pistes, et TOUS les cadres à vérifier partent ensemble au classifieur,
//     au lieu d'un seul par tour ;
//   - une piste n'est validée qu'après avoir cumulé plusieurs vues : les probabilités
//     des dernières images sont moyennées, ce qui rattrape un angle ou un flou.
//
// Hors de l'appli iPhone (navigateur, serveur de dev), le module natif n'existe pas :
// le mode retombe sur le moteur web du scan, plus lent, qui sert à vérifier la logique.
//
// POUR RETIRER LE MODE IA : supprimer ce fichier et `plugins/scan-ia`, retirer la
// dépendance `@guiguidex/scan-ia` de package.json puis `npx cap update ios`, et
// défaire le bloc « mode IA » de scan.js (bouton à deux positions) et de style.css.
import CLASSES from './data/scan-classes.json';

// Modèles du mode IA. Phase 0 : les modèles ACTUELS, pour mesurer ce qu'apporte le
// moteur seul ; les modèles plus gros (ml/, MobileCLIP2-S2 et détecteur 384×576)
// prendront leur place ici.
const MODELES = {
  classifieur: { chemin: 'scan/modele.onnx', taille: 256 },
  detecteur: { chemin: 'scan/detecteur.onnx', largeur: 256, hauteur: 384, pas: 8 },
};
const PISTES_MAX = 12;
const LOT_MAX = 8;                 // cadres envoyés ensemble au classifieur, au plus
// Temps accordé à la reconnaissance à chaque tour. Le lot s'y adapte d'après la durée
// mesurée par cadre : 8 sur la puce de l'iPhone, 1 ou 2 sur le moteur web. Sans ce
// budget, la détection attendait la fin de 8 analyses et les cadres suivaient mal.
const BUDGET_MS = 200;
// Naissance basse : sur une grille d'images à l'écran, Rondoudou ne dépassait pas 0,26–0,38.
// Le risque de faux cadre est tenu par la reconnaissance (90 %, aucun objet accepté aux
// mesures), et par la confirmation : deux détections avant d'analyser une piste.
const SEUIL_NAISSANCE = 0.3, SEUIL_SUIVI = 0.25, MANQUES_MAX = 5;
const CONFIRMATIONS = 2;
const SEUIL_AFFICHAGE = 0.9;       // même exigence que le mode Auto
const SEUIL_VUE_UNIQUE = 0.97;     // une seule vue suffit si elle est quasi certaine
const VUES_MAX = 5;                // vues cumulées par piste
const REFUS_APRES = 6;             // vues sans jamais atteindre le seuil : piste ignorée
const REVERIFIE_MS = 1500;
const IMAGENET = { moyenne: [0.485, 0.456, 0.406], ecart: [0.229, 0.224, 0.225] };
const BRUT = { moyenne: [0, 0, 0], ecart: [1, 1, 1] };

// Index de sortie → groupe (numéro de l'espèce ; 0 = « rien »).
const GROUPES = new Map();
CLASSES.forEach(([, groupe], i) => {
  if (!GROUPES.has(groupe)) GROUPES.set(groupe, []);
  GROUPES.get(groupe).push(i);
});

const attente = (ms) => new Promise((ok) => setTimeout(ok, ms));

function softmax(logits, k, C) {
  const l = logits.subarray(k * C, (k + 1) * C);
  let max = -Infinity;
  for (const v of l) if (v > max) max = v;
  let somme = 0;
  for (const v of l) somme += Math.exp(v - max);
  const p = new Float32Array(C);
  for (let i = 0; i < C; i++) p[i] = Math.exp(l[i] - max) / somme;
  return p;
}

// Même décision que le scan : somme par groupe, puis la forme seulement si elle pèse
// plus de la moitié du groupe.
function juge(p) {
  let meilleur = 0, conf = 0;
  for (const [groupe, idx] of GROUPES) {
    let s = 0;
    for (const i of idx) s += p[i];
    if (s > conf) { conf = s; meilleur = groupe; }
  }
  if (!meilleur) return { conf, trouve: null };
  let classe = -1, pc = 0;
  for (const i of GROUPES.get(meilleur)) if (p[i] > pc) { pc = p[i]; classe = i; }
  return { conf, trouve: pc > conf / 2 ? CLASSES[classe][0] : meilleur };
}

function moyenneVues(vues) {
  const p = new Float32Array(vues[0].length);
  for (const v of vues) for (let i = 0; i < p.length; i++) p[i] += v[i] / vues.length;
  return p;
}

const iou = (a, b) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / Math.max(1e-6, a.w * a.h + b.w * b.h - inter);
};

// ------------------------------------------------------------ moteurs
//
// Un moteur reçoit des DESSINS — des fonctions qui peignent la zone voulue dans un
// canevas de la taille du réseau — et rend les sorties brutes des réseaux.

// Puce de l'iPhone : les zones partent en JPEG, ~20 Ko l'une, et reviennent en
// flottants encodés en base64.
function moteurNatif(plugin) {
  const toile = document.createElement('canvas');
  const c = toile.getContext('2d');
  const jpeg = (dessin, l, h) => {
    toile.width = l;
    toile.height = h;
    dessin(c, l, h);
    return toile.toDataURL('image/jpeg', 0.9).slice(23); // retire « data:image/jpeg;base64, »
  };
  const flottants = (b64) => {
    const bin = atob(b64);
    const octets = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    return new Float32Array(octets.buffer);
  };
  let chargement = null;
  return {
    nom: 'puce de l’iPhone',
    charge() {
      chargement ??= plugin.charge({
        modeles: { classifieur: MODELES.classifieur.chemin, detecteur: MODELES.detecteur.chemin },
        unites: 'ALL',
      }).then(() => ({ detecteur: MODELES.detecteur, classifieur: MODELES.classifieur }));
      return chargement.catch((e) => { chargement = null; throw e; });
    },
    async detecte(dessin) {
      const { largeur, hauteur } = MODELES.detecteur;
      const r = await plugin.execute({
        modele: 'detecteur', images: [jpeg(dessin, largeur, hauteur)], largeur, hauteur, normalisation: 'imagenet',
      });
      return {
        chaleur: flottants(r.sorties.chaleur.donnees), taille: flottants(r.sorties.taille.donnees),
        decalage: flottants(r.sorties.decalage.donnees), ms: r.msCalcul,
      };
    },
    async analyse(dessins) {
      const t = MODELES.classifieur.taille;
      const images = dessins.map((d) => jpeg(d, t, t));
      const r = await plugin.execute({ modele: 'classifieur', images, largeur: t, hauteur: t, normalisation: 'brut' });
      return { logits: flottants(r.sorties.logits.donnees), n: images.length, ms: r.msCalcul };
    },
  };
}

// Secours hors appli : le Worker du scan (onnxruntime-web), avec ses propres modèles.
function moteurWeb({ pret, analyse, detecte, dims }) {
  const toile = document.createElement('canvas');
  const c = toile.getContext('2d', { willReadFrequently: true });
  const pixels = (dessin, l, h, { moyenne, ecart }) => {
    toile.width = l;
    toile.height = h;
    dessin(c, l, h);
    const d = c.getImageData(0, 0, l, h).data;
    const plan = l * h, px = new Float32Array(3 * plan);
    for (let i = 0; i < plan; i++) {
      for (let k = 0; k < 3; k++) px[k * plan + i] = (d[i * 4 + k] / 255 - moyenne[k]) / ecart[k];
    }
    return px;
  };
  return {
    nom: 'moteur web (secours)',
    async charge() { await pret(); return dims; },
    detecte: (dessin) => detecte(pixels(dessin, dims.detecteur.largeur, dims.detecteur.hauteur, IMAGENET)),
    analyse(dessins) {
      const t = dims.classifieur.taille, taille = 3 * t * t;
      const px = new Float32Array(dessins.length * taille);
      dessins.forEach((d, k) => px.set(pixels(d, t, t, BRUT), k * taille));
      return analyse(px, dessins.length);
    },
  };
}

// ------------------------------------------------------------ boucle du mode IA

export function creeModeIA({ el, video, ecran, nomDe, poserPistes, estActif, estEnPause, montreDiag, secours }) {
  const plugin = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.ScanIa : null;
  const moteur = plugin ? moteurNatif(plugin) : secours ? moteurWeb(secours) : null;
  let enCours = false, pistes = [], idPiste = 100_000;
  let msParZone = 60; // durée mesurée d'une reconnaissance, lissée

  // Vue ↔ vidéo (aperçu en object-fit: cover), et zone analysée : le plus grand
  // rectangle aux proportions du détecteur, centré dans l'écran du Pokédex.
  function geometrie(det) {
    const w = el.clientWidth, h = el.clientHeight, vw = video.videoWidth, vh = video.videoHeight;
    if (!w || !h || !vw || !vh) return null;
    const e = Math.max(w / vw, h / vh), ox = (w - vw * e) / 2, oy = (h - vh * e) / 2;
    let x0 = ecran.offsetLeft, y0 = ecran.offsetTop, rw = ecran.offsetWidth, rh = ecran.offsetHeight;
    if (rw / rh > det.largeur / det.hauteur) { const nw = rh * det.largeur / det.hauteur; x0 += (rw - nw) / 2; rw = nw; }
    else { const nh = rw * det.hauteur / det.largeur; y0 += (rh - nh) / 2; rh = nh; }
    return { e, ox, oy, x0, y0, rw, rh };
  }

  function boitesDe(r, g, det) {
    const gl = det.largeur / det.pas, gh = det.hauteur / det.pas, n = gl * gh, f = g.rw / det.largeur, boites = [];
    for (let i = 0; i < n; i++) {
      const s = r.chaleur[i];
      if (s < SEUIL_SUIVI) continue;
      const gx = i % gl, gy = (i - gx) / gl;
      const w = r.taille[i] * det.pas * f, h = r.taille[n + i] * det.pas * f;
      const cx = g.x0 + (gx + r.decalage[i]) * det.pas * f, cy = g.y0 + (gy + r.decalage[n + i]) * det.pas * f;
      boites.push({ x: cx - w / 2, y: cy - h / 2, w, h, s });
    }
    return boites.sort((a, b) => b.s - a.s).slice(0, PISTES_MAX);
  }

  function majPistes(boites) {
    const libres = new Set(pistes);
    for (const b of boites) {
      let meilleure = null, recouvre = 0.15;
      for (const p of libres) {
        const u = iou(p, b);
        if (u > recouvre) { recouvre = u; meilleure = p; }
      }
      if (meilleure) {
        libres.delete(meilleure);
        for (const k of ['x', 'y', 'w', 'h']) meilleure[k] += (b[k] - meilleure[k]) * 0.6;
        meilleure.manques = 0;
        meilleure.s = b.s;
        meilleure.vu++;
      } else if (b.s >= SEUIL_NAISSANCE && pistes.length < PISTES_MAX) {
        pistes.push({ id: idPiste++, ...b, manques: 0, vu: 1, etat: 'nouvelle', key: null, nom: '', vues: [], essais: 0, verifieA: 0 });
      }
    }
    for (const p of libres) p.manques++;
    pistes = pistes.filter((p) => p.manques < MANQUES_MAX);
  }

  // Les pistes à regarder ce tour-ci : les pas encore reconnues (grandes d'abord), puis
  // les reconnues dont la vérification a vieilli. Les ignorées reviennent toutes les 3 s.
  function aVerifier(n) {
    const t = performance.now();
    const enAttente = pistes.filter((p) => p.etat === 'nouvelle' && p.vu >= CONFIRMATIONS)
      .sort((a, b) => b.w * b.h - a.w * a.h);
    const vieilles = pistes.filter((p) => (p.etat === 'reconnu' && t - p.verifieA > REVERIFIE_MS)
      || (p.etat === 'ignoree' && t - p.verifieA > 2 * REVERIFIE_MS));
    return [...enAttente, ...vieilles].slice(0, n);
  }

  function dessinDe(p, g) {
    const cote = Math.max(p.w, p.h) * 1.15 / g.e;
    const cx = (p.x + p.w / 2 - g.ox) / g.e, cy = (p.y + p.h / 2 - g.oy) / g.e;
    return (c, l, h) => {
      c.fillStyle = '#000';
      c.fillRect(0, 0, l, h);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(video, cx - cote / 2, cy - cote / 2, cote, cote, 0, 0, l, h);
    };
  }

  function integre(p, probas) {
    p.vues.push(probas);
    if (p.vues.length > VUES_MAX) p.vues.shift();
    p.verifieA = performance.now();
    const j = juge(moyenneVues(p.vues));
    const sur = j.trouve !== null && j.conf >= SEUIL_AFFICHAGE
      && (p.vues.length >= 2 || j.conf >= SEUIL_VUE_UNIQUE);
    if (sur) {
      Object.assign(p, { etat: 'reconnu', key: j.trouve, nom: nomDe(j.trouve), essais: 0 });
    } else if (p.etat === 'reconnu') {
      // La moyenne des vues retombe sous le seuil : on efface, sans clignoter pour une image.
      if (j.conf < SEUIL_AFFICHAGE * 0.9 || j.trouve === null) Object.assign(p, { etat: 'nouvelle', key: null, nom: '', vues: [] });
    } else if (++p.essais >= REFUS_APRES) {
      Object.assign(p, { etat: 'ignoree', vues: [], essais: 0 });
    }
  }

  async function demarre() {
    if (enCours || !estActif()) return;
    if (!moteur) { montreDiag('Mode IA indisponible : aucun moteur'); return; }
    enCours = true;
    try {
      montreDiag('Mode IA : préparation des modèles…');
      const t0 = performance.now();
      const dims = await moteur.charge();
      montreDiag(`Mode IA : ${moteur.nom}, prêt en ${Math.round(performance.now() - t0)} ms`);
      while (estActif()) {
        if (estEnPause()) { await attente(300); continue; }
        const g = geometrie(dims.detecteur);
        if (!g) { await attente(300); continue; }
        const dessinDet = (c, l, h) => c.drawImage(video, (g.x0 - g.ox) / g.e, (g.y0 - g.oy) / g.e, g.rw / g.e, g.rh / g.e, 0, 0, l, h);
        const r = await moteur.detecte(dessinDet);
        if (!estActif()) break;
        majPistes(boitesDe(r, g, dims.detecteur));
        const lot = aVerifier(Math.max(1, Math.min(LOT_MAX, Math.floor(BUDGET_MS / msParZone))));
        let msClasse = 0;
        if (lot.length) {
          const a = await moteur.analyse(lot.map((p) => dessinDe(p, g)));
          msClasse = a.ms;
          msParZone = msParZone * 0.5 + (a.ms / lot.length) * 0.5;
          const C = CLASSES.length;
          lot.forEach((p, k) => { if (pistes.includes(p)) integre(p, softmax(a.logits, k, C)); });
        }
        if (!estActif()) break;
        poserPistes(pistes);
        // Développement : état du mode IA, pour le vérifier sans téléphone. Retiré du build.
        if (import.meta.env.DEV) {
          window.__ia = {
            detection: Math.round(r.ms), reconnaissance: Math.round(msClasse), lot: lot.length,
            msParZone: Math.round(msParZone),
            pistes: pistes.map((p) => ({ etat: p.etat, nom: p.nom, vu: p.vu, vues: p.vues.length, s: +p.s.toFixed(2) })),
          };
        }
        const reconnus = pistes.filter((p) => p.etat === 'reconnu').length;
        montreDiag(`IA · ${moteur.nom} · détection ${Math.round(r.ms)} ms · reconnaissance ${Math.round(msClasse)} ms`
          + ` (${lot.length}) · ${reconnus}/${pistes.length} reconnus`);
        await attente(15);
      }
    } catch (e) {
      console.error('mode IA', e);
      montreDiag(`Mode IA en erreur : ${e?.message ?? e}`);
    } finally {
      enCours = false;
      pistes = [];
      poserPistes(null); // null : le mode IA s'en va, scan.js efface s'il est encore affiché
    }
  }

  return { demarre, disponible: !!moteur, natif: !!plugin };
}
