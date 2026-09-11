// ---------- Vue Scan : reconnaître un Pokémon par l'appareil photo ----------
//
// L'aperçu de la caméra arrière remplit la vue. Un cadre désigne la zone à analyser :
// on le place en touchant l'image, on l'agrandit ou le réduit en pinçant. Le bouton
// capture l'image, le réseau de neurones l'analyse, et la fiche du Pokémon reconnu
// s'ouvre — sinon « Pokémon non trouvé ».
//
// Tout est local : le modèle (`public/scan/modele.onnx`) est embarqué, et l'analyse
// tourne sur le téléphone, dans un Worker. Aucune image ne quitte l'appareil.
//
// Ce module ne connaît rien du reste de l'appli : il reçoit de quoi ouvrir une fiche,
// et rend un élément que main.js pose dans la vue.
import CLASSES from './data/scan-classes.json';

// Côté du carré analysé, celui de l'entraînement (MobileCLIP2-S0 attend 256 px).
const TAILLE = 256;
// En dessous de cette confiance, on préfère « non trouvé » à une fiche fausse. Réglé
// sur les cartes des extensions jamais vues (ml/LISEZMOI.md) : à 0,4, illustrations
// 92,8 % bonnes / 3,6 % fausses, et encore 90,4 % / 5,3 % Pokémon TOURNÉ ; aucune
// image sans Pokémon n'ouvre de fiche.
const SEUIL = 0.4;
// Deux cadrages du même endroit, le cadre tel quel et un peu resserré, dont on
// moyenne les réponses : un Pokémon mal centré ou trop petit dans le cadre est mieux
// reconnu, pour un coût d'analyse doublé.
const ECHELLES = [1, 0.78];
// Le cadre, en fraction du plus petit côté de la vue.
const COTE_DEFAUT = 0.62, COTE_MIN = 0.22, COTE_MAX = 1;

// Suivi en continu. Le détecteur (ml/detecteur.py) regarde l'écran du Pokédex en
// 256×384 et rend une grille au pas de 8 : probabilité d'un centre de Pokémon, taille
// de sa boîte, décalage dans la case — maxima locaux déjà extraits dans le graphe.
const DET_L = 256, DET_H = 384, DET_PAS = 8;
const DET_GL = DET_L / DET_PAS, DET_GH = DET_H / DET_PAS;
const MOYENNE = [0.485, 0.456, 0.406], ECART = [0.229, 0.224, 0.225]; // ImageNet
// Hystérésis : une piste NAÎT au-dessus de 0,4 (93,5 % des cadres justes sur les scènes
// de test), mais une piste existante se contente de 0,25 pour continuer — un Pokémon
// déjà suivi ne doit pas clignoter dès qu'une image est un peu moins nette.
const SEUIL_NAISSANCE = 0.5, SEUIL_SUIVI = 0.25;
// Un cadre ne s'AFFICHE que si le classifieur est sûr à 90 % au moins que c'est ce
// Pokémon. En dessous, la piste reste suivie mais invisible : un objet quelconque que
// le détecteur a pris pour un Pokémon ne doit jamais apparaître encadré. (Le bouton,
// lui, garde SEUIL : on y désigne soi-même la zone.)
const SEUIL_AFFICHAGE = 0.9;
const PISTES_MAX = 6;
// Une piste sans détection pendant ce nombre d'images disparaît.
const MANQUES_MAX = 4;
// Une piste reconnue est revérifiée de temps en temps : on a pu changer de carte au
// même endroit. Une piste refusée aussi, un Pokémon mal vu au début pouvant se préciser.
const REVERIFIE_MS = 3000;

// Index de sortie → groupe (numéro de l'espèce ; 0 = « rien »). Calculé une fois.
const GROUPES = new Map();
CLASSES.forEach(([, groupe], i) => {
  if (!GROUPES.has(groupe)) GROUPES.set(groupe, []);
  GROUPES.get(groupe).push(i);
});

