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
//     des dernières images sont moyennées, ce qui rattrape un angle ou un flou ;
//   - le classifieur balaie AUSSI des fenêtres fixes (cadre manuel, centre, six tuiles)
//     sans attendre le détecteur : un Pokémon que celui-ci ne voit pas est trouvé quand même.
//
// Hors de l'appli iPhone (navigateur, serveur de dev), le module natif n'existe pas :
// le mode retombe sur le moteur web du scan, plus lent, qui sert à vérifier la logique.
//
// POUR RETIRER LE MODE IA : supprimer ce fichier et `plugins/scan-ia`, retirer la
// dépendance `@guiguidex/scan-ia` de package.json puis `npx cap update ios`, et
// défaire le bloc « mode IA » de scan.js (bouton à deux positions) et de style.css.
import CLASSES from './data/scan-classes.json';

// Modèles du mode IA. Classifieur : MobileCLIP2-S2 (147 Mo, ré-assemblé à la compilation
// depuis modeles/scan-ia/), le mode Auto gardant S0. Détecteur : l'actuel — le
// détecteur IA 384×576 fait ~360 ms par image sur le moteur web, trop lent pour suivre.
const MODELES = {
  classifieur: { chemin: 'scan-ia/classifieur.onnx', taille: 256 },
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
const SEUIL_VUE_UNIQUE = 0.9;      // une seule vue suffit à 90 % (S2 : ~98 % de noms justes à ce seuil)
// …ou une réponse CONSTANTE : le même Pokémon en tête de la moyenne trois fois d'affilée,
// au seuil du bouton (0,4), sans que « rien » pèse. Blindalyce, sur l'écran de Saphir
// Alpha, partageait ~40 % avec Chrysacier, son jumeau : le bouton le trouvait à chaque
// fois, les 90 % ne l'atteignaient jamais, et le mode IA n'affichait aucun cadre.
const SEUIL_CONSTANT = 0.4, REPONSES_CONSTANTES = 3, RIEN_CONSTANT = 0.25;
// …ou deux réponses identiques d'affilée, déjà plus sûres : le nom arrive une vue plus tôt.
const SEUIL_CONSTANT_2 = 0.55;
const VUES_MAX = 5;                // vues cumulées par piste
const REFUS_APRES = 5;             // vues sans être reconnue : piste ignorée (revue toutes les 3 s)
const RIEN_MAX = 0.6;              // « rien » à 60 % sur deux vues : ignorée sans attendre
// Balayage par fenêtres : dès 0,35 une fenêtre ouvre ou nourrit une piste, qui ne s'affiche
// qu'aux mêmes conditions que les autres (90 % cumulés, ou réponse constante).
const SEUIL_FENETRE = 0.35;
const FENETRE_DUREE_MS = 4000;     // une piste née d'une fenêtre vit ce temps sans détection
const REVERIFIE_MS = 1500;
// Doublons : deux boîtes (ou deux pistes) désignent le même Pokémon au-delà de ce
// recouvrement, ou quand l'une est contenue à 70 % dans l'autre.
const DOUBLON_IOU = 0.4, DOUBLON_INCLUS = 0.7;
// Une vue seule qui désigne un AUTRE Pokémon au moins à ce niveau efface le passé de la
// piste : le Pokémon a changé sous le cadre. Plus haut que les ~40–60 % d'hésitation entre
// jumeaux (Blindalys / Armulys), pour ne pas effacer une piste qui hésite.
const CHANGEMENT = 0.7;
// Signature visuelle d'une piste : l'histogramme des couleurs du CŒUR de son cadre (70 %
// du côté, 4 niveaux par canal, 64 cases), relevé quand une vue confirme son nom. Comparée
// à chaque détection, elle dit tout de suite si le cadre a glissé sur un AUTRE Pokémon —
// sans attendre une nouvelle reconnaissance (~0,6 s sur le moteur web), ni que la moyenne
// de cinq vues anciennes bascule. La piste qui a perdu son Pokémon s'efface, et le voisin
// reçoit une piste neuve, sans nom tant qu'il n'est pas reconnu.
const SIG_COTE = 16, SIG_COEUR = 0.7, SIG_MEME = 0.5;
// Contrôle de la signature là où le cadre S'AFFICHE, toutes les 100 ms : un cadre nommé qui
// ne recouvre plus son Pokémon se cache sans attendre la détection suivante.
const GARDE_MS = 100;
// Vues d'une même piste cadrées tour à tour plus ou moins large : la moyenne des vues
// devient celle de plusieurs cadrages, comme les deux du bouton.
const MARGES = [1.15, 0.95, 1.35];
// Rattacher une détection à une piste : pas si sa taille change de plus de ×2,5.
const RAPPORT_TAILLE = 2.5;
// Cadre « en analyse » : détection nette et confirmée, pas encore reconnue.
const ANALYSE_SCORE = 0.55, ANALYSE_VU = 3;
// Suivi : part du chemin parcourue par image d'affichage (à 60 i/s), et prolongement
// du mouvement entre deux analyses, au plus ce temps-là.
const GLISSE = 0.3, PREDICTION_MS = 300, VITESSE_MAX = 2; // px par ms
const IMAGENET = { moyenne: [0.485, 0.456, 0.406], ecart: [0.229, 0.224, 0.225] };
const BRUT = { moyenne: [0, 0, 0], ecart: [1, 1, 1] };

// Index de sortie → groupe (numéro de l'espèce ; 0 = « rien »).
const GROUPES = new Map();
CLASSES.forEach(([, groupe], i) => {
  if (!GROUPES.has(groupe)) GROUPES.set(groupe, []);
  GROUPES.get(groupe).push(i);
});

const INDEX_RIEN = GROUPES.get(0) ?? [];
const rien = (p) => INDEX_RIEN.reduce((s, i) => s + p[i], 0);
// Intersection de deux histogrammes normalisés : 1 = identiques, 0 = rien en commun.
const ressemblance = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.min(a[k], b[k]); return s; };

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

