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
// Les reverse « Poké Ball » et « Master Ball » n'existent que dans quelques
// extensions d'Écarlate et Violet (Évolutions Prismatiques, Mascarade
// Crépusculaire, Étincelles Déferlantes…), et seulement sur les cartes communes à
// rares. Règle de Cartodex, gardée telle quelle.
export function extensionABall(setId, setNom) {
  const id = String(setId || '').toLowerCase();
  const n = String(setNom || '').toLowerCase();
  return id.includes('sv07') || id.includes('sv7') || id.includes('sv08') || id.includes('sv8')
    || id.includes('sv85') || id.includes('sv085')
    || n.includes('flamme') || n.includes('foudre') || n.includes('prismatique');
}

// Les variantes qu'une carte peut prendre, dans l'ordre d'affichage. TCGdex les
// publie désormais carte par carte (`variants`) : on les suit quand on les a, et l'on
// retombe sur la règle de Cartodex sinon (normale + reverse pour les cartes
// courantes, une seule version pour les cartes rares).
//
// « Holo », c'est la RARE HOLOGRAPHIQUE classique de chaque série, et elle seule
// (28/10/2026, à la demande, convention de Pokécardex). Une carte spéciale toute brillante
// — ex, EX, GX, V, VMAX, VSTAR, TURBO, Prime, LÉGENDE, Radieux, illustrations, hyper
// rares, promos… — n'a pas de version « holo » : sa version NORMALE est celle-là. TCGdex,
// lui, la publie en `holo` seul ; on la range en `normal`.
const SPECIALE = /(^|[\s-])(ex|gx|v|vmax|vstar|vunion|break|turbo|lv\.?\s?x|prime|légende|legend)$|[★☆]/i;
export function holoClassique(c) {
  const r = String(c?.rarity ?? c?.rar ?? '').toLowerCase().trim();
  const nom = String(c?.name ?? c?.n ?? '').trim();
  return categorie(c) === 'rare' && !r.startsWith('radi') && !SPECIALE.test(nom);
}
// La variante telle qu'on la range : un « holo » sur une carte qui n'est pas une rare
// holographique classique est sa version normale. Rareté inconnue : on ne tranche pas.
export function varianteReelle(c, v) {
  if (v !== 'holo') return v;
  const r = String(c?.rarity ?? c?.rar ?? '').trim();
  return r && !holoClassique(c) ? 'normal' : v;
}

export function variantes(c, setId, setNom) {
  const cat = categorie(c);
  const courante = cat === 'commune' || cat === 'peu_commune' || cat === 'rare';
  const v = c?.variants;
  const liste = [];
  if (v && typeof v === 'object') {
    const holo = !!v.holo && holoClassique(c);
    if (v.normal || (v.holo && !holo)) liste.push('normal');
    if (holo) liste.push('holo');
    if (v.reverse) liste.push('reverse');
    if (v.firstEdition) liste.push('premiere');
  }
  if (!liste.length) {
    liste.push('normal');
    if (courante) liste.push('reverse');
  }
  if (courante && extensionABall(setId, setNom)) liste.push('reverse_pokeball', 'reverse_masterball');
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