// Coque du Pokédex de Kalos, une moitié. Dessinée pour la moitié du HAUT ; celle du
// bas est la même, retournée en CSS. Le dessin est bien plus haut qu'il n'y paraît
// (400×800) : fermé, le Pokédex occupe tout l'écran et on en voit presque tout —
// les grandes rainures en dôme autour de la lentille ; ouvert, la coque remonte et
// seule sa bande basse reste visible (`--cap-h`, 100 unités), où les mêmes rainures
// ne montrent plus que leurs coins, comme sur l'appareil.
//
// L'échancrure centrale (rayon 46) est laissée TRANSPARENTE : fermée, les deux
// échancrures forment la lentille ; ouverte, l'écran — la caméra — y déborde.
// Le suffixe distingue les identifiants de dégradés des deux moitiés.
const coque = (x) => `
  <svg viewBox="0 0 400 800" aria-hidden="true">
    <defs>
      <linearGradient id="pdx-rouge-${x}" gradientUnits="userSpaceOnUse" x1="0" y1="380" x2="0" y2="800">
        <stop offset="0" stop-color="#e63a42"/><stop offset=".62" stop-color="#cf1d28"/><stop offset="1" stop-color="#a50f19"/>
      </linearGradient>
      <linearGradient id="pdx-noir-${x}" gradientUnits="userSpaceOnUse" x1="0" y1="728" x2="0" y2="800">
        <stop offset="0" stop-color="#4a4c54"/><stop offset=".5" stop-color="#1b1c20"/><stop offset="1" stop-color="#0c0c0e"/>
      </linearGradient>
      <radialGradient id="pdx-brille-${x}" cx="90" cy="690" r="130" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <path d="M0 0H400V800H246A46 46 0 0 0 154 800H0Z" fill="url(#pdx-rouge-${x})"/>
    <ellipse cx="90" cy="690" rx="150" ry="46" fill="url(#pdx-brille-${x})"/>
    <g fill="none">
      <circle cx="200" cy="800" r="436" stroke="#18181c" stroke-width="16"/>
      <circle cx="200" cy="800" r="445" stroke="#ff8f94" stroke-opacity=".22" stroke-width="2"/>
      <circle cx="200" cy="800" r="468" stroke="#18181c" stroke-width="6"/>
      <!-- Cercles ENTIERS autour de la lentille : fermé, les deux moitiés les
           referment en anneaux complets ; ouvert, il n'en reste que les coins. -->
      <circle cx="200" cy="800" r="206" stroke="#18181c" stroke-width="14"/>
      <circle cx="200" cy="800" r="215" stroke="#ff8f94" stroke-opacity=".25" stroke-width="2"/>
      <circle cx="200" cy="800" r="238" stroke="#18181c" stroke-width="6"/>
    </g>
    <path d="M128 800A72 72 0 0 1 272 800H246A46 46 0 0 0 154 800Z" fill="url(#pdx-noir-${x})"/>
    <path d="M136 800A64 64 0 0 1 264 800" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="3"/>
    <path d="M125 800A75 75 0 0 1 275 800" fill="none" stroke="#e3e7ec" stroke-width="4"/>
    <path d="M154 800A46 46 0 0 1 246 800" fill="none" stroke="#a8f1fb" stroke-width="2.5"/>
    <path d="M0 798H125M275 798H400" stroke="#e3e7ec" stroke-width="4"/>
  </svg>`;

const html = (s) => {
  const t = document.createElement('template');
  t.innerHTML = s.trim();
  return t.content.firstElementChild;
};

