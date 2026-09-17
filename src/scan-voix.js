// Voix du Pokédex : à l'ouverture d'une fiche DEPUIS LE SCAN, une voix lit le nom, la
// catégorie, les types et la description du Pokémon, comme le Pokédex de l'anime.
//
// La voix est ENREGISTRÉE : un MP3 par espèce dans public/voix/<numéro>.mp3, généré sur
// le PC par une voix de synthèse neuronale (XTTS-v2, voix « Sofia »), accélérée ×1,3 et
// passée dans un effet de haut-parleur métallique, précédée d'un double bip — voir
// ml/voix/. La voix du système sonnait trop robotique et prononçait mal (« Shurikan »).
// Rien ne passe par le réseau : les fichiers sont embarqués comme les sprites et les cris.
//
// Si le fichier manque, on retombe sur la synthèse vocale du système.

const FEMININES = ['audrey', 'aurélie', 'aurelie', 'amélie', 'amelie', 'marie', 'julie', 'hortense', 'denise', 'virginie', 'céline', 'celine', 'léa', 'lea', 'chantal', 'sylvie', 'google français'];
const MASCULINES = ['thomas', 'nicolas', 'daniel', 'paul', 'henri', 'claude', 'jacques', 'rémi', 'remi', 'antoine', 'jean'];

// Un vingtième de seconde de silence en WAV : sert à débloquer le lecteur dans un geste.
const SILENCE = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

const parle = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';

let lecteur = null;
let debloquee = false;
let voixChoisie = null;
let demande = 0; // numéro de la dernière lecture demandée : une ancienne erreur ne relit rien

function choisitVoix() {
  const voix = speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang));
  if (!voix.length) return null;
  const nom = (v) => v.name.toLowerCase();
  const rang = (v) => {
    const i = FEMININES.findIndex((f) => nom(v).includes(f));
    let r = i < 0 ? 100 : i;
    if (MASCULINES.some((m) => nom(v).includes(m))) r += 1000;
    if (/premium|enhanced|améliorée|natural/i.test(v.name)) r -= 50;
    if (!/fr[-_]fr/i.test(v.lang)) r += 5;
    return r;
  };
  return voix.sort((a, b) => rang(a) - rang(b))[0];
}
if (parle()) {
  voixChoisie = choisitVoix();
  speechSynthesis.addEventListener?.('voiceschanged', () => { voixChoisie = choisitVoix(); });
}

// iOS ne laisse jouer un son qu'après une lecture lancée DANS un geste. Le mode Manuel
// ouvre la fiche après une analyse asynchrone, hors du geste : le premier toucher de la
// vue Scan débloque donc le lecteur (silence) et la synthèse vocale (phrase muette). Le
// même élément audio sert ensuite à toutes les lectures, c'est lui qui reste débloqué.
export function debloqueVoix() {
  if (debloquee) return;
  debloquee = true;
  lecteur ??= new Audio();
  lecteur.src = SILENCE;
  lecteur.play().catch(() => {});
  if (parle()) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

export function taisVoix() {
  demande++;
  if (lecteur) lecteur.pause();
  if (parle()) speechSynthesis.cancel();
}

function synthese({ nom, categorie, types = [], description }) {
  if (!parle()) return;
  const phrases = [
    `${nom}.`,
    categorie ? `Le ${categorie}.` : '',
    types.length ? `Type ${types.join(' et ')}.` : '',
    description ?? '',
  ].filter(Boolean).join(' ');
  const u = new SpeechSynthesisUtterance(phrases);
  u.lang = voixChoisie?.lang ?? 'fr-FR';
  if (voixChoisie) u.voice = voixChoisie;
  u.pitch = 1.15;
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

// `fiche` : { numero, nom, categorie, types: ['Spectre', 'Poison'], description }.
export function litFiche(fiche) {
  taisVoix();
  const n = demande;
  lecteur ??= new Audio();
  lecteur.onerror = () => { if (n === demande) synthese(fiche); };
  lecteur.src = `voix/${fiche.numero}.mp3`;
  lecteur.currentTime = 0;
  lecteur.play().catch((e) => {
    // Fichier absent : l'erreur arrive par onerror. Lecture refusée (pas de geste) :
    // la synthèse ne passerait pas non plus, on n'insiste pas.
    if (e?.name !== 'NotAllowedError' && n === demande && lecteur.error) synthese(fiche);
  });
}