// Part de la plus petite des deux boîtes couverte par l'autre.
const inclusion = (a, b) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / Math.max(1e-6, Math.min(a.w * a.h, b.w * b.h));
};
const doublon = (a, b) => iou(a, b) > DOUBLON_IOU || inclusion(a, b) > DOUBLON_INCLUS;

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
    nom: 'puce de l’iPhone · S2',
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
    nom: 'moteur web (secours) · S2',
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

export function creeModeIA({ el, video, ecran, nomDe, zoneVue, poserPistes, estActif, estEnPause, montreDiag, secours }) {
  const plugin = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.ScanIa : null;
  const moteur = plugin ? moteurNatif(plugin) : secours ? moteurWeb(secours) : null;
  let enCours = false, pistes = [], idPiste = 100_000;
  let msParZone = 60; // durée mesurée d'une reconnaissance, lissée
  let cycle = 0, iTuile = 0, iZone = 0, alterne = 0, tour = 0, rafId = 0, dernierRaf = 0;
  let gAffiche = null, gardeA = 0;

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

  const toileSig = document.createElement('canvas');
  toileSig.width = toileSig.height = SIG_COTE;
  const cSig = toileSig.getContext('2d', { willReadFrequently: true });
  function signature(b, g) {
    const cote = Math.max(b.w, b.h) * SIG_COEUR / g.e;
    const cx = (b.x + b.w / 2 - g.ox) / g.e, cy = (b.y + b.h / 2 - g.oy) / g.e;
    cSig.clearRect(0, 0, SIG_COTE, SIG_COTE);
    cSig.drawImage(video, cx - cote / 2, cy - cote / 2, cote, cote, 0, 0, SIG_COTE, SIG_COTE);
    const d = cSig.getImageData(0, 0, SIG_COTE, SIG_COTE).data;
    const h = new Float32Array(64);
    for (let i = 0; i < d.length; i += 4) h[(d[i] >> 6) * 16 + (d[i + 1] >> 6) * 4 + (d[i + 2] >> 6)] += 1;
    for (let k = 0; k < 64; k++) h[k] /= SIG_COTE * SIG_COTE;
    return h;
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
    // Un même Pokémon donne parfois deux pics (deux tailles de boîte) : on garde le plus sûr.
    const gardees = [];
    for (const b of boites.sort((a, c) => c.s - a.s)) {
      if (!gardees.some((k) => doublon(k, b))) gardees.push(b);
      if (gardees.length >= PISTES_MAX) break;
    }
    return gardees;
  }

  const actives = () => pistes.filter((p) => p.etat !== 'ignoree').length;

  // Les pistes ignorées (fonds, objets) ne doivent jamais empêcher un vrai Pokémon de
  // naître : elles ne comptent pas dans la place, et la plus ancienne cède la sienne.
  function ajoute(champs) {
    if (pistes.length >= PISTES_MAX * 2) {
      const i = pistes.findIndex((p) => p.etat === 'ignoree');
      if (i < 0) return null;
      pistes.splice(i, 1);
    }
    const p = {
      id: idPiste++, s: 0, manques: 0, vu: 1, etat: 'nouvelle', key: null, nom: '', vues: [],
      essais: 0, verifieA: 0, fenetre: false, vivantJusqua: 0, ...champs,
    };
    pistes.push(p);
    return p;
  }

  function majPistes(boites, g) {
    const t = performance.now();
    const libres = new Set(pistes);
    const perdues = new Set();
    for (const b of boites) {
      let meilleure = null, recouvre = 0.15;
      for (const p of libres) {
        const u = iou(p, b);
        // Taille trop différente : ce n'est pas le même objet, même s'ils se recouvrent (un
        // petit Pokémon posé là où était un grand).
        const rapport = (b.w * b.h) / Math.max(1, p.w * p.h);
        if (u > recouvre && rapport < RAPPORT_TAILLE && rapport > 1 / RAPPORT_TAILLE) { recouvre = u; meilleure = p; }
      }
      // Le cadre a-t-il glissé sur un AUTRE Pokémon ? Sa signature en décide sur-le-champ.
      if (meilleure?.sigRef && ressemblance(signature(b, g), meilleure.sigRef) < SIG_MEME) {
        perdues.add(meilleure);
        meilleure = null;
      }
      // Une piste née d'une fenêtre est plus grande que son Pokémon : une détection dont le
      // centre tombe dedans lui revient, et lui donne un cadre à sa taille.
      if (!meilleure) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        meilleure = [...libres].find((p) => p.fenetre && cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) ?? null;
        if (meilleure) Object.assign(meilleure, { x: b.x, y: b.y, w: b.w, h: b.h, fenetre: false });
      }
      if (meilleure) {
        libres.delete(meilleure);
        const avant = { x: meilleure.x, y: meilleure.y };
        for (const k of ['x', 'y', 'w', 'h']) meilleure[k] += (b[k] - meilleure[k]) * 0.8;
        // Vitesse du cadre, lissée : l'affichage prolonge le mouvement entre deux analyses.
        const dt = t - (meilleure.majA ?? t);
        if (dt > 0 && dt < 1000) {
          const borne = (v) => Math.max(-VITESSE_MAX, Math.min(VITESSE_MAX, v));
          meilleure.vx = borne(0.5 * (meilleure.vx ?? 0) + 0.5 * (meilleure.x - avant.x) / dt);
          meilleure.vy = borne(0.5 * (meilleure.vy ?? 0) + 0.5 * (meilleure.y - avant.y) / dt);
        }
        meilleure.majA = t;
        meilleure.manques = 0;
        // Reconnue sans signature (nommée par une fenêtre, plus grande que le Pokémon) : la
        // première détection immobile la lui donne, à la taille du Pokémon.
        if (meilleure.etat === 'reconnu' && !meilleure.sigRef && Math.hypot(meilleure.vx ?? 0, meilleure.vy ?? 0) < 0.05) {
          meilleure.sigRef = signature(b, g);
        }
        meilleure.s = b.s;
        meilleure.vu++;
      } else if (b.s >= SEUIL_NAISSANCE && actives() < PISTES_MAX) {
        ajoute({ ...b, vu: 1 });
      }
    }
    for (const p of libres) { p.manques++; p.vx = (p.vx ?? 0) * 0.5; p.vy = (p.vy ?? 0) * 0.5; }
    // Une piste refusée pour sa signature, et qu'aucune autre détection n'a reprise, a perdu
    // son Pokémon : elle s'efface aussitôt, avec son nom, au lieu de traîner quatre tours.
    pistes = pistes.filter((p) => !(perdues.has(p) && libres.has(p))
      && (p.manques < MANQUES_MAX || (p.fenetre && p.vivantJusqua > t)));
    fusionne();
  }

  // Deux pistes sur le même Pokémon (une du détecteur, une d'une fenêtre, ou deux boîtes
  // successives) n'en font qu'une : on garde la plus avancée — reconnue, puis la plus vue —
  // avec le cadre du détecteur plutôt que celui, trop grand, d'une fenêtre.
  function fusionne() {
    const rang = (p) => (p.etat === 'reconnu' ? 3 : p.etat === 'nouvelle' ? 2 : 1) * 100 + p.vues.length * 10 + p.s;
    const actives_ = pistes.filter((p) => p.etat !== 'ignoree').sort((a, b) => rang(b) - rang(a));
    const retirees = new Set();
    for (let i = 0; i < actives_.length; i++) {
      const a = actives_[i];
      if (retirees.has(a)) continue;
      for (let j = i + 1; j < actives_.length; j++) {
        const b = actives_[j];
        if (retirees.has(b) || !doublon(a, b)) continue;
        // Deux Pokémon DIFFÉRENTS reconnus l'un sur l'autre (un petit devant un grand) : on
        // ne fusionne pas des réponses qui se contredisent.
        if (a.etat === 'reconnu' && b.etat === 'reconnu' && a.key !== b.key) continue;
        if (a.fenetre && !b.fenetre) Object.assign(a, { x: b.x, y: b.y, w: b.w, h: b.h, s: b.s, fenetre: false, manques: 0 });
        if (!a.vues.length && b.vues.length) Object.assign(a, { vues: b.vues, reponses: b.reponses });
        retirees.add(b);
      }
    }
    if (retirees.size) pistes = pistes.filter((p) => !retirees.has(p));
  }

  // Affichage : chaque cadre glisse vers sa position, prolongée par sa vitesse, à chaque
  // image d'affichage — le suivi paraît continu même quand l'analyse ne tourne que 3 fois
  // par seconde. Les pistes nettement détectées mais pas encore reconnues ont un cadre
  // « en analyse », sans nom.
  function affiche(t = performance.now()) {
    const dt = dernierRaf ? Math.min(100, t - dernierRaf) : 16;
    dernierRaf = t;
    const k = 1 - Math.pow(1 - GLISSE, dt / 16);
    const garde = gAffiche && t - gardeA >= GARDE_MS;
    if (garde) gardeA = t;
    const vues = [];
    for (const p of pistes) {
      const avance = Math.min(PREDICTION_MS, t - (p.majA ?? t));
      const x = p.x + (p.vx ?? 0) * avance, y = p.y + (p.vy ?? 0) * avance;
      if (p.ax === undefined) Object.assign(p, { ax: x, ay: y, aw: p.w, ah: p.h });
      p.ax += (x - p.ax) * k; p.ay += (y - p.ay) * k; p.aw += (p.w - p.aw) * k; p.ah += (p.h - p.ah) * k;
      if (garde && p.etat === 'reconnu' && p.sigRef) {
        p.douteuse = ressemblance(signature({ x: p.ax, y: p.ay, w: p.aw, h: p.ah }, gAffiche), p.sigRef) < SIG_MEME;
      }
      const enAnalyse = p.etat === 'nouvelle' && !p.fenetre && p.s >= ANALYSE_SCORE && p.vu >= ANALYSE_VU;
      if ((p.etat === 'reconnu' && !p.douteuse) || enAnalyse) {
        vues.push({ ...p, x: p.ax, y: p.ay, w: p.aw, h: p.ah, etat: enAnalyse ? 'analyse' : p.etat });
      }
    }
    poserPistes(vues);
  }
  function animeAffichage(t) {
    if (!enCours) { rafId = 0; return; }
    affiche(t);
    rafId = requestAnimationFrame(animeAffichage);
  }

  // Les pistes à regarder ce tour-ci : les pas encore reconnues — celles nées d'une fenêtre
  // d'abord, qui ont déjà une vue prometteuse, puis les mieux détectées —, ensuite les
  // reconnues dont la vérification a vieilli. Les ignorées reviennent toutes les 3 s.
  function aVerifier(n, g) {
    if (n <= 0) return [];
    const t = performance.now();
    // Le Pokémon qu'on vise, au centre de l'écran, passe avant ceux du bord.
    const centre = (p) => 1 - Math.min(1, Math.hypot(p.x + p.w / 2 - (g.x0 + g.rw / 2), p.y + p.h / 2 - (g.y0 + g.rh / 2)) / (g.rh / 2));
    const priorite = (p) => (p.fenetre ? 2 : p.s + centre(p));
    const enAttente = pistes.filter((p) => p.etat === 'nouvelle' && (p.vu >= CONFIRMATIONS || p.fenetre))
      .sort((a, b) => priorite(b) - priorite(a));
    // Une piste reconnue qui BOUGE est revérifiée plus souvent : c'est là qu'un autre
    // Pokémon peut prendre sa place. Les plus anciennement vérifiées d'abord.
    const delai = (p) => (Math.hypot(p.vx ?? 0, p.vy ?? 0) > 0.15 ? REVERIFIE_MS * 0.4 : REVERIFIE_MS);
    const vieilles = pistes.filter((p) => (p.etat === 'reconnu' && t - p.verifieA > delai(p))
      || (p.etat === 'ignoree' && t - p.verifieA > 2 * REVERIFIE_MS))
      .sort((a, b) => a.verifieA - b.verifieA);
    return [...enAttente, ...vieilles].slice(0, n);
  }

  // Balayage : fenêtres fixes que le classifieur regarde sans attendre le détecteur — le
  // cadre manuel, une grande fenêtre centrale, puis six tuiles qui se recouvrent.
  function prochainesFenetres(k, g) {
    const sortie = [];
    for (let i = 0; i < k; i++) {
      const etape = cycle++ % 3, z = zoneVue?.();
      if (etape === 0 && z) {
        // Le cadre manuel, tel quel puis resserré à 78 %, en alternance : les deux cadrages
        // du bouton, qui reconnaît si bien.
        const c = z.cote * (iZone++ % 2 ? 0.78 : 1);
        sortie.push({ x: z.cx - c / 2, y: z.cy - c / 2, w: c, h: c });
      } else if (etape === 1) {
        const c = Math.min(g.rw, g.rh) * 0.9;
        sortie.push({ x: g.x0 + (g.rw - c) / 2, y: g.y0 + (g.rh - c) / 2, w: c, h: c });
      } else {
        const s = g.rw * 0.62, k6 = iTuile++ % 6, fx = k6 % 2, fy = ((k6 - fx) / 2) / 2;
        sortie.push({ x: g.x0 + (g.rw - s) * fx, y: g.y0 + (g.rh - s) * fy, w: s, h: s });
      }
    }
    return sortie;
  }

  function integreFenetre(f, probas) {
    const j = juge(probas);
    if (j.trouve === null || j.conf < SEUIL_FENETRE) return;
    const t = performance.now();
    const dedans = (p) => {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h;
    };
    const suivies = pistes.filter((p) => p.etat !== 'ignoree' && dedans(p));
    // Une fenêtre contient souvent PLUSIEURS Pokémon : elle ne nourrit une piste que si
    // elle est seule dedans, et ne contredit jamais une piste déjà reconnue.
    if (suivies.length > 1) return;
    let p = suivies[0];
    if (p?.etat === 'reconnu') {
      if (p.key === j.trouve && p.fenetre) p.vivantJusqua = t + FENETRE_DUREE_MS;
      return;
    }
    if (!p) {
      if (actives() >= PISTES_MAX) return;
      p = ajoute({ x: f.x, y: f.y, w: f.w, h: f.h, vu: CONFIRMATIONS, fenetre: true, vivantJusqua: t + FENETRE_DUREE_MS });
      if (!p) return;
    }
    if (p.fenetre) p.vivantJusqua = t + FENETRE_DUREE_MS;
    integre(p, probas);
  }

  function dessinDe(p, g, marge = 1.15) {
    const cote = Math.max(p.w, p.h) * marge / g.e;
    const cx = (p.x + p.w / 2 - g.ox) / g.e, cy = (p.y + p.h / 2 - g.oy) / g.e;
    return (c, l, h) => {
      c.fillStyle = '#000';
      c.fillRect(0, 0, l, h);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(video, cx - cote / 2, cy - cote / 2, cote, cote, 0, 0, l, h);
    };
  }

  function integre(p, probas, sig = null) {
    // Le Pokémon a CHANGÉ sous le cadre (carte remplacée, caméra déplacée) : une vue nette
    // qui contredit la réponse de la piste efface son passé. Sans ça, cinq vues anciennes
    // imposaient l'ancien nom plusieurs secondes.
    const seule = juge(probas);
    const reference = p.etat === 'reconnu' ? p.key : p.reponses?.[p.reponses.length - 1];
    if (reference != null && seule.trouve !== null && seule.trouve !== reference && seule.conf >= CHANGEMENT) {
      Object.assign(p, { etat: 'nouvelle', key: null, nom: '', vues: [], reponses: [], essais: 0, sigRef: null });
    }
    p.vues.push(probas);
    if (p.vues.length > VUES_MAX) p.vues.shift();
    p.verifieA = performance.now();
    const moyenne = moyenneVues(p.vues);
    const j = juge(moyenne);
    // Réponse de la moyenne à chaque vue : c'est sa STABILITÉ qui compte pour « constant ».
    p.reponses = [...(p.reponses ?? []), j.trouve].slice(-REPONSES_CONSTANTES);
    const sur = j.trouve !== null && j.conf >= SEUIL_AFFICHAGE
      && (p.vues.length >= 2 || j.conf >= SEUIL_VUE_UNIQUE);
    const stable = (n) => p.reponses.length >= n && p.reponses.slice(-n).every((k) => k === j.trouve);
    const constant = j.trouve !== null && rien(moyenne) < RIEN_CONSTANT
      && ((j.conf >= SEUIL_CONSTANT && stable(REPONSES_CONSTANTES)) || (j.conf >= SEUIL_CONSTANT_2 && stable(2)));
    if (sur || constant) {
      Object.assign(p, { etat: 'reconnu', key: j.trouve, nom: nomDe(j.trouve), essais: 0 });
      if (p.fenetre) p.vivantJusqua = p.verifieA + FENETRE_DUREE_MS;
      // Signature de référence : celle de la vue qui confirme le nom.
      if (sig && seule.trouve === j.trouve) p.sigRef = sig;
    } else if (p.etat === 'reconnu') {
      // Effacé seulement si la réponse CHANGE ou retombe franchement : pas pour une image floue.
      if (j.trouve === null || j.trouve !== p.key || j.conf < SEUIL_CONSTANT * 0.75) {
        Object.assign(p, { etat: 'nouvelle', key: null, nom: '', vues: [], reponses: [], sigRef: null });
      }
    } else if (++p.essais >= REFUS_APRES || (p.vues.length >= 2 && rien(moyenne) >= RIEN_MAX)) {
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
        gAffiche = g;
        const dessinDet = (c, l, h) => c.drawImage(video, (g.x0 - g.ox) / g.e, (g.y0 - g.oy) / g.e, g.rw / g.e, g.rh / g.e, 0, 0, l, h);
        const r = await moteur.detecte(dessinDet);
        if (!estActif()) break;
        majPistes(boitesDe(r, g, dims.detecteur), g);
        // Moteur lent (le web) : un tour sur deux ne fait QUE détecter, pour que les cadres
        // suivent deux fois plus souvent. Sur la puce, détection et reconnaissance à chaque tour.
        const lent = msParZone > 120;
        const classe = !lent || tour++ % 2 === 0;
        const n = classe ? Math.max(1, Math.min(LOT_MAX, Math.floor(BUDGET_MS / msParZone))) : 0;
        // Fenêtres : une tous les deux tours sur un moteur lent, deux par tour au moins sur un
        // moteur rapide, et toute place que les pistes laissent libre.
        const reserve = n >= 3 ? 2 : n ? (alterne++ % 2 === 0 ? 1 : 0) : 0;
        const lot = aVerifier(n - reserve, g);
        const fen = prochainesFenetres(Math.max(0, n - lot.length), g);
        // Signature relevée au MÊME instant que l'image analysée.
        const sigs = lot.map((p) => signature(p, g));
        const dessins = [...lot.map((p) => dessinDe(p, g, MARGES[p.vues.length % MARGES.length])), ...fen.map((f) => dessinDe(f, g, 1))];
        let msClasse = 0;
        if (dessins.length) {
          // Pendant la reconnaissance, l'affichage continue d'être tenu à jour — par
          // requestAnimationFrame d'ordinaire, par ce minuteur s'il est suspendu.
          const veille = setInterval(() => { if (performance.now() - dernierRaf > GARDE_MS) affiche(); }, GARDE_MS);
          const a = await moteur.analyse(dessins).finally(() => clearInterval(veille));
          msClasse = a.ms;
          msParZone = msParZone * 0.5 + (a.ms / dessins.length) * 0.5;
          const C = CLASSES.length;
          lot.forEach((p, k) => { if (pistes.includes(p)) integre(p, softmax(a.logits, k, C), sigs[k]); });
          fen.forEach((f, k) => integreFenetre(f, softmax(a.logits, lot.length + k, C)));
          fusionne();
        }
        if (!estActif()) break;
        // L'affichage vit sa vie par requestAnimationFrame ; on le rafraîchit aussi ici, pour
        // les navigateurs qui suspendent les images d'affichage (onglet en arrière-plan).
        affiche();
        if (!rafId) rafId = requestAnimationFrame(animeAffichage);
        // Développement : état du mode IA, pour le vérifier sans téléphone. Retiré du build.
        if (import.meta.env.DEV) {
          window.__ia = {
            detection: Math.round(r.ms), reconnaissance: Math.round(msClasse), lot: lot.length, fenetres: fen.length,
            msParZone: Math.round(msParZone),
            pistes: pistes.map((p) => ({
              etat: p.etat, nom: p.nom, vu: p.vu, vues: p.vues.length, s: +p.s.toFixed(2), fenetre: p.fenetre,
              reponses: p.reponses ?? [],
            })),
          };
        }
        const reconnus = pistes.filter((p) => p.etat === 'reconnu').length;
        montreDiag(`IA · ${moteur.nom} · détection ${Math.round(r.ms)} ms · reconnaissance ${Math.round(msClasse)} ms`
          + ` (${lot.length} + ${fen.length} fenêtres) · ${reconnus}/${actives()} reconnus`);
        await attente(15);
      }
    } catch (e) {
      console.error('mode IA', e);
      montreDiag(`Mode IA en erreur : ${e?.message ?? e}`);
    } finally {
      enCours = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      pistes = [];
      poserPistes(null); // null : le mode IA s'en va, scan.js efface s'il est encore affiché
    }
  }

  return { demarre, disponible: !!moteur, natif: !!plugin };
}
