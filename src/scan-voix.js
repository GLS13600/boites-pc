// Voix du Pokédex : à l'ouverture d'une fiche DEPUIS LE SCAN, une voix féminine lit le
// nom, la catégorie, les types et la description du Pokémon, comme le Pokédex de l'anime.
//
// Synthèse vocale du système (speechSynthesis) : les voix d'iOS sont sur l'appareil,
// aucun réseau. Pas de fichier audio embarqué, rien à télécharger.

// Voix françaises féminines connues, par ordre de préférence (iOS, macOS, Windows,
// Android). Les voix « améliorées » ou « premium » d'iOS portent le même nom.
const FEMININES = ['audrey', 'aurélie', 'aurelie', 'amélie', 'amelie', 'marie', 'julie', 'hortense', 'denise', 'virginie', 'céline', 'celine', 'léa', 'lea', 'chantal', 'sylvie', 'google français'];
const MASCULINES = ['thomas', 'nicolas', 'daniel', 'paul', 'henri', 'claude', 'jacques', 'rémi', 'remi', 'antoine', 'jean'];

const parle = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';

let debloquee = false;
let voixChoisie = null;

function choisitVoix() {
  const voix = speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang));
  if (!voix.length) return null;
  const nom = (v) => v.name.toLowerCase();
  const rang = (v) => {
    const i = FEMININES.findIndex((f) => nom(v).includes(f));
    let r = i < 0 ? 100 : i;
    if (MASCULINES.some((m) => nom(v).includes(m))) r += 1000;
    if (/premium|enhanced|améliorée|natural/i.test(v.name)) r -= 50; // plus naturelle
    if (!/fr[-_]fr/i.test(v.lang)) r += 5;                             // français de France d'abord
    return r;
  };
  return voix.sort((a, b) => rang(a) - rang(b))[0];
}
if (parle()) {
  voixChoisie = choisitVoix();
  speechSynthesis.addEventListener?.('voiceschanged', () => { voixChoisie = choisitVoix(); });
}

// iOS n'accepte de parler qu'après une première lecture lancée DANS un geste. Le mode
// Manuel ouvre la fiche après une analyse asynchrone, hors du geste : on débloque donc
// la voix au premier toucher de la vue Scan, par une phrase vide.
export function debloqueVoix() {
  if (debloquee || !parle()) return;
  debloquee = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

export function taisVoix() {
  if (parle()) speechSynthesis.cancel();
}

// `fiche` : { nom, categorie, types: ['Spectre', 'Poison'], description }.
export function litFiche({ nom, categorie, types = [], description }) {
  if (!parle()) return;
  speechSynthesis.cancel();
  const phrases = [
    `${nom}.`,
    categorie ? `Le ${categorie}.` : '',
    types.length ? `Type ${types.join(' et ')}.` : '',
    description ?? '',
  ].filter(Boolean).join(' ');
  const u = new SpeechSynthesisUtterance(phrases);
  u.lang = voixChoisie?.lang ?? 'fr-FR';
  if (voixChoisie) u.voice = voixChoisie;
  // Un peu plus aiguë et vive que la voix par défaut : le ton du Pokédex de l'anime.
  u.pitch = 1.15;
  u.rate = 1.05;
  speechSynthesis.speak(u);
}
