// Les règles du collectionneur, reprises de Cartodex : catégories de rareté et
// variantes qu'une carte peut prendre. C'est le savoir métier de l'appli de cartes ;
// on le garde à part, sans rien d'interface, pour qu'il se lise et se corrige d'un bloc.

// ---------------------------------------------------------------- rareté
// TCGdex écrit la rareté de quarante façons (« Commune », « Double rare »,
// « Illustration spéciale rare », « Deux Diamants »…). Cartodex les range en sept
// catégories de collectionneur ; c'est ce rangement que filtrent et trient les vues.
export const CATEGORIES = ['commune', 'peu_commune', 'rare', 'ultra_rare', 'ar', 'alternative', 'autre'];

export function categorie(c) {
  const r = String(c?.rarity ?? c?.rar ?? '').toLowerCase().trim();
  const nom = String(c?.name ?? c?.n ?? '').toLowerCase().trim();
  const num = String(c?.localId ?? c?.num ?? '').toLowerCase().trim();
  const id = String(c?.id ?? '').toLowerCase();

  // Trainer Gallery et Galarian Gallery : des illustrations, quel que soit le libellé.
  if (num.startsWith('tg') || id.includes('-tg') || num.startsWith('gg') || id.includes('-gg')) return 'ar';
  if (r.includes('hyper rare') || r.includes('rare noir blanc') || nom.endsWith('brillant')) return 'autre';

  const cartePuissante = nom.includes(' ex ') || nom.includes('-ex') || nom.endsWith(' ex')
    || nom.endsWith('v') || nom.includes(' v ') || nom.endsWith('vmax') || nom.includes(' vmax ')
    || nom.endsWith('vstar') || nom.includes(' vstar ');
  if (cartePuissante) {
    if (r.includes('spéciale') || r.includes('special') || r === 'sir' || r === 'sar') return 'alternative';
    if (r === 'illustration rare' || r === 'ar') return 'ar';
    return 'ultra_rare';
  }
  if (r === 'commune' || r === 'common' || r === 'un diamant') return 'commune';
  if (r === 'peu commune' || r === 'uncommon' || r === 'deux diamants') return 'peu_commune';
  if (r === 'rare' || r === 'holo rare' || r === 'rare holo' || r === 'radieux rare' || r === 'trois diamants') return 'rare';
  if (r === 'ultra rare' || r === 'double rare' || r === 'rare prime' || r.endsWith('lv.x')
    || r.endsWith('légende') || r === 'quatre diamants') return 'ultra_rare';
  if (r === 'ar' || r.includes('illustration rare')) return 'ar';
  if (r.includes('spéciale') || r.includes('special illustration') || r === 'sir' || r === 'sar' || r === 'alternative') return 'alternative';
  // Sans rareté connue (détail pas encore chargé) : on ne range pas au hasard.
  if (!r) return null;
  return 'autre';
}

// ---------------------------------------------------------------- variantes
// Les reverse « Poké Ball » et « Master Ball » : Évolutions Prismatiques, Flamme
// Blanche et Foudre Noire SEULEMENT (29/10/2026, à la demande), sur les cartes communes
// à rares. La règle de Cartodex reconnaissait aussi Couronne Stellaire et Étincelles
// Déferlantes (sv07, sv08) et, par le NOM, toute extension où paraît « flamme » ou
// « foudre » — Flammes Obsidiennes, Flammes Fantasmagoriques… D'où la liste exacte des
// identifiants, les mêmes chez TCGdex en français et en anglais.
const EXTENSIONS_BALL = new Set(['sv08.5', 'sv10.5w', 'sv10.5b']);
export const extensionABall = (setId) => EXTENSIONS_BALL.has(String(setId || '').toLowerCase());
// TCG Pocket est un jeu numérique : ses cartes n'ont pas de reverse.
const POCKET = /^(a\d|b\d|p-[ab])/i;
// Les séries Wizards d'avant la reverse (29/10/2026, à la demande) : Set de Base, Jungle,
// Fossile, Base Set 2, Team Rocket, Gym, Neo, Southern Islands et les promos Wizards.
// Elle arrive avec Legendary Collection (2002), puis toute la série e-card. TCGdex en
// annonce pourtant quelques-unes (Southern Islands) : ici, on n'en propose AUCUNE.
const WIZARDS_SANS_REVERSE = /^(base[1-5]|basep|wp|gym[12]|neo[1-4]|si1)$/i;