export function creeScan({ ouvrirFiche, nomDe = (k) => String(k), estMasque = () => false }) {
  const el = html(`
    <section class="scan" aria-label="Scanner un Pokémon">
      <video class="scan-video" playsinline muted autoplay></video>
      <div class="scan-ecran" aria-hidden="true"></div>
      <div class="scan-zone" hidden><i></i><i></i><i></i><i></i></div>
      <div class="scan-pistes" aria-live="polite"></div>
      <div class="pdx-verre" aria-hidden="true"></div>
      <div class="pdx-bande" aria-hidden="true"></div>
      <div class="pdx-lentille" aria-hidden="true"></div>
      <div class="pdx-haut" aria-hidden="true">${coque('h')}</div>
      <div class="pdx-bas" aria-hidden="true">${coque('b')}</div>
      <p class="scan-aide">Touchez l'image pour placer le cadre sur le Pokémon</p>
      <p class="scan-etat" hidden></p>
      <p class="scan-toast" role="status" hidden></p>
      <button class="scan-btn" type="button" aria-label="Scanner"><span></span></button>
    </section>`);
  const video = el.querySelector('video');
  const zoneEl = el.querySelector('.scan-zone');
  const etat = el.querySelector('.scan-etat');
  const toast = el.querySelector('.scan-toast');
  const btn = el.querySelector('.scan-btn');
  const ecran = el.querySelector('.scan-ecran');
  const pistesEl = el.querySelector('.scan-pistes');
  const aide = el.querySelector('.scan-aide');

  let flux = null;        // MediaStream de la caméra
  let ouverture = false;  // demande d'accès en cours
  let actif = false;      // la vue est affichée
  let occupe = false;     // une analyse est en cours
  // Cadre en FRACTIONS de la vue : il reste au même endroit si la vue change de taille.
  // `cy` est posé au premier affichage, au milieu de l'écran entre les deux coques ;
  // `px` est le côté réellement affiché, que la capture relit.
  const zone = { cx: 0.5, cy: null, cote: COTE_DEFAUT, px: 0 };

  // ------------------------------------------------------------ messages
  const montreEtat = (texte) => { etat.textContent = texte ?? ''; etat.hidden = !texte; };
  let minuteToast = 0;
  const montreToast = (texte) => {
    toast.textContent = texte;
    toast.hidden = false;
    toast.classList.remove('vu');
    void toast.offsetWidth; // relance l'animation d'entrée
    toast.classList.add('vu');
    clearTimeout(minuteToast);
    minuteToast = setTimeout(() => { toast.hidden = true; }, 2200);
  };

  // ------------------------------------------------------------ modèle
  let worker = null, pret = null, suivant = 1, suiviPossible = false;
  const attentes = new Map();

  function prepareModele() {
    if (pret) return pret;
    worker = new Worker(new URL('./scan-worker.js', import.meta.url), { type: 'module' });
    pret = new Promise((ok, ko) => {
      worker.onmessage = ({ data }) => {
        if (data.type === 'pret') { suiviPossible = data.suivi; ok(); }
        else if (data.type === 'resultat') attentes.get(data.id)?.ok(data);
        else if (data.type === 'erreur') {
          if (attentes.has(data.id)) attentes.get(data.id).ko(new Error(data.message));
          else ko(new Error(data.message));
        }
        if (data.id) attentes.delete(data.id);
      };
      worker.onerror = (e) => ko(new Error(e.message || 'Worker du scan en échec'));
    });
    worker.postMessage({
      type: 'charge',
      classifieur: new URL('scan/modele.onnx', document.baseURI).href,
      detecteur: new URL('scan/detecteur.onnx', document.baseURI).href,
    });
    // Un échec de chargement doit pouvoir être retenté à la prochaine ouverture.
    pret.catch(() => { worker?.terminate(); worker = null; pret = null; });
    return pret;
  }

  const demande = (message, transfert) => new Promise((ok, ko) => {
    const id = suivant++;
    attentes.set(id, { ok, ko });
    worker.postMessage({ ...message, id }, transfert);
  });
  const analyse = (pixels, n) => demande({ type: 'analyse', pixels, n, taille: TAILLE }, [pixels.buffer]);
  const detecte = (pixels) => demande({ type: 'detecte', pixels, largeur: DET_L, hauteur: DET_H }, [pixels.buffer]);

  // Moyenne des probabilités sur les cadrages, puis somme par groupe : une espèce et
  // ses formes se partagent la ressemblance, et c'est l'espèce qu'on juge d'abord.
  function decide(logits, n) {
    const C = CLASSES.length;
    const p = new Float32Array(C);
    for (let k = 0; k < n; k++) {
      const l = logits.subarray(k * C, (k + 1) * C);
      let max = -Infinity;
      for (const v of l) if (v > max) max = v;
      let somme = 0;
      for (const v of l) somme += Math.exp(v - max);
      for (let i = 0; i < C; i++) p[i] += Math.exp(l[i] - max) / somme / n;
    }
    let meilleur = null, conf = 0;
    for (const [groupe, idx] of GROUPES) {
      let s = 0;
      for (const i of idx) s += p[i];
      if (s > conf) { conf = s; meilleur = groupe; }
    }
    if (!meilleur || conf < SEUIL) return { conf, trouve: null, groupe: meilleur };
    // Dans le groupe retenu, la forme la plus probable — mais seulement si elle pèse
    // plus de la moitié du groupe. Sinon on ouvre l'espèce, qui ne peut pas être fausse.
    let classe = -1, pc = 0;
    for (const i of GROUPES.get(meilleur)) if (p[i] > pc) { pc = p[i]; classe = i; }
    const key = pc > conf / 2 ? CLASSES[classe][0] : meilleur;
    return { conf, trouve: key, groupe: meilleur };
  }

  // ------------------------------------------------------------ caméra
  // ------------------------------------------------------------ ouverture du Pokédex
  //
  // À chaque ENTRÉE dans la vue, le Pokédex s'ouvre : fermé plein écran, sa lentille
  // se charge et lance des ondes, un reflet balaie la bande de verre, puis les deux
  // coques s'écartent sur un liseré lumineux et l'écran de verre s'éclaircit jusqu'à
  // laisser voir la caméra. Tout est en CSS : la classe `ferme` pose l'état de départ
  // sans transition, `ouvre` porte les transitions et animations de la séquence.
  // Un rendu survenu en cours de route (capture cochée dans la fiche) ne la relance
  // pas : seule une entrée réelle, `actif` passant de faux à vrai, le fait.
  let minuteOuverture = 0;

  // Positions des coques ouvertes, en PIXELS. Safari sur iPhone faisait disparaître la
  // coque du haut pendant l'ouverture : sa position finale mêlait %, unités de
  // conteneur (cqw) et zone sûre (env()), un mélange que WebKit n'interpole pas dans
  // une transformation animée. La coque du bas, sans zone sûre, restait visible. On
  // relève donc les distances sur l'écran réellement posé (`.scan-ecran`), et
  // l'animation ne manipule plus que des pixels.
  function majCoques() {
    const h = el.clientHeight;
    if (!h) return;
    const haut = ecran.offsetTop, bas = haut + ecran.offsetHeight;
    el.style.setProperty('--haut-ouvert', `${haut - h / 2}px`);
    el.style.setProperty('--bas-ouvert', `${bas - h / 2}px`);
    el.style.setProperty('--course-faisceau', `${ecran.offsetHeight}px`);
  }

  function animeOuverture() {
    clearTimeout(minuteOuverture);
    majCoques();
    el.classList.remove('ouvre');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.remove('ferme'); return; }
    el.classList.add('ferme');
    void el.offsetWidth; // valide l'état fermé avant de lancer les transitions
    el.classList.add('ouvre');
    el.classList.remove('ferme');
    minuteOuverture = setTimeout(() => el.classList.remove('ouvre'), 2000);
  }

  async function demarre() {
    const entree = !actif;
    actif = true;
    if (entree) animeOuverture();
    majZone();
    prepareModele().catch(() => {});
    if (flux) { video.play().catch(() => {}); suis(); return; }
    // Chaque rendu rappelle demarre() : sans ce verrou, un rendu survenu pendant la
    // demande d'autorisation ouvrirait un second flux, jamais refermé.
    if (ouverture) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      montreEtat(window.isSecureContext
        ? 'Aucune caméra disponible sur cet appareil.'
        : 'La caméra demande une connexion sécurisée (https).');
      return;
    }
    montreEtat('Ouverture de la caméra…');
    ouverture = true;
    try {
      const f = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      // On a pu quitter la vue pendant la demande d'autorisation.
      if (!actif) { f.getTracks().forEach((t) => t.stop()); return; }
      flux = f;
      video.srcObject = f;
      // Sans attendre play() : sa promesse peut tarder, et le message resterait affiché.
      video.play().catch(() => {});
      montreEtat(null);
      majZone();
      suis();
    } catch (e) {
      montreEtat(e?.name === 'NotAllowedError'
        ? "L'accès à la caméra a été refusé. Autorisez-le dans Réglages › Guiguidex."
        : 'Impossible d’ouvrir la caméra.');
    } finally {
      ouverture = false;
    }
  }

  function coupeFlux() {
    if (!flux) return;
    flux.getTracks().forEach((t) => t.stop());
    flux = null;
    video.srcObject = null;
  }

  // Quitter la vue coupe la caméra : témoin d'enregistrement éteint, batterie épargnée.
  function arrete() {
    if (!actif) return;
    actif = false;
    coupeFlux();
    videPistes();
  }

  // Appli en arrière-plan : iOS coupe de toute façon la caméra ; on la rouvre au retour.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) coupeFlux();
    else if (actif && el.isConnected) demarre();
  });

  // ------------------------------------------------------------ cadre
  function majZone() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    // Le cadre reste dans l'ÉCRAN du Pokédex, entre les deux coques : placé dessous,
    // il désignerait une zone que l'on ne voit pas.
    const haut = ecran.offsetTop, bas = haut + ecran.offsetHeight;
    const cote = Math.min(zone.cote * Math.min(w, bas - haut), w, bas - haut);
    if (zone.cy === null) zone.cy = (haut + bas) / 2 / h;
    const cx = Math.min(Math.max(zone.cx * w, cote / 2), w - cote / 2);
    const cy = Math.min(Math.max(zone.cy * h, haut + cote / 2), bas - cote / 2);
    zone.cx = cx / w;
    zone.cy = cy / h;
    zone.px = cote;
    Object.assign(zoneEl.style, {
      width: `${cote}px`, height: `${cote}px`, left: `${cx - cote / 2}px`, top: `${cy - cote / 2}px`,
    });
    zoneEl.hidden = false;
  }
  new ResizeObserver(() => { majCoques(); majZone(); }).observe(el);

  // Toucher place le cadre ; deux doigts qui s'écartent ou se rapprochent le
  // redimensionnent. Tant que la décision n'est pas prise, rien ne bouge.
  const doigts = new Map();
  let pince = null, bouge = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.scan-btn')) return;
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    el.setPointerCapture?.(e.pointerId);
    if (doigts.size === 2) {
      const [a, b] = [...doigts.values()];
      pince = { d: Math.hypot(a.x - b.x, a.y - b.y), cote: zone.cote };
    }
    bouge = false;
  });
  el.addEventListener('pointermove', (e) => {
    const d = doigts.get(e.pointerId);
    if (!d) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (Math.hypot(d.x - d.x0, d.y - d.y0) > 10) bouge = true;
    if (pince && doigts.size === 2) {
      const [a, b] = [...doigts.values()];
      const f = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pince.d);
      zone.cote = Math.min(COTE_MAX, Math.max(COTE_MIN, pince.cote * f));
      majZone();
    }
  });
  const leve = (e) => {
    const d = doigts.get(e.pointerId);
    if (!d) return;
    doigts.delete(e.pointerId);
    if (!pince && !bouge && e.type === 'pointerup') {
      const r = el.getBoundingClientRect();
      // Toucher un Pokémon suivi et reconnu ouvre sa fiche.
      const p = pisteSous(e.clientX - r.left, e.clientY - r.top);
      if (p) { doigts.delete(e.pointerId); ouvrirFiche(p.key); return; }
      zone.cx = (e.clientX - r.left) / r.width;
      zone.cy = (e.clientY - r.top) / r.height;
      majZone();
    }
    if (doigts.size === 0) pince = null;
  };
  el.addEventListener('pointerup', leve);
  el.addEventListener('pointercancel', leve);

  // ------------------------------------------------------------ capture et analyse
  const toile = document.createElement('canvas');
  toile.width = toile.height = TAILLE;
  const ctx = toile.getContext('2d', { willReadFrequently: true });

  // Découpe les cadrages dans une source (vidéo ou image) et les met au format du
  // réseau : RGB en [0, 1], canaux séparés (CHW).
  function pixelsDe(source, cx, cy, cote, echelles = ECHELLES) {
    const n = echelles.length;
    const px = new Float32Array(n * 3 * TAILLE * TAILLE);
    const plan = TAILLE * TAILLE;
    echelles.forEach((e, k) => {
      const c = cote * e;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, TAILLE, TAILLE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, cx - c / 2, cy - c / 2, c, c, 0, 0, TAILLE, TAILLE);
      const d = ctx.getImageData(0, 0, TAILLE, TAILLE).data;
      const base = k * 3 * plan;
      for (let i = 0; i < plan; i++) {
        px[base + i] = d[i * 4] / 255;
        px[base + plan + i] = d[i * 4 + 1] / 255;
        px[base + 2 * plan + i] = d[i * 4 + 2] / 255;
      }
    });
    return px;
  }

  // Le cadre affiché, ramené en pixels de la vidéo. L'aperçu est en `object-fit:
  // cover` : la vidéo est agrandie jusqu'à couvrir la vue, et ses bords sont rognés.
  function zoneDansVideo() {
    const w = el.clientWidth, h = el.clientHeight;
    const vw = video.videoWidth, vh = video.videoHeight;
    const e = Math.max(w / vw, h / vh);
    const ox = (w - vw * e) / 2, oy = (h - vh * e) / 2;
    return {
      cx: (zone.cx * w - ox) / e,
      cy: (zone.cy * h - oy) / e,
      cote: zone.px / e,
    };
  }

  async function reconnais(pixels) {
    if (!worker || !pret) prepareModele();
    let lent = setTimeout(() => montreEtat('Chargement du modèle…'), 250);
    try {
      await pret;
    } finally {
      clearTimeout(lent);
      montreEtat(null);
    }
    const r = await analyse(pixels, pixels.length / (3 * TAILLE * TAILLE));
    return { ...decide(r.logits, r.n), ms: r.ms };
  }

  // Le bouton et le suivi partagent le moteur : une seule demande à la fois.
  let verrou = Promise.resolve();
  const enSerie = (fn) => {
    const r = verrou.then(fn, fn);
    verrou = r.catch(() => {});
    return r;
  };

  // ------------------------------------------------------------ suivi en continu
  //
  // Tant que la caméra tourne, le détecteur regarde l'écran du Pokédex, image après
  // image. Chaque boîte trouvée devient une PISTE, rattachée d'une image à l'autre par
  // recouvrement : c'est ce qui fait qu'un cadre suit son Pokémon au lieu d'en créer
  // un nouveau à chaque image. Une piste neuve est confiée au classifieur ; reconnue,
  // elle affiche le nom du Pokémon et se touche pour ouvrir sa fiche. Refusée — un
  // objet qui ressemblait à un Pokémon sans en être un —, elle reste suivie mais
  // invisible, pour ne pas être réanalysée à chaque image.
  //
  // Le cadre manuel ne s'affiche que quand aucun Pokémon n'est suivi.
  let pistes = [], idPiste = 1, suiviEnCours = false;
  const attente = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const iou = (a, b) => {
    const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    return inter / Math.max(1e-6, a.w * a.h + b.w * b.h - inter);
  };

  // Correspondance vue ↔ vidéo (aperçu en object-fit: cover), et zone analysée : le
  // plus grand rectangle 2:3 centré dans l'écran du Pokédex.
  function geometrie() {
    const w = el.clientWidth, h = el.clientHeight, vw = video.videoWidth, vh = video.videoHeight;
    if (!w || !h || !vw || !vh) return null;
    const e = Math.max(w / vw, h / vh), ox = (w - vw * e) / 2, oy = (h - vh * e) / 2;
    let x0 = ecran.offsetLeft, y0 = ecran.offsetTop, rw = ecran.offsetWidth, rh = ecran.offsetHeight;
    if (rw / rh > DET_L / DET_H) { const nw = rh * DET_L / DET_H; x0 += (rw - nw) / 2; rw = nw; }
    else { const nh = rw * DET_H / DET_L; y0 += (rh - nh) / 2; rh = nh; }
    return { e, ox, oy, x0, y0, rw, rh };
  }

  const toileDet = document.createElement('canvas');
  toileDet.width = DET_L;
  toileDet.height = DET_H;
  const ctxDet = toileDet.getContext('2d', { willReadFrequently: true });

  function pixelsDetection(g) {
    ctxDet.drawImage(video, (g.x0 - g.ox) / g.e, (g.y0 - g.oy) / g.e, g.rw / g.e, g.rh / g.e, 0, 0, DET_L, DET_H);
    const d = ctxDet.getImageData(0, 0, DET_L, DET_H).data;
    const plan = DET_L * DET_H;
    const px = new Float32Array(3 * plan);
    for (let i = 0; i < plan; i++) {
      px[i] = (d[i * 4] / 255 - MOYENNE[0]) / ECART[0];
      px[plan + i] = (d[i * 4 + 1] / 255 - MOYENNE[1]) / ECART[1];
      px[2 * plan + i] = (d[i * 4 + 2] / 255 - MOYENNE[2]) / ECART[2];
    }
    return px;
  }

  // Cases retenues → boîtes en pixels de la vue.
  function boitesDe(r, g) {
    const f = g.rw / DET_L, n = DET_GL * DET_GH, boites = [];
    for (let i = 0; i < n; i++) {
      const s = r.chaleur[i];
      if (s < SEUIL_SUIVI) continue;
      const gx = i % DET_GL, gy = (i - gx) / DET_GL;
      const w = r.taille[i] * DET_PAS * f, h = r.taille[n + i] * DET_PAS * f;
      const cx = g.x0 + (gx + r.decalage[i]) * DET_PAS * f, cy = g.y0 + (gy + r.decalage[n + i]) * DET_PAS * f;
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
        // Lissage : le cadre rejoint la détection sans trembler d'une image à l'autre.
        for (const k of ['x', 'y', 'w', 'h']) meilleure[k] += (b[k] - meilleure[k]) * 0.6;
        meilleure.manques = 0;
      } else if (b.s >= SEUIL_NAISSANCE && pistes.length < PISTES_MAX) {
        pistes.push({ id: idPiste++, ...b, manques: 0, etat: 'nouvelle', key: null, nom: '', essais: 0, doutes: 0, verifieA: 0 });
      }
    }
    for (const p of libres) p.manques++;
    pistes = pistes.filter((p) => p.manques < MANQUES_MAX);
  }

  // Une piste à la fois est confiée au classifieur, la plus urgente d'abord : les
  // neuves (les plus grandes en premier), puis celles dont la vérification a vieilli.
  async function classeUnePiste(g) {
    const maintenant = performance.now();
    const neuves = pistes.filter((p) => p.etat === 'nouvelle').sort((a, b) => b.w * b.h - a.w * a.h);
    const p = neuves.find((q) => q.essais === 0 || maintenant - q.verifieA > 500)
      ?? pistes.find((q) => q.etat !== 'nouvelle' && maintenant - q.verifieA > REVERIFIE_MS);
    if (!p) return;
    const cote = Math.max(p.w, p.h) * 1.15;
    const cx = (p.x + p.w / 2 - g.ox) / g.e, cy = (p.y + p.h / 2 - g.oy) / g.e;
    const r = await enSerie(() => reconnais(pixelsDe(video, cx, cy, cote / g.e, [1])));
    if (!pistes.includes(p)) return;
    p.verifieA = performance.now();
    if (r.trouve !== null && r.conf >= SEUIL_AFFICHAGE) {
      Object.assign(p, { etat: 'reconnu', key: r.trouve, nom: nomDe(r.trouve), essais: 0, doutes: 0 });
    } else if (p.etat === 'reconnu') {
      // Déjà affiché : deux vérifications sous 90 % d'affilée pour l'effacer, sans
      // quoi une seule image floue le ferait clignoter.
      if (++p.doutes >= 2) Object.assign(p, { etat: 'refusee', key: null, nom: '' });
    } else if (++p.essais >= 3) {
      // Trois essais sans jamais atteindre 90 % : la piste s'efface pour de bon.
      Object.assign(p, { etat: 'refusee', key: null, nom: '' });
    }
  }

  function dessinePistes() {
    // Seules les pistes reconnues s'affichent : plus de cadre « en attente » qui
    // encadrait n'importe quel objet le temps que le classifieur se prononce.
    const visibles = pistes.filter((p) => p.etat === 'reconnu');
    const vus = new Set();
    for (const p of visibles) {
      let n = pistesEl.querySelector(`[data-piste="${p.id}"]`);
      if (!n) {
        n = html(`<div class="scan-piste" data-piste="${p.id}"><i></i><i></i><i></i><i></i><b></b></div>`);
        pistesEl.append(n);
      }
      vus.add(n);
      n.classList.toggle('reconnu', p.etat === 'reconnu');
      // Près du haut de l'écran, le nom passerait sous le bandeau d'aide ou sous la
      // coque : il se met alors SOUS le cadre.
      n.classList.toggle('nom-bas', p.y - ecran.offsetTop < 64);
      n.querySelector('b').textContent = p.etat === 'reconnu' ? p.nom : '';
      Object.assign(n.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` });
    }
    for (const n of [...pistesEl.children]) if (!vus.has(n)) n.remove();
    zoneEl.hidden = visibles.length > 0 || !zone.px;
    aide.textContent = visibles.some((p) => p.etat === 'reconnu')
      ? 'Touchez un Pokémon pour ouvrir sa fiche'
      : "Touchez l'image pour placer le cadre sur le Pokémon";
  }

  function videPistes() {
    pistes = [];
    pistesEl.replaceChildren();
    if (zone.px) zoneEl.hidden = false;
  }

  function pisteSous(x, y) {
    return pistes.filter((p) => p.etat === 'reconnu' && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
  }

  async function suis() {
    if (suiviEnCours) return;
    suiviEnCours = true;
    try {
      while (actif && el.isConnected && flux) {
        // En pause pendant l'ouverture du Pokédex, sous une fiche, pendant une analyse
        // au bouton, ou appli en arrière-plan : inutile de faire chauffer le téléphone.
        if (document.hidden || estMasque() || occupe || el.classList.contains('ouvre')
          || el.classList.contains('ferme') || video.readyState < 2) {
          await attente(300);
          continue;
        }
        try { await (pret ?? prepareModele()); } catch { await attente(2000); continue; }
        if (!suiviPossible) return;
        const g = geometrie();
        if (!g) { await attente(300); continue; }
        const r = await enSerie(() => detecte(pixelsDetection(g)));
        const boites = boitesDe(r, g);
        majPistes(boites);
        // Développement : état du suivi, pour le vérifier sans caméra. Retiré du build.
        if (import.meta.env.DEV) window.__suivi = { ms: Math.round(r.ms), boites, pistes: pistes.map((p) => ({ etat: p.etat, nom: p.nom, x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.w), h: Math.round(p.h) })) };
        dessinePistes();
        await classeUnePiste(g);
        dessinePistes();
        await attente(30);
      }
    } catch (e) {
      console.error('suivi', e);
    } finally {
      suiviEnCours = false;
      videPistes();
    }
  }

  async function scanne() {
    if (occupe) return;
    // Des Pokémon sont suivis et reconnus : le bouton ouvre la fiche du plus grand à
    // l'écran, celui qu'on vise manifestement. Sinon, analyse du cadre comme avant.
    const vus = pistes.filter((p) => p.etat === 'reconnu');
    if (vus.length) {
      ouvrirFiche(vus.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b)).key);
      return;
    }
    if (!flux || video.readyState < 2) { montreToast('La caméra n’est pas prête'); return; }
    occupe = true;
    el.classList.add('analyse');
    try {
      const z = zoneDansVideo();
      const r = await enSerie(() => reconnais(pixelsDe(video, z.cx, z.cy, z.cote)));
      if (r.trouve !== null) {
        zoneEl.classList.add('ok');
        setTimeout(() => zoneEl.classList.remove('ok'), 500);
        ouvrirFiche(r.trouve);
      } else {
        zoneEl.classList.remove('ko');
        void zoneEl.offsetWidth;
        zoneEl.classList.add('ko');
        montreToast('Pokémon non trouvé');
      }
    } catch (e) {
      console.error(e);
      montreToast('Analyse impossible');
    } finally {
      occupe = false;
      el.classList.remove('analyse');
    }
  }
  btn.addEventListener('click', scanne);

  // En développement : analyser une image quelconque, cadre = image entière. Sert à
  // vérifier toute la chaîne sans caméra. Retiré du build par Vite.
  if (import.meta.env.DEV) {
    window.__scanImage = async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const cote = Math.min(img.naturalWidth, img.naturalHeight);
      return reconnais(pixelsDe(img, img.naturalWidth / 2, img.naturalHeight / 2, cote));
    };
  }

  return { element: el, demarre, arrete };
}
