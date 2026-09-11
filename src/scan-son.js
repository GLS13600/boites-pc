// Son d'ouverture du Pokédex, SYNTHÉTISÉ — aucun fichier audio.
//
// Il reprend les éléments typiques des ouvertures de Pokédex, sans en copier aucune :
// les sons des jeux et de l'anime appartiennent à leurs ayants droit, et l'appli doit
// rester hors ligne. Chaque couche est calée sur une étape de l'animation (voir
// animeOuverture dans scan.js et la séquence dans style.css) :
//
//   0 → 0,5 s     la lentille se charge : cascade de bips carrés et montée en fréquence ;
//   0,18 / 0,4 s  les deux ondes : un « ping » cristallin chacune ;
//   0,5 → 1,3 s   les coques s'écartent : souffle filtré qui balaie, moteur grave ;
//   1,0 → 1,8 s   le faisceau descend l'écran : tonalité de scanner, modulée ;
//   1,25 s        l'écran est prêt : carillon à deux notes.
//
// `programme` accepte n'importe quel contexte audio, y compris hors ligne
// (OfflineAudioContext) : c'est ce qui permet de vérifier le son sans l'écouter.

export function programme(ctx, sortie, t0 = ctx.currentTime) {
  // Bruit blanc, pour le souffle mécanique.
  const bruit = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 1.2), ctx.sampleRate);
  const d = bruit.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Enveloppe : montée, maintien, extinction exponentielle (jamais jusqu'à 0 exact).
  const enveloppe = (gain, debut, attaque, tenue, chute, niveau) => {
    gain.gain.setValueAtTime(0.0001, debut);
    gain.gain.linearRampToValueAtTime(niveau, debut + attaque);
    gain.gain.setValueAtTime(niveau, debut + attaque + tenue);
    gain.gain.exponentialRampToValueAtTime(0.0001, debut + attaque + tenue + chute);
  };
  const oscillateur = (type, frequence, debut, duree, niveau, versFrequence = null) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(frequence, debut);
    if (versFrequence) o.frequency.exponentialRampToValueAtTime(versFrequence, debut + duree);
    enveloppe(g, debut, 0.005, duree * 0.4, duree * 0.6, niveau);
    o.connect(g).connect(sortie);
    o.start(debut);
    o.stop(debut + duree + 0.05);
    return o;
  };

  // 1. Charge de la lentille : cascade de bips, montée en fréquence.
  [880, 1175, 1480, 1760, 2350, 2960].forEach((f, i) => oscillateur('square', f, t0 + 0.02 + i * 0.055, 0.045, 0.05));
  {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const vibrato = ctx.createOscillator();
    const profondeur = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(260, t0);
    o.frequency.exponentialRampToValueAtTime(1400, t0 + 0.5);
    vibrato.frequency.value = 22;
    profondeur.gain.value = 18;
    vibrato.connect(profondeur).connect(o.frequency);
    enveloppe(g, t0, 0.08, 0.3, 0.25, 0.12);
    o.connect(g).connect(sortie);
    o.start(t0); vibrato.start(t0);
    o.stop(t0 + 0.7); vibrato.stop(t0 + 0.7);
  }

  // 2. Les deux ondes de la lentille.
  for (const t of [0.18, 0.4]) oscillateur('sine', 2400, t0 + t, 0.16, 0.09, 1600);

  // 3. Ouverture des coques : souffle qui balaie + moteur grave.
  {
    const src = ctx.createBufferSource();
    const filtre = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = bruit;
    filtre.type = 'bandpass';
    filtre.Q.value = 1.4;
    filtre.frequency.setValueAtTime(350, t0 + 0.5);
    filtre.frequency.exponentialRampToValueAtTime(3200, t0 + 1.25);
    enveloppe(g, t0 + 0.5, 0.18, 0.35, 0.3, 0.22);
    src.connect(filtre).connect(g).connect(sortie);
    src.start(t0 + 0.5);
    src.stop(t0 + 1.4);

    const moteur = ctx.createOscillator();
    const passeBas = ctx.createBiquadFilter();
    const gm = ctx.createGain();
    moteur.type = 'sawtooth';
    moteur.frequency.setValueAtTime(85, t0 + 0.5);
    moteur.frequency.linearRampToValueAtTime(150, t0 + 1.2);
    passeBas.type = 'lowpass';
    passeBas.frequency.value = 420;
    enveloppe(gm, t0 + 0.5, 0.1, 0.5, 0.2, 0.08);
    moteur.connect(passeBas).connect(gm).connect(sortie);
    moteur.start(t0 + 0.5);
    moteur.stop(t0 + 1.4);
  }

  // 4. Faisceau de scanner : tonalité aiguë, modulée en amplitude, qui descend un peu.
  {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const trem = ctx.createOscillator();
    const tremGain = ctx.createGain();
    const mod = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(2100, t0 + 1.02);
    o.frequency.exponentialRampToValueAtTime(1500, t0 + 1.78);
    trem.type = 'square';
    trem.frequency.value = 28;
    tremGain.gain.value = 0.5;
    mod.gain.value = 0.5;
    trem.connect(tremGain).connect(mod.gain);
    enveloppe(g, t0 + 1.02, 0.06, 0.5, 0.2, 0.06);
    o.connect(mod).connect(g).connect(sortie);
    o.start(t0 + 1.02); trem.start(t0 + 1.02);
    o.stop(t0 + 1.85); trem.stop(t0 + 1.85);
  }

  // 5. Carillon « prêt » : deux notes triangulaires.
  oscillateur('triangle', 1318.5, t0 + 1.25, 0.12, 0.14);
  oscillateur('triangle', 1760, t0 + 1.38, 0.28, 0.14);

  return 1.9; // durée totale, en secondes
}

let contexte = null;
let sortie = null;

// À appeler DEPUIS le geste de l'utilisateur (le toucher sur l'onglet Scan) : iOS
// n'autorise un contexte audio qu'ouvert ou relancé dans un geste.
export function joueOuverture() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!contexte) {
      contexte = new Ctx();
      // Limiteur en sortie : les couches se superposent, jamais de saturation. Le gain
      // est poussé à 2,4 : mesurée hors ligne, la crête brute ne dépassait pas 0,24,
      // trop discret pour le haut-parleur d'un téléphone.
      const limiteur = contexte.createDynamicsCompressor();
      limiteur.threshold.value = -3;
      limiteur.ratio.value = 12;
      sortie = contexte.createGain();
      sortie.gain.value = 2.4;
      sortie.connect(limiteur).connect(contexte.destination);
    }
    if (contexte.state === 'suspended') contexte.resume();
    programme(contexte, sortie, contexte.currentTime + 0.02);
  } catch {
    // Le son est un plus : sans audio, l'ouverture se fait en silence.
  }
}