// Les variantes qu'une carte peut prendre, dans l'ordre d'affichage. TCGdex les
// publie désormais carte par carte (`variants`) : on les suit quand on les a, et l'on
// retombe sinon sur une seule version. Toute commune, peu commune ou rare a sa REVERSE
// (29/10/2026, à la demande), que TCGdex l'annonce ou non — sauf dans Pocket et dans les
// séries Wizards qui n'en ont jamais eu.
//
// « Holo », c'est la RARE HOLOGRAPHIQUE classique de chaque série, et elle seule
// (28/10/2026, à la demande, convention de Pokécardex). Une carte spéciale toute brillante
// — ex, EX, GX, V, VMAX, VSTAR, TURBO, Prime, LÉGENDE, Radieux, illustrations, hyper
// rares, promos… — n'a pas de version « holo » : sa version NORMALE est celle-là. TCGdex,
// lui, la publie en `holo` seul ; on la range en `normal`.
//
// Depuis Écarlate et Violet (puis Méga-Évolution), TOUTES les rares sont holographiques :
// elles se rangent en « holo » (+ reverse), JAMAIS en « normale » — même quand TCGdex
// annonce aussi une normale (Méganium de Méga-Évolution). Demandé le 28/10/2026 ; une
// version intermédiaire les rangeait en normale, et les exemplaires et pochettes rangés
// ainsi repassent en holo (`varianteReelle`).
const SPECIALE = /(^|[\s-])(ex|gx|v|vmax|vstar|vunion|break|turbo|lv\.?\s?x|prime|légende|legend)$|[★☆]/i;
const ERE_TOUT_HOLO = /^(sv|me|30th)/i;
const extensionDe = (c) => {
  const s = typeof c?.set === 'object' ? c?.set?.id : c?.set;
  if (s) return String(s);
  const id = String(c?.id ?? '');
  return id.slice(0, Math.max(0, id.lastIndexOf('-')));
};
export function holoClassique(c) {
  const r = String(c?.rarity ?? c?.rar ?? '').toLowerCase().trim();
  const nom = String(c?.name ?? c?.n ?? '').trim();
  return categorie(c) === 'rare' && !r.startsWith('radi') && !SPECIALE.test(nom);
}
// Une rare d'Écarlate et Violet ou de Méga-Évolution : holo, et seulement holo.
const rareToutHolo = (c) => holoClassique(c) && ERE_TOUT_HOLO.test(extensionDe(c));
// La variante telle qu'on la range : un « holo » sur une carte qui n'est pas une rare
// holographique est sa version normale ; une « normale » d'une rare d'Écarlate et Violet
// ou de Méga-Évolution est sa version holo. Rareté inconnue : on ne tranche pas.
export function varianteReelle(c, v) {
  if (v !== 'holo' && v !== 'normal') return v;
  const r = String(c?.rarity ?? c?.rar ?? '').trim();
  if (!r) return v;
  if (v === 'holo') return holoClassique(c) ? v : 'normal';
  return rareToutHolo(c) ? 'holo' : v;
}

export function variantes(c, setId) {
  const cat = categorie(c);
  const courante = cat === 'commune' || cat === 'peu_commune' || cat === 'rare';
  const ext = String(setId || extensionDe(c));
  const v = c?.variants;
  const liste = [];
  if (v && typeof v === 'object') {
    const toutHolo = rareToutHolo(c);
    const holo = (!!v.holo || toutHolo) && holoClassique(c);
    if ((v.normal && !toutHolo) || (v.holo && !holo)) liste.push('normal');
    if (holo) liste.push('holo');
    // Six cartes de Southern Islands n'ont, chez TCGdex, QUE la reverse : elles retombent
    // sur leur version normale, plus bas.
    if (v.reverse && !WIZARDS_SANS_REVERSE.test(ext)) liste.push('reverse');
    if (v.firstEdition) liste.push('premiere');
  }
  if (!liste.length) liste.push(rareToutHolo(c) ? 'holo' : 'normal');
  // La reverse prend sa place d'affichage : avant la première édition.
  if (courante && !liste.includes('reverse') && !POCKET.test(ext) && !WIZARDS_SANS_REVERSE.test(ext)) {
    const p = liste.indexOf('premiere');
    liste.splice(p < 0 ? liste.length : p, 0, 'reverse');
  }
  if (courante && extensionABall(ext)) liste.push('reverse_pokeball', 'reverse_masterball');
  return liste;
}

export const VARIANTES = ['normal', 'holo', 'reverse', 'premiere', 'reverse_pokeball', 'reverse_masterball'];
export const LANGUES_CARTE = ['FR', 'EN', 'JP'];
export const ETATS = ['neuf', 'tres_bon', 'bon', 'abime'];

// Les exemplaires repris de Cartodex portent l'état en toutes lettres (« Très Bon ») :
// on le ramène à la clé, pour le traduire.
export function cleEtat(e) {
  const x = String(e || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (x.startsWith('tres')) return 'tres_bon';
  if (x.startsWith('bon')) return 'bon';
  if (x.startsWith('abim')) return 'abime';
  return 'neuf';
}

// ---------------------------------------------------------------- recherche tolérante
// Distance d'édition (Levenshtein), pour proposer « Dracaufeu » à qui tape
// « dracofeu ». Cartodex embarquait un dictionnaire de 2 Mo ; ici, les noms du
// Pokédex — déjà dans l'appli — suffisent : une carte porte presque toujours le nom
// d'un Pokémon.
export function distance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prec = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cour = [i];
    for (let j = 1; j <= n; j++) {
      cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prec = cour;
  }
  return prec[n];
}
