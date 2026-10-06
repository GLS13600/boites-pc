import './style.css';
import pokedex from './data/pokedex.json';
import wallpapers from './data/wallpapers.json';
import { ALIGNEMENT, DEFAUT } from './paper-align.js';
import evolutions from './data/evolutions.json';
import forms from './data/forms.json';
import remakes from './data/dex-remakes.json';
import moves from './data/moves.json';
import learnsets from './data/learnsets.json';
import stats from './data/stats.json';
import JEUX from './data/versions.json';
import typechart from './data/typechart.json';
import abilities from './data/abilities.json';
import items from './data/items.json';
import NATURES from './data/natures.json';
import formDesc from './data/form-desc.json';
import elevage from './data/elevage.json';
import { creeScan } from './scan.js';
import { creeCompteUI } from './compte-ui.js';
// La synchronisation ne connaît ni l'état ni les clés de stockage : main.js lui
// fournit de quoi lire et poser la collection, elle se charge du transport.
import { brancher as brancheSync, marqueChange } from './sync.js';
import {
  t, langue, chargeLangue, LANGUES, estLangue, LANGUE_KEY,
  nomKind, obtention, nomMethode, nomLieu, libStat, statLignes, groupesApprentissage,
  nomRole, nomOrientation, nomRemake,
} from './i18n.js';

// Service worker : il ne sert QUE la version web hébergée. Sous Capacitor la page
// n'est pas servie en HTTP et tout est déjà embarqué dans l'app — l'enregistrement
// est donc conditionné au protocole, et un échec est sans conséquence.
//
// Ni en DÉVELOPPEMENT : `sw.js` n'est produit qu'à la compilation, le serveur de dev
// répondait donc par la page HTML, et le navigateur consignait « unsupported MIME
// type » à chaque chargement. Le `.catch` taisait la promesse, pas la console — et
// une erreur répétée à chaque rechargement finit par masquer les vraies.
if (!import.meta.env.DEV && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ---------- Constantes ----------

const GENS = [
  { n: 1, name: 'Kanto', from: 1, to: 151 },
  { n: 2, name: 'Johto', from: 152, to: 251 },
  { n: 3, name: 'Hoenn', from: 252, to: 386 },
  { n: 4, name: 'Sinnoh', from: 387, to: 493 },
  { n: 5, name: 'Unys', from: 494, to: 649 },
  { n: 6, name: 'Kalos', from: 650, to: 721 },
  { n: 7, name: 'Alola', from: 722, to: 809 },
  { n: 8, name: 'Galar', from: 810, to: 905 },
  { n: 9, name: 'Paldea', from: 906, to: 1025 },
];
const BOX_SIZE = 30;

// Les onglets : les 9 générations, puis les remakes. Une génération se décrit par une
// plage du Pokédex national ; un remake porte sa propre liste, dans l'ordre régional
// du jeu (Or HeartGold classe les Johto avant les Kanto). L'ordre de ce tableau fixe
// l'index utilisé par state.order et state.box : n'ajouter qu'à la FIN, sinon les
// boîtes déjà personnalisées changeraient de place.
// Un Pokédex RÉGIONAL mélange les générations : celui de RO/SA compte 211 entrées,
// dont 47 de gén. 1 et 20 de gén. 2, et celui de HG/SS en compte 256 pour 100
// espèces de Johto. Une boîte de remake ne retient que les espèces de SA
// génération — c'est ce qu'on vient y collectionner — mais dans l'ordre du jeu,
// qui reste tout l'intérêt de l'onglet.
//
// `GENS` associe déjà chaque région à sa plage de numéros : `name` EST la région,
// donc aucune table de correspondance à tenir à jour. Le filtrage a lieu ici et
// non dans `dex-remakes.json`, qui doit rester une copie fidèle de PokéAPI.
function listeRemake(r) {
  const g = GENS.find((x) => x.name === r.region);
  return g ? r.liste.filter((id) => id >= g.from && id <= g.to) : r.liste;
}

// Les listes sont figées une fois pour toutes ; seuls les LIBELLÉS suivent la langue,
// et `renommeOnglets()` les repose. L'index dans ce tableau reste la clé de
// `state.order` et `state.box` : rien ne doit le déplacer.
// `region` est l'INDEX de la région dans GENS, relevé ici pendant que les noms sont
// encore français. La région d'un remake n'est pas celle de sa génération — Rouge Feu
// est un jeu de gén. 3 qui se passe à Kanto —, et `GENS[i].name` est traduit ensuite :
// un index survit à la traduction, un nom non.
const ONGLETS = [
  ...GENS.map((g, i) => ({ ...g, label: '', sub: g.name, region: i, remake: false })),
  ...Object.entries(remakes).map(([cle, r]) => ({
    n: r.gen, name: r.region, label: r.court, sub: r.region,
    region: GENS.findIndex((g) => g.name === r.region),
    liste: listeRemake(r), titre: r.name, remake: true, cle,
  })),
];
// Les libellés suivent la langue ; `name` aussi, car c'est lui qu'affichent l'en-tête
// et le sous-titre des boîtes.
function renommeOnglets() {
  for (const o of ONGLETS) {
    const region = GENS[o.region]?.name ?? o.name;
    o.name = region;
    o.sub = region;
    if (o.remake) {
      o.label = nomRemake(o.cle, 'court');
      o.titre = nomRemake(o.cle, 'nom');
    } else {
      o.label = t('genCourt', o.n);
    }
  }
}

const TYPES = {
  normal: ['Normal', '#9a9a86'], fire: ['Feu', '#e2703a'], water: ['Eau', '#4483c9'],
  grass: ['Plante', '#529d43'], electric: ['Électrik', '#d3a51c'], ice: ['Glace', '#4fadbd'],
  fighting: ['Combat', '#b8433a'], poison: ['Poison', '#8e4497'], ground: ['Sol', '#b58c3d'],
  flying: ['Vol', '#7b8dd6'], psychic: ['Psy', '#d95181'], bug: ['Insecte', '#8a9e26'],
  rock: ['Roche', '#9a8542'], ghost: ['Spectre', '#5f5090'], dragon: ['Dragon', '#5a46c4'],
  dark: ['Ténèbres', '#4f423b'], steel: ['Acier', '#7e8e9b'], fairy: ['Fée', '#d977c1'],
};

// Catégorie d'une attaque. Le statut est volontairement neutre : il n'inflige pas de
// dégâts, ses colonnes Puissance et Précision valent souvent « — ».
// Les NOMS sont posés par la surcouche (`appliqueSurcouche`) ; seules les couleurs
// sont écrites ici.
const CLASSES = {
  physical: ['', '#b5603a'], special: ['', '#4472b5'], status: ['', '#7c7c74'],
};

// ---------- Sprites ----------

// Tout vit dans public/sprites/ : l'appli ne fait AUCUNE requête réseau, et le
// chemin est relatif SANS « / » initial, comme les fonds de boîte — indispensable
// avec base: './', sinon Capacitor ne les trouve pas sur l'iPhone.
// Rapatriement : npm run fetch-sprites
// Forme admise pour une clé de sprite : un numéro, un slug (`585-summer`), ou un
// chemin de dossier (`female/902`). Rien d’autre ne peut atteindre une URL.
//
// C’est volontairement une LISTE BLANCHE, et non un échappement : on sait exactement
// ce qu’est une clé légitime, et tout ce qui n’y ressemble pas est une donnée
// fabriquée. Une clé refusée retombe sur le sprite 0, que le repli `onerror`
// remplacera comme pour n’importe quel fichier manquant.
const CLE_SPRITE = /^[A-Za-z0-9][A-Za-z0-9_-]*(\/[A-Za-z0-9][A-Za-z0-9_-]*)*$/;
const cleSure = (k) => (CLE_SPRITE.test(String(k ?? '')) ? k : '0');

const REPO = 'sprites';
const sprites = {
  still: (id, shiny) => `${REPO}/${shiny ? 'shiny/' : ''}${cleSure(id)}.png`,
  // Les artworks sont recompressés en WebP à 384 px par le script : 260 Mo de PNG
  // tombent à ~37 Mo. D'où l'extension qui diffère de celle des sprites fixes.
  art: (id, shiny) => `${REPO}/other/official-artwork/${shiny ? 'shiny/' : ''}${cleSure(id)}.webp`,
};
// Un gif animé peut manquer pour quelques formes : on retombe sur le sprite fixe.
//
// Le repli écrit l'URL dans un attribut `onerror`, donc DANS DU CODE JAVASCRIPT entre
// apostrophes, lui-même dans un attribut HTML entre guillemets. Une clé contenant une
// apostrophe en sortait et exécutait ce qui suit — `esc()` n'échappe pas l'apostrophe,
// et ce chemin ne l'appelait pas davantage. Vérifié exploitable : une sauvegarde
// fabriquée portant la clé `x';…;'` faisait exécuter son contenu au chargement de la
// boîte, avec accès à `localStorage` et donc au jeton de session.
//
// `cleSure` est le garde-fou de dernier recours, appliqué au plus près du DOM : une
// clé qui n'a pas la forme d'un numéro ou d'un slug ne produit plus d'URL du tout.
const imgFallback = (id, shiny) => `onerror="this.onerror=null;this.src='${sprites.still(spriteKey(id), shiny)}'"`;

// Repli du grand portrait, à DEUX niveaux : l'artwork peut manquer pour une forme,
// et son sprite 2D aussi — 25 formes n'en ont aucun. On finit sur le sprite de
// l'espèce, qui existe toujours.
const portraitFallback = (id, shiny) => {
  const propre = sprites.still(spriteKey(id), shiny);
  const espece = sprites.still(speciesOf(id), shiny);
  return `onerror="this.onerror=function(){this.onerror=null;this.src='${espece}'};this.src='${propre}'"`;
};

// ---------- Formes alternatives ----------

// Les formes portent un id de sprite au-delà de 10000, donc sans collision avec les
// 1025 numéros du Pokédex : elles peuvent être capturées et rangées comme les autres.
// Une clé identifie soit une espèce (numéro du Pokédex), soit une forme.
// Les formes issues de « varieties » gardent leur id numérique ; les formes
// cosmétiques (saisons, lettres d'Zarbi) portent un slug, car les ids de
// /pokemon-form chevauchent ceux de /pokemon et se télescoperaient.
// Des COPIES, pas les objets de forms.json : d'où la reconstruction au changement de
// langue, sans laquelle `monName` continuerait de rendre le nom français d'une forme
// alors que la fiche, qui lit forms.json, aurait déjà basculé.
const FORM_BY_KEY = new Map();
function construitFormes() {
  FORM_BY_KEY.clear();
  for (const [sid, liste] of Object.entries(forms)) {
    for (const f of liste) FORM_BY_KEY.set(f.key, { ...f, species: Number(sid) });
  }
}
construitFormes();
// Un attribut HTML revient toujours en chaîne : on rétablit le type d'origine.
const asKey = (v) => (/^[0-9]+$/.test(v) ? Number(v) : v);
// Pendant de `asKey` : une clé acceptable est un entier positif, ou un slug. Sert à
// filtrer ce qui arrive d'un fichier d'import ou du compte — voir `appliqueDonnees`.
const cleAdmise = (k) =>
  (typeof k === 'number' && Number.isInteger(k) && k >= 0)
  || (typeof k === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(k));

const monName = (k) => pokedex[k]?.name || FORM_BY_KEY.get(k)?.name || t('numero', k);
// Le sprite d'une forme cosmétique s'appelle « 585-summer », pas « 10068 ».
const spriteKey = (k) => FORM_BY_KEY.get(k)?.sprite ?? k;
// Espèce de rattachement d'une clé : elle-même pour une espèce, la base pour une forme.
const speciesOf = (k) => FORM_BY_KEY.get(k)?.species ?? k;

// ---------- Fonds de boîte ----------

// Les 276 fonds officiels, générations III à IX, dans `public/wallpapers/<id>.png`.
// Trop volumineux pour être inlinés (6 Mo) : ils sont copiés tels quels dans `dist/`
// par Vite, donc embarqués dans l'app et disponibles hors ligne.
//
// L'URL est relative — pas de `/` initial — pour rester compatible avec `base: './'`,
// sans quoi Capacitor ne les trouverait pas sur le système de fichiers de l'iPhone.
//
// Les gén. I et II n'ont pas de fond du tout : les boîtes y étaient unies.
// Le catalogue est produit par un script à partir des fichiers ; l'`id` est le nom de
// fichier et part en localStorage, le renommer casserait les boîtes personnalisées.
// 30 noms de fichiers contiennent des accents (« Box_PokéCenter_E ») : on encode.
// Les fonds sont rangés PAR GÉNÉRATION, `wallpapers/<gen>/<id>.png`. Le dossier se
// déduit de `PAPER_GEN` : l'identifiant, lui, reste le seul nom de fichier et ne
// change donc PAS. C'est ce qui permet ce classement sans migration — l'id part en
// `localStorage`, et le renommer aurait fait perdre son fond à chaque boîte
// personnalisée.
const paperUrl = (id) =>
  (PAPER_BY_ID.has(id) ? `wallpapers/${PAPER_GEN.get(id)}/${encodeURIComponent(id)}.png` : '');

const PAPER_BY_ID = new Map();
const PAPER_GEN = new Map(); // id -> génération, pour rouvrir le sélecteur au bon endroit
for (const [gen, list] of Object.entries(wallpapers)) {
  for (const w of list) { PAPER_BY_ID.set(w.id, w); PAPER_GEN.set(w.id, Number(gen)); }
}

// Un id inconnu (fond retiré, ou ancien catalogue) ne doit pas casser une boîte.
const paperCss = (id) => (paperUrl(id) ? `url(${paperUrl(id)})` : '');

// Plaque de titre : la bande qui, dans le jeu, porte le nom de la boîte. Elle a été
// découpée du fond et vit à part, dans `titres/<id>.png`. Toutes les générations n'en
// ont pas — d'où le drapeau `titre` au catalogue, qui évite d'aller chercher 200
// fichiers inexistants.
const titreUrl = (id) => (PAPER_BY_ID.get(id)?.titre ? `wallpapers/titres/${encodeURIComponent(id)}.png` : '');
const titreCss = (id) => (titreUrl(id) ? `url(${titreUrl(id)})` : '');
// Hauteur de la bande d'en-tête du fond, en fraction de l'image (0 = pas de bande).
// Format de l'image (« 156x142 ») : sert à choisir le calage quand une génération
// contient plusieurs mises en page.
const paperSize = (id) => PAPER_BY_ID.get(id)?.size ?? null;
// Génération du FOND (et non de la boîte affichée) : c'est elle qui commande le calage.
const paperGen = (id) => PAPER_GEN.get(id) ?? null;

// ---------- État ----------

const STORE_KEY = 'pcbox.caught';
const SHINY_KEY = 'pcbox.caught.shiny';
const BOXES_KEY = 'pcbox.boxes';
const ORDER_KEY = 'pcbox.order';
const VIEW_KEY = 'pcbox.view';
const EQUIPES_KEY = 'pcbox.equipes';
const JEU_KEY = 'pcbox.jeu';
const THEME_KEY = 'pcbox.theme';
const ONGLETS_KEY = 'pcbox.onglets';
const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

// Ordre D'AFFICHAGE des onglets : un tableau d'index dans ONGLETS.
//
// Les index eux-mêmes ne bougent JAMAIS. Ils sont la clé de `state.order`,
// `state.box` et `state.boxes` : réordonner ONGLETS aurait déplacé toutes les
// boîtes déjà personnalisées. On sépare donc l'ordre d'affichage du stockage.
//
// La liste est reprise index par index : on écarte l'inconnu et on complète à la
// fin, pour qu'un onglet ajouté plus tard apparaisse au lieu de disparaître.
function lisOrdreOnglets() {
  const brut = readJSON(ONGLETS_KEY, null);
  const vus = new Set();
  const l = [];
  if (Array.isArray(brut)) {
    for (const i of brut) {
      if (Number.isInteger(i) && i >= 0 && i < ONGLETS.length && !vus.has(i)) { vus.add(i); l.push(i); }
    }
  }
  for (let i = 0; i < ONGLETS.length; i++) if (!vus.has(i)) l.push(i);
  return l;
}

const state = {
  gen: 0,
  box: ONGLETS.map(() => 0),
  mode: 'catch',
  shiny: false, // affichage chromatique dans la fiche
  // Deux collections distinctes : le Pokédex normal et le Pokédex chromatique.
  caught: new Set(readJSON(STORE_KEY, [])),
  caughtShiny: new Set(readJSON(SHINY_KEY, [])),
  view: localStorage.getItem(VIEW_KEY) === 'shiny' ? 'shiny' : 'normal',
  // Contenu de chaque génération : liste ordonnée de clés. Absente = ordre du Pokédex.
  order: readJSON(ORDER_KEY, {}),
  ordreOnglets: lisOrdreOnglets(),
  held: null, // case saisie en mode Ranger
  ongletTenu: null, // index ONGLETS de l'onglet porté, ou null
  dexQ: '', // recherche du Pokédex, volontairement NON persistée
  // Réglages par boîte, clé « gén:boîte » -> { name, paper }.
  boxes: readJSON(BOXES_KEY, {}),
  paperGen: null, // génération ouverte dans le sélecteur de fond
  addIndex: null, // rang où insérer, dans la liste de la génération
  addQuery: '',
  addGen: 1,      // génération listée dans le sélecteur
  placing: null, // Pokémon choisi, en attente d'un emplacement
  open: null,
  pris: null,   // Pokémon coché au dernier tap : sa case s'anime, une fois

  // Boîte de combat : vue active, jeu de référence, équipe de six, panneau ouvert.
  vue: 'accueil',
  // Thème : « clair », « sombre », ou « auto » (celui du téléphone). Clair par défaut,
  // pour ne rien changer à qui n'y touche pas.
  theme: ['clair', 'sombre', 'auto'].includes(localStorage.getItem('pcbox.theme'))
    ? localStorage.getItem('pcbox.theme') : 'clair',
  dexGen: null, // Pokédex affiché : null = menu, 0 = national, 1 à 9 = une génération
  // Filtre de la grille du Pokédex : 'tous', 'manquants' ou 'captures'. Gardé le temps
  // de la session, d'une région à l'autre — on cherche ce qui manque à Kanto, puis à
  // Johto —, mais pas d'un lancement à l'autre : la grille complète reste l'accueil.
  dexFiltre: 'tous',
  // Type et tri de la grille du Pokédex : de passage, comme la recherche — gardés le
  // temps de la session, pas d'un lancement à l'autre.
  dexType: '',
  dexTri: 'num',
  jeu: localStorage.getItem('pcbox.jeu') || 'scarlet-violet',
  // Une équipe par version de jeu : on garde une composition distincte pour chaque
  // opus, puisque attaques, talents et objets n'y sont pas les mêmes.
  equipes: (() => {
    const parJeu = readJSON('pcbox.equipes', null);
    if (parJeu && typeof parJeu === 'object' && !Array.isArray(parJeu)) return parJeu;
    // Migration de l'équipe unique d'avant : elle devient celle du jeu courant.
    const ancienne = readJSON('pcbox.equipe', null);
    const jeu = localStorage.getItem('pcbox.jeu') || 'scarlet-violet';
    return Array.isArray(ancienne) && ancienne.length === 6 ? { [jeu]: ancienne } : {};
  })(),
  bs: null, // panneau de la boîte de combat : { mode, slot, emplacement, q }
};
// CHAQUE écriture locale prévient la synchronisation. C'est le seul endroit où la
// brancher : ces cinq fonctions sont les seules portes d'entrée de la progression
// dans `localStorage`, et les accrocher ici évite d'y penser aux quelque soixante
// points d'appel. `marqueChange()` ne fait que programmer un envoi différé — sans
// compte connecté elle rend la main aussitôt, et rien n'attend jamais le réseau.
const save = () => {
  localStorage.setItem(STORE_KEY, JSON.stringify([...state.caught]));
  localStorage.setItem(SHINY_KEY, JSON.stringify([...state.caughtShiny]));
  marqueChange();
};
const saveOrder = () => {
  localStorage.setItem(ORDER_KEY, JSON.stringify(state.order));
  marqueChange();
};

// La vue chromatique tient sa propre collection : c'est un shiny dex à part entière.
const shinyView = () => state.view === 'shiny';
const caughtSet = () => (shinyView() ? state.caughtShiny : state.caught);
const isCaught = (k) => caughtSet().has(k);
const saveBoxes = () => {
  localStorage.setItem(BOXES_KEY, JSON.stringify(state.boxes));
  marqueChange();
};

// Par défaut une génération suit l'ordre du Pokédex ; à la première modification on
// matérialise la liste et on la stocke en entier. Simple, et robuste au fait que le
// contenu par défaut puisse changer plus tard.
function genList(gen) {
  const o = ONGLETS[gen];
  return state.order[gen] ?? o.liste ?? range(o.from, o.to);
}
function editList(gen) {
  if (!state.order[gen]) state.order[gen] = [...genList(gen)];
  return state.order[gen];
}
// Insère en décalant tout ce qui suit, y compris dans les boîtes suivantes.
function insertAt(gen, index, key) {
  const l = editList(gen);
  l.splice(Math.max(0, Math.min(index, l.length)), 0, key);
  saveOrder();
}
function removeAt(gen, index) {
  const l = editList(gen);
  if (index >= 0 && index < l.length) { l.splice(index, 1); saveOrder(); }
}
// Dépôt : le Pokémon se pose sur la case VISÉE, quelle qu'elle soit. Sur un autre
// Pokémon les deux échangent ; sur une case vide il s'y installe et laisse un trou
// derrière lui.
//
// Une case libre au-delà de la liste renvoyait auparavant le Pokémon À LA FIN de
// celle-ci : on désignait une case précise et il atterrissait ailleurs. On comble
// donc d'abord avec des emplacements vides jusqu'à la case visée, ce qui ramène
// les deux cas à un simple échange. Les `null` ainsi créés sont des emplacements
// vides ordinaires, que la progression ignore déjà.
function swapOrMove(gen, from, to) {
  const l = editList(gen);
  if (from < 0 || from >= l.length || from === to) return;
  while (l.length <= to) l.push(null);
  [l[from], l[to]] = [l[to], l[from]];
  saveOrder();
}

// Déplacement : après le retrait, une destination située plus loin recule d'un cran.
//
// Sur une case VIDE on ne décale rien : le Pokémon s'y installe, comme au
// glisser-déposer. Sans ce cas particulier, `splice` le ramenait au bout de la
// liste et la case désignée restait vide. Le décalage garde tout son sens sur une
// case occupée, où il n'y a pas de place à prendre.
function moveTo(gen, from, to) {
  const l = editList(gen);
  if (from === to || from < 0 || from >= l.length) return;
  if (to >= l.length || l[to] === null || l[to] === undefined) {
    while (l.length <= to) l.push(null);
    [l[from], l[to]] = [l[to], l[from]];
    saveOrder();
    return;
  }
  const [k] = l.splice(from, 1);
  l.splice(Math.max(0, Math.min(from < to ? to - 1 : to, l.length)), 0, k);
  saveOrder();
}
function resetOrder(gen) { delete state.order[gen]; saveOrder(); }

const saveOrdreOnglets = () => {
  localStorage.setItem(ONGLETS_KEY, JSON.stringify(state.ordreOnglets));
  marqueChange();
};

// `vers` est le rang D'AFFICHAGE final, une fois l'onglet retiré de la liste —
// même convention que `bougeBoite`, à ne pas corriger par un `vers - 1`.
function bougeOnglet(de, vers) {
  const l = state.ordreOnglets;
  if (de === vers || de < 0 || de >= l.length || vers < 0 || vers >= l.length) return false;
  const [i] = l.splice(de, 1);
  l.splice(vers, 0, i);
  saveOrdreOnglets();
  return true;
}

// Une case peut valoir null : c'est un emplacement vide VOULU, ce qui permet d'avoir
// des boîtes entières libres. La progression n'en tient évidemment pas compte.
function padBoites(l) {
  while (l.length % BOX_SIZE !== 0) l.push(null);
  return l;
}
// Ajoute une boîte vide à la fin de l'onglet.
function ajouteBoite(gen) {
  const l = padBoites(editList(gen));
  for (let i = 0; i < BOX_SIZE; i++) l.push(null);
  saveOrder();
}
// Déplace une boîte entière : on travaille sur des tranches de 30, d'où le calage
// préalable. Sans lui, une liste de longueur libre décalerait tout le reste.
//
// `vers` est la position FINALE de la boîte, une fois qu'elle a été retirée de la
// liste — pas un point d'insertion dans la numérotation d'origine. L'ancienne version
// corrigeait `vers - 1` quand on allait vers la droite, ce qui rendait tout
// déplacement d'un cran vers la droite parfaitement inopérant (0 → 1 laissait ABCD
// inchangé) et faisait atterrir 0 → 3 en position 2. Ne pas réintroduire ce décalage.
function bougeBoite(gen, de, vers) {
  if (de === vers) return;
  const l = padBoites(editList(gen));
  const bloc = l.splice(de * BOX_SIZE, BOX_SIZE);
  l.splice(vers * BOX_SIZE, 0, ...bloc);
  saveOrder();
}

// Retire la boîte affichée, avec les 30 rangs qu'elle occupe : tout ce qui suit
// remonte d'une boîte. On refuse la dernière — un onglet sans boîte n'a pas de sens.
function supprimeBoite(gen, b) {
  if (boxCount(gen) <= 1) return false;
  const l = padBoites(editList(gen));
  const bloc = l.slice(b * BOX_SIZE, (b + 1) * BOX_SIZE);
  const dedans = bloc.filter((k) => k !== null && k !== undefined).length;
  // Une boîte vide part sans un mot ; une boîte pleine, jamais en silence.
  if (dedans && !confirm(t('confirmeSupprBoite', dedans))) return false;
  l.splice(b * BOX_SIZE, BOX_SIZE);
  saveOrder();
  return true;
}

// Une forme n'est jamais dans une liste par défaut : il suffit de balayer celles
// qui ont été personnalisées.
function dansUneBoite(key) {
  for (const gen of Object.keys(state.order)) {
    const i = state.order[gen].indexOf(key);
    if (i >= 0) return { gen: Number(gen), index: i };
  }
  return null;
}
const genDe = (espece) => GENS.findIndex((g) => espece >= g.from && espece <= g.to);

// Range une forme juste derrière son espèce, et derrière les formes de la même
// espèce déjà présentes : on obtient Vivaldaim, ses saisons dans l'ordre, puis
// Haydaim et la suite.
function rangeForme(espece, key) {
  if (dansUneBoite(key)) return;
  const gen = genDe(espece);
  if (gen < 0) return;
  const l = editList(gen);
  const i = l.indexOf(espece);
  if (i < 0) { l.push(key); saveOrder(); return; }
  const soeurs = new Set((forms[espece] ?? []).map((x) => x.key));
  let j = i + 1;
  while (j < l.length && soeurs.has(l[j])) j++;
  l.splice(j, 0, key);
  saveOrder();
}
function sortForme(key) {
  const loc = dansUneBoite(key);
  if (loc) removeAt(loc.gen, loc.index);
}

// Les fonds de la gén. 5 ont porté un temps un préfixe `5G_`, avant de revenir au
// nom simple des autres générations. Or l'id d'un fond EST son nom de fichier et vit
// dans `localStorage` : une version intermédiaire a donc pu écrire « 5G_Box_Beach_V »
// chez qui la faisait tourner. On le rétablit, sans quoi la boîte perdrait son fond
// en silence — `paperCss` ignore les id inconnus. À garder un moment.
(function migrePrefixe5G() {
  let bouge = false;
  for (const info of Object.values(state.boxes)) {
    if (!info.paper || PAPER_BY_ID.has(info.paper)) continue;
    if (!info.paper.startsWith('5G_')) continue;
    const nu = info.paper.slice(3);
    if (PAPER_BY_ID.has(nu)) { info.paper = nu; bouge = true; }
  }
  if (bouge) saveBoxes();
})();

// Ancien format (Pokémon rangés par boîte sous « add ») : on les verse une fois pour
// toutes en fin de génération, pour ne perdre aucune personnalisation.
(function migreAdd() {
  let bouge = false;
  for (const [cle, info] of Object.entries(state.boxes)) {
    if (!info.add) continue;
    const gen = Number(cle.split(':')[0]);
    const l = editList(gen);
    for (const k of Object.values(info.add)) if (!l.includes(k)) l.push(k);
    delete info.add;
    bouge = true;
  }
  if (bouge) { saveOrder(); saveBoxes(); }
})();

const boxInfo = (gen, box) => state.boxes[`${gen}:${box}`] || {};
const boxLabel = (gen, box) => boxInfo(gen, box).name || t('boiteN', box + 1);
function setBox(gen, box, patch) {
  const key = `${gen}:${box}`;
  const next = { ...state.boxes[key], ...patch };
  // On ne garde pas les valeurs vides : le défaut doit rester le défaut.
  for (const k of Object.keys(next)) {
    const v = next[k];
    if (!v || (typeof v === 'object' && !Object.keys(v).length)) delete next[k];
  }
  if (Object.keys(next).length) state.boxes[key] = next; else delete state.boxes[key];
  saveBoxes();
}
const hasData = Object.keys(pokedex).length > 60;

const app = document.getElementById('app');
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// PokéAPI renvoie les habitats en minuscules (« forêts »), les couleurs capitalisées.
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// Les noms de boîte sont saisis par l'utilisateur et repartent dans du innerHTML.
// Icônes utilitaires : une seule grille (24), un seul trait (1,7 px, bouts ronds).
// Inline plutôt qu'une librairie : l'appli ne charge rien à l'exécution, et il n'en
// faut qu'une poignée. `aria-hidden` partout — le libellé du bouton porte le sens.
const ICO = {
  gauche: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  droite: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  moins: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  exporte: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"/></svg>',
  importe: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5m0 0L8 9m4-4l4 4M5 19h14"/></svg>',
  crayon: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5h4L19 9l-4-4L4.5 15.5v4z"/><path d="M14.3 5.7l4 4"/></svg>',
  coche: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  nuage: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5a3.9 3.9 0 0 1-.3-7.8 5.2 5.2 0 0 1 10-1.3A3.6 3.6 0 0 1 17.6 18.5z"/><path d="M12 15.5v-5m0 0L9.8 12.7M12 10.5l2.2 2.2"/></svg>',
  croix: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
};

// Icônes des blocs de Réglages. La pastille qui les porte prend `--c` en CSS.
const ICO_REG = {
  apparence: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/></svg>',
  langue: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3.2 9.5h17.6M3.2 14.5h17.6M12 3a15 15 0 0 1 0 18A15 15 0 0 1 12 3z"/></svg>',
  compte: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/></svg>',
  sauvegarde: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14M12 3.5v11M8 10.5l4 4 4-4"/></svg>',
  legal: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.2v15.6M7 19.8h10M5 8h14M12 5.6 5 8m7-2.4L19 8"/><path d="M2.6 14.2 5 8l2.4 6.2a2.6 2.6 0 0 1-4.8 0zM16.6 14.2 19 8l2.4 6.2a2.6 2.6 0 0 1-4.8 0z"/></svg>',
  avenir: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/></svg>',
};

// L’APOSTROPHE EST ÉCHAPPÉE elle aussi : tous les attributs ne sont pas écrits entre
// guillemets, et un attribut de gestionnaire (`onerror`) contient du JavaScript où
// l’apostrophe délimite les chaînes. L’omettre avait rendu un chemin exploitable.
// Un nombre à une décimale, au format de la langue de l'appli : « 0,6 » en français,
// « 0.6 » en anglais. `toFixed` écrivait toujours le point, et la fiche affichait
// « 0.6 m » au milieu d'un texte français.
const decimale = (n) => {
  try {
    return Number(n).toLocaleString(document.documentElement.lang || 'fr',
      { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  } catch { return Number(n).toFixed(1); }
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Recherche insensible aux accents et à la casse.
const fold = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Catalogue complet pour le sélecteur : les 1025 espèces puis les 326 formes.
// Classé par génération puis par numéro du Pokédex, chaque espèce immédiatement
// suivie de ses formes : c'est l'ordre dans lequel on cherche un Pokémon.
const genDuNumero = (id) => GENS.find((g) => id >= g.from && id <= g.to)?.n ?? 0;
const CATALOGUE = [];
// Il porte des NOMS, donc il se refait quand la langue change — la recherche se fait
// sur `cle`, qui en dépend directement.
function construitCatalogue() {
  CATALOGUE.length = 0;
  for (const id of Object.keys(pokedex).map(Number).sort((a, b) => a - b)) {
    const p = pokedex[id];
    const gen = p.generation ?? genDuNumero(id);
    CATALOGUE.push({ id, sprite: String(id), name: p.name, sub: t('numero', id), gen, num: id });
    for (const f of forms[id] ?? []) {
      CATALOGUE.push({
        id: f.key,
        sprite: f.sprite,
        name: f.name,
        sub: `${p.name} · ${nomKind(f.kind)}`,
        gen,
        num: id,
      });
    }
  }
  for (const e of CATALOGUE) e.cle = fold(e.name + ' ' + e.sub + ' ' + e.num);
}

// ---------- Compte utilisateur ----------
//
// Module à part (compte-ui.js), accroché comme le scan : il reçoit ce dont il a
// besoin plutôt que d'importer main.js. Sans configuration Supabase il rend une
// chaîne vide, et l'appli se comporte exactement comme avant — hors ligne, sans
// compte, et sans la moindre requête réseau.
//
// Il reçoit aussi un PANNEAU à lui — le choix de l'avatar s'y fait, au lieu de
// pousser une liste dans la page : la page restait alors à redessiner à chaque
// geste, et l'on repartait du haut. Les fonctions passées ici sont déclarées plus
// bas, avec les autres panneaux ; elles sont hissées, donc utilisables dès ici.
const compteUI = creeCompteUI({
  t, esc, sprites, spriteKey, imgFallback, CATALOGUE, ICO, ICO_REG,
  // Un rendu ne sert que si la page Réglages est à l'écran : le compte peut changer
  // d'état pendant qu'on est ailleurs, sans qu'il y ait rien à redessiner.
  rend: () => { if (state.vue === 'reglages') render(); },
  panneau: {
    ouvre: ouvreComptePanneau,
    maj: majComptePanneau,
    ferme: fermeComptePanneau,
    corps: () => compteBody,
  },
});

// ---------- Rendu ----------

// Génération affichée au dernier rendu : sert à ne lancer la cascade des cases
// qu'en CHANGEANT de génération.
let derniereGen = null;

function render() {
  // L'accueil et les autres vues se rendent chacune entièrement ; tout le reste de
  // render() ne concerne que la gestion des boîtes.
  // Hors de la vue Scan, la caméra est coupée : sans effet si elle l'est déjà.
  if (state.vue !== 'scan') scan.arrete();
  if (state.vue === 'accueil') return renderAccueil();
  if (state.vue === 'attaques') return renderAttaques();
  if (state.vue === 'reglages') return renderReglages();
  if (state.vue === 'combat') return renderCombat();
  if (state.vue === 'pokedex') return renderPokedex();
  if (state.vue === 'scan') return renderScan();

  const g = ONGLETS[state.gen];
  const liste = genList(state.gen);
  const perso = !!state.order[state.gen];
  const boxes = boxCount(state.gen);
  const b = Math.min(state.box[state.gen], boxes - 1);
  state.box[state.gen] = b;
  const start = b * BOX_SIZE;
  const cases = Array.from({ length: BOX_SIZE }, (_, i) => liste[start + i]);
  // Les cases explicitement vides ne comptent ni au numérateur ni au dénominateur.
  const remplies = liste.filter((k) => k !== null && k !== undefined);
  const pris = remplies.filter(isCaught).length;
  const total = remplies.length;
  const rang = state.mode === "move";
  // Un id inconnu retombe sur « aucun fond » plutôt que sur une grille vide.
  const paperBg = paperCss(boxInfo(state.gen, b).paper);
  const titrePlaque = titreCss(boxInfo(state.gen, b).paper);
  const entreeGen = state.gen !== derniereGen;
  derniereGen = state.gen;

  // Ordre par défaut : on affiche la plage du Pokédex, plus parlante. Dès que la
  // génération est réarrangée, cette plage ne veut plus rien dire : on montre le rang.
  // Ordre d'origine : on annonce les numéros réels — nationaux pour une génération,
  // régionaux pour un remake. Réarrangé, ces numéros seraient faux : on montre le rang.
  const sous = start >= total
    // Boîte de rab, au-delà de la liste : aucun numéro à annoncer.
    ? t('boiteLibre', g.name)
    : perso
      ? t('boiteRang', g.name, Math.min(start + 1, total), Math.min(start + BOX_SIZE, total), total)
      : g.remake
        ? t('boiteNumRegional', g.name, start + 1, Math.min(start + BOX_SIZE, total))
        : t('boiteNumNational', g.name, start + g.from, Math.min(start + g.from + BOX_SIZE - 1, g.to));

  // `poser()` reconstruit la barre d'onglets, qui défile horizontalement : un
  // élément neuf repart à scrollLeft 0, donc tout à gauche sur Gén. 1. On mémorise
  // son décalage pour le lui rendre juste après.
  const defileOnglets = app.querySelector('.gens')?.scrollLeft ?? 0;

  poser(
    entete(t('boites'), t('boitesSous', g.name, pris, total)),
    renderTabs(),
    h(`
      <section class="box ${paperBg ? 'papered' : ''} ${rang ? 'ranger' : ''} ${state.placing !== null ? 'placement' : ''}">
        ${paperBg ? `<div class="box-paper" data-gen="${paperGen(boxInfo(state.gen, b).paper) ?? ''}" data-size="${paperSize(boxInfo(state.gen, b).paper) ?? ''}" style="background-image:${paperBg}"></div>` : ''}
        <div class="box-head">
          <button class="box-arrow" data-dir="-1" ${b === 0 ? 'disabled' : ''} aria-label="${t('boitePrecedente')}">${ICO.gauche}</button>
          <!-- La plaque de titre se pose EN FOND du bouton, pas dans un calque à part :
               ses proportions (116×23, soit 5,04) collent presque exactement à celles du
               bouton (5,19), et le texte se place naturellement par-dessus. -->
          <button class="box-title ${titrePlaque ? 'plaque' : ''}" data-act="box-edit"
                  title="${t('renommerBoite')}"
                  ${titrePlaque ? `style="background-image:${titrePlaque}"` : ''}>
            ${esc(boxLabel(state.gen, b))}
            <small>${sous}</small>
          </button>
          <button class="box-arrow" data-dir="1" ${b === boxes - 1 ? 'disabled' : ''} aria-label="${t('boiteSuivante')}">${ICO.droite}</button>
        </div>
        <div class="grid ${paperBg ? 'papered' : ''} ${entreeGen ? 'entre' : ''}">${cases.map((k, i) => renderSlot(k, start + i)).join('')}</div>
        <!-- Les pastilles restent centrées : les deux boutons se font face, de part
             et d'autre, et gardent la même largeur pour ne pas les décaler. -->
        <div class="box-dots">
          <button class="dot-btn" data-act="del-box" ${boxes <= 1 ? 'disabled' : ''}
                  title="${t('supprimerBoite')}" aria-label="${t('supprimerBoite')}">${ICO.moins}</button>
          <span class="dots">${Array.from({ length: boxes }, (_, i) => `<i class="${i === b ? 'on' : ''}" data-boite="${i}"></i>`).join('')}</span>
          <button class="dot-btn" data-act="add-box"
                  title="${t('ajouterBoite')}" aria-label="${t('ajouterBoiteCourt')}">${ICO.plus}</button>
        </div>
      </section>
    `),
    h(`
      <footer class="foot">
        <div class="progress">
          <div class="bar"><span style="width:${total ? (100 * pris) / total : 0}%"></span></div>
          <div><strong>${pris}</strong> / ${total}</div>
        </div>
        <!-- Trois rangées empilées, dans l'ordre où l'on s'en sert : l'action, puis
             ce que fait un tap, puis l'affichage et la sauvegarde. -->
        <div class="tools">
          <button class="btn primaire" data-act="add">
            ${ICO.plus}<span>${t('ajouterPokemon')}</span>
          </button>

          <!-- Trois états sur un seul rail : on voit d'un coup celui qui est actif. -->
          <div class="segmente" role="group" aria-label="${t('effetDuTap')}">
            ${[['catch', 'modeCapturer'], ['info', 'modeFiche'], ['move', 'modeRanger']].map(([m, cle]) => `
              <button class="${state.mode === m ? 'on' : ''}" data-act="mode-set" data-mode="${m}"
                      aria-pressed="${state.mode === m}">${t(cle)}</button>`).join('')}
          </div>

          <button class="btn bascule ${shinyView() ? 'on' : ''}" data-act="view"
                  aria-pressed="${shinyView()}" title="${t('basculeChromatique')}">
            <b>&#10022;</b><span>${shinyView() ? t('vueChromatique') : t('vueNormale')}</span>
          </button>
        </div>
        ${state.placing !== null ? `<div class="hint placer">
          ${t('aidePlacer', esc(monName(state.placing)))}
          <button data-act="annuler-placement">${t('annuler')}</button>
        </div>` : ''}
        ${rang ? `<div class="hint">${t('aideRanger')}</div>` : ''}
        ${hasData ? '' : `<div class="hint">${t('aideSansDonnees')}</div>`}
        <!-- Repère de build. Les mises à jour arrivant sans fil par SideStore, c'est
             le seul moyen de vérifier d'un coup d'œil quelle version tourne. -->
        <div class="version">v${__APP_VERSION__}</div>
      </footer>
    `),
  );

  // Rendu AVANT tout recentrage : sans lui, l'armement d'un appui long ramenait la
  // barre à gauche, le doigt se retrouvait au-dessus d'un tout autre onglet, et
  // celui qu'on portait y sautait aussitôt — impossible de le déplacer vers la
  // droite, il partait systématiquement vers Gén. 1.
  const barreOnglets = app.querySelector('.gens');
  if (barreOnglets) barreOnglets.scrollLeft = defileOnglets;

  // L'animation de prise a été posée dans le rendu qu'on vient de faire : on
  // l'oublie, sinon elle rejouerait au rendu suivant (une bascule chromatique,
  // un changement de boîte) sur un Pokémon capturé il y a longtemps.
  state.pris = null;

  calePaper();
  if (import.meta.env.DEV) window.__annoncerCalage?.();

  // Garde l'onglet de génération actif visible dans la barre (utile après un swipe).
  // Pendant qu'on PORTE un onglet on ne recentre pas : la barre glisserait sous le
  // doigt, ce que le déplacement lirait comme un nouveau mouvement.
  if (state.ongletTenu === null) {
    app.querySelector('.gen-tab[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}

// Calage du fond, lu dans src/paper-align.js — table éditée à la main.
// Les valeurs sont en pourcentage de la GRILLE des cases, pas du panneau : c'est
// ce qui fige le calage même si les marges de la boîte changent plus tard.
// Mesuré après rendu, car la taille des cases dépend de la largeur de l'écran.
function calePaper() {
  const box = app.querySelector('.box.papered');
  const paper = box?.querySelector('.box-paper');
  const grid = box?.querySelector('.grid');
  if (!paper || !grid) return;

  const bb = box.getBoundingClientRect(), gb = grid.getBoundingClientRect();
  if (!bb.height || !gb.height) return;

  const a = alignementDe(paper.dataset.gen, paper.dataset.size);
  // Repères de la grille, en fraction du panneau.
  const gx = (gb.left - bb.left) / bb.width, gw = gb.width / bb.width;
  const gy = (gb.top - bb.top) / bb.height, gh = gb.height / bb.height;

  paper.style.left = `${(gx + (a.x / 100) * gw) * 100}%`;
  paper.style.width = `${(a.w / 100) * gw * 100}%`;
  paper.style.top = `${(gy + (a.y / 100) * gh) * 100}%`;
  paper.style.height = `${(a.h / 100) * gh * 100}%`;
}

// « gen:format » d'abord, puis « gen », puis le défaut.
// REGLAGES contient les valeurs poussées par l'outil de calage : elles priment, mais
// ne vivent qu'en mémoire — rien n'est écrit dans paper-align.js sans copier-coller.
const CALAGE_KEY = 'pcbox.calage';
// Réglages en cours venus de l'outil. Persistés : un réglage perdu parce qu'on a
// fermé la fenêtre, c'est du travail refait pour rien.
const REGLAGES = new Map(Object.entries(readJSON(CALAGE_KEY, {})));
const saveReglages = () =>
  localStorage.setItem(CALAGE_KEY, JSON.stringify(Object.fromEntries(REGLAGES)));
function cleDe(gen, size) {
  return ALIGNEMENT[`${gen}:${size}`] ? `${gen}:${size}` : (ALIGNEMENT[gen] ? String(gen) : `${gen}:${size}`);
}
function alignementDe(gen, size) {
  const cle = cleDe(gen, size);
  return REGLAGES.get(cle) ?? ALIGNEMENT[cle] ?? ALIGNEMENT[gen] ?? DEFAUT;
}

// Les onglets se rendent dans `state.ordreOnglets`. `data-gen` reste l'index dans
// ONGLETS — la clé de tout le stockage — et `data-rang` porte la position affichée,
// dont le geste de déplacement a besoin.
function renderTabs() {
  const el = h(`<nav class="gens" role="tablist"></nav>`);
  state.ordreOnglets.forEach((i, rang) => {
    const o = ONGLETS[i];
    el.append(h(`
      <button class="gen-tab ${o.remake ? 'remake' : ''} ${i === state.ongletTenu ? 'tenu' : ''}"
              role="tab" data-gen="${i}" data-rang="${rang}"
              aria-selected="${i === state.gen}" ${o.titre ? `title="${esc(o.titre)}"` : ''}>
        ${esc(o.label)}<small>${esc(o.sub)}</small>
      </button>`));
  });
  return el;
}

// `index` est le rang ABSOLU dans la liste de la génération, pas la case dans la
// boîte : insertion, déplacement et retrait travaillent tous sur ce rang.
function renderSlot(key, index) {
  const rang = state.mode === "move";
  if (key === undefined || key === null) {
    return `<button class="slot empty ${rang && state.held !== null ? 'cible' : ''}" data-slot="${index}"
             style="--i:${index % BOX_SIZE}" aria-label="${t('emplacementLibre')}">+</button>`;
  }
  const caught = isCaught(key);
  const forme = FORM_BY_KEY.has(key);
  const tenu = rang && state.held === index;
  const name = monName(key);
  // Toujours le sprite 2D fixe ; chromatique si la vue chromatique est active.
  const src = sprites.still(spriteKey(key), shinyView());
  return `
    <button class="slot ${caught ? 'caught' : ''} ${forme ? 'extra' : ''} ${tenu ? 'tenu' : ''} ${rang && state.held !== null && !tenu ? 'cible' : ''} ${key === state.pris ? 'pris' : ''}"
            style="--i:${index % BOX_SIZE}"
            data-id="${key}" data-slot="${index}"
            aria-label="${esc(name)}${caught ? ', ' + t('capture') : ''}">
      <span class="num">${forme ? '★' : key}</span>
      <img src="${src}" alt="" loading="lazy" draggable="false" ${imgFallback(speciesOf(key), shinyView())} />
      ${rang ? `<span class="slot-x" data-remove="${index}" role="button" aria-label="${t('retirerDeLaBoite')}">×</span>` : ''}
    </button>`;
}

// ---------- Fiche ----------

const backdrop = h(`<div class="backdrop"></div>`);
const sheet = h(`<aside class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body"></div></aside>`);
document.body.append(backdrop, sheet);
// Toucher le fond assombri referme le panneau ouvert, quel qu'il soit. Le panneau de
// la boîte de combat y échappait : il affichait bien le fond, mais seul un glissement
// vers le bas le fermait — on tapait à côté sans effet.
backdrop.addEventListener('click', () => { closeSheet(); closeBoxSheet(); closeAddSheet(); closeBattleSheet(); fermeComptePanneau(); fermeLegal(); });

// Stats de base en barres.
//
// La longueur est rapportée à 255, le maximum réel du jeu (les PV de Leuphorie) :
// les barres restent donc comparables d'une espèce à l'autre, et aucune valeur n'est
// écrêtée. Rapporter au meilleur score de l'espèce aurait donné à tout Pokémon une
// barre pleine, y compris aux plus faibles.
//
// La COULEUR dit la qualité de la valeur, ce que la longueur seule rend mal à cette
// échelle : à 255, une stat de 100 n'occupe que 39 % de la piste.
// Les libellés viennent de la traduction : `statLignes()` les relit à chaque rendu.
const MAX_STAT = 255;
const classeStat = (v) => (v < 60 ? 'sb-bas' : v < 100 ? 'sb-moyen' : v < 120 ? 'sb-bon' : 'sb-haut');

// `statsDe` et non `stats[...]` : une forme a ses PROPRES stats de base, et la fiche
// doit montrer celles de la forme affichée — Kyurem Blanc monte à 170 en Atq. Spé.
function renderStatsBase(key) {
  const st = statsDe(key);
  if (!st) return `<p class="none">${t('statsInconnues')}</p>`;
  const lignes = statLignes();
  const total = lignes.reduce((n, [k]) => n + (st[k] || 0), 0);
  return `
    <div class="statbars">
      ${lignes.map(([k, lib]) => `
        <div class="sb">
          <span class="sb-lib">${lib}</span>
          <span class="sb-val">${st[k]}</span>
          <span class="sb-piste"><i class="${classeStat(st[k])}"
                style="width:${(100 * st[k]) / MAX_STAT}%"></i></span>
        </div>`).join('')}
      <div class="sb sb-total">
        <span class="sb-lib">${t('total')}</span>
        <span class="sb-val">${total}</span>
        <span class="sb-piste"></span>
      </div>
    </div>`;
}

// ---------- Capture et élevage ----------
//
// Ce que l'on vient chercher en pleine partie et que la fiche ne disait pas : à quel
// point il se capture, avec quoi il se reproduit, ce qu'il rapporte au K.O. Données
// de l'ESPÈCE (scripts/fetch-elevage.mjs) : une forme emprunte celles de son espèce.

// Points d'expérience totaux au niveau 100, par courbe : ils disent mieux que le nom
// de la courbe ce qu'elle coûte.
const COURBE_XP = {
  slow: 1250000, medium: 1000000, fast: 800000, 'medium-slow': 1059860,
  'slow-then-very-fast': 600000, 'fast-then-very-slow': 1640000,
};

// Un pourcentage lisible : une décimale sous 10 %, aucune au-delà — sauf demande
// contraire : la répartition des sexes va par huitièmes (87,5 / 12,5), et l'arrondir
// donnait 88 % et 13 %, soit 101 %.
const pourcent = (x, dec) => {
  const v = Math.min(100, x * 100);
  try {
    return v.toLocaleString(document.documentElement.lang || 'fr',
      { maximumFractionDigits: dec ?? (v < 10 ? 1 : 0) });
  } catch { return v.toFixed(dec ?? (v < 10 ? 1 : 0)); }
};
const entier = (n) => Number(n).toLocaleString(document.documentElement.lang || 'fr');

function renderElevage(base) {
  const e = elevage.especes[base];
  if (!e) return '';
  // Chance de capture d'une Poké Ball, sans statut, depuis la gén. 3 : la valeur
  // modifiée vaut taux × (3 PVmax − 2 PV) / (3 PVmax), et la probabilité en est très
  // proche de cette valeur sur 255. PV pleins : taux / 3 ; à 1 PV : presque le taux.
  const plein = Math.min(1, e.c / 3 / 255);
  const bas = Math.min(1, e.c / 255);
  const sexe = e.s < 0
    ? t('asexue')
    : t('sexeRepartition', pourcent((8 - e.s) / 8, 1), pourcent(e.s / 8, 1));
  const lg = ['fr', 'en', 'ja'].includes(langue()) ? langue() : 'fr';
  const oeufs = e.o.map((g) => esc(elevage.groupes[g]?.[lg] ?? g)).join(', ');
  const ev = e.v.map((n, i) => (n ? `${n} ${statLignes()[i][1]}` : '')).filter(Boolean).join(', ');
  const courbe = e.r ? t(`courbeXp_${e.r.replace(/-/g, '_')}`) : '';
  return `
    <dl class="facts elevage">
      <div class="fact wide">
        <dt>${t('tauxCapture')}</dt>
        <dd><b>${e.c}</b> <small>${t('chanceCapture', pourcent(plein), pourcent(bas))}</small></dd>
      </div>
      <div class="fact wide">
        <dt>${t('sexe')}</dt>
        <dd>${sexe}${e.s < 0 ? '' : `<span class="sexe-bar" style="--f:${(100 * e.s) / 8}%" aria-hidden="true"></span>`}</dd>
      </div>
      <div class="fact"><dt>${t('groupesOeufs')}</dt><dd>${oeufs}</dd></div>
      <div class="fact"><dt>${t('eclosion')}</dt><dd>${t('eclosionVal', e.e, entier(e.e * 257))}</dd></div>
      <div class="fact"><dt>${t('evDonnes')}</dt><dd>${ev || '—'}</dd></div>
      <div class="fact"><dt>${t('expBase')}</dt><dd>${e.x ?? '—'}</dd></div>
      <div class="fact"><dt>${t('courbeXp')}</dt><dd>${courbe ? t('courbeXpVal', courbe, entier(COURBE_XP[e.r])) : '—'}</dd></div>
      <div class="fact"><dt>${t('bonheurBase')}</dt><dd>${e.b ?? '—'}</dd></div>
    </dl>`;
}

// ---------- Cri du Pokémon ----------
//
// Les cris viennent de PokéAPI (github.com/PokeAPI/cries) et sont EMBARQUÉS dans
// public/cries/, convertis en MP3 par scripts/fetch-cries.mjs : l'appli ne fait aucune
// requête au runtime, et Safari sur iPhone ne lit pas l'OGG d'origine de façon fiable.
//
// Une forme à clé numérique a souvent son propre cri (`10034.mp3`) ; une forme
// cosmétique, à clé slug, n'en a jamais : on demande le cri de la clé, et à défaut
// celui de l'espèce.
const ICONE_CRI = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" fill="currentColor"/><path d="M15.4 8.6a4.8 4.8 0 0 1 0 6.8M17.9 6.1a8.4 8.4 0 0 1 0 11.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
let criEnCours = null;

function joueCri(cle, bouton) {
  // Un nouvel appui relance le cri depuis le début au lieu de superposer deux lectures.
  if (criEnCours) { criEnCours.pause(); criEnCours = null; }
  const espece = speciesOf(cle);
  const sources = [...new Set([String(cle), String(espece)])]
    .filter((c) => /^\d+$/.test(c))
    .map((c) => `cries/${c}.mp3`);
  const essaie = (i) => {
    if (i >= sources.length) { bouton?.classList.remove('joue'); return; }
    const son = new Audio(sources[i]);
    criEnCours = son;
    son.addEventListener('ended', () => { bouton?.classList.remove('joue'); if (criEnCours === son) criEnCours = null; });
    son.addEventListener('error', () => { if (criEnCours === son) essaie(i + 1); });
    bouton?.classList.add('joue');
    son.play().catch(() => { if (criEnCours === son) essaie(i + 1); });
  };
  essaie(0);
}

function openSheet(id) {
  // Nouveau Pokémon : on repart en haut. Simple bascule (shiny, capture) : on garde la place.
  const keepScroll = state.open === id ? sheetBody.scrollTop : 0;
  state.open = id;
  // Une forme n'a pas d'entrée propre au Pokédex : on emprunte celle de son espèce
  // pour les types, la description et les lieux de capture, et on garde un lien
  // de retour vers la forme de base.
  const forme = FORM_BY_KEY.get(id) || null;
  const base = speciesOf(id);
  const p = pokedex[base] || {};
  const caught = isCaught(id);
  const sh = state.shiny;
  // La fiche montre TOUJOURS le Pokémon en couleur, capturé ou non, normal comme
  // chromatique : c'est la page où l'on vient regarder la bête. Le gris reste le
  // signal d'état de la grille, et ici le bouton de capture dit déjà où l'on en est.
  //
  // On demande TOUJOURS l'artwork de la forme elle-même, et `portraitFallback`
  // retombe sur son sprite 2D quand il n'existe pas. Le portrait montre donc le plus
  // souvent possible une image nette, SANS jamais cesser de représenter la forme
  // exacte — un artwork qui ne serait pas le bon vaut moins que le sprite qui l'est.
  //
  // Le critère précédent — « clé numérique » — était faux dans les deux sens : 12
  // formes à clé numérique (Mimiqui Démasqué, Zygarde, Méga-Nigirigon…) n'ont aucun
  // artwork, et 70 formes à clé slug en ont un (Pichu, Zarbi A, Cape Plante, les trois
  // Mothim…), qui restait inutilisé. Le fichier fait foi, pas la forme de la clé.
  //
  // `spriteKey(id)` et non `id` : l'artwork d'une forme à slug porte le nom de son
  // sprite (`414` pour mothim-plant), jamais celui de sa clé.
  const portrait = sprites.art(spriteKey(id), sh);

  sheet.querySelector('.sheet-body').innerHTML = `
    <div class="sheet-top">
      <div class="portrait">
        <img src="${portrait}" alt="${p.name || id}" ${portraitFallback(id, sh)} />
        <button class="shiny-btn ${sh ? 'on' : ''}" data-act="shiny" aria-pressed="${sh}"
                title="${sh ? t('voirNormale') : t('voirChromatique')}">&#10022;</button>
        <button class="cri-btn" data-act="cri" title="${t('ecouterCri')}" aria-label="${t('ecouterCriDe', esc(p.name || t('numero', base)))}">${ICONE_CRI}</button>
      </div>
      <div>
        <h2 class="sheet-name">${esc(forme ? forme.name : (p.name || t('numero', id)))}<small>#${String(base).padStart(4, '0')}</small></h2>
        <p class="sheet-genus">${forme ? `${esc(p.name || '')} · ${nomKind(forme.kind)}` : (p.genus || '')}${elevage.especes[base]?.l ? ` · <span class="statut">${t('statut_' + elevage.especes[base].l)}</span>` : ''}${sh ? ' · ' + t('formeChromatique') : ''}</p>
        <div class="types">${(p.types || []).map((t) => `<span class="type" style="--t:${TYPES[t]?.[1] || '#888'}">${TYPES[t]?.[0] || t}</span>`).join('')}</div>
      </div>
    </div>

    ${forme ? renderObtention(forme, base) : ''}

    ${forme ? `<button class="back-btn" data-evo="${base}">${t('revenirA', esc(p.name || t('numero', base)))}</button>` : ''}

    <button class="catch-btn ${caught ? 'done' : ''}" data-act="toggle" data-id="${id}">
      ${caught ? t('retirerDeLaBoite') : t('marquerCapture')}
    </button>

    <dl class="facts">
      <div class="fact"><dt>${t('habitat')}</dt><dd>${cap(p.habitat) || t('habitatInconnu')}</dd></div>
      <div class="fact"><dt>${t('couleur')}</dt><dd>${p.color || '—'}</dd></div>
      <div class="fact"><dt>${t('taille')}</dt><dd>${p.height ? decimale(p.height) + ' m' : '—'}</dd></div>
      <div class="fact"><dt>${t('poids')}</dt><dd>${p.weight ? decimale(p.weight) + ' kg' : '—'}</dd></div>
      ${p.flavor ? `<div class="fact wide"><dt>${t('description')}</dt><dd>${p.flavor}</dd></div>` : ''}
    </dl>

    <h3>${t('statsDeBase')}</h3>
    ${renderStatsBase(id)}

    <h3>${t('captureElevage')}</h3>
    ${renderElevage(base)}

    <h3>${t('faiblessesEtResistances')} <small>${t('tableActuelle')}</small></h3>
    ${renderFaiblesses(base, 9)}

    <h3>${t('familleEvolution')}${compteFamille(base)}</h3>
    ${renderEvolution(base, id)}

    ${renderForms(base, id)}

    <h3>${t('talents')}</h3>
    ${renderTalents(base)}

    <h3>${t('attaques')}</h3>
    ${renderMoves(base)}

    <h3>${t('ouLeTrouver')}</h3>
    ${renderEncounters(p, base)}
  `;
  sheetBody.scrollTop = keepScroll;
  sheet.classList.add('open');
  syncBackdrop();
}

// Famille d'évolution : une ligne par membre, indentée selon la profondeur, ce qui
// rend lisibles les familles qui se ramifient (Évoli en compte huit).
function renderEvolution(id, courant = id) {
  const chaine = evolutions.chains[evolutions.of[id]];
  const membres = chaine?.membres ?? [];
  if (membres.length < 2) return `<p class="none">${t('nEvoluePas')}</p>`;

  const parId = new Map(membres.map((m) => [m.id, m]));
  const profondeur = (m) => {
    let d = 0, c = m;
    while (c && c.from !== null) { d++; c = parId.get(c.from); }
    return d;
  };

  // La famille suit la règle de la GRILLE : un membre manquant est gris, un membre
  // capturé est en couleur et porte sa Poké Ball. Tout était en couleur, avec une
  // pastille de 9 px pour seul signal — à rebours du reste de l'appli, et c'est
  // pourtant ici qu'on se demande lesquels de la famille il reste à attraper. Les
  // sprites suivent aussi la collection active : chromatiques en vue chromatique.
  return '<div class="evo">' + membres.map((m) => {
    const vu = isCaught(m.id);
    return `
    <div class="evo-row" style="--d:${profondeur(m)}">
      ${m.how ? `<div class="evo-how">${esc(m.how)}</div>` : ''}
      <button class="evo-mon ${m.id === courant || m.id === id ? 'on' : ''} ${vu ? 'vu' : 'manque'}" data-evo="${m.id}"
              aria-label="${esc(monName(m.id))}${vu ? ', ' + t('capture') : ''}">
        <img src="${sprites.still(spriteKey(m.id), shinyView())}" alt="" loading="lazy" ${imgFallback(m.id, shinyView())} />
        <span>${esc(monName(m.id))}</span>
        ${vu ? '<i class="evo-ok" aria-hidden="true"></i>' : ''}
      </button>
    </div>`;
  }).join('') + '</div>';
}

// « 2 / 3 » à côté du titre : l'avancement de la famille d'un coup d'œil. Rien pour
// une espèce qui n'évolue pas — le compte d'un seul n'apprendrait rien.
function compteFamille(id) {
  const membres = evolutions.chains[evolutions.of[id]]?.membres ?? [];
  if (membres.length < 2) return '';
  const pris = membres.filter((m) => isCaught(m.id)).length;
  const complet = pris === membres.length;
  return ` <small class="evo-compte ${complet ? 'complet' : ''}">${pris} / ${membres.length}</small>`;
}

// Formes alternatives de l'espèce, si PokéAPI en connaît.
// `courant` est la clé réellement affichée : elle peut être une forme, auquel cas
// la forme de base est ajoutée en tête pour pouvoir y revenir d'un geste.
// `courant` est la clé réellement affichée : elle peut être une forme, auquel cas
// la forme de base est ajoutée en tête pour pouvoir y revenir d'un geste.
// Chaque forme porte un bouton qui la range dans la boîte, juste derrière son
// espèce, ou l'en retire.
function renderForms(id, courant = id) {
  const liste = forms[id] ?? [];
  if (!liste.length) return '';
  const manquantes = liste.filter((x) => !dansUneBoite(x.key)).length;
  const aFemelle = liste.some((f) => f.kind === 'femelle');
  const entrees = [
    { key: id, name: pokedex[id]?.name ?? t('numero', id), kind: aFemelle ? 'male' : 'base' },
    ...liste,
  ];
  return `
    <div class="formes-head">
      <h3>${t('formes')}</h3>
      ${manquantes
        ? `<button class="formes-all" data-forms-all="${id}">${t('ajouterLesFormes', manquantes)}</button>`
        : ''}
    </div>
    <div class="formes">${entrees.map((f) => {
      const base = f.kind === 'base' || f.kind === 'male';
      const dans = base || dansUneBoite(f.key);
      return `
      <div class="forme ${f.key === courant ? 'ici' : ''} ${isCaught(f.key) ? 'on' : ''}">
        <button class="forme-go" data-evo="${f.key}">
          <img src="${sprites.still(spriteKey(f.key), shinyView())}" alt="" loading="lazy" ${imgFallback(id, shinyView())} />
          <span>${esc(f.name)}<i>${f.kind === 'male' ? t('male')
            : base ? t('formeDeBase') : nomKind(f.kind)}</i></span>
        </button>
        ${base ? '' : `<button class="forme-add ${dans ? 'on' : ''}" data-form-add="${f.key}"
                aria-label="${dans ? t('retirerDeLaBoite') : t('ajouterALaBoite')}"
                title="${dans ? t('retirerDeLaBoite') : t('ajouterALaBoite')}">${dans ? '&#10003;' : '+'}</button>`}
      </div>`;
    }).join('')}</div>`;
}

// ---------- Obtention d'une forme ----------
//
// PokéAPI décrit l'obtention dans `form_descriptions`, mais pour 34 espèces
// seulement — les cas mécaniquement particuliers : fusion de Kyurem, Chant Antique
// de Meloetta, Orbe Griseous de Giratina. Pour tout le reste (Méga, Gigamax,
// régionales…), on explique par NATURE de forme, ce qui reste exact.
function renderObtention(forme, base) {
  const officielle = formDesc[base];
  // « Forme particulière à cette espèce » n'apprend rien quand la description
  // officielle dit déjà comment l'obtenir : on ne garde alors que celle-ci.
  const parNature = forme.kind === 'autre' && officielle
    ? null : obtention(forme.kind);
  return `
    <p class="obtention">
      <b>${t('commentObtenir')}</b>
      ${parNature ? `<span>${esc(parNature)}</span>` : ''}
      ${officielle ? `<i>${esc(officielle)}</i>` : ''}
    </p>`;
}

// ---------- Talents ----------

// Les talents de l'espèce, tous jeux confondus : la fiche du Pokédex décrit
// l'espèce, pas une partie en cours. Le filtrage par version n'a lieu que dans la
// boîte de combat, où l'on compose pour un jeu précis.
function renderTalents(base) {
  const liste = abilities.of[base] || [];
  if (!liste.length) return `<p class="none">${t('aucunTalent')}</p>`;
  return `<ul class="talents">${liste.map(([slug, cache]) => {
    const ab = abilities.list[slug];
    if (!ab) return '';
    return `<li>
      <span class="t-nom">${esc(ab.n)}${cache ? `<i>${t('talentCache')}</i>` : ''}</span>
      ${ab.d ? `<span class="t-desc">${esc(ab.d)}</span>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

// ---------- Attaques ----------

// Une espèce apprend un moveset différent dans chaque jeu ; `learnsets.json` n'en
// garde qu'un, celui du jeu le plus récent où elle apparaît, et la fiche annonce
// lequel — sans quoi on lirait des niveaux faux sans savoir d'où ils sortent.
//
// Les attaques sont celles de l'ESPÈCE : une forme emprunte déjà l'entrée de son
// espèce pour les types et les lieux de capture, c'est le même principe.

function renderMove(id, badge) {
  const m = moves[id];
  if (!m) return '';
  const [tn, tc] = TYPES[m.t] || [m.t || '—', '#888'];
  const [cn, cc] = CLASSES[m.c] || [m.c || '—', '#888'];
  // Une attaque de statut n'a ni puissance ni précision : « — » plutôt qu'un 0 faux.
  const val = (v) => (v == null ? '—' : v);
  return `
    <li class="mrow">
      <button class="move" data-move="${id}" aria-expanded="false">
        <span class="mbadge">${esc(badge)}</span>
        <span class="mmain">
          <span class="mtitre">
            <span class="mname">${esc(m.n)}</span>
            <span class="type mini" style="--t:${tc}">${tn}</span>
          </span>
          <span class="mmeta">
            <span class="mcls" style="--c:${cc}">${cn}</span>
            <span>${t('puisCourt')} <b>${val(m.p)}</b></span>
            <span>${t('precCourt')} <b>${val(m.a)}</b></span>
            <span>${t('ppCourt')} <b>${val(m.pp)}</b></span>
          </span>
        </span>
        ${m.d ? '<span class="mchev" aria-hidden="true">&rsaquo;</span>' : ''}
      </button>
      ${m.d ? `<p class="mdesc" hidden>${esc(m.d)}</p>` : ''}
    </li>`;
}

function renderMoves(base) {
  const l = learnsets[base];
  if (!l) return `<p class="none">${t('attaquesInconnues')}</p>`;

  // Niveau 0 = attaque connue d'entrée de jeu (départ ou juste après évolution).
  const groupes = [
    [t('apprNiveau'), l.n.map(([id, lv]) => [id, lv > 0 ? t('niveauBadge', lv) : t('depart')]), true],
    [t('ctEtCs'), l.m, false],
    [t('apprOeuf'), l.o.map((id) => [id, t('oeuf')]), false],
    [t('apprMaitre'), l.t.map((id) => [id, t('maitre')]), false],
  ].filter(([, liste]) => liste.length);

  if (!groupes.length) return `<p class="none">${t('attaquesInconnues')}</p>`;

  return `
    <p class="moves-jeu">${t('dApres', esc(l.j))}</p>
    ${groupes.map(([titre, liste, ouvert]) => `
      <details class="mgroup" ${ouvert ? 'open' : ''}>
        <summary>${titre}<b>${liste.length}</b></summary>
        <ul class="mlist">${liste.map(([id, badge]) => renderMove(id, badge)).join('')}</ul>
      </details>`).join('')}
  `;
}

// ---------- Lieux de capture : les trous de la source dans les remakes ----------
//
// PokéAPI a importé les rencontres des remakes de façon très lacunaire. Mesuré sur les
// Pokédex régionaux : Rubis Oméga / Saphir Alpha n'a de lieu que pour 70 espèces sur
// 211 — ni Magicarpe, ni Tentacool, ni Wailmer, qui se pêchent et se trouvent en
// surfant —, et Diamant Étincelant / Perle Scintillante n'en a AUCUN. Une espèce du
// Pokédex de RO/SA s'affichait donc sans la moindre ligne pour ce jeu.
//
// On comble avec ce qui est SÛR, et on le dit :
//   1. une évolution s'obtient en faisant évoluer sa forme précédente ;
//   2. un bébé apparu après son évolution (Pichu, Azurill, Rozbouton…) s'obtient par
//      un œuf de celle-ci ;
//   3. un Pokémon sauvage est donné aux lieux du jeu D'ORIGINE, explicitement marqués
//      comme indicatifs — un remake reprend la carte de son modèle, mais pas toujours
//      à l'identique ;
//   4. à défaut, on dit que la source ne renseigne pas le mode d'obtention.
// Jamais un lieu inventé.
//
// Les jeux sont reconnus par une CLÉ relevée au chargement, quand les noms sont encore
// français : la surcouche de traduction réécrit `g.game` en place, et « Rubis Oméga »
// devient « Omega Ruby ». Les index restent alignés, c'est elle qui le garantit.
const JEU_PAR_NOM = {
  'Rouge': 'red', 'Bleu': 'blue', 'Jaune': 'yellow', 'Vert': 'green',
  'Rouge Feu': 'firered', 'Vert Feuille': 'leafgreen',
  'Or': 'gold', 'Argent': 'silver', 'Cristal': 'crystal',
  'Or HeartGold': 'heartgold', 'Argent SoulSilver': 'soulsilver',
  'Rubis': 'ruby', 'Saphir': 'sapphire', 'Émeraude': 'emerald',
  'Rubis Oméga': 'omega-ruby', 'Saphir Alpha': 'alpha-sapphire',
  'Diamant': 'diamond', 'Perle': 'pearl', 'Platine': 'platinum',
  'Let’s Go, Pikachu': 'lgp', 'Let’s Go, Évoli': 'lge',
};
const CLES_RENCONTRES = new Map();
for (const [id, e] of Object.entries(pokedex)) {
  CLES_RENCONTRES.set(Number(id), (e.encounters || []).map((g) => JEU_PAR_NOM[g.game] ?? null));
}

// Chaque remake, ses propres jeux, et le jeu dont il reprend la carte.
const REMAKES_LIEUX = [
  { cle: 'frlg', jeux: ['firered', 'leafgreen'], origine: ['red', 'blue', 'yellow', 'green'] },
  { cle: 'hgss', jeux: ['heartgold', 'soulsilver'], origine: ['gold', 'silver', 'crystal'] },
  { cle: 'rosa', jeux: ['omega-ruby', 'alpha-sapphire'], origine: ['ruby', 'sapphire', 'emerald'], navidex: true },
  { cle: 'lgpe', jeux: ['lgp', 'lge'], origine: ['red', 'blue', 'yellow'] },
  { cle: 'deps', jeux: [], origine: ['diamond', 'pearl', 'platinum'] },
];
const LISTES_REMAKES = Object.fromEntries(Object.entries(remakes).map(([k, r]) => [k, new Set(r.liste)]));

// Bébé : forme de base dont l'évolution est apparue dans une génération ANTÉRIEURE.
// Pichu (gén. 2) précède Pikachu (gén. 1) : on ne le trouve qu'en œuf. Aucune donnée
// `is_baby` n'est embarquée ; cette règle les couvre tous sans liste à tenir.
function enfantDuBebe(id) {
  const ch = evolutions.chains[evolutions.of[id]];
  const m = ch?.membres?.find((x) => x.id === id);
  if (!m || m.from !== null) return null;
  const suite = ch.membres.find((x) => x.from === id);
  if (!suite) return null;
  return (pokedex[suite.id]?.generation ?? 99) < (pokedex[id]?.generation ?? 0) ? suite.id : null;
}

const htmlLieu = (pl) => `
  <div class="loc">
    <div>
      <div class="where">${esc(nomLieu(pl.location))}</div>
      <div class="how">${pl.methods.map((m) => nomMethode(m.method)).join(', ')}</div>
    </div>
    <div class="lvl">${t('niveauCourt', pl.min, pl.max !== pl.min ? '–' + pl.max : '')}${pl.chance ? ` · ${pl.chance} %` : ''}</div>
  </div>`;

const NOTE_NAVIDEX = () => `<p class="loc-note navidex">${t('lieuNavidex')}</p>`;

// Le Navidex ne cherche que les Pokémon qui se promènent : herbes, grottes, surf et
// fonds marins. Ni la pêche, ni Éclate-Roc, ni un don ou une rencontre fixe — la note
// sous Arcko, offert par le Prof. Seko, aurait été fausse.
const NAVIDEX_METHODES = new Set(['walk', 'surf', 'seaweed', 'horde', 'dark-grass']);
const navidexPossible = (places) => places.some((pl) => pl.methods.some((m) => NAVIDEX_METHODES.has(m.method)));

// Ce qui ne passe pas par la carte du jeu d'origine, ou ne s'y reproduit pas dans le
// remake : disques bonus de Colosseum, Pokémon Channel, Ranger, échanges avec un
// personnage, Pokémon errants (Latios et Latias sont fixes dans RO/SA). Les reprendre
// comme lieux « indicatifs » aurait donné Jirachi au Centre Pokémon de Hoenn.
const HORS_CARTE = new Set([
  'colosseum-bonus-disc-jpn', 'colosseum-bonus-disc-us', 'pokemon-channel-pal',
  'pokemon-ranger', 'snag', 'snag-rematch', 'pokespot', 'npc-trade',
  'roaming-grass', 'roaming-water',
]);

// Le bloc d'un remake absent de la source, ou rien si la source le couvre déjà.
function blocRemake(id, enc, cles, r) {
  if (!LISTES_REMAKES[r.cle]?.has(id)) return '';
  const present = cles.some((k) => r.jeux.includes(k));
  if (present) return '';
  const nom = esc(nomRemake(r.cle, 'nom'));
  const ch = evolutions.chains[evolutions.of[id]];
  const m = ch?.membres?.find((x) => x.id === id);

  // 1. Évolution.
  if (m && m.from !== null) {
    return `
    <div class="game deduit">
      <div class="game-name">${nom}</div>
      <div class="loc"><div>
        <div class="where">${t('lieuParEvolution', esc(monName(m.from)))}</div>
        ${m.how ? `<div class="how">${esc(m.how)}</div>` : ''}
      </div></div>
    </div>`;
  }
  // 2. Bébé : œuf.
  const enfant = enfantDuBebe(id);
  if (enfant) {
    return `
    <div class="game deduit">
      <div class="game-name">${nom}</div>
      <div class="loc"><div>
        <div class="where">${t('lieuParOeuf')}</div>
        <div class="how">${t('lieuOeufDe', esc(monName(enfant)))}</div>
      </div></div>
    </div>`;
  }
  // 3. Lieux du jeu d'origine, dédoublonnés d'un jeu à l'autre.
  const blocs = enc.filter((_, i) => r.origine.includes(cles[i]));
  const vus = new Map();
  if (blocs.length) {
    for (const g of blocs) for (const lieu of g.places) {
      const pl = { ...lieu, methods: lieu.methods.filter((x) => !HORS_CARTE.has(x.method)) };
      if (!pl.methods.length) continue;
      const k = pl.location + '|' + pl.methods.map((x) => x.method).join(',');
      if (!vus.has(k)) vus.set(k, pl);
    }
  }
  if (vus.size) {
    const jeuxOrigine = [...new Set(blocs.map((g) => g.game))].join(' / ');
    return `
    <div class="game deduit">
      <div class="game-name">${nom}</div>
      <p class="loc-note">${t('lieuIndicatif', esc(jeuxOrigine))}</p>
      ${[...vus.values()].map(htmlLieu).join('')}
      ${r.navidex && navidexPossible([...vus.values()]) ? NOTE_NAVIDEX() : ''}
    </div>`;
  }
  // 4. Rien de sûr à dire.
  return `
    <div class="game deduit">
      <div class="game-name">${nom}</div>
      <p class="loc-note">${t('lieuNonRenseigne')}</p>
    </div>`;
}

function renderEncounters(p, id) {
  const enc = p.encounters || [];
  const cles = CLES_RENCONTRES.get(Number(id)) || [];
  // La note du Navidex ne vient qu'une fois, sous le DERNIER des deux blocs de RO/SA,
  // et seulement si l'un d'eux le trouve à l'état sauvage.
  const oras = enc.filter((_, i) => cles[i] === 'omega-ruby' || cles[i] === 'alpha-sapphire');
  const dernierOras = navidexPossible(oras.flatMap((g) => g.places))
    ? Math.max(cles.lastIndexOf('omega-ruby'), cles.lastIndexOf('alpha-sapphire')) : -1;
  const reels = enc.map((g, i) => `
    <div class="game">
      <div class="game-name">${g.game}</div>
      ${g.places.map(htmlLieu).join('')}
      ${i === dernierOras ? NOTE_NAVIDEX() : ''}
    </div>`).join('');
  const deduits = REMAKES_LIEUX.map((r) => blocRemake(Number(id), enc, cles, r)).join('');
  if (!reels && !deduits) return `<p class="none">${t('aucuneRencontre')}</p>`;
  return `<div class="games">${reels}${deduits}</div>`;
}

function closeSheet() {
  sheet.classList.remove('open');
  state.open = null;
  syncBackdrop();
}

// ---------- Fermeture d'un panneau par glissement vers le bas ----------
// Le contenu défile normalement. Le panneau ne suit le doigt que si le geste est
// franchement vertical, vers le bas, et que le contenu est déjà en haut (ou que le
// geste part de la poignée). Sinon on ne touche à rien : c'est un simple défilement.

const CLOSE_AT = 110; // px de glissement au-delà desquels on ferme
const NAV_AT = 60;    // px au-delà desquels on passe à la fiche voisine

// ---------- Passer d'une fiche à l'autre par glissement horizontal ----------

// Les voisins sont les Pokémon rangés dans la BOÎTE affichée, cases vides exclues.
// Une fiche ouverte depuis une chaîne d'évolution ou une forme peut donc ne pas s'y
// trouver : le geste ne fait alors rien, plutôt que de sauter n'importe où.
function voisinFiche(dir) {
  // Une fiche ouverte par le scan n'a pas de voisins : elle ne vient d'aucune liste.
  if (state.vue === 'scan') return null;
  // Dans la vue Pokédex, les voisins sont les espèces de la génération affichée,
  // pas le contenu d'une boîte : on parcourt le Pokédex national dans l'ordre.
  if (state.vue === 'pokedex') {
    // La grille est triée, filtrée ou cherchée : les voisins sont ceux qu'on VOIT.
    // Trié par Vitesse, glisser doit mener au suivant de la liste, pas au numéro d'à côté.
    const affiches = especesDex();
    const k = affiches.indexOf(Number(state.open));
    if (k >= 0) return affiches[k + dir] ?? null;
    const g = plageDex(state.dexGen ?? 0);
    const id = Number(state.open);
    if (!Number.isInteger(id) || id < g.from || id > g.to) return null;
    const j = id + dir;
    return j >= g.from && j <= g.to ? j : null;
  }
  const liste = genList(state.gen);
  const debut = state.box[state.gen] * BOX_SIZE;
  const boite = liste.slice(debut, debut + BOX_SIZE).filter((k) => k !== null && k !== undefined);
  const i = boite.indexOf(state.open);
  if (i < 0) return null;
  const j = i + dir;
  return j >= 0 && j < boite.length ? boite[j] : null;
}

// Le glissement porte sur .sheet-body, jamais sur .sheet : ce dernier réserve son
// transform au translateY d'ouverture, et un translateX l'écraserait — le panneau
// resterait collé en bas de l'écran.
const NAV_OUT = 130, NAV_IN = 210;
let navFicheEnCours = false;

function navFiche(dir) {
  if (navFicheEnCours) return;
  const suivant = voisinFiche(dir);
  if (suivant === null || suivant === undefined) return;
  navFicheEnCours = true;

  const b = sheetBody;
  const w = b.getBoundingClientRect().width || 340;
  b.style.transition = `transform ${NAV_OUT}ms ease-in, opacity ${NAV_OUT}ms ease-in`;
  b.style.transform = `translateX(${-dir * w * 0.45}px)`;
  b.style.opacity = '0';

  setTimeout(() => {
    openSheet(suivant);
    b.style.transition = 'none';
    b.style.transform = `translateX(${dir * w * 0.4}px)`;
    b.style.opacity = '0';
    // Reflow forcé plutôt que requestAnimationFrame, comme pour les boîtes : rAF ne
    // se déclenche pas onglet en arrière-plan et la fiche resterait invisible.
    void b.offsetWidth;
    b.style.transition = `transform ${NAV_IN}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${NAV_IN}ms ease-out`;
    b.style.transform = '';
    b.style.opacity = '';
    setTimeout(() => { b.style.transition = ''; navFicheEnCours = false; }, NAV_IN);
  }, NAV_OUT);
}

function enableSwipeClose(el, close, nav = null) {
  const body = el.querySelector('.sheet-body');
  let startY = 0, startX = 0, startTop = 0, fromGrip = false, drag = null, horizontalLocal = false;

  el.addEventListener('touchstart', (e) => {
    if (!el.classList.contains('open') || e.touches.length !== 1) { drag = 'no'; return; }
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    startTop = body.scrollTop;
    fromGrip = !e.target.closest('.sheet-body');
    // Les onglets de génération et la table des types défilent de côté : un glissement
    // horizontal qui part de là leur appartient, il ne doit ni naviguer ni revenir.
    horizontalLocal = !!e.target.closest('.paper-gens, .tt-wrap, input, select, textarea');
    drag = null;
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (drag === 'no' || !el.classList.contains('open')) return;
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;

    // Premier mouvement : on décide une fois pour toutes de quel geste il s'agit —
    // fermeture, navigation, ou simple défilement du contenu.
    if (drag === null) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        const atTop = startTop <= 0 && body.scrollTop <= 0;
        drag = dy > 0 && (fromGrip || atTop) ? 'close' : 'no';
        if (drag === 'close') el.style.transition = 'none';
      } else {
        drag = nav && !horizontalLocal ? 'nav' : 'no';
        if (drag === 'nav') body.style.transition = 'none';
      }
      if (drag === 'no') return;
    }

    e.preventDefault(); // pendant le geste, la page ne doit pas bouger

    if (drag === 'nav') {
      // Sans voisin de ce côté, le contenu ne suit qu'au tiers : le geste répond
      // quand même, mais on sent qu'il n'ira nulle part.
      const libre = nav.voisin(dx > 0 ? -1 : 1) != null;
      body.style.transform = `translateX(${libre ? dx : dx / 3}px)`;
      body.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 520));
      return;
    }

    el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / 340));
  }, { passive: false });

  const end = (e) => {
    if (drag === 'nav') {
      const dx = (e.changedTouches?.[0]?.clientX ?? startX) - startX;
      // On rend la main : navFiche() reprend la suite de l'animation, ou le contenu
      // revient simplement en place si le geste était trop court.
      body.style.transition = '';
      body.style.transform = '';
      body.style.opacity = '';
      if (Math.abs(dx) > NAV_AT) nav.aller(dx > 0 ? -1 : 1);
      drag = null;
      return;
    }
    if (drag !== 'close') { drag = null; return; }
    const dy = (e.changedTouches?.[0]?.clientY ?? startY) - startY;
    // On rend la main au CSS : il anime soit le retour en place, soit la sortie.
    el.style.transition = '';
    el.style.transform = '';
    backdrop.style.opacity = '';
    if (dy > CLOSE_AT) close();
    drag = null;
  };
  el.addEventListener('touchend', end, { passive: true });
  el.addEventListener('touchcancel', end, { passive: true });
}

const sheetBody = sheet.querySelector('.sheet-body');
enableSwipeClose(sheet, closeSheet, { voisin: voisinFiche, aller: navFiche });

// ---------- Panneau « personnaliser la boîte » ----------

const boxSheet = h(`<aside class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body"></div></aside>`);
document.body.append(boxSheet);
const boxBody = boxSheet.querySelector('.sheet-body');
enableSwipeClose(boxSheet, closeBoxSheet);

function closeBoxSheet() {
  boxSheet.classList.remove('open');
  syncBackdrop();
}

// Le voile est partagé : il reste tant qu'au moins un panneau est ouvert.
function syncBackdrop() {
  backdrop.classList.toggle('open',
    sheet.classList.contains('open') || boxSheet.classList.contains('open')
    || addSheet.classList.contains('open') || battleSheet.classList.contains('open')
    || compteSheet.classList.contains('open') || legalSheet.classList.contains('open'));
}

// ---------- Panneau « ajouter un Pokémon à un emplacement » ----------

const addSheet = h(`<aside class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body"></div></aside>`);
document.body.append(addSheet);
const addBody = addSheet.querySelector('.sheet-body');
enableSwipeClose(addSheet, closeAddSheet);

function closeAddSheet() {
  addSheet.classList.remove('open');
  state.addIndex = null;
  syncBackdrop();
}

function openAddSheet(index) {
  state.addIndex = index;
  state.addQuery = '';
  state.addGen = ONGLETS[state.gen].n;   // on part de la génération qu'on regarde
  renderAddSheet();
  addBody.scrollTop = 0;
  addSheet.classList.add('open');
  syncBackdrop();
}

// ---------- Panneau du compte ----------
//
// Le choix de la photo de profil s'y fait, comme le choix d'un fond ou d'un Pokémon
// se fait dans le sien. Avant, la liste s'ajoutait DANS la page Réglages : chaque
// geste la redessinait, et la page repartait du haut. C'est compte-ui.js qui en
// écrit le contenu ; main.js ne fournit que le contenant et le voile partagé.
const compteSheet = h(`<aside class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body"></div></aside>`);
document.body.append(compteSheet);
const compteBody = compteSheet.querySelector('.sheet-body');
enableSwipeClose(compteSheet, fermeComptePanneau);

function ouvreComptePanneau(html) {
  compteBody.innerHTML = html;
  compteBody.scrollTop = 0;
  compteSheet.classList.add('open');
  syncBackdrop();
}

// Le défilement est RENDU après coup : on remplace le contenu d'un panneau déjà
// ouvert (un choix, une recherche), et repartir en haut de la liste à chaque fois
// serait exactement le défaut qu'on corrige dans la page.
function majComptePanneau(html) {
  const y = compteBody.scrollTop;
  compteBody.innerHTML = html;
  compteBody.scrollTop = y;
}

// Fermé de trois façons — le bouton, le glissement vers le bas, le voile —, d'où
// l'avis donné au module : sans lui il croirait son panneau encore ouvert.
function fermeComptePanneau() {
  if (!compteSheet.classList.contains('open')) return;
  compteSheet.classList.remove('open');
  compteUI.panneauFerme();
  syncBackdrop();
}

// ---------- Documents légaux ----------
//
// Ils s'ouvrent DANS UN PANNEAU de l'appli. La première version les confiait au
// greffon Browser — un Safari système — et rien ne s'ouvrait dans l'IPA : Safari
// n'accepte que des adresses http(s), et la page de l'appli est servie en
// capacitor://localhost. La promesse était rejetée, le repli `window.open` ne fait
// rien dans une vue web Capacitor : le toucher restait sans effet.
//
// Le panneau lit les pages embarquées dans `dist/legal/` — produites depuis le
// Markdown de `legal/` par scripts/build-legal.mjs — et n'en garde que le <main>.
// Même source que le site, donc toujours le même texte, et hors ligne. Le chemin est
// RELATIF, comme celui des sprites, à cause de `base: './'`.
const legalSheet = h(`<aside class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body legal-doc"></div></aside>`);
document.body.append(legalSheet);
const legalBody = legalSheet.querySelector('.sheet-body');
enableSwipeClose(legalSheet, fermeLegal);

function fermeLegal() {
  if (!legalSheet.classList.contains('open')) return;
  legalSheet.classList.remove('open');
  syncBackdrop();
}

// Hors du français, la politique de confidentialité existe en anglais : on la donne
// plutôt que le texte français. Les autres documents n'existent qu'en français.
const pageLegale = (page) => (page === 'confidentialite' && langue() !== 'fr' ? 'privacy' : page);

async function ouvreLegal(page) {
  legalBody.innerHTML = `<p class="legal-attente">…</p>`;
  legalBody.scrollTop = 0;
  legalSheet.classList.add('open');
  syncBackdrop();
  try {
    const r = await fetch(`legal/${pageLegale(page)}.html`);
    if (!r.ok) throw new Error(String(r.status));
    // DOMParser n'exécute aucun script ; et ces pages sont les nôtres, embarquées.
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const main = doc.querySelector('main');
    if (!main) throw new Error('main');
    // Le pied de page des pages web renvoie au site (« ../ ») : dans l'appli il n'a
    // pas de sens, le panneau se referme d'un geste.
    main.querySelector('a[href="../"]')?.remove();
    legalBody.innerHTML = main.innerHTML;
    legalBody.lang = doc.documentElement.lang || 'fr';
  } catch {
    legalBody.innerHTML = `<p class="legal-attente">${t('legalIndispo')}</p>`;
  }
}

// Les liens entre documents restent dans le panneau ; un lien vers l'extérieur (la
// CNIL) part dans Safari, qui l'accepte puisqu'il est en https.
legalBody.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a) return;
  const href = a.getAttribute('href');
  const interne = href.match(/^([a-z-]+)\.html$/);
  if (interne) { e.preventDefault(); ouvreLegal(interne[1]); return; }
  if (/^https:\/\//.test(href)) {
    e.preventDefault();
    const B = window.Capacitor?.Plugins?.Browser;
    if (B) B.open({ url: href }).catch(() => {});
    else window.open(href, '_blank', 'noopener');
  }
});

// Une seule fabrique de liste : le rendu complet et la frappe s'en servent tous deux.
function picksHTML(res) {
  return res.map((e) => `
    <button class="pick" data-pick="${e.id}">
      <img src="${sprites.still(e.sprite)}" alt="" loading="lazy" ${imgFallback(e.num, false)} />
      <span>${esc(e.name)}<i>${esc(e.sub)}</i></span>
    </button>`).join('');
}

// Sans recherche : la génération choisie, en entier. Avec recherche : on cherche dans
// TOUTES les générations, sinon on ne trouverait pas ce qu'on ne sait pas situer.
function picksPourEtat() {
  const q = fold(state.addQuery || '');
  if (q) return { res: CATALOGUE.filter((e) => e.cle.includes(q)).slice(0, 80), cherche: true };
  return { res: CATALOGUE.filter((e) => e.gen === state.addGen), cherche: false };
}

function renderAddSheet(keepFocus) {
  const { res, cherche } = picksPourEtat();
  addBody.innerHTML = `
    <h2 class="bs-title">${state.addIndex === null ? t('choisirAPlacer') : t('ajouterIci')}</h2>
    <label class="bs-field">
      <span>${t('rechercher')}</span>
      <input class="bs-name add-q" type="text" value="${esc(state.addQuery || '')}"
             placeholder="${t('placeholderPokemon')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
    </label>
    <div class="paper-gens" role="tablist">
      ${GENS.map((g) => `
        <button class="paper-gen ${!cherche && g.n === state.addGen ? 'on' : ''}" role="tab"
                aria-selected="${!cherche && g.n === state.addGen}" data-agen="${g.n}">
          ${t('genCourt', g.n)}<small>${g.name}</small>
        </button>`).join('')}
    </div>
    ${cherche ? `<p class="paper-note">${t('resultatsToutesGens')}</p>` : ''}
    <div class="picks">${picksHTML(res)}</div>
    ${res.length ? '' : `<p class="paper-note">${t('aucunResultat')}</p>`}
    ${res.length === 80 ? `<p class="paper-note">${t('premiers80')}</p>` : ''}
  `;
  if (keepFocus) {
    const i = addBody.querySelector('.add-q');
    i.focus();
    i.setSelectionRange(i.value.length, i.value.length);
  }
}

// La frappe ne reconstruit que la liste, pas le champ : sinon il perdrait le focus.
addBody.addEventListener('input', (e) => {
  if (!e.target.classList.contains('add-q')) return;
  state.addQuery = e.target.value;
  addBody.querySelector('.picks').innerHTML = picksHTML(picksPourEtat().res);
});

addSheet.addEventListener('click', (e) => {
  const g = e.target.closest('[data-agen]');
  if (g) {
    state.addGen = +g.dataset.agen;
    state.addQuery = '';   // la recherche couvrait toutes les générations
    renderAddSheet();
    return;
  }

  const b = e.target.closest('[data-pick]');
  if (!b) return;
  const choix = asKey(b.dataset.pick);
  if (state.addIndex === null) {
    // Ouvert sans emplacement : on demande où poser, la case suivante décidera.
    state.placing = choix;
  } else {
    insertAt(state.gen, state.addIndex, choix);
  }
  state.held = null;
  closeAddSheet();
  render();
});

function openBoxSheet() {
  // On ouvre sur la génération du fond déjà posé, pour qu'il apparaisse sélectionné ;
  // sinon sur celle de la boîte, en remontant à la III (première à avoir des fonds).
  const pose = PAPER_GEN.get(boxInfo(state.gen, state.box[state.gen]).paper);
  state.paperGen = pose ?? Math.max(3, ONGLETS[state.gen].n);
  renderBoxSheet();
  boxBody.scrollTop = 0;
  boxSheet.classList.add('open');
  syncBackdrop();
}

function renderBoxSheet() {
  const gen = state.gen, box = state.box[gen];
  const info = boxInfo(gen, box);
  const pg = state.paperGen ?? ONGLETS[gen].n; // numéro de génération, pas un index

  boxBody.innerHTML = `
    <h2 class="bs-title">${t('personnaliserBoite')}</h2>

    <label class="bs-field">
      <span>${t('nom')}</span>
      <input class="bs-name" type="text" maxlength="24" value="${esc(info.name || '')}"
             placeholder="${t('boiteN', box + 1)}" autocomplete="off" />
    </label>

    ${state.order[state.gen] ? `<button class="reset-btn" data-act="reset-order">${t('retablirOrdre', esc(ONGLETS[state.gen].titre ?? t('laGen', ONGLETS[state.gen].n)))}</button>` : ''}

    <h3>${t('fond')}</h3>
    <div class="paper-gens" role="tablist">
      ${GENS.map((g) => `
        <button class="paper-gen ${g.n === pg ? 'on' : ''}" role="tab" aria-selected="${g.n === pg}" data-pgen="${g.n}">
          ${t('genCourt', g.n)}<small>${g.name}</small>
        </button>`).join('')}
    </div>

    <div class="papers">
      <button class="paper ${!info.paper ? 'on' : ''}" data-paper="">
        <span class="paper-swatch none"></span><small>${t('aucunFond')}</small>
      </button>
      ${(wallpapers[pg] || []).map((w) => `
        <button class="paper ${info.paper === w.id ? 'on' : ''}" data-paper="${w.id}">
          <span class="paper-swatch shot" style="background-image:${paperCss(w.id)}"></span>
          <small>${w.name}<i>${w.game}</i></small>
        </button>`).join('')}
    </div>
    ${wallpapers[pg] ? '' : `<p class="paper-note">${t('sansFond', pg)}</p>`}
  `;
}

boxSheet.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="reset-order"]')) {
    resetOrder(state.gen);
    state.held = null;
    render();
    renderBoxSheet();
    return;
  }

  const pgen = e.target.closest('[data-pgen]');
  if (pgen) { state.paperGen = +pgen.dataset.pgen; renderBoxSheet(); return; }

  const paper = e.target.closest('[data-paper]');
  if (paper) {
    setBox(state.gen, state.box[state.gen], { paper: paper.dataset.paper });
    render();
    // On referme : le choix est fait, et laisser le panneau ouvert cachait
    // justement la boîte dont on vient de changer le fond.
    closeBoxSheet();
  }
});

// Saisie du nom : on enregistre au fil de la frappe sans reconstruire le panneau,
// sinon le champ perdrait le focus à chaque caractère.
boxBody.addEventListener('input', (e) => {
  if (!e.target.classList.contains('bs-name')) return;
  setBox(state.gen, state.box[state.gen], { name: e.target.value.trim() });
  const title = app.querySelector('.box-title');
  if (title) title.childNodes[0].nodeValue = boxLabel(state.gen, state.box[state.gen]);
});

// ---------- Interactions ----------

function toggle(id, { annulable = false } = {}) {
  const set = caughtSet();
  const prise = !set.has(id);
  set.has(id) ? set.delete(id) : set.add(id);
  // La case qui vient d'être COCHÉE rebondit une fois. Décocher n'anime rien : on
  // corrige une erreur, ce n'est pas une prise.
  state.pris = prise ? id : null;
  save();
  render();

  // Décocher depuis la GRILLE se signale, avec de quoi revenir en arrière. En mode
  // Capturer, un simple toucher retire un Pokémon de la collection, et le seul indice
  // en est un sprite de 50 px qui repasse au gris : un toucher égaré en faisant
  // défiler passait inaperçu, et c'est une capture chromatique qu'on pouvait perdre
  // ainsi. Le bandeau rend la chose visible, et réversible d'un geste.
  //
  // La vue est relevée MAINTENANT : si l'on bascule entre normal et chromatique avant
  // d'annuler, la capture doit revenir dans la collection d'où elle est partie.
  if (!prise && annulable) {
    const vue = state.view;
    proposeAnnulation(t('retireDeLaCollection', monName(id)), () => {
      (vue === 'shiny' ? state.caughtShiny : state.caught).add(id);
      save();
      render();
    });
  }
}

// ---------- Annulation ----------
//
// Un bandeau unique, en bas de l'écran, au gabarit des « snackbars » d'iOS et
// d'Android : un message, un bouton, et il s'efface seul. Un nouvel appel remplace
// le précédent — seule la dernière action s'annule, comme partout ailleurs.
const bandeauAnnule = h(`<div class="annule" role="status" aria-live="polite"><span></span><button type="button"></button></div>`);
document.body.append(bandeauAnnule);
let minuteurAnnule = 0;
let aRetablir = null;

function proposeAnnulation(texte, retablir) {
  aRetablir = retablir;
  bandeauAnnule.querySelector('span').textContent = texte;
  bandeauAnnule.querySelector('button').textContent = t('annuler');
  bandeauAnnule.classList.add('visible');
  clearTimeout(minuteurAnnule);
  // 5 s : le temps de lire une ligne et de tendre le pouce, pas davantage — au-delà,
  // le bandeau masquerait le bas de la vue pour rien.
  minuteurAnnule = setTimeout(cacheAnnulation, 5000);
}

function cacheAnnulation() {
  clearTimeout(minuteurAnnule);
  bandeauAnnule.classList.remove('visible');
  aRetablir = null;
}

bandeauAnnule.querySelector('button').addEventListener('click', () => {
  const f = aRetablir;
  cacheAnnulation();
  retourHaptique();
  f?.();
});

app.addEventListener('click', (e) => {
  const tab = e.target.closest('.gen-tab');
  if (tab) { state.gen = +tab.dataset.gen; render(); return; }

  const arrow = e.target.closest('.box-arrow');
  // Pendant qu'on porte une boîte, la flèche la déplace (géré au pointerdown) : elle
  // ne doit pas en plus faire défiler jusqu'à la boîte voisine.
  if (arrow) { if (!boxPress?.armed) slide(+arrow.dataset.dir); return; }

  // La croix retire de la boîte sans déclencher le bouton qui l'entoure.
  const croix = e.target.closest('[data-remove]');
  if (croix) {
    e.stopPropagation();
    removeAt(state.gen, +croix.dataset.remove);
    if (state.held !== null) state.held = null;
    render();
    return;
  }

  const slot = e.target.closest('.slot[data-slot]');
  if (slot) {
    const index = +slot.dataset.slot;
    const key = slot.dataset.id === undefined ? undefined : asKey(slot.dataset.id);

    // Un placement en cours l'emporte sur le mode : c'est le chemin « ajouter
    // n'importe quel Pokémon n'importe où », utilisable depuis n'importe quelle boîte.
    if (state.placing !== null) {
      insertAt(state.gen, index, state.placing);
      state.placing = null;
      state.held = null;
      render();
      return;
    }

    if (state.mode === 'move') {
      if (state.held === null) {
        if (key !== undefined) { state.held = index; render(); }
        else openAddSheet(index); // case libre : on ajoute plutôt que de déplacer
      } else if (state.held === index) {
        state.held = null; render();          // reprise : on repose
      } else {
        moveTo(state.gen, state.held, index);
        state.held = null;
        render();
      }
      return;
    }

    // Hors mode Ranger, une case libre ouvre le sélecteur, sinon capture ou fiche.
    if (key === undefined) { openAddSheet(index); return; }
    state.mode === 'catch' ? toggle(key, { annulable: true }) : openSheet(key);
    return;
  }

  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'add') { openAddSheet(null); return; }
  if (act === 'add-box') {
    ajouteBoite(state.gen);
    state.box[state.gen] = boxCount(state.gen) - 1;   // on se pose dans la nouvelle
    render();
    return;
  }
  if (act === 'del-box') {
    const b = state.box[state.gen];
    if (supprimeBoite(state.gen, b)) {
      state.box[state.gen] = Math.min(b, boxCount(state.gen) - 1);
      render();
    }
    return;
  }
  if (act === 'annuler-placement') { state.placing = null; render(); return; }
  // Sauvegarde : les quatre boutons vivent dans la page Réglages.
  if (act === 'export') { exportTout(); return; }
  if (act === 'import') { importTout(); return; }
  if (act === 'box-edit') openBoxSheet();
  if (act === 'mode-set') {
    state.mode = e.target.closest('[data-mode]').dataset.mode;
    state.held = null;
    render();
  }
  if (act === 'view') {
    state.view = shinyView() ? 'normal' : 'shiny';
    // La fiche suit la vue : en shiny dex, on veut voir les formes chromatiques.
    state.shiny = shinyView();
    localStorage.setItem(VIEW_KEY, state.view);
    marqueChange();
    render();
  }
});

// ---------- Appui long : saisir puis glisser ----------
//
// Un appui de 450 ms « saisit » la case : elle se met à briller et le téléphone
// vibre. Le doigt reste posé, on glisse jusqu'à la case voulue, on relâche : les
// deux Pokémon échangent leur place.
//
// L'appui long n'ouvre plus la fiche : il est réservé au déplacement. La fiche
// s'ouvre en mode « voir la fiche » (tap) ou au clic droit. Seule exception, le mode
// Ranger : relâcher sans avoir bougé y ouvre le sélecteur d'insertion, qui n'a pas
// d'autre point d'entrée.
//
// Avant l'armement, tout mouvement annule : c'est un swipe de boîte, pas une saisie.

let pressTimer;
let press = null; // { slot, index, key, x, y, armed, dragging, ghost }

// iOS Safari n'implémente PAS navigator.vibrate : sur iPhone le retour haptique
// n'arrivera qu'une fois l'app empaquetée avec Capacitor et @capacitor/haptics.
// On tente les deux, sans rien casser si aucun n'est présent.
function retourHaptique() {
  try { window.Capacitor?.Plugins?.Haptics?.impact?.({ style: 'LIGHT' }); } catch { /* absent */ }
  navigator.vibrate?.(18);
}

// Pendant un glissement, s'attarder sur le bord gauche ou droit du panneau fait
// passer à la boîte précédente ou suivante. C'est le seul moyen de déplacer d'une
// boîte à l'autre sans lâcher : on ne peut pas faire défiler en tenant un Pokémon.
const BORD_MS = 550;   // temps d'attente avant de basculer
const BORD_PX = 46;    // largeur de la zone sensible
let bordTimer = null;
let bordSens = 0;

function stopBord() {
  clearTimeout(bordTimer);
  bordTimer = null;
  bordSens = 0;
  app.querySelector('.box')?.classList.remove('bord-g', 'bord-d');
}

// Appelée à chaque mouvement : arme, désarme ou laisse filer selon la position.
function veilleBord(x) {
  const box = app.querySelector('.box');
  if (!box) return;
  const r = box.getBoundingClientRect();
  const sens = x < r.left + BORD_PX ? -1 : x > r.right - BORD_PX ? 1 : 0;
  if (sens === bordSens) {
    // Même bord : on laisse filer le compte à rebours, mais on remet la classe — un
    // rendu intermédiaire a pu remplacer le panneau et donc l'effacer.
    if (sens) box.classList.add(sens < 0 ? 'bord-g' : 'bord-d');
    return;
  }
  stopBord();
  if (!sens || !target(sens)) return;     // hors zone, ou bout de l'onglet
  bordSens = sens;
  box.classList.add(sens < 0 ? 'bord-g' : 'bord-d');
  bordTimer = setTimeout(() => {
    bordTimer = null;
    navigate(sens);        // change de boîte SANS interrompre le glissement
    stopBord();
    retourHaptique();
  }, BORD_MS);
}

const finPress = () => {
  stopBord();
  clearTimeout(pressTimer);
  if (press?.ghost) press.ghost.remove();
  if (press?.slot) press.slot.classList.remove('tenu', 'glisse');
  app.querySelectorAll('.slot.survol').forEach((n) => n.classList.remove('survol'));
  press = null;
};

function ghostSuit(x, y) {
  if (press?.ghost) press.ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
}
// Le fantôme est en pointer-events:none, elementFromPoint voit donc la case dessous.
function caseSous(x, y) {
  return document.elementFromPoint(x, y)?.closest('.slot[data-slot]') ?? null;
}

app.addEventListener('pointerdown', (e) => {
  const slot = e.target.closest('.slot[data-slot]');
  if (!slot || e.button > 0) return;
  finPress();
  press = {
    slot,
    index: +slot.dataset.slot,
    key: slot.dataset.id === undefined ? undefined : asKey(slot.dataset.id),
    x: e.clientX, y: e.clientY,
    armed: false, dragging: false, ghost: null,
  };
  pressTimer = setTimeout(() => {
    pressTimer = null;
    if (!press) return;
    press.armed = true;
    if (press.key !== undefined) {
      press.slot.classList.add('tenu');
      retourHaptique();
    }
  }, 450);
});

window.addEventListener('pointermove', (e) => {
  if (!press) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;

  if (!press.armed) {
    // Pas encore saisi : un mouvement signifie que l'utilisateur fait défiler.
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) finPress();
    return;
  }
  if (press.key === undefined) return;

  if (!press.dragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
    press.dragging = true;
    const src = press.slot.querySelector('img');
    const g = document.createElement('img');
    g.src = src.src;
    g.className = 'drag-ghost';
    document.body.append(g);
    press.ghost = g;
    press.slot.classList.add('glisse');
  }
  if (!press.dragging) return;

  e.preventDefault();
  ghostSuit(e.clientX, e.clientY);
  veilleBord(e.clientX);
  const cible = caseSous(e.clientX, e.clientY);
  app.querySelectorAll('.slot.survol').forEach((n) => n.classList.remove('survol'));
  if (cible && cible !== press.slot) cible.classList.add('survol');
}, { passive: false });

window.addEventListener('pointerup', (e) => {
  if (!press) return;
  const p = press;
  clearTimeout(pressTimer);

  if (p.dragging) {
    const cible = caseSous(e.clientX, e.clientY);
    finPress();
    if (cible && +cible.dataset.slot !== p.index) {
      swapOrMove(state.gen, p.index, +cible.dataset.slot);
    }
    render();
    // Le clic qui suit le relâchement ne doit pas capturer le Pokémon.
    p.slot.addEventListener('click', (ev) => ev.stopPropagation(), { once: true, capture: true });
    return;
  }

  if (p.armed) {
    finPress();
    // En mode Ranger seulement : insérer ici. Ailleurs, on repose simplement le
    // Pokémon — l'appui long n'ouvre plus la fiche.
    if (state.mode === 'move') openAddSheet(p.index);
    p.slot.addEventListener('click', (ev) => ev.stopPropagation(), { once: true, capture: true });
    return;
  }
  finPress();
});

window.addEventListener('pointercancel', finPress);

// ---------- Déplacer une boîte entière ----------
//
// Appui long sur le NOM de la boîte : on la « porte ». Deux façons de la déplacer
// ensuite, sans jamais relâcher le nom :
//
//   - glisser vers la gauche ou la droite : chaque PAS_BOITE parcourus la font
//     avancer d'un cran, et l'affichage la suit ;
//   - appuyer sur une flèche avec un SECOND doigt : un cran par appui.
//
// La version précédente demandait de lâcher la boîte sur une des pastilles du bas.
// Ces pastilles font 6 px (12 px une fois armées) et se trouvent sous toute la
// grille : viser au doigt était irréaliste. Elles restent un indicateur de position,
// plus une cible.

const PAS_BOITE = 70; // px de glissement horizontal pour avancer d'un cran

let boxTimer;
let boxPress = null; // { id, titre, x, y, armed, dragging, bouge }

const finBoxPress = () => {
  clearTimeout(boxTimer);
  boxPress?.titre?.classList.remove('tenu');
  app.querySelector('.box')?.classList.remove('porte');
  app.querySelector('.box-dots')?.classList.remove('cible');
  boxPress = null;
};

// render() détruit le titre tenu : après chaque rendu, on reprend le nouveau et on
// lui rend sa marque, sinon la boîte cesserait visuellement d'être portée.
const marqueTenue = () => {
  if (!boxPress) return;
  boxPress.titre = app.querySelector('.box-title');
  boxPress.titre?.classList.add('tenu');
  app.querySelector('.box')?.classList.add('porte');
  app.querySelector('.box-dots')?.classList.add('cible');
};

// Avance la boîte portée d'un cran. On la suit : `state.box` la accompagne, donc
// l'écran montre toujours la boîte qu'on tient.
function deplaceBoiteDe(dir) {
  if (!boxPress?.armed) return false;
  const de = state.box[state.gen];
  const vers = de + dir;
  if (vers < 0 || vers >= boxCount(state.gen)) return false;
  bougeBoite(state.gen, de, vers);
  state.box[state.gen] = vers;
  boxPress.bouge = true;
  render();
  marqueTenue();
  retourHaptique();
  return true;
}

app.addEventListener('pointerdown', (e) => {
  // Second doigt sur une flèche pendant qu'on porte une boîte : elle avance d'un
  // cran. Testé AVANT le nom, sinon le geste serait pris pour un nouvel appui.
  if (boxPress?.armed) {
    const fleche = e.target.closest('.box-arrow:not(:disabled)');
    if (fleche) { e.preventDefault(); deplaceBoiteDe(+fleche.dataset.dir); return; }
  }

  const titre = e.target.closest('.box-title');
  if (!titre || e.button > 0) return;
  finBoxPress();
  boxPress = { id: e.pointerId, titre, x: e.clientX, y: e.clientY, armed: false, dragging: false, bouge: false };
  boxTimer = setTimeout(() => {
    boxTimer = null;
    if (!boxPress) return;
    boxPress.armed = true;
    marqueTenue();
    retourHaptique();
  }, 450);
});

window.addEventListener('pointermove', (e) => {
  if (!boxPress || e.pointerId !== boxPress.id) return;
  if (!boxPress.armed) {
    // Avant l'armement, tout mouvement annule : sans quoi un swipe de boîte
    // démarrerait un déplacement.
    const dx = e.clientX - boxPress.x, dy = e.clientY - boxPress.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) finBoxPress();
    return;
  }
  e.preventDefault();
  boxPress.dragging = true;

  // On recale l'origine à chaque cran franchi : le geste peut donc enchaîner
  // plusieurs boîtes d'un seul glissement continu.
  let d = e.clientX - boxPress.x;
  while (Math.abs(d) >= PAS_BOITE) {
    const dir = d > 0 ? 1 : -1;
    if (!deplaceBoiteDe(dir)) { boxPress.x = e.clientX; break; } // butée : on repart de zéro
    boxPress.x += dir * PAS_BOITE;
    d = e.clientX - boxPress.x;
  }
}, { passive: false });

window.addEventListener('pointerup', (e) => {
  // Seul le pointeur qui tient le nom termine le geste : lever le second doigt après
  // avoir touché une flèche lâcherait sinon la boîte au premier appui.
  if (!boxPress || e.pointerId !== boxPress.id) return;
  const b = boxPress;
  clearTimeout(boxTimer);
  finBoxPress();
  if (!b.armed) return;
  // Le clic qui suit tout pointerup rouvrirait le panneau une seconde fois.
  b.titre?.addEventListener('click', (ev) => ev.stopPropagation(), { once: true, capture: true });
  // Relâché sans avoir rien déplacé : c'était un appui long simple, on ouvre le panneau.
  if (!b.dragging && !b.bouge) openBoxSheet();
});

window.addEventListener('pointercancel', (e) => { if (boxPress && e.pointerId === boxPress.id) finBoxPress(); });

// ---------- Déplacer un onglet ----------
//
// Appui long sur un onglet : on le « porte ». On le fait ensuite glisser sur ses
// voisins, qui lui cèdent la place.
//
// Manipulation DIRECTE, et non pas fixe comme pour les boîtes : les onglets n'ont
// pas tous la même largeur (« Gén. 1 » contre « Let's Go »), un pas en pixels
// tomberait juste ici et faux là. On regarde donc simplement quel onglet se trouve
// sous le doigt.
//
// L'ordre obtenu ne touche QUE l'affichage : les index d'ONGLETS, qui indexent les
// boîtes et leur contenu, restent intacts.

let tabTimer;
let tabPress = null; // { id, x, y, armed, bouge }

const finTabPress = () => {
  clearTimeout(tabTimer);
  tabPress = null;
  if (state.ongletTenu !== null) { state.ongletTenu = null; render(); }
};

function deplaceOngletSous(x, y) {
  if (!tabPress?.armed || state.ongletTenu === null) return;
  const sous = document.elementFromPoint(x, y)?.closest('.gen-tab');
  if (!sous) return;
  const de = state.ordreOnglets.indexOf(state.ongletTenu);
  if (!bougeOnglet(de, +sous.dataset.rang)) return;
  tabPress.bouge = true;
  render();
  retourHaptique();
}

app.addEventListener('pointerdown', (e) => {
  const tab = e.target.closest('.gen-tab');
  if (!tab || e.button > 0) return;
  finTabPress();
  const gen = +tab.dataset.gen;
  tabPress = { id: e.pointerId, x: e.clientX, y: e.clientY, armed: false, bouge: false };
  tabTimer = setTimeout(() => {
    tabTimer = null;
    if (!tabPress) return;
    tabPress.armed = true;
    state.ongletTenu = gen;
    render();
    retourHaptique();
  }, 450);
});

window.addEventListener('pointermove', (e) => {
  if (!tabPress || e.pointerId !== tabPress.id) return;
  if (!tabPress.armed) {
    // Avant l'armement, tout mouvement annule : la barre doit rester défilable.
    const dx = e.clientX - tabPress.x, dy = e.clientY - tabPress.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) finTabPress();
    return;
  }
  e.preventDefault();
  deplaceOngletSous(e.clientX, e.clientY);
}, { passive: false });

window.addEventListener('pointerup', (e) => {
  if (!tabPress || e.pointerId !== tabPress.id) return;
  const arme = tabPress.armed;
  finTabPress();
  // Le clic qui suit tout pointerup changerait d'onglet : on l'absorbe dès qu'on a
  // porté, même sans avoir rien déplacé — l'appui long n'est pas une sélection.
  if (arme) {
    app.addEventListener('click', (ev) => {
      if (ev.target.closest('.gen-tab')) { ev.stopPropagation(); ev.preventDefault(); }
    }, { once: true, capture: true });
  }
});

window.addEventListener('pointercancel', (e) => { if (tabPress && e.pointerId === tabPress.id) finTabPress(); });

// La barre défile en `touch-action: pan-x` : pendant qu'on porte un onglet, ce
// défilement se battrait avec le geste. On le supprime à la source, comme pour le
// swipe des boîtes. Ne pas repasser ce listener en `passive: true`.
app.addEventListener('touchmove', (e) => {
  if (tabPress?.armed) e.preventDefault();
}, { passive: false });
app.addEventListener('contextmenu', (e) => {
  const slot = e.target.closest('.slot[data-id]');
  if (slot) { e.preventDefault(); openSheet(asKey(slot.dataset.id)); }
});

sheet.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'toggle') { toggle(state.open); openSheet(state.open); }
  if (act === 'shiny') { state.shiny = !state.shiny; openSheet(state.open); }
  if (act === 'cri') joueCri(state.open, e.target.closest('[data-act="cri"]'));
  const ajout = e.target.closest('[data-form-add]');
  if (ajout) {
    const k = asKey(ajout.dataset.formAdd);
    const espece = speciesOf(k);
    dansUneBoite(k) ? sortForme(k) : rangeForme(espece, k);
    render();
    openSheet(state.open);
    return;
  }

  const toutes = e.target.closest('[data-forms-all]');
  if (toutes) {
    const espece = asKey(toutes.dataset.formsAll);
    for (const x of forms[espece] ?? []) rangeForme(espece, x.key);
    render();
    openSheet(state.open);
    return;
  }

  // Déplier l'effet d'une attaque. On agit sur le DOM plutôt que de rappeler
  // openSheet() : reconstruire la fiche refermerait les groupes et perdrait la
  // position de défilement, au beau milieu d'une liste de soixante attaques.
  const mv = e.target.closest('[data-move]');
  if (mv) {
    const desc = mv.parentElement.querySelector('.mdesc');
    if (desc) {
      const ouvert = !desc.hidden;
      desc.hidden = ouvert;
      mv.setAttribute('aria-expanded', String(!ouvert));
      mv.classList.toggle('ouvert', !ouvert);
    }
    return;
  }

  const evoBtn = e.target.closest('[data-evo]');
  if (evoBtn) { const n = asKey(evoBtn.dataset.evo); if (n !== state.open) openSheet(n); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSheet(); closeBoxSheet(); closeAddSheet();
    if (state.placing !== null) { state.placing = null; render(); }
  }
});

// ---------- Glisser du bord gauche : revenir à l'accueil ----------
//
// Le geste de retour d'iOS, et il PART DU BORD pour de bonnes raisons : la vue Boîtes
// utilise déjà le glissement horizontal pour changer de boîte, et les barres d'onglets,
// la table des types et les filtres défilent eux aussi à l'horizontale. En n'écoutant
// que les 26 premiers pixels, les deux gestes ne se disputent jamais.
//
// La vue suit le doigt (transform seul, donc à 60 images par seconde), puis part à
// droite ou revient en place. Les panneaux ouverts ont leur propre retour : tant qu'il
// y en a un, ce geste se tait.
const BORD_RETOUR = 26;   // largeur de la zone d'amorce, en pixels
const RETOUR_AT = 70;     // distance au-delà de laquelle on revient à l'accueil
const VUES_RETOUR = new Set(['boites', 'pokedex', 'attaques', 'combat', 'reglages']);
const bordRetour = { actif: false, x0: 0, y0: 0, dx: 0, vue: null };

const panneauOuvert = () => !!document.querySelector('.sheet.open');

function poseRetour(dx) {
  if (!bordRetour.vue) return;
  bordRetour.vue.style.transform = dx ? `translate3d(${dx}px,0,0)` : '';
  bordRetour.vue.style.opacity = dx ? String(Math.max(0.5, 1 - dx / 520)) : '';
}

function fermeRetour(revient) {
  const vue = bordRetour.vue;
  bordRetour.actif = false;
  bordRetour.vue = null;
  if (!vue) return;
  vue.style.transition = `transform ${NAV_OUT}ms ease-out, opacity ${NAV_OUT}ms ease-out`;
  if (revient) {
    // On part vers la droite, puis la page précédente se rend par-dessus.
    vue.style.transform = 'translate3d(100%,0,0)';
    vue.style.opacity = '0';
    setTimeout(retourEnArriere, NAV_OUT);
  } else {
    vue.style.transform = '';
    vue.style.opacity = '';
    setTimeout(() => { vue.style.transition = ''; }, NAV_OUT);
  }
}

// La « page d'avant » n'est pas toujours l'accueil : une fiche d'attaque revient à la
// liste des attaques, et une grille du Pokédex à son menu — exactement ce que font les
// boutons « ‹ » de ces deux écrans. Partout ailleurs, on rentre à l'accueil.
function retourEnArriere() {
  if (state.vue === 'attaques' && state.bs?.mode === 'infoAttaque') { retourMenuAttaques(); return; }
  if (state.vue === 'pokedex' && state.dexGen !== null) { state.dexGen = null; state.dexQ = ''; render(); return; }
  vaVers('accueil');
}

app.addEventListener('touchstart', (e) => {
  if (!VUES_RETOUR.has(state.vue) || panneauOuvert()) return;
  if (e.touches.length !== 1 || press?.dragging || boxPress?.armed || sliding) return;
  if (e.touches[0].clientX > BORD_RETOUR) return;
  const vue = app.querySelector('.vue');
  if (!vue) return;
  Object.assign(bordRetour, { actif: true, x0: e.touches[0].clientX, y0: e.touches[0].clientY, dx: 0, vue });
  vue.style.transition = 'none';
}, { passive: true });

app.addEventListener('touchmove', (e) => {
  if (!bordRetour.actif) return;
  const dx = e.touches[0].clientX - bordRetour.x0;
  const dy = e.touches[0].clientY - bordRetour.y0;
  // Geste franchement vertical : c'est un défilement, on rend la main.
  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) { poseRetour(0); fermeRetour(false); return; }
  if (dx <= 0) { bordRetour.dx = 0; poseRetour(0); return; }
  e.preventDefault();          // sans quoi la page défilerait sous le doigt
  bordRetour.dx = dx;
  poseRetour(dx);
}, { passive: false });

app.addEventListener('touchend', () => {
  if (!bordRetour.actif) return;
  fermeRetour(bordRetour.dx > RETOUR_AT);
}, { passive: true });

app.addEventListener('touchcancel', () => { if (bordRetour.actif) fermeRetour(false); }, { passive: true });

// ---------- Swipe horizontal, sans dérive verticale ----------

let sx = 0, sy = 0, locked = null;
app.addEventListener('touchstart', (e) => {
  if (sliding || press?.dragging || boxPress?.armed || !e.target.closest('.box')) return;
  sx = e.touches[0].clientX;
  sy = e.touches[0].clientY;
  locked = null;
}, { passive: true });

app.addEventListener('touchmove', (e) => {
  if (press?.dragging || boxPress?.armed || bordRetour.actif) return; // déplacement ou retour en cours
  if (!e.target.closest('.box')) return;
  const dx = e.touches[0].clientX - sx;
  const dy = e.touches[0].clientY - sy;
  if (locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
    locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }
  // Geste horizontal : on bloque tout mouvement de la page et la grille suit le doigt.
  if (locked === 'x') { e.preventDefault(); dragGrid(dx); }
}, { passive: false });

app.addEventListener('touchend', (e) => {
  if (locked !== 'x' || bordRetour.actif || !e.target.closest('.box')) return;
  locked = null;
  const dx = e.changedTouches[0].clientX - sx;
  if (Math.abs(dx) < 50) snapGrid();
  else slide(dx < 0 ? 1 : -1, dx);
}, { passive: true });

app.addEventListener('touchcancel', () => { locked = null; snapGrid(); }, { passive: true });

const boxCount = (gen) => Math.max(1, Math.ceil(genList(gen).length / BOX_SIZE));
// Rang du dernier élément réel : sert au sous-titre, qui doit ignorer le remplissage.
const tailleBrute = (gen) => genList(gen).length;

// Destination d'un déplacement d’une boîte, ou null si on est en bout de Pokédex.
// Au bord d'une génération, on déborde sur la voisine (dernière / première boîte).
function target(dir) {
  const next = state.box[state.gen] + dir;
  if (next >= 0 && next < boxCount(state.gen)) return { gen: state.gen, box: next };
  // Au bord d'un onglet on déborde sur le voisin AFFICHÉ, et non sur l'index
  // suivant dans ONGLETS : depuis que les onglets se réordonnent, les deux
  // diffèrent, et suivre les index ferait sauter à un onglet éloigné à l'écran.
  const rang = state.ordreOnglets.indexOf(state.gen) + dir;
  if (rang < 0 || rang >= state.ordreOnglets.length) return null;
  const voisin = state.ordreOnglets[rang];
  return { gen: voisin, box: dir > 0 ? 0 : boxCount(voisin) - 1 };
}

function navigate(dir) {
  const t = target(dir);
  if (!t) return;
  state.gen = t.gen;
  state.box[t.gen] = t.box;
  render();
}

// ---------- Animation du passage d’une boîte à l’autre ----------

const OUT_MS = 150; // la grille finit de sortir
const IN_MS = 230;  // la suivante entre en décélérant
const smooth = matchMedia('(prefers-reduced-motion: reduce)');
const gridEl = () => app.querySelector('.grid');
const paperEl = () => app.querySelector('.box-paper');
// La plaque de titre glisse avec le reste. Elle est le FOND du bouton, donc c'est
// lui qu'on translate : le nom part avec sa plaque, comme la grille part avec le
// sien. Les séparer ferait flotter le nom au-dessus d'une plaque en mouvement.
const titleEl = () => app.querySelector('.box-title');
let sliding = false;

// Colle la grille au doigt. Sans destination (bout du Pokédex), on freine le geste.
function dragGrid(dx) {
  const g = gridEl();
  if (!g || sliding) return;
  const d = target(dx > 0 ? -1 : 1) ? dx : dx / 3;
  g.classList.add('no-anim');
  g.style.transform = `translateX(${d}px)`;
  g.style.opacity = String(Math.max(0.4, 1 - Math.abs(d) / 620));
  // Le fond suit le doigt, un peu en retrait : il est plus large que la grille, un
  // déplacement identique le ferait paraître plus rapide.
  const f = paperEl();
  if (f) {
    f.classList.add('no-anim');
    f.style.transform = `translateX(${d * 0.85}px)`;
  }
  // La plaque suit au même rythme que la grille : plus étroite que le fond, elle
  // n'a pas besoin du retrait appliqué à celui-ci.
  const t = titleEl();
  if (t) {
    t.classList.add('no-anim');
    t.style.transform = `translateX(${d}px)`;
  }
}

// Relâché sans franchir le seuil : la grille revient en place.
function snapGrid() {
  for (const el of [gridEl(), paperEl(), titleEl()]) {
    if (!el) continue;
    el.classList.remove('no-anim');
    el.style.transform = '';
    el.style.opacity = '';
  }
}

// Franchi : on prolonge la sortie, on rend la nouvelle boîte, puis on la fait entrer.
// `dx` est la distance déjà parcourue au doigt : la sortie doit toujours aller au-delà,
// sinon la grille reviendrait en arrière au relâché.
function slide(dir, dx = 0) {
  const g = gridEl();
  if (sliding) return;
  if (!target(dir)) { snapGrid(); return; }
  if (!g || smooth.matches) { navigate(dir); return; }

  const w = g.getBoundingClientRect().width || 320;
  const out = -dir * Math.max(w * 0.5, Math.abs(dx) + 60);

  sliding = true;
  g.classList.remove('no-anim');
  g.style.transition = `transform ${OUT_MS}ms ease-in, opacity ${OUT_MS}ms ease-in`;
  g.style.transform = `translateX(${out}px)`;
  g.style.opacity = '0';

  const fOut = paperEl();
  if (fOut) {
    fOut.classList.remove('no-anim');
    fOut.style.transition = `transform ${OUT_MS}ms ease-in, opacity ${OUT_MS}ms ease-in`;
    fOut.style.transform = `translateX(${out}px)`;
    fOut.style.opacity = '0';
  }

  const tOut = titleEl();
  if (tOut) {
    tOut.classList.remove('no-anim');
    tOut.style.transition = `transform ${OUT_MS}ms ease-in, opacity ${OUT_MS}ms ease-in`;
    tOut.style.transform = `translateX(${out}px)`;
    tOut.style.opacity = '0';
  }

  setTimeout(() => {
    navigate(dir); // render() reconstruit la grille
    const n = gridEl();
    if (!n) { sliding = false; return; }
    // Position de départ posée sans animation, puis on relâche vers 0.
    n.classList.add('no-anim');
    n.style.transform = `translateX(${dir * 55}%)`;
    n.style.opacity = '0';
    // Force le calcul du style de départ. Volontairement pas de requestAnimationFrame :
    // il ne se déclenche pas onglet en arrière-plan, et la grille resterait invisible.
    void n.offsetWidth;
    n.classList.remove('no-anim');
    n.style.transition = `transform ${IN_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${IN_MS}ms ease-out`;
    n.style.transform = '';
    n.style.opacity = '';

    // Le fond de la nouvelle boîte entre par le même bord que la grille.
    const fIn = paperEl();
    if (fIn) {
      fIn.classList.add('no-anim');
      fIn.style.transform = `translateX(${dir * 55}%)`;
      fIn.style.opacity = '0';
      void fIn.offsetWidth;
      fIn.classList.remove('no-anim');
      fIn.style.transition = `transform ${IN_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${IN_MS}ms ease-out`;
      fIn.style.transform = '';
      fIn.style.opacity = '';
    }

    // Même entrée pour la plaque, par le même bord.
    const tIn = titleEl();
    if (tIn) {
      tIn.classList.add('no-anim');
      tIn.style.transform = `translateX(${dir * 55}%)`;
      tIn.style.opacity = '0';
      void tIn.offsetWidth;
      tIn.classList.remove('no-anim');
      tIn.style.transition = `transform ${IN_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${IN_MS}ms ease-out`;
      tIn.style.transform = '';
      tIn.style.opacity = '';
    }

    setTimeout(() => {
      n.style.transition = '';
      if (fIn) fIn.style.transition = '';
      sliding = false;
    }, IN_MS);
  }, OUT_MS);
}

// ---------- Sauvegarde ----------

// Remet un fichier JSON à l'utilisateur, sur le web comme dans l'appli iPhone.
//
// Sur le web, un lien `download` vers un blob suffit. Dans l'appli, la vue web de
// Capacitor l'IGNORE en silence : aucun téléchargement, aucune erreur — les boutons
// Exporter ne faisaient tout simplement rien sur l'iPhone. On y écrit donc le
// fichier dans le cache (@capacitor/filesystem), puis on ouvre la feuille de partage
// d'iOS (@capacitor/share) : « Enregistrer dans Fichiers », AirDrop, Mail…
// Les plugins sont lus sur `window.Capacitor`, comme Haptics : rien à embarquer
// dans le bundle web.
async function remetFichier(nom, objet) {
  const texte = JSON.stringify(objet);
  const { Filesystem, Share } = window.Capacitor?.Plugins ?? {};
  if (window.Capacitor?.isNativePlatform?.() && Filesystem && Share) {
    try {
      const { uri } = await Filesystem.writeFile({ path: nom, data: texte, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: nom, files: [uri] });
    } catch (e) {
      // Refermer la feuille de partage n'est pas une erreur.
      if (!/cancel/i.test(e?.message ?? '')) alert(t('exportImpossible', e?.message ?? e));
    }
    return;
  }
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([texte], { type: 'application/json' })),
    download: nom,
  });
  a.click();
  // Libéré au tour suivant : révoqué aussitôt, certains navigateurs n'ont pas
  // encore lu le blob quand le téléchargement démarre.
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

// UN seul fichier pour tout ce que l'utilisateur a fait : captures normales et
// chromatiques, réglages et ordre des boîtes, ordre des onglets, les équipes de toutes
// les versions, et les préférences (jeu, vue, thème). Deux exports séparés obligeaient
// à penser aux deux — et l'appli est réinstallée tous les 7 jours.
//
// Les champs gardent les noms des anciens exports : un fichier produit par cette
// version se relit donc aussi par les anciennes, et l'inverse reste vrai.
//
// `donneesCompletes()` est partagée avec la sauvegarde en ligne (`src/sync.js`) : le
// serveur reçoit donc exactement ce que l'export écrit, et l'import relit les deux
// sans distinction. Elle ne porte PAS de date — c'est l'export qui l'ajoute au
// fichier. La synchronisation compare deux charges pour savoir s'il y a quelque chose
// à envoyer, et un horodatage les rendrait toujours différentes.
function donneesCompletes() {
  return {
    // Simple marqueur de format, jamais relu à l'import : `importTout` reconnaît un
    // fichier à ses CHAMPS, pas à son type. L'application a porté le nom Guiguidex
    // jusqu'au 01/10/2026, et les sauvegardes d'alors se relisent sans rien changer.
    type: 'unydex',
    v: 2,
    // Boîtes
    caught: [...state.caught],
    caughtShiny: [...state.caughtShiny],
    boxes: state.boxes,
    order: state.order,
    onglets: state.ordreOnglets,
    // Équipes
    equipes: state.equipes,
    // Préférences
    jeu: state.jeu,
    view: state.view,
    theme: state.theme,
    langue: langue(),
  };
}

function exportTout() {
  const payload = { ...donneesCompletes(), date: new Date().toISOString() };
  remetFichier(`unydex-${new Date().toISOString().slice(0, 10)}.json`, payload);
}
// L'import prend ce qu'il TROUVE : un fichier complet, un ancien export de boîtes
// (objet ou simple tableau d'IDs) ou un ancien export d'équipes. Chaque partie absente
// est laissée telle quelle — importer des équipes seules n'efface pas les boîtes.
function importTout() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
  input.onchange = async () => {
    try {
      const repris = await appliqueDonnees(JSON.parse(await input.files[0].text()));
      alert(t('restaure', repris.map(([cle, ...a]) => t(cle, ...a)).join(', ')));
    } catch {
      alert(t('fichierIllisible'));
    }
  };
  input.click();
}

// Applique une charge, d'où qu'elle vienne : un fichier choisi à la main, ou la
// collection rapportée du compte. Elle LÈVE sur un contenu inexploitable et rend la
// liste de ce qui a été repris — c'est à l'appelant de décider s'il faut le dire.
async function appliqueDonnees(data) {
  // Tableau nu = tout premier format, qui ne portait que les captures.
  const d = Array.isArray(data) ? { caught: data } : data;
  if (!d || typeof d !== 'object') throw new Error('format');
  // Des CLÉS, traduites seulement au moment du message : le fichier peut changer la
  // langue, et la confirmation doit alors partir dans la NOUVELLE.
  const repris = [];

  if (Array.isArray(d.caught)) {
    // Les clés de formes cosmétiques sont des chaînes : ne pas tout forcer en nombre.
    //
    // ELLES SONT FILTRÉES : la charge vient d'un fichier choisi par l'utilisateur ou
    // du serveur, donc d'une source qui n'est pas sous notre contrôle. Une clé
    // fabriquée se retrouvait écrite telle quelle dans l'URL d'un sprite, et de là
    // dans un attribut `onerror` — soit du code exécuté au simple affichage de la
    // boîte. C'est la première des trois barrières, et la seule qui empêche la
    // donnée d'entrer : les deux autres (`cleSure`, `esc`) sont au plus près du DOM.
    state.caught = new Set(d.caught.map(asKey).filter(cleAdmise));
    state.caughtShiny = new Set((d.caughtShiny || []).map(asKey).filter(cleAdmise));
    state.boxes = d.boxes || {};
    // Une case vide (`null`) est légitime et doit survivre au filtrage : elle porte
    // la mise en page des boîtes.
    state.order = Object.fromEntries(
      Object.entries(d.order || {})
        .filter(([g, l]) => Number.isInteger(+g) && Array.isArray(l))
        .map(([g, l]) => [g, l.map((k) => (k == null ? null : asKey(k))).map((k) => (k == null || cleAdmise(k) ? k : null))]),
    );
    save();
    saveBoxes();
    saveOrder();
    repris.push(['partieBoites']);
  }

  // L'ordre des onglets : repris index par index, comme au chargement.
  if (Array.isArray(d.onglets)) {
    const vus = new Set();
    const liste = d.onglets.filter((i) => Number.isInteger(i) && ONGLETS[i] && !vus.has(i) && vus.add(i));
    ONGLETS.forEach((_, i) => { if (!vus.has(i)) liste.push(i); });
    state.ordreOnglets = liste;
    saveOrdreOnglets();
  }

  // Les équipes FUSIONNENT : les versions absentes du fichier restent en place.
  const brut = d.equipes && typeof d.equipes === 'object' && !Array.isArray(d.equipes) ? d.equipes : null;
  if (brut) {
    let n = 0;
    for (const [cle, eq] of Object.entries(brut)) {
      // Jeu inconnu : on ignore plutôt que de créer une clé fantôme.
      if (!JEUX.some((v) => v.k === cle) || !Array.isArray(eq)) continue;
      // Le contenu vient d'un fichier : on le rebâtit à six cases et on écarte
      // tout ce qui ne ressemble pas à un membre.
      state.equipes[cle] = Array.from({ length: 6 }, (_, i) => {
        const m = eq[i];
        return m && typeof m === 'object' && m.key != null ? m : null;
      });
      n++;
    }
    if (n) { saveCombat(); repris.push(['partieEquipes', n]); }
  }

  // Préférences : chacune n'est reprise que si elle est valide.
  if (JEUX.some((v) => v.k === d.jeu)) { state.jeu = d.jeu; saveCombat(); }
  if (d.view === 'normal' || d.view === 'shiny') {
    state.view = d.view;
    state.shiny = shinyView();
    localStorage.setItem(VIEW_KEY, state.view);
  }
  if (['clair', 'sombre', 'auto'].includes(d.theme)) {
    state.theme = d.theme;
    localStorage.setItem(THEME_KEY, state.theme);
    appliqueTheme();
  }

  if (!repris.length) throw new Error('vide');
  // La langue en dernier : elle refait le rendu elle-même, une fois la surcouche
  // chargée, et le message de confirmation part alors dans la bonne langue.
  if (estLangue(d.langue) && d.langue !== langue()) {
    await poseLangueEtRend(d.langue);
  } else {
    render();
  }
  return repris;
}

// ---------- Boîte de combat ----------
//
// Seconde vue de l'application, atteinte par la barre du bas. On y compose une
// équipe de six, on lui choisit des attaques, et on change de version de jeu : le
// moveset disponible suit, puisqu'une espèce n'apprend pas les mêmes attaques dans
// Rouge/Bleu et dans Écarlate/Violet.
//
// `learnsets-vg.json` pèse 5,7 Mo (11 jeux par espèce en moyenne) : il est chargé
// par import() À LA DEMANDE, à la première ouverture de la vue, et non au
// démarrage. Vite en fait un chunk séparé, servi depuis le système de fichiers —
// l'application reste donc utilisable hors ligne.

const JEU_DEFAUT = 'scarlet-violet';
const NIV_DEFAUT = 50;
const EQUIPE_VIDE = () => Array.from({ length: 6 }, () => null);

let LEARN_VG = null;
let chargementVG = null;
function chargeVG() {
  if (LEARN_VG) return Promise.resolve(LEARN_VG);
  chargementVG ??= import('./data/learnsets-vg.json').then((m) => {
    LEARN_VG = m.default;
    return LEARN_VG;
  });
  return chargementVG;
}

const jeuCourant = () => JEUX.find((v) => v.k === state.jeu) || JEUX[JEUX.length - 1];

// Stats de base d'un membre. On interroge sa CLÉ avant son espèce : une forme a ses
// propres stats, et l'écart est parfois énorme — Kyurem Blanc monte à 170 en Atq.
// Spé. là où Kyurem plafonne à 130. Sans ça, une valeur relevée en jeu sur une forme
// ressortait « hors plage » sans raison. Le repli sert aux formes cosmétiques.
const statsDe = (key) => stats[key] || stats[speciesOf(key)] || null;

// L'équipe du jeu couramment sélectionné, créée à la volée si elle n'existe pas.
const equipe = () => (state.equipes[state.jeu] ??= EQUIPE_VIDE());

const saveCombat = () => {
  localStorage.setItem(EQUIPES_KEY, JSON.stringify(state.equipes));
  localStorage.setItem(JEU_KEY, state.jeu);
  marqueChange();
};

// ---------- Talents et objets, filtrés par version ----------

// Les talents n'existent qu'à partir de la gén. 3, les talents cachés de la gén. 5.
// Un talent introduit après le jeu choisi n'est pas proposé.
//
// On interroge la CLÉ du membre avant son espèce : une forme a ses propres talents,
// et ils font toute la différence — Kyurem Blanc a Turbo Brasier là où Kyurem a
// Pression, Méga-Dracaufeu X a Griffe Dure là où Dracaufeu a Brasier. Le repli sur
// l'espèce sert aux formes cosmétiques, qui n'ont pas d'entrée propre.
function poolTalents(key) {
  const g = genDuJeu();
  if (g < 3) return [];
  const liste = abilities.of[key] || abilities.of[speciesOf(key)] || [];
  return liste
    .filter(([slug, cache]) => (abilities.list[slug]?.g ?? 3) <= g && (!cache || g >= 5));
}

// Les objets tenus apparaissent en gén. 2. Une liste de générations vide signifie
// que PokéAPI l'ignore : on laisse passer plutôt que d'amputer la liste à tort.
function poolObjets() {
  const g = genDuJeu();
  if (g < 2) return [];
  return Object.entries(items)
    .filter(([, o]) => !o.g.length || o.g.includes(g))
    .sort((a, b) => a[1].n.localeCompare(b[1].n, 'fr'));
}

// Formules officielles des jeux, à IV 31, EV 0 et nature neutre — les valeurs qu'on
// veut voir dans un planificateur, sans imposer un dressage précis.
// Munja fait exception : ses PV valent 1 quoi qu'il arrive.
const MUNJA = 292;

// Formules officielles complètes. `ev` est le total d'EV (0 à 252), `mult` le
// coefficient de nature (1,1 / 1 / 0,9). Les PV ignorent la nature.
const calcPVIv = (base, niv, iv, espece, ev = 0) =>
  espece === MUNJA ? 1
    : Math.floor(((2 * base + iv + Math.floor(ev / 4)) * niv) / 100) + niv + 10;
const calcStatIv = (base, niv, iv, ev = 0, mult = 1) =>
  Math.floor((Math.floor(((2 * base + iv + Math.floor(ev / 4)) * niv) / 100) + 5) * mult);

// Coefficient appliqué à une stat par la nature choisie. Les cinq natures neutres
// augmentent et diminuent la même stat : elles ne changent donc rien.
const NATURE_PAR_CLE = Object.fromEntries(NATURES.map((n) => [n.k, n]));
function multNature(cle, natureKey) {
  const nat = NATURE_PAR_CLE[natureKey];
  if (!nat || !nat.p || nat.p === nat.m) return 1;
  if (nat.p === cle) return 1.1;
  if (nat.m === cle) return 0.9;
  return 1;
}

const calcPV = (base, niv, espece, ev = 0) => calcPVIv(base, niv, 31, espece, ev);
const calcStat = (base, niv, ev = 0, mult = 1) => calcStatIv(base, niv, 31, ev, mult);

// Retrouve les IV compatibles avec une stat relevée en jeu.
//
// L'arrondi de la formule fait que PLUSIEURS IV donnent la même valeur affichée,
// d'autant plus qu'on est à bas niveau : à N.50 une stat couvre souvent deux IV, à
// N.100 la réponse est unique. On renvoie donc une plage, jamais un chiffre seul.
//
// Hypothèse assumée : EV à 0 et nature neutre. Un Pokémon entraîné ou de nature
// favorable sortira de la plage — c'est ce que dit alors « hors plage ».
function ivPossibles(base, niv, valeur, estPV, espece, ev = 0, mult = 1) {
  if (!Number.isFinite(valeur)) return null;
  const ok = [];
  for (let iv = 0; iv <= 31; iv++) {
    const v = estPV ? calcPVIv(base, niv, iv, espece, ev) : calcStatIv(base, niv, iv, ev, mult);
    if (v === valeur) ok.push(iv);
  }
  return ok.length ? { min: ok[0], max: ok[ok.length - 1] } : null;
}

// Attaques apprenables dans un jeu donné. `null` = absent de ce jeu, ce qui n'est
// pas la même chose qu'une liste vide.
//
// On interroge la CLÉ du membre avant son espèce : une forme n'apprend pas les
// mêmes attaques — Kyurem Blanc a Flamme Croix, que Kyurem n'a pas, et lui manquent
// Grimace et Ère Glaciaire. Le fichier ne porte l'entrée d'une forme que pour les
// jeux où elle diffère, d'où le repli sur l'espèce.
function poolAttaques(key, jeu) {
  const l = LEARN_VG?.[key]?.[jeu] ?? LEARN_VG?.[speciesOf(key)]?.[jeu];
  if (!l) return null;
  const vues = new Set();
  const out = [];
  // Le niveau d'abord : si une attaque s'apprend aussi par CT, c'est le niveau
  // qu'on veut afficher, c'est l'information la plus utile.
  for (const [id, lv] of l.n) if (!vues.has(id) && vues.add(id)) out.push({ id, src: lv > 0 ? `N.${lv}` : 'Dép.', rang: 0 });
  for (const [id, lab] of l.m) if (!vues.has(id) && vues.add(id)) out.push({ id, src: String(lab), rang: 1 });
  for (const id of l.o) if (!vues.has(id) && vues.add(id)) out.push({ id, src: 'Œuf', rang: 2 });
  for (const id of l.t) if (!vues.has(id) && vues.add(id)) out.push({ id, src: 'Maître', rang: 3 });
  return out;
}

// ---------- Accueil : la planche de tuiles d'où partent toutes les vues ----------
//
// La barre du bas a été RETIRÉE, à la demande : l'application s'ouvre désormais sur une
// page d'accueil de tuiles, d'après une maquette fournie. Chaque tuile ouvre une vue, et
// une barre « ‹ Accueil » l'y ramène. Les dessins sont inline, comme les icônes qu'ils
// remplacent : l'appli ne fait aucune requête au runtime.
// Illustrations des tuiles : une SCÈNE par vue, qui occupe toute la tuile et dit d'un
// coup d'œil ce qu'on va y trouver. Elles ont été redessinées le 30/09/2026 : la
// planche précédente (appareil à lentille et voyants, disque, grappe de Poké Balls)
// ressemblait trop à celle d'une autre application de Pokédex. Compositions nouvelles,
// et surtout PARLANTES : un Pokédex ouvert sur une fiche, une boîte du PC avec ses
// cases, une ceinture de dresseur à six Poké Balls, un impact d'attaque, un téléphone
// qui scanne, une console de réglages.
//
// Le fond coloré vient de la feuille de style ; ces dessins posent par-dessus des
// formes qui débordent volontairement des bords (la tuile est en overflow: hidden).
const ART = {
  // Un Pokédex OUVERT : écran de gauche avec une fiche, liste d'entrées à droite.
  pokedex: `
    <svg class="tuile-art" viewBox="0 0 320 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="286" cy="24" r="62" fill="#fff" opacity=".16"/>
      <circle cx="30" cy="132" r="52" fill="#000" opacity=".07"/>
      <!-- Coque, ouverte en deux volets. -->
      <g>
        <rect x="18" y="26" width="132" height="104" rx="13" fill="#a8160a"/>
        <rect x="26" y="34" width="116" height="88" rx="9" fill="#fff1ef"/>
        <!-- La fiche : silhouette, nom, deux jauges. -->
        <circle cx="62" cy="66" r="21" fill="#cfd8e3"/>
        <path d="M62 52c8 0 14 7 14 15 0 9-6 14-14 14s-14-5-14-14c0-8 6-15 14-15z" fill="#8fa0b5"/>
        <rect x="92" y="52" width="40" height="7" rx="3.5" fill="#2a3443"/>
        <rect x="92" y="64" width="28" height="6" rx="3" fill="#b9c3d0"/>
        <rect x="36" y="96" width="96" height="7" rx="3.5" fill="#e2e7ee"/>
        <rect x="36" y="96" width="62" height="7" rx="3.5" fill="#e2584f"/>
        <rect x="36" y="108" width="96" height="7" rx="3.5" fill="#e2e7ee"/>
        <rect x="36" y="108" width="34" height="7" rx="3.5" fill="#ecb22e"/>
      </g>
      <g>
        <rect x="160" y="26" width="140" height="104" rx="13" fill="#bf1a0c"/>
        <!-- Liste d'entrées du Pokédex. -->
        <g>
          <rect x="170" y="38" width="120" height="24" rx="7" fill="#fdf1f0"/>
          <circle cx="184" cy="50" r="7" fill="#e2584f"/>
          <rect x="197" y="46" width="52" height="6" rx="3" fill="#8fa0b5"/>
          <rect x="197" y="55" width="30" height="4" rx="2" fill="#c3ccd8"/>
        </g>
        <g opacity=".92">
          <rect x="170" y="68" width="120" height="24" rx="7" fill="#fdf1f0"/>
          <circle cx="184" cy="80" r="7" fill="#ecb22e"/>
          <rect x="197" y="76" width="64" height="6" rx="3" fill="#8fa0b5"/>
          <rect x="197" y="85" width="26" height="4" rx="2" fill="#c3ccd8"/>
        </g>
        <g opacity=".82">
          <rect x="170" y="98" width="120" height="24" rx="7" fill="#fdf1f0"/>
          <circle cx="184" cy="110" r="7" fill="#43c15c"/>
          <rect x="197" y="106" width="44" height="6" rx="3" fill="#8fa0b5"/>
          <rect x="197" y="115" width="34" height="4" rx="2" fill="#c3ccd8"/>
        </g>
      </g>
      <!-- Charnière. -->
      <rect x="150" y="30" width="12" height="96" rx="6" fill="#7d0f05"/>
    </svg>`,

  // La boîte du PC : son bandeau de titre, ses cases, deux Pokémon rangés.
  boites: `
    <svg class="tuile-art" viewBox="0 0 150 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="132" cy="16" r="44" fill="#fff" opacity=".18"/>
      <circle cx="10" cy="140" r="38" fill="#0c3f11" opacity=".12"/>
      <rect x="14" y="16" width="122" height="118" rx="14" fill="#eafcef"/>
      <rect x="22" y="24" width="106" height="20" rx="7" fill="#12ad3c"/>
      <rect x="32" y="31" width="52" height="6" rx="3" fill="#eaf6ea"/>
      <g fill="#d3f0da">
        <rect x="22" y="50" width="30" height="30" rx="8"/><rect x="60" y="50" width="30" height="30" rx="8"/>
        <rect x="98" y="50" width="30" height="30" rx="8"/><rect x="22" y="86" width="30" height="30" rx="8"/>
        <rect x="60" y="86" width="30" height="30" rx="8"/><rect x="98" y="86" width="30" height="30" rx="8"/>
      </g>
      <!-- Deux cases occupées : la Poké Ball dit « capturé ». -->
      <g>
        <circle cx="37" cy="65" r="11" fill="#fff" stroke="#2a3443" stroke-width="2.6"/>
        <path d="M26 65a11 11 0 0 1 22 0z" fill="#d6453c" stroke="#2a3443" stroke-width="2.6"/>
        <circle cx="37" cy="65" r="3.4" fill="#fff" stroke="#2a3443" stroke-width="2.2"/>
      </g>
      <g>
        <circle cx="113" cy="101" r="11" fill="#fff" stroke="#2a3443" stroke-width="2.6"/>
        <path d="M102 101a11 11 0 0 1 22 0z" fill="#d6453c" stroke="#2a3443" stroke-width="2.6"/>
        <circle cx="113" cy="101" r="3.4" fill="#fff" stroke="#2a3443" stroke-width="2.2"/>
      </g>
    </svg>`,

  // L'équipe : la ceinture du dresseur et ses six Poké Balls.
  equipes: `
    <svg class="tuile-art" viewBox="0 0 150 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="18" cy="20" r="46" fill="#fff" opacity=".2"/>
      <circle cx="138" cy="136" r="44" fill="#123f66" opacity=".12"/>
      <!-- La sangle, en biais. -->
      <path d="M-8 96l166-52v26L-8 122z" fill="#0a3f80"/>
      <path d="M-8 96l166-52v6L-8 102z" fill="#5aa9ff" opacity=".75"/>
      <!-- Six Poké Balls accrochées à la ceinture : l'équipe au complet. -->
      <g>
        <g transform="translate(6 92) rotate(-17)">
          <circle r="14" fill="#fff" stroke="#1e2227" stroke-width="3.4"/>
          <path d="M-14 0a14 14 0 0 1 28 0z" fill="#d6453c" stroke="#1e2227" stroke-width="3.4"/>
          <circle r="4.8" fill="#fff" stroke="#1e2227" stroke-width="3"/>
        </g>
        <g transform="translate(34 83) rotate(-17)">
          <circle r="14" fill="#fff" stroke="#1e2227" stroke-width="3.4"/>
          <path d="M-14 0a14 14 0 0 1 28 0z" fill="#d6453c" stroke="#1e2227" stroke-width="3.4"/>
          <circle r="4.8" fill="#fff" stroke="#1e2227" stroke-width="3"/>
        </g>
        <g transform="translate(62 74) rotate(-17)">
          <circle r="14" fill="#fff" stroke="#1e2227" stroke-width="3.4"/>
          <path d="M-14 0a14 14 0 0 1 28 0z" fill="#d6453c" stroke="#1e2227" stroke-width="3.4"/>
          <circle r="4.8" fill="#fff" stroke="#1e2227" stroke-width="3"/>
        </g>
        <g transform="translate(90 65) rotate(-17)">
          <circle r="14" fill="#fff" stroke="#1e2227" stroke-width="3.4"/>
          <path d="M-14 0a14 14 0 0 1 28 0z" fill="#d6453c" stroke="#1e2227" stroke-width="3.4"/>
          <circle r="4.8" fill="#fff" stroke="#1e2227" stroke-width="3"/>
        </g>
        <g transform="translate(118 57) rotate(-17)">
          <circle r="14" fill="#fff" stroke="#1e2227" stroke-width="3.4"/>
          <path d="M-14 0a14 14 0 0 1 28 0z" fill="#d6453c" stroke="#1e2227" stroke-width="3.4"/>
          <circle r="4.8" fill="#fff" stroke="#1e2227" stroke-width="3"/>
        </g>
        <g transform="translate(146 48) rotate(-17)">
          <circle r="14" fill="#fff" stroke="#1e2227" stroke-width="3.4"/>
          <path d="M-14 0a14 14 0 0 1 28 0z" fill="#d6453c" stroke="#1e2227" stroke-width="3.4"/>
          <circle r="4.8" fill="#fff" stroke="#1e2227" stroke-width="3"/>
        </g>
      </g>
    </svg>`,

  // Les attaques : un impact, et les trois catégories qui gravitent autour.
  attaques: `
    <svg class="tuile-art" viewBox="0 0 150 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="16" cy="18" r="44" fill="#fff" opacity=".2"/>
      <circle cx="140" cy="140" r="46" fill="#8a6a12" opacity=".14"/>
      <!-- Les trois catégories, en jetons, alignées en haut. -->
      <g>
        <circle cx="30" cy="28" r="15" fill="#e8562b" stroke="#8a3b14" stroke-width="2.8"/>
        <path d="M30 19l3.4 6.8 7.6-1.1-5.5 5.4 5.5 5.4-7.6-1.1L30 41l-3.4-6.6-7.6 1.1 5.5-5.4-5.5-5.4 7.6 1.1z" fill="#ffe0a3"/>
        <circle cx="72" cy="22" r="14" fill="#2f6fd0" stroke="#17427f" stroke-width="2.8"/>
        <circle cx="72" cy="22" r="7.5" fill="none" stroke="#dbe9fb" stroke-width="3.2"/>
        <circle cx="114" cy="28" r="14" fill="#9aa3ab" stroke="#525c66" stroke-width="2.8"/>
        <path d="M114 20c4.4 0 8 3.6 8 8s-3.6 8-8 8a8 8 0 0 1 0-16z" fill="#f2f3f4"/>
      </g>
      <!-- Traits de vitesse. -->
      <g stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45">
        <path d="M10 66h24M4 84h16M14 102h26"/>
      </g>
      <!-- L'impact, au centre. -->
      <path d="M80 48l10 24 25-8-12 23 23 13-25 6 6 25-22-13-17 20-4-26-26 2 16-20-19-17 26-3z"
            fill="#fff3c4" stroke="#8a4b05" stroke-width="3.2" stroke-linejoin="round"/>
      <path d="M80 68l5.5 13 14.5-4.5-7 13 13.5 7-14.5 3.5 2.5 14.5-12.5-7.5-10 12-2-15.5-15 1 9-11.5-11-10 15.5-2z" fill="#ff9800"/>
    </svg>`,

  // Le scan : le téléphone qui vise un Pokémon, et son faisceau.
  scan: `
    <svg class="tuile-art" viewBox="0 0 150 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="132" cy="20" r="46" fill="#fff" opacity=".18"/>
      <circle cx="12" cy="134" r="40" fill="#2b1f5e" opacity=".18"/>
      <!-- Le téléphone. -->
      <rect x="30" y="14" width="90" height="122" rx="16" fill="#2a0f63"/>
      <rect x="37" y="22" width="76" height="106" rx="11" fill="#4a1fa8"/>
      <!-- Ce que voit la caméra : une Poké Ball dans le viseur. -->
      <g transform="translate(75 70)">
        <circle r="24" fill="#fff" stroke="#1e2227" stroke-width="4"/>
        <path d="M-24 0a24 24 0 0 1 48 0z" fill="#d6453c" stroke="#1e2227" stroke-width="4"/>
        <circle r="8" fill="#fff" stroke="#1e2227" stroke-width="4"/>
      </g>
      <!-- Coins de visée et faisceau. -->
      <g fill="none" stroke="#c9b8ff" stroke-width="4.5" stroke-linecap="round">
        <path d="M48 56v-8a6 6 0 0 1 6-6h8"/><path d="M88 42h8a6 6 0 0 1 6 6v8"/>
        <path d="M102 84v8a6 6 0 0 1-6 6h-8"/><path d="M62 98h-8a6 6 0 0 1-6-6v-8"/>
      </g>
      <rect x="44" y="68" width="62" height="4" rx="2" fill="#e6dcff" opacity=".9"/>
      <!-- Le nom trouvé, sous l'image. -->
      <rect x="50" y="110" width="50" height="7" rx="3.5" fill="#c9b8ff" opacity=".85"/>
    </svg>`,

  // Les réglages : la console du PC, ses curseurs et son interrupteur.
  reglages: `
    <svg class="tuile-art" viewBox="0 0 150 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="18" cy="18" r="42" fill="#fff" opacity=".18"/>
      <circle cx="136" cy="138" r="42" fill="#053b3a" opacity=".25"/>
      <rect x="18" y="20" width="114" height="92" rx="13" fill="#e4fbf8"/>
      <rect x="26" y="28" width="98" height="76" rx="8" fill="#0f4a4a"/>
      <!-- Deux curseurs et un interrupteur : ce qu'on vient régler. -->
      <g>
        <rect x="36" y="42" width="78" height="7" rx="3.5" fill="#63707f"/>
        <rect x="36" y="42" width="44" height="7" rx="3.5" fill="#6ff0e2"/>
        <circle cx="80" cy="45.5" r="9" fill="#f4f7fa" stroke="#39434f" stroke-width="2.4"/>
        <rect x="36" y="64" width="78" height="7" rx="3.5" fill="#63707f"/>
        <rect x="36" y="64" width="24" height="7" rx="3.5" fill="#ffd166"/>
        <circle cx="60" cy="67.5" r="9" fill="#f4f7fa" stroke="#39434f" stroke-width="2.4"/>
        <rect x="36" y="84" width="34" height="14" rx="7" fill="#63707f"/>
        <circle cx="63" cy="91" r="5.6" fill="#f4f7fa"/>
        <rect x="80" y="86" width="34" height="5" rx="2.5" fill="#63707f"/>
        <rect x="80" y="94" width="22" height="5" rx="2.5" fill="#63707f"/>
      </g>
      <!-- Pied de la console. -->
      <path d="M62 112h26l5 12H57z" fill="#cdeeea"/>
      <rect x="44" y="124" width="62" height="10" rx="5" fill="#e4fbf8"/>
    </svg>`,
};

// Une carte par vue. `sous()` est appelée au rendu : chaque carte annonce un chiffre
// VIVANT — où en est la collection, combien de Pokémon dans l'équipe, quel mode de
// scan. C'est ce qui remplace les illustrations : l'accueil informe au lieu de décorer.
// `nom()` et `sous()` sont appelées AU RENDU : la tuile suit donc la langue sans
// qu'on ait à reconstruire ce tableau.
const TUILES = [
  {
    cle: 'pokedex', vue: 'pokedex', grande: true,
    nom: () => t('tuilePokedex'),
    sous: () => t('tuilePokedexSous'),
  },
  {
    cle: 'boites', vue: 'boites',
    nom: () => t('tuileBoites'),
    sous: () => {
      const liste = genList(state.gen).filter((k) => k !== null && k !== undefined);
      return t('tuileBoitesSous', liste.filter(isCaught).length, liste.length, ONGLETS[state.gen].label);
    },
  },
  {
    cle: 'equipes', vue: 'combat',
    nom: () => t('tuileEquipes'),
    sous: () => t('tuileEquipesSous', equipe().filter(Boolean).length, jeuCourant().nom),
  },
  {
    cle: 'attaques', vue: 'attaques',
    nom: () => t('tuileAttaques'),
    sous: () => t('tuileAttaquesSous', Object.keys(moves).length),
  },
  {
    cle: 'scan', vue: 'scan',
    nom: () => t('tuileScan'),
    sous: () => {
      const m = localStorage.getItem('pcbox.scan.mode');
      return t('tuileScanSous', t(m === 'manuel' ? 'modeManuel' : m === 'ia' ? 'modeIA' : 'modeAuto'));
    },
  },
  {
    // En BANDEAU sur toute la largeur : six tuiles dont une pleine largeur en tête,
    // c'est cinq demi-tuiles — la dernière restait seule, un trou à sa droite.
    // Réglages n'est pas une destination qu'on visite souvent ; une bande basse, en
    // pied de planche, lui va mieux qu'une tuile carrée.
    cle: 'reglages', vue: 'reglages', bandeau: true,
    nom: () => t('tuileReglages'),
    sous: () => t('tuileReglagesSous', (THEMES().find(([v]) => v === state.theme)?.[1] || '').toLowerCase()),
  },
];

function renderAccueil() {
  // Progression du Pokédex national, sur la collection ACTIVE : c'est le chiffre que
  // la carte en tête affiche, et l'anneau qui l'accompagne.
  let pris = 0;
  for (let id = 1; id <= 1025; id++) if (isCaught(id)) pris++;
  const pct = Math.round((100 * pris) / 1025);
  // Quatre Pokémon sur 1025 font 0,4 % : arrondi, l'anneau affichait « 0 % » et restait
  // VIDE, comme si rien n'avait été fait. Il montre désormais « <1 », et son arc suit
  // la valeur exacte — un filet de couleur dès la première capture.
  const pctExact = (100 * pris) / 1025;
  const pctTexte = pris > 0 && pct < 1 ? '<1' : String(pct);

  const carte = (tu) => `
    <button class="tuile t-${tu.cle} ${tu.grande ? 'grande' : ''} ${tu.bandeau ? 'bandeau' : ''}" data-tuile="${tu.cle}">
      ${ART[tu.cle]}
      ${tu.grande ? `<span class="anneau" style="--p:${pctExact.toFixed(2)}" aria-hidden="true"><i>${pctTexte}<em>%</em></i></span>` : ''}
      <span class="tuile-txt">
        <b>${esc(tu.nom())}</b>
        <small>${esc(tu.sous())}</small>
      </span>
    </button>`;

  poser(h(`
    <section class="accueil">
      <header class="accueil-tete">
        <h1>${t('appTitre')}</h1>
        <p>${t('accueilSous', pris, shinyView())} <span>v${__APP_VERSION__}</span></p>
      </header>
      <div class="tuiles">
        ${TUILES.map(carte).join('')}
      </div>
    </section>`));
}

// ---------- Réglages : apparence, et ce qui viendra s'y ajouter ----------
//
// Le thème se choisit ici : clair, sombre, ou celui du téléphone. Le choix vit dans
// `localStorage` et s'applique par un attribut sur <html>, que la feuille de style lit
// (`:root[data-theme="sombre"]`). « Automatique » est résolu ICI plutôt qu'en CSS :
// la palette sombre n'est écrite qu'une fois, et un changement de réglage du téléphone
// se répercute tout seul.
const themeSysteme = window.matchMedia?.('(prefers-color-scheme: dark)');
// Appelée au rendu, comme les tuiles : les libellés suivent la langue.
const THEMES = () => [
  ['clair', t('themeClair')],
  ['sombre', t('themeSombre')],
  ['auto', t('themeAuto')],
];

function appliqueTheme() {
  const sombre = state.theme === 'sombre' || (state.theme === 'auto' && !!themeSysteme?.matches);
  document.documentElement.dataset.theme = sombre ? 'sombre' : 'clair';
  // La barre d'état d'iOS et l'onglet du navigateur suivent le thème.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sombre ? '#14171b' : '#d6453c');
}
themeSysteme?.addEventListener?.('change', () => { if (state.theme === 'auto') appliqueTheme(); });
appliqueTheme();

// Chaque bloc porte son rang (`--i`) : c'est lui qui échelonne l'entrée en
// cascade, comme les cases d'une boîte. Et son icône, dans une pastille teintée.
const bloc = (i, cle, titre, aide, corps, vide) => `
  <div class="reg-bloc ${vide ? 'vide' : ''} b-${cle}" style="--i:${i}">
    <h3><span class="reg-pastille">${ICO_REG[cle]}</span>${titre}</h3>
    <p class="reg-aide">${aide}</p>
    ${corps}
  </div>`;

// Rail segmenté : le curseur GLISSE d'une position à l'autre au lieu de sauter.
// `--i` porte l'index choisi et `--n` le nombre d'options ; tout le mouvement est
// une transition CSS sur `left`, donc rien à animer en JavaScript.
const rail = (options, actif, attribut, aria) => {
  const i = Math.max(0, options.findIndex(([v]) => v === actif));
  return `
    <div class="reg-rail" role="radiogroup" aria-label="${aria}" style="--i:${i};--n:${options.length}">
      ${options.map(([v, lib]) => `
        <button class="${v === actif ? 'on' : ''}" role="radio" aria-checked="${v === actif}"
                ${attribut}="${v}" ${attribut === 'data-langue' ? `lang="${v}"` : ''}>${esc(lib)}</button>`).join('')}
    </div>`;
};

function renderReglages() {
  // `poser()` remplace la zone qui défile : un élément neuf repart en haut. On rend
  // donc sa position à la page, comme on rend son décalage à la barre d'onglets —
  // sans quoi enregistrer un pseudo ou changer de thème renvoyait tout en haut.
  // Seulement si l'on ÉTAIT déjà sur les Réglages : en y arrivant depuis l'accueil,
  // la position mémorisée serait celle d'une autre vue.
  const vueActuelle = app.querySelector('.vue');
  const defileReg = vueActuelle?.querySelector('.reg') ? vueActuelle.scrollTop : 0;

  poser(entete(t('reglages')), h(`
    <section class="reg">
      ${bloc(0, 'apparence', t('apparence'), t('apparenceAide'),
        rail(THEMES(), state.theme, 'data-theme', t('theme')))}

      <!-- La langue : les libellés restent dans LEUR langue (Français, English,
           日本語), comme partout ailleurs — on doit pouvoir retrouver la sienne
           depuis une langue qu'on ne lit pas. -->
      ${bloc(1, 'langue', t('langue'), t('langueAide'),
        rail(LANGUES, langue(), 'data-langue', t('langue')))}

      ${bloc(2, 'sauvegarde', t('sauvegarde'), t('sauvegardeAide'), `
        <div class="reg-lignes">
          <button class="reg-ligne" data-act="export">
            ${ICO.exporte}<span><b>${t('exportTout')}</b><small>${t('exportToutSous')}</small></span>
          </button>
          <button class="reg-ligne" data-act="import">
            ${ICO.importe}<span><b>${t('importTout')}</b><small>${t('importToutSous')}</small></span>
          </button>
        </div>`)}

      ${compteUI.htmlCompte()}

      <!-- Apple exige (5.1.1(i)) un lien vers la politique de confidentialité DANS
           l'application, « easily accessible ». Les pages sont produites depuis le
           Markdown de legal/ par scripts/build-legal.mjs et déployées avec le site ;
           elles sont aussi embarquées, donc ces liens s'ouvrent hors ligne.
           PAS D'ACCENT GRAVE dans ce commentaire : il vit dans un gabarit de chaîne,
           et le moindre y terminerait le gabarit. -->
      ${bloc(4, 'legal', t('legal'), t('legalAide'), `
        <div class="reg-lignes">
          ${[['confidentialite', 'legalConfidentialite', 'legalConfidentialiteSous'],
              ['conditions', 'legalConditions', 'legalConditionsSous'],
              ['mentions', 'legalMentions', 'legalMentionsSous']].map(([page, titre, sous]) => `
            <button class="reg-ligne" data-legal="${page}">
              ${ICO.droite}<span><b>${t(titre)}</b><small>${t(sous)}</small></span>
            </button>`).join('')}
        </div>`)}

      <!-- D'autres réglages viendront ici : un bloc par sujet, sur le même gabarit. -->
      ${bloc(5, 'avenir', t('aVenir'), t('aVenirSous'), '', true)}
    </section>`));

  if (defileReg) app.querySelector('.vue').scrollTop = defileReg;
}

// Changer de langue : charger la surcouche, refaire ce qui porte des noms, rendre.
// Le catalogue et les libellés d'onglets en dépendent, et ils sont construits une
// seule fois — d'où ces deux reconstructions.
async function poseLangueEtRend(l) {
  await chargeLangue(l, { TYPES, GENS, CLASSES });
  marqueChange();   // la langue fait partie de la charge sauvegardée
  renommeOnglets();
  construitFormes();
  construitCatalogue();
  // La vue Scan est un élément unique, construit au chargement : elle ne se refait
  // pas au rendu et doit reposer ses libellés elle-même.
  scan.retraduit();
  render();
}

// Barre de retour, construite une fois : elle coiffe toutes les vues sauf l'accueil.
const barreRetour = h(`
  <header class="retour">
    <button data-accueil>${ICO.gauche}<span class="retour-txt">${t('accueil')}</span></button>
  </header>`);
barreRetour.addEventListener('click', () => vaVers('accueil'));

function vaVers(vue) {
  if (vue === state.vue) return;
  fermeLesPanneaux();
  state.vue = vue;
  // Entrer dans le Pokédex ramène TOUJOURS à son menu : on vient choisir quel
  // Pokédex regarder, pas reprendre là où l'on s'était arrêté.
  if (vue === 'pokedex') { state.dexGen = null; state.dexQ = ''; }
  render();
}

app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tuile]');
  if (b) {
    const tu = TUILES.find((x) => x.cle === b.dataset.tuile);
    if (tu) vaVers(tu.vue);
    return;
  }
  // `button[data-theme]` et non `[data-theme]` : `appliqueTheme()` pose cet attribut
  // sur <html>, que `closest` finit donc par trouver pour N'IMPORTE quel clic dans
  // l'appli. Le thème « celui du téléphone » se figeait ainsi en clair ou en sombre
  // au premier clic venu, et le choix de la langue n'était jamais atteint.
  const doc = e.target.closest('button[data-legal]');
  if (doc) { ouvreLegal(doc.dataset.legal); return; }

  const th = e.target.closest('button[data-theme]');
  if (th) {
    state.theme = th.dataset.theme;
    localStorage.setItem(THEME_KEY, state.theme);
    marqueChange();
    appliqueTheme();
    retourHaptique();
    render();
    return;
  }
  const lg = e.target.closest('button[data-langue]');
  if (lg && lg.dataset.langue !== langue()) {
    retourHaptique();
    poseLangueEtRend(lg.dataset.langue);
  }
});

// Grand titre façon iOS : il coiffe la vue, puis se réduit et s'efface en défilant
// sous la barre des onglets, qui reste collée en haut. Le rétrécissement est posé par
// une classe, pas par un calcul à chaque image : le défilement reste fluide.
function entete(titre, sous) {
  return h(`
    <header class="entete">
      <h1>${esc(titre)}</h1>
      ${sous ? `<p>${esc(sous)}</p>` : ''}
    </header>`);
}

// Coquille d'application : le contenu de chaque vue défile DANS une zone dédiée
// (`.vue`), coiffée hors accueil par la barre de retour, qui ne défile pas.
function poser(...enfants) {
  const vue = document.createElement('div');
  vue.className = 'vue';
  vue.append(...enfants);
  // L'écoute vit sur la zone qui défile ; elle meurt avec elle au rendu suivant.
  const tete = enfants[0];
  if (tete instanceof Element && tete.classList.contains('entete')) {
    vue.addEventListener('scroll', () => {
      tete.classList.toggle('compact', vue.scrollTop > 12);
    }, { passive: true });
  }
  app.replaceChildren(...(state.vue === 'accueil' ? [vue] : [barreRetour, vue]));
}

function renderEquipeSlot(m, i) {
  if (!m) {
    return `<button class="eq vide" data-eq="${i}" aria-label="${t('emplacementLibreN', i + 1)}">
      <b>+</b><small>${t('libre')}</small>
    </button>`;
  }
  const espece = speciesOf(m.key);
  const st = statsDe(m.key);
  const niv = m.niv ?? NIV_DEFAUT;
  const pv = m.stats?.pv ?? (st ? calcPV(st.pv, niv, espece) : 0);
  const absent = LEARN_VG && !LEARN_VG[m.key]?.[state.jeu] && !LEARN_VG[espece]?.[state.jeu];
  return `
    <button class="eq ${isCaught(m.key) ? '' : 'gris'} ${absent ? 'absent' : ''}" data-eq="${i}"
            aria-label="${esc(t('niveauDe', monName(m.key), niv))}">
      <img src="${sprites.still(spriteKey(m.key), !!m.shiny)}" alt=""
           ${imgFallback(espece, !!m.shiny)} />
      <span class="eq-nom">${esc(monName(m.key))}</span>
      <span class="eq-jauge"><i>${t('stat_pv')}</i><span class="jauge"><b></b></span></span>
      <span class="eq-bas">
        <span class="eq-lv">${t('niveauBadge', niv)}</span>
        <span class="eq-pv">${pv}/${pv}</span>
      </span>
      ${m.objet && items[m.objet]
        ? `<img class="eq-obj" src="items/${m.objet}.png" alt="" title="${esc(items[m.objet].n)}" />`
        : ''}
      ${absent ? `<span class="eq-alerte" title="${t('absentDeCeJeu')}">!</span>` : ''}
    </button>`;
}

function renderCombat() {
  const jeu = jeuCourant();
  const pleines = equipe().filter(Boolean).length;

  poser(
    entete(t('equipes'), t('equipesSous', pleines, jeu.nom)),
    h(`
      <section class="combat">
        <div class="combat-head">
          <button class="jeu-btn" data-act="choix-jeu">
            <small>${t('versionDuJeu')}</small>
            <b>${esc(jeu.nom)}</b>
          </button>
          <div class="combat-compte"><b>${pleines}</b>/6</div>
        </div>

        <div class="equipe">
          ${equipe().map(renderEquipeSlot).join('')}
        </div>

        <div class="sd-barre">
          <button class="sd-btn" data-act="sd-export" ${pleines ? '' : 'disabled'}>${ICO.exporte}<span>${t('sdExporter')}</span></button>
          <button class="sd-btn" data-act="sd-import">${ICO.importe}<span>${t('sdImporter')}</span></button>
        </div>

        ${LEARN_VG ? '' : `<p class="combat-charge">${t('chargementAttaques')}</p>`}

        <div class="analyse">${renderAnalyse()}</div>

        ${renderTableTypes()}

        ${renderCalcTypes()}

        <!-- L'aide ne sert qu'à la première prise en main : dès qu'un Pokémon est
             placé, le geste est compris et le pavé n'est plus que du bruit. -->
        ${pleines ? '' : `<p class="hint">${t('aideEquipe', esc(jeu.nom))}</p>`}
      </section>`),
  );

  if (!LEARN_VG) chargeVG().then(() => { if (state.vue === 'combat') render(); });
}

// ---------- Analyse de l'équipe ----------
//
// Trois lectures complémentaires, celles qui servent vraiment à équilibrer :
//   défense  — qui encaisse quoi, et surtout les faiblesses partagées ;
//   attaque  — ce que l'équipe sait frapper efficacement, d'après les attaques
//              RÉELLEMENT choisies, pas d'après le potentiel de l'espèce ;
//   rôles    — mur, sweeper, attaquant, déduits des stats de base.
//
// La table des types suit la génération du jeu choisi : afficher les faiblesses
// actuelles pour une partie de Rouge/Bleu donnerait des réponses fausses.

const NUM_GEN = {
  'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3, 'generation-iv': 4,
  'generation-v': 5, 'generation-vi': 6, 'generation-vii': 7, 'generation-viii': 8,
  'generation-ix': 9,
};
const genDuJeu = () => NUM_GEN[jeuCourant().gen] ?? 9;

// Rôle déduit des stats de base. Heuristique assumée : elle situe un Pokémon,
// elle ne remplace pas le jugement d'un joueur.
function roleDe(st) {
  const encaisse = st.pv + st.def + st.defs;
  const frappe = Math.max(st.att, st.atts);
  const ecart = st.att - st.atts;
  // Des CLÉS, pas des libellés : les textes sont traduits au rendu, et les tests
  // ci-dessous (« est-ce un mur ? ») ne dépendent donc pas de la langue.
  const orientation = ecart >= 15 ? 'physique' : ecart <= -15 ? 'special' : 'mixte';
  let role;
  // Seuils calés sur des encaisseurs réels : Airmure et Magnézone plafonnent à 275
  // en PV+Déf+Déf.Spé, et ce sont pourtant les murs de leur équipe. À 300 le test ne
  // reconnaissait quasiment que Leuphorie, et l'appli annonçait « aucun encaisseur »
  // juste après avoir désigné Magnézone comme le plus solide.
  if (encaisse >= 270 && frappe < 100) role = 'mur';
  else if (encaisse >= 260) role = 'tank';
  else if (st.vit >= 100 && frappe >= 100) role = 'sweeper';
  else if (st.vit <= 55 && frappe >= 110) role = 'casseur';
  else if (frappe >= 110) role = 'attaquant';
  else role = 'polyvalent';
  return { role, orientation, encaisse, frappe };
}

function analyseEquipe() {
  const table = typechart.chart[genDuJeu()];
  const TT = typechart.types;

  const membres = [];
  equipe().forEach((m, i) => {
    if (!m) return;
    const esp = speciesOf(m.key);
    const st = statsDe(m.key);
    if (!st) return;
    membres.push({
      i, key: m.key, esp, nom: monName(m.key),
      types: pokedex[esp]?.types || [],
      st, niv: m.niv ?? NIV_DEFAUT,
      moves: (m.moves || []).filter(Boolean),
      shiny: !!m.shiny,
      ...roleDe(st),
    });
  });
  if (!membres.length) return null;

  // --- Défense : le multiplicateur subi par CHAQUE membre ---
  // On garde le détail et pas seulement des comptes : voir trois « ×2 » alignés dit
  // immédiatement ce qu'un simple « 3 » ne montre pas.
  const def = TT.map((a) => {
    const mults = membres.map((mb) => {
      let mult = 1;
      for (const t of mb.types) mult *= table[a]?.[t] ?? 1;
      return mult;
    });
    return {
      t: a,
      mults,
      faibles: mults.filter((m) => m > 1).length,
      resiste: mults.filter((m) => m < 1 && m > 0).length,
      immune: mults.filter((m) => m === 0).length,
      pire: Math.max(...mults),
    };
  });

  // --- Attaque : d'après les attaques offensives réellement sélectionnées ---
  const typesAtq = new Set();
  let sansAttaque = 0;
  for (const mb of membres) {
    const offensives = mb.moves.filter((id) => moves[id] && moves[id].c !== 'status' && moves[id].p);
    if (!offensives.length) sansAttaque++;
    for (const id of offensives) typesAtq.add(moves[id].t);
  }
  // Face à un type défenseur donné, le mieux que l'équipe puisse faire avec les
  // types d'attaque dont elle dispose.
  const off = TT.map((d) => ({
    t: d,
    mult: typesAtq.size ? Math.max(...[...typesAtq].map((a) => table[a]?.[d] ?? 1)) : null,
  }));
  const couverts = new Set(off.filter((o) => o.mult > 1).map((o) => o.t));

  // --- Conseils : uniquement des constats actionnables ---
  const avis = [];
  const communes = def.filter((d) => d.faibles >= 3).sort((a, b) => b.faibles - a.faibles);
  for (const d of communes) {
    avis.push({ ton: 'alerte', txt: t('avisFaiblesse', membres.length === d.faibles ? t('touteLequipe') : t('nMembres', d.faibles), TYPES[d.t][0]) });
  }
  const sansParade = def.filter((d) => !d.resiste && !d.immune && d.faibles > 0);
  if (sansParade.length) {
    avis.push({ ton: 'alerte', txt: t('avisSansParade', sansParade.map((d) => TYPES[d.t][0]).join(', ')) });
  }

  // --- Conseils tirés des ATTAQUES réellement choisies ---
  //
  // Les contrôles ci-dessus portent sur les types et les stats de base, donc sur ce
  // qu'un Pokémon EST. Ceux-ci portent sur ce qu'on lui a mis en main, là où se
  // logent les erreurs les plus coûteuses et les plus faciles à corriger.
  const sansStab = [], categorieRatee = [], incomplets = [], monoType = [];
  let statutQuelquePart = false;

  for (const mb of membres) {
    if (mb.moves.some((id) => moves[id]?.c === 'status')) statutQuelquePart = true;
    if (mb.moves.length && mb.moves.length < 4) incomplets.push(mb.nom);

    const off = mb.moves.map((id) => moves[id]).filter((mv) => mv && mv.c !== 'status' && mv.p);
    if (!off.length) continue;

    // Le STAB vaut 1,5x : une attaque du type du lanceur frappe toujours plus fort
    // qu'une attaque neutre de puissance égale.
    if (!off.some((mv) => mb.types.includes(mv.t))) sansStab.push(mb.nom);

    // Attaquer dans sa mauvaise catégorie gâche l'essentiel de la puissance.
    const phys = off.filter((mv) => mv.c === 'physical').length;
    const spec = off.filter((mv) => mv.c === 'special').length;
    const ecart = mb.st.att - mb.st.atts;
    if (ecart >= 20 && spec > phys) {
      categorieRatee.push(t('avisCategorie', mb.nom, t('special'), mb.st.att, mb.st.atts, libStat('att'), libStat('atts')));
    } else if (ecart <= -20 && phys > spec) {
      categorieRatee.push(t('avisCategorie', mb.nom, t('physique'), mb.st.atts, mb.st.att, libStat('atts'), libStat('att')));
    }

    // Toutes ses attaques du même type : un seul mur bien choisi l'arrête.
    if (off.length >= 2 && new Set(off.map((mv) => mv.t)).size === 1) monoType.push(mb.nom);
  }

  for (const txt of categorieRatee) avis.push({ ton: 'alerte', txt: esc(txt) });
  if (sansStab.length) {
    avis.push({ ton: 'conseil', txt: t('avisSansStab', sansStab.map(esc).join('</b>, <b>')) });
  }
  if (monoType.length) {
    avis.push({ ton: 'conseil', txt: t('avisMonoType', monoType.map(esc).join('</b>, <b>'), monoType.length > 1) });
  }
  if (membres.some((m) => m.moves.length) && !statutQuelquePart) {
    avis.push({ ton: 'conseil', txt: t('avisSansStatut') });
  }
  if (incomplets.length) {
    avis.push({ ton: 'info', txt: t('avisIncomplet', incomplets.map(esc).join('</b>, <b>')) });
  }

  const murs = membres.filter((m) => m.role === 'mur' || m.role === 'tank');
  if (!murs.length) avis.push({ ton: 'conseil', txt: t('avisSansMur') });

  const rapides = membres.filter((m) => m.st.vit >= 100);
  if (!rapides.length && membres.length >= 3) avis.push({ ton: 'conseil', txt: t('avisSansVitesse') });

  const phys = membres.filter((m) => m.orientation === 'physique').length;
  const spec = membres.filter((m) => m.orientation === 'special').length;
  if (membres.length >= 3 && spec === 0) avis.push({ ton: 'conseil', txt: t('avisToutPhysique') });
  if (membres.length >= 3 && phys === 0) avis.push({ ton: 'conseil', txt: t('avisToutSpecial') });

  // Deux membres au type identique : les faiblesses se cumulent au lieu de se couvrir.
  const vus = new Map();
  for (const m of membres) {
    const cle = [...m.types].sort().join('/');
    if (vus.has(cle)) avis.push({ ton: 'conseil', txt: t('avisMemeType', esc(vus.get(cle)), esc(m.nom)) });
    else vus.set(cle, m.nom);
  }

  if (sansAttaque) {
    avis.push({ ton: 'info', txt: t('avisSansAttaque', sansAttaque) });
  }
  const nonCouverts = TT.filter((d) => !couverts.has(d));
  if (typesAtq.size && nonCouverts.length) {
    avis.push({ ton: 'info', txt: t('avisNonCouverts', nonCouverts.map((d) => TYPES[d][0]).join(', ')) });
  }
  if (!avis.length) avis.push({ ton: 'bon', txt: t('avisRien') });

  return { membres, def, off, couverts, typesAtq, avis, murs };
}

// ---------- Rendu de l'analyse ----------

// ---------- Rendu partagé des multiplicateurs de type ----------
// Utilisé par l'analyse d'équipe ET par la fiche de combat d'un membre.

// × pour ce qui fait mal, ÷ pour ce qui est encaissé, 0 pour une immunité.
const fmt = (m) => (m === 0 ? '0' : m > 1 ? `×${m}` : `÷${Math.round(1 / m)}`);
const classeMult = (m) => (m === 0 ? 'm0' : m > 1 ? 'mx' : 'md');

// Les multiplicateurs de même nature sont MULTIPLIÉS entre eux : deux membres
// faibles ×2 donnent un seul jeton ×4, pas « ×2 ×2 ». Une ligne se lit alors d'un
// coup — ×16 dit tout de suite qu'un type ravage l'équipe.
// Les immunités échappent à ce calcul (un produit contenant 0 vaudrait 0) : elles
// gardent leur propre jeton, avec le nombre de membres concernés en exposant.
// Sur un seul Pokémon la liste ne contient qu'une valeur : le produit la rend telle
// quelle, et la même fonction sert donc aux deux usages.
const jetonsDe = (mults) => {
  const mal = mults.filter((m) => m > 1);
  const bien = mults.filter((m) => m > 0 && m < 1);
  const nulles = mults.filter((m) => m === 0).length;
  const out = [];
  if (mal.length) out.push({ v: mal.reduce((a, b) => a * b, 1), n: 1 });
  if (bien.length) out.push({ v: bien.reduce((a, b) => a * b, 1), n: 1 });
  if (nulles) out.push({ v: 0, n: nulles });
  return out;
};

// Symbole du type, chemin relatif SANS « / » initial comme les sprites et les
// fonds : indispensable avec base: './', sinon Capacitor ne les trouve pas sur
// l'iPhone. Le nom français reste en alt et en title, pour l'accessibilité.
// Génération d'APPARITION des types tardifs. PokéAPI ne publie dans
// `past_damage_relations` que ce qui a CHANGÉ : les types qui n'existaient pas
// encore gardent donc leurs relations modernes dans les tables antérieures. Sans
// ce filtre, une table de Rouge/Bleu afficherait une ligne Fée — un type inventé
// vingt ans plus tard.
const TYPE_DEPUIS = { dark: 2, steel: 2, fairy: 6 };
const typesDeGen = (gen) => typechart.types.filter((t) => (TYPE_DEPUIS[t] ?? 1) <= gen);

const badge = (t) => {
  const nom = esc(TYPES[t]?.[0] || t);
  return `<img class="tb" src="types/${t}.svg" alt="${nom}" title="${nom}" />`;
};

// Une ligne = le symbole du type suivi de ses multiplicateurs. Les valeurs neutres
// sont omises, et une ligne qui n'aurait plus rien à montrer disparaît entièrement :
// dix-huit types dont douze sans intérêt, c'était surtout du bruit.
const ligne = (t, jetons, alerte) => (!jetons.length ? '' : `
  <div class="tl ${alerte ? 'chaud' : ''}">
    ${badge(t)}
    <span class="tm">${jetons.map((j) =>
      `<i class="${classeMult(j.v)}">${fmt(j.v)}${j.n > 1 ? `<sup>${j.n}</sup>` : ''}</i>`).join('')}</span>
  </div>`);

// Faiblesses, résistances et immunités d'un SEUL Pokémon. Même principe que
// l'analyse d'équipe : ×2, ×4 pour ce qui fait mal, ÷ pour ce qui est encaissé,
// 0 pour ce qui ne touche pas.
//
// La génération est un PARAMÈTRE : la fiche de combat passe celle du jeu choisi,
// la fiche du Pokédex la table moderne. Cette dernière décrit l'espèce et non une
// partie — même règle que pour ses talents, listés tous jeux confondus.
function renderFaiblesses(espece, gen = genDuJeu()) {
  const table = typechart.chart[gen];
  const types = pokedex[espece]?.types || [];
  if (!types.length) return `<p class="none">${t('typesInconnus')}</p>`;
  const lignes = typesDeGen(gen)
    .map((a) => {
      let mult = 1;
      for (const t of types) mult *= table[a]?.[t] ?? 1;
      return { t: a, mult };
    })
    .filter((x) => x.mult !== 1)
    .sort((x, y) => y.mult - x.mult);
  if (!lignes.length) return `<p class="none">${t('neutrePartout')}</p>`;
  return `<div class="tgrid">${lignes.map((x) =>
    ligne(x.t, jetonsDe([x.mult]), x.mult >= 4)).join('')}</div>`;
}

// Table des types complète : 18 attaquants en lignes, 18 défenseurs en colonnes.
//
// Repliée par défaut (`<details>`), et c'est délibéré : 324 cases sous l'équipe
// noieraient l'analyse, alors qu'on ne vient l'ouvrir que ponctuellement, pour
// vérifier un cas précis. Pas de JavaScript pour ça, la balise suffit.
//
// Les cases NEUTRES restent vides : sur 324 cases, 200 valent 1 et ne disent rien.
// Ne garder que ce qui s'écarte de 1 rend la table lisible d'un coup d'œil.
//
// Elle suit la génération du jeu choisi, comme le reste de la boîte de combat :
// c'est tout l'intérêt d'avoir une table par génération.
function renderTableTypes() {
  const gen = genDuJeu();
  const table = typechart.chart[gen];
  const T = typesDeGen(gen);
  const entete = T.map((d) => `<th scope="col">${badge(d)}</th>`).join('');
  const corps = T.map((a) => `
    <tr>
      <th scope="row">${badge(a)}</th>
      ${T.map((d) => {
        const m = table[a]?.[d] ?? 1;
        return m === 1 ? '<td></td>' : `<td class="${classeMult(m)}">${fmt(m)}</td>`;
      }).join('')}
    </tr>`).join('');
  return `
    <details class="tt">
      <summary>${t('tableDesTypes')} <small>${esc(jeuCourant().nom)}</small></summary>
      <div class="tt-wrap">
        <table class="tt-tab">
          <thead><tr><th></th>${entete}</tr></thead>
          <tbody>${corps}</tbody>
        </table>
      </div>
    </details>`;
}

// ---------- Calculateur de types ----------
//
// Choisir un ou deux types et lire d'un coup ce qu'ils encaissent, ce qu'ils frappent,
// et quels Pokémon les portent. La table complète répond à « Feu contre Plante ? » ;
// ce calculateur répond à « que craint un Acier / Fée ? », qu'elle obligeait à
// calculer de tête en croisant deux colonnes.
//
// Il suit la génération du jeu choisi, comme la table. Ses commandes agissent SUR LE
// DOM (`majCalcTypes`) : rendre la vue refermerait le volet et ramènerait en haut.
const calcTypes = [];
let calcOuvert = false;

function htmlCorpsCalc() {
  const gen = genDuJeu();
  const table = typechart.chart[gen];
  const T = typesDeGen(gen);
  // Un type sélectionné qui n'existe pas dans cette génération (Fée en gén. 1) est
  // écarté du calcul plutôt que de fausser le résultat.
  const choix = calcTypes.filter((x) => T.includes(x));
  const boutons = T.map((ty) => `
    <button class="tc-type ${choix.includes(ty) ? 'on' : ''}" data-calctype="${ty}"
            aria-pressed="${choix.includes(ty)}">${badge(ty)}<span>${esc(TYPES[ty]?.[0] || ty)}</span></button>`).join('');
  if (!choix.length) {
    return `<div class="tc-types ${choix.length ? 'choix' : ''}">${boutons}</div>
      <p class="tc-aide">${t('calcAide')}</p>`;
  }

  // Défense : multiplicateur subi de chaque type attaquant.
  const def = new Map();
  for (const a of T) {
    let m = 1;
    for (const d of choix) m *= table[a]?.[d] ?? 1;
    if (m !== 1) def.set(a, m);
  }
  // Attaque : le meilleur multiplicateur que ces types infligent à chaque défenseur
  // — c'est la couverture d'un Pokémon qui a une attaque de chacun de ses types.
  const att = new Map();
  for (const d of T) att.set(d, Math.max(...choix.map((a) => table[a]?.[d] ?? 1)));

  const groupe = (lib, ids, classe) => (!ids.length ? '' : `
    <div class="tc-groupe">
      <span class="tc-lib ${classe}">${lib}</span>
      <span class="tc-badges">${ids.map(badge).join('')}</span>
    </div>`);
  const parMult = (map, v) => [...map].filter(([, m]) => m === v).map(([k]) => k);

  const defense = [4, 2, 0.5, 0.25, 0].map((v) =>
    groupe(fmt(v), parMult(def, v), classeMult(v))).join('');
  const attaque = [
    groupe(t('calcSuperEfficace'), parMult(att, 2), 'mx'),
    groupe(t('calcPeuEfficace'), parMult(att, 0.5), 'md'),
    groupe(t('calcSansEffet'), parMult(att, 0), 'm0'),
  ].join('');

  // Les Pokémon qui portent EXACTEMENT cette combinaison, dans l'ordre du Pokédex et
  // jusqu'à la génération du jeu : un type seul désigne les Pokémon de type unique.
  const voulu = [...choix].sort().join();
  const mons = range(1, 1025).filter((id) => {
    const p = pokedex[id];
    return p && p.generation <= gen && [...(p.types || [])].sort().join() === voulu;
  });
  const sh = shinyView();
  return `
    <div class="tc-types choix">${boutons}</div>
    <h4 class="tc-titre">${t('calcDefense')}</h4>
    <div class="tc-def">${defense || `<p class="none">${t('neutrePartout')}</p>`}</div>
    <h4 class="tc-titre">${t('calcAttaque')}</h4>
    <div class="tc-off">${attaque || `<p class="none">${t('neutrePartout')}</p>`}</div>
    <h4 class="tc-titre">${t('calcPokemon', mons.length)}</h4>
    ${mons.length ? `<div class="tc-mons">${mons.map((id) => `
      <button class="tc-mon ${isCaught(id) ? '' : 'gris'}" data-calcmon="${id}" title="${esc(pokedex[id].name)}">
        <img src="${sprites.still(id, sh)}" alt="${esc(pokedex[id].name)}" loading="lazy" ${imgFallback(id, sh)} />
      </button>`).join('')}</div>` : `<p class="none">${t('calcAucunPokemon')}</p>`}`;
}

function renderCalcTypes() {
  return `
    <details class="tt tc" ${calcOuvert ? 'open' : ''}>
      <summary>${t('calcTypes')} <small>${esc(jeuCourant().nom)}</small></summary>
      <div class="tc-corps">${htmlCorpsCalc()}</div>
    </details>`;
}

function majCalcTypes() {
  const corps = app.querySelector('.tc-corps');
  if (corps) corps.innerHTML = htmlCorpsCalc();
}

// Un troisième type remplace le plus ancien : un Pokémon n'en porte que deux.
app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-calctype]');
  if (b) {
    const ty = b.dataset.calctype;
    const i = calcTypes.indexOf(ty);
    if (i >= 0) calcTypes.splice(i, 1);
    else { calcTypes.push(ty); if (calcTypes.length > 2) calcTypes.shift(); }
    retourHaptique();
    majCalcTypes();
    return;
  }
  const m = e.target.closest('[data-calcmon]');
  if (m) openSheet(Number(m.dataset.calcmon));
});
// Le volet se souvient d'être ouvert : un rendu de la vue (changer de membre, de
// version) ne doit pas le refermer sous les yeux.
app.addEventListener('toggle', (e) => {
  if (e.target.classList?.contains('tc')) calcOuvert = e.target.open;
}, true);

function renderAnalyse() {
  const a = analyseEquipe();
  if (!a) return '';
  const TT = typechart.types;

  // Le plus solide de l'équipe : la réponse directe à « qui est le tanker ».
  const tank = a.membres.slice().sort((x, y) => y.encaisse - x.encaisse)[0];

  return `
    <h3 class="an-h">${t('defense')} <small>${t('defenseSous')}</small></h3>
    <div class="tgrid">
      ${a.def.slice()
        .sort((x, y) => y.faibles - x.faibles || y.pire - x.pire || (y.resiste + y.immune) - (x.resiste + x.immune))
        .map((d) => ligne(d.t, jetonsDe(d.mults), d.faibles >= 3)).join('')}
    </div>

    <h3 class="an-h">${t('attaque')} <small>${t('attaqueSous')}</small></h3>
    ${a.typesAtq.size
      ? `<div class="tgrid off">${a.off.slice()
          .sort((x, y) => y.mult - x.mult)
          .map((o) => ligne(o.t, o.mult === 1 ? [] : [{ v: o.mult, n: 1 }], false)).join('')}</div>`
      : `<p class="none">${t('aucuneOffensive')}</p>`}

    <h3 class="an-h">${t('roles')}</h3>
    <p class="an-tank">${t('plusSolide', esc(tank.nom), tank.encaisse)}</p>
    <ul class="roles">
      ${a.membres.map((m) => `
        <li>
          <img src="${sprites.still(spriteKey(m.key), m.shiny)}" alt="" ${imgFallback(m.esp, m.shiny)} />
          <span class="r-nom">${esc(m.nom)}</span>
          <span class="r-role">${esc(nomRole(m.role))}</span>
          <span class="r-det">${esc(t('detailRole', nomOrientation(m.orientation), m.st.vit, m.encaisse))}</span>
        </li>`).join('')}
    </ul>

    <h3 class="an-h">${t('conseils')}</h3>
    <ul class="avis">
      ${a.avis.map((v) => `<li class="${v.ton}">${v.txt}</li>`).join('')}
    </ul>
  `;
}

// ---------- Panneau de la boîte de combat ----------

const battleSheet = h(`<aside class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body"></div></aside>`);
document.body.append(battleSheet);
const battleBody = battleSheet.querySelector('.sheet-body');

// Les attaques ont leur propre VUE, détachée de la boîte de combat à la demande : on
// vient y consulter les attaques du jeu, pas composer une équipe. Le contenu est le
// même (`htmlMenuAttaques`, `htmlInfoAttaque`) et les mêmes écoutes le servent : seul
// le contenant change — cette page-ci au lieu du corps du panneau.
const corpsAtq = h('<section class="atq-page"></section>');
// Où écrire, et quel défilement lire : la page dans la vue Attaques, le panneau sinon.
const corpsCombat = () => (state.vue === 'attaques' ? corpsAtq : battleBody);
// Ce qui DÉFILE n'est pas le même élément : dans la page c'est la zone de vue qui la
// contient, dans le panneau c'est son corps. Lire scrollTop sur la page donnerait 0.
const defileCombat = () => (state.vue === 'attaques' ? (corpsAtq.parentElement ?? corpsAtq) : battleBody);

function renderAttaques() {
  // La vue se souvient de l'attaque ouverte quand on revient d'ailleurs.
  if (!['attaques', 'infoAttaque'].includes(state.bs?.mode)) {
    state.bs = { mode: 'attaques', slot: null, emplacement: null, q: '' };
  }
  poser(corpsAtq);
  renderBattleSheet();
  // Les movesets par jeu sont chargés à la demande : la page se refait à leur arrivée.
  if (!LEARN_VG) chargeVG().then(() => { if (state.vue === 'attaques') renderBattleSheet(); });
}
// Glisser de gauche à droite = revenir en arrière : de la fiche d'une attaque à la
// liste des attaques, d'un choix d'attaque, de talent, d'objet ou de nature au détail
// du Pokémon, et sinon fermer le panneau. Vers la gauche il n'y a rien : le contenu ne
// suit qu'au tiers, comme la fiche du Pokédex en bout de boîte.
enableSwipeClose(battleSheet, closeBattleSheet, {
  voisin: (dir) => (dir === -1 && state.bs ? true : null),
  aller: (dir) => { if (dir === -1) glisseRetourCombat(); },
});

let retourCombatEnCours = false;
function glisseRetourCombat() {
  const bs = state.bs;
  if (!bs || retourCombatEnCours) return;
  const action = bs.mode === 'infoAttaque' ? retourMenuAttaques
    : SOUS_PANNEAUX.has(bs.mode) ? () => openBattleSheet('detail', bs.slot)
    : null;
  // Rien derrière : le retour ferme le panneau, avec sa propre sortie vers le bas.
  if (!action) { closeBattleSheet(); return; }
  retourCombatEnCours = true;
  // Même mouvement que le passage d'une fiche à l'autre (navFiche), dans le sens du
  // retour : le contenu part à droite, le précédent revient de la gauche.
  const b = battleBody;
  const w = b.getBoundingClientRect().width || 340;
  b.style.transition = `transform ${NAV_OUT}ms ease-in, opacity ${NAV_OUT}ms ease-in`;
  b.style.transform = `translateX(${w * 0.45}px)`;
  b.style.opacity = '0';
  setTimeout(() => {
    action();
    b.style.transition = 'none';
    b.style.transform = `translateX(${-w * 0.4}px)`;
    b.style.opacity = '0';
    void b.offsetWidth; // pas de requestAnimationFrame, comme pour navFiche
    b.style.transition = `transform ${NAV_IN}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${NAV_IN}ms ease-out`;
    b.style.transform = '';
    b.style.opacity = '';
    setTimeout(() => { b.style.transition = ''; retourCombatEnCours = false; }, NAV_IN);
  }, NAV_OUT);
}

// Retour de la fiche d'une attaque à la liste. Recherche et position relues AVANT de
// rouvrir la liste, qui les remettrait à zéro.
function retourMenuAttaques() {
  const { q, y } = filtreAttaques;
  openBattleSheet('attaques');
  state.bs.q = q;
  renderBattleSheet();
  defileCombat().scrollTop = y;
}

function closeBattleSheet() {
  battleSheet.classList.remove('open');
  state.bs = null;
  syncBackdrop();
}
// Panneaux ouverts DEPUIS la fiche de détail, et qui y ramènent. Choisir une
// attaque en bas de la fiche renvoyait tout en haut : on perdait sa place à chaque
// attaque, soit quatre fois par Pokémon. Même principe que le `keepScroll` de la
// fiche du Pokédex.
const SOUS_PANNEAUX = new Set(['attaque', 'talent', 'objet', 'nature', 'cible']);
let defileDetail = { slot: null, y: 0 };

function openBattleSheet(mode, slot = null, emplacement = null) {
  const avant = state.bs;
  // On quitte le détail pour un sous-panneau : on retient où on en était.
  if (avant?.mode === 'detail' && mode !== 'detail') {
    defileDetail = { slot: avant.slot, y: battleBody.scrollTop };
  }
  state.bs = { mode, slot, emplacement, q: '' };
  renderBattleSheet();
  if (state.vue === 'attaques') { defileCombat().scrollTop = 0; return; }
  // Retour au détail depuis un de ces panneaux, sur le MÊME Pokémon : on rend la
  // position. Ouvert autrement — depuis l'équipe, ou sur un autre membre — la fiche
  // repart en haut, comme il se doit.
  const retour = mode === 'detail' && SOUS_PANNEAUX.has(avant?.mode) && defileDetail.slot === slot;
  battleBody.scrollTop = retour ? defileDetail.y : 0;
  battleSheet.classList.add('open');
  syncBackdrop();
}

function renderBattleSheet(gardeFocus) {
  const bs = state.bs;
  if (!bs) return;
  const corps = corpsCombat();
  corps.innerHTML =
    bs.mode === 'version' ? htmlVersions()
    : bs.mode === 'mon' || bs.mode === 'cible' ? htmlChoixMon()
    : bs.mode === 'detail' ? htmlDetail()
    : bs.mode === 'nature' ? htmlChoixNature()
    : bs.mode === 'talent' ? htmlChoixTalent()
    : bs.mode === 'objet' ? htmlChoixObjet()
    : bs.mode === 'attaques' ? htmlMenuAttaques()
    : bs.mode === 'infoAttaque' ? htmlInfoAttaque()
    : bs.mode === 'sd-export' || bs.mode === 'sd-import' ? htmlShowdown()
    : htmlChoixAttaque();
  if (gardeFocus) {
    const c = corps.querySelector('.bs-name');
    if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
  }
}

// Les 21 jeux, groupés par génération pour qu'on s'y retrouve.
function htmlVersions() {
  const parGen = {};
  for (const v of JEUX) (parGen[v.gen] ??= []).push(v);
  return `
    <h2 class="bs-title">${t('versionDuJeu')}</h2>
    <p class="paper-note">${t('noteVersions')}</p>
    ${Object.entries(parGen).map(([gen, liste]) => `
      <div class="vgroupe">
        <h3>${t('genLongue', NUM_GEN[gen] ?? gen.replace('generation-', '').toUpperCase())}</h3>
        ${liste.map((v) => `
          <button class="vjeu ${v.k === state.jeu ? 'on' : ''}" data-jeu="${esc(v.k)}">
            ${esc(v.nom)}${v.k === state.jeu ? ' <i>✓</i>' : ''}
          </button>`).join('')}
      </div>`).join('')}
  `;
}

// Choix d'un Pokémon pour un emplacement. Capturé = couleur, non capturé = gris :
// c'est le même signal que dans la grille des boîtes.
function htmlChoixMon() {
  const q = fold(state.bs.q || '');
  const res = q
    ? CATALOGUE.filter((e) => e.cle.includes(q)).slice(0, 80)
    : CATALOGUE.filter((e) => e.gen === state.addGen);
  return `
    <h2 class="bs-title">${state.bs?.mode === 'cible' ? t('degatsChoisirCible') : t('choisirPokemon')}</h2>
    <label class="bs-field">
      <span>${t('rechercher')}</span>
      <input class="bs-name bs-q" type="text" value="${esc(state.bs.q || '')}"
             placeholder="${t('placeholderPokemon')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
    </label>
    ${q ? '' : `<div class="paper-gens" role="tablist">
      ${GENS.map((g) => `
        <button class="paper-gen ${g.n === state.addGen ? 'on' : ''}" role="tab"
                aria-selected="${g.n === state.addGen}" data-agen="${g.n}">
          ${t('genCourt', g.n)}<small>${g.name}</small>
        </button>`).join('')}
    </div>`}
    <div class="picks">
      ${res.map((e) => `
        <button class="pick ${isCaught(e.id) ? '' : 'gris'}" ${state.bs?.mode === 'cible' ? 'data-ciblepick' : 'data-eqpick'}="${e.id}">
          <img src="${sprites.still(e.sprite)}" alt="" loading="lazy" ${imgFallback(e.num, false)} />
          <span>${esc(e.name)}<i>${esc(e.sub)}</i></span>
        </button>`).join('')}
    </div>
    ${res.length ? '' : `<p class="paper-note">${t('aucunResultat')}</p>`}
  `;
}

function htmlChoixNature() {
  const m = equipe()[state.bs.slot];
  if (!m) return `<p class="none">${t('emplacementVide')}</p>`;
  return `
    <h2 class="bs-title">${t('natureDe', esc(monName(m.key)))}</h2>
    <p class="paper-note">${t('noteNature')}</p>
    <div class="atq4">
      ${NATURES.map((n) => {
        const neutre = !n.p || n.p === n.m;
        return `
          <button class="atq ${m.nature === n.k ? 'choisi' : ''}" data-picknat="${esc(n.k)}">
            <span class="atq-h"><span class="atq-n">${esc(n.n)}</span></span>
            <span class="atq-m">${neutre ? t('aucunEffet')
              : `<b class="n-plus">+10 %</b> ${esc(libStat(n.p))} · <b class="n-moins">−10 %</b> ${esc(libStat(n.m))}`}</span>
          </button>`;
      }).join('')}
    </div>`;
}

// Les talents que l'espèce peut avoir dans le jeu choisi.
function htmlChoixTalent() {
  const m = equipe()[state.bs.slot];
  if (!m) return `<p class="none">${t('emplacementVide')}</p>`;
  const liste = poolTalents(m.key);
  return `
    <h2 class="bs-title">${t('talentDe', esc(monName(m.key)))}</h2>
    <p class="paper-note">${t('talentsDispo', esc(jeuCourant().nom))}</p>
    <div class="atq4">
      ${liste.map(([slug, cache]) => {
        const ab = abilities.list[slug];
        if (!ab) return '';
        return `
          <button class="atq ${m.talent === slug ? 'choisi' : ''}" data-picktal="${esc(slug)}">
            <span class="atq-h">
              <span class="atq-n">${esc(ab.n)}</span>
              ${cache ? `<span class="type mini" style="--t:#7c7c74">${t('talentCache')}</span>` : ''}
            </span>
            ${ab.d ? `<span class="atq-m">${esc(ab.d)}</span>` : ''}
          </button>`;
      }).join('')}
      ${m.talent ? `<button class="atq libre" data-picktal="">${t('retirerTalent')}</button>` : ''}
    </div>`;
}

// Les objets tenables en combat, existants dans le jeu choisi.
function htmlChoixObjet() {
  const m = equipe()[state.bs.slot];
  if (!m) return `<p class="none">${t('emplacementVide')}</p>`;
  const q = fold(state.bs.q || '');
  const tous = poolObjets();
  const res = q ? tous.filter(([, o]) => fold(o.n).includes(q)) : tous;
  return `
    <h2 class="bs-title">${t('objetDe', esc(monName(m.key)))}</h2>
    <p class="paper-note">${t('objetsDispo', tous.length, esc(jeuCourant().nom))}</p>
    <label class="bs-field">
      <span>${t('rechercher')}</span>
      <input class="bs-name bs-q" type="text" value="${esc(state.bs.q || '')}"
             placeholder="${t('placeholderObjet')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
    </label>
    ${m.objet ? `<button class="atq libre" data-pickobj="">${t('retirerObjet')}</button>` : ''}
    <div class="objets">
      ${res.map(([slug, o]) => `
        <button class="objet ${m.objet === slug ? 'choisi' : ''}" data-pickobj="${esc(slug)}">
          <img src="items/${slug}.png" alt="" loading="lazy" />
          <span>${esc(o.n)}${o.d ? `<i>${esc(o.d)}</i>` : ''}</span>
        </button>`).join('')}
    </div>
    ${res.length ? '' : `<p class="paper-note">${t('aucunObjetCorrespond')}</p>`}`;
}

// Détail d'un membre : niveau, stats calculées, quatre attaques.
// ---------- Échange d'équipe au format Showdown ----------
//
// Le format texte de Pokémon Showdown est LA langue commune des joueurs : sites de
// stratégie, forums, simulateurs, autres applis l'importent et l'exportent. Une équipe
// d'Unydex se partage donc en un copier-coller, et une équipe trouvée ailleurs s'y
// recopie de même.
//
//   Charizard @ Life Orb
//   Ability: Blaze
//   Level: 50
//   Shiny: Yes
//   EVs: 252 SpA / 4 SpD / 252 Spe
//   Modest Nature
//   - Flamethrower
//
// Le format exige les noms ANGLAIS, quelle que soit la langue de l'appli : ils sont lus
// dans la surcouche anglaise, chargée à la demande (le même fichier que la traduction).
// À l'import, les noms sont comparés réduits à leurs lettres et chiffres, comme le fait
// Showdown lui-même : « Mr. Mime », « mr mime » et « MrMime » se valent.
let EN = null;
const chargeAnglais = () => (EN ? Promise.resolve(EN)
  : import('./data/i18n/en.json').then((m) => (EN = m.default || m)));
const versId = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const STAT_SD = { pv: 'HP', att: 'Atk', def: 'Def', atts: 'SpA', defs: 'SpD', vit: 'Spe' };

// Nom Showdown d'une clé : l'espèce en anglais, ou pour une forme à clé NUMÉRIQUE —
// un vrai Pokémon pour PokéAPI : Méga, régionale, Motisma, Gigamax… — son identifiant PokéAPI — « charizard-mega-x » devient
// « Charizard-Mega-X », exactement l'écriture de Showdown. Une forme cosmétique n'a
// pas d'existence en combat : elle s'exporte sous le nom de son espèce.
function nomShowdown(key) {
  const espece = speciesOf(key);
  const f = FORM_BY_KEY.get(key);
  if (typeof key === 'number' && f?.slug) return f.slug.split('-').map((x) => (x ? x[0].toUpperCase() + x.slice(1) : x)).join('-');
  return EN?.especes?.[espece]?.name || pokedex[espece]?.name || String(espece);
}

function texteShowdown(equipeListe) {
  return equipeListe.filter(Boolean).map((m) => {
    const lignes = [];
    const objet = m.objet && EN?.objets?.[m.objet]?.n;
    const sexe = typeof m.key === 'string' && m.key.endsWith('-female') ? ' (F)' : '';
    lignes.push(`${nomShowdown(m.key)}${sexe}${objet ? ` @ ${objet}` : ''}`);
    const talent = m.talent && EN?.talents?.[m.talent]?.n;
    if (talent) lignes.push(`Ability: ${talent}`);
    lignes.push(`Level: ${m.niv ?? NIV_DEFAUT}`);
    if (m.shiny) lignes.push('Shiny: Yes');
    // Dans l'ordre de Showdown — PV, Atq, Déf, Atq. Spé., Déf. Spé., Vitesse.
    const evs = Object.keys(STAT_SD).filter((k) => m.evs?.[k] > 0).map((k) => [k, m.evs[k]]);
    if (evs.length) lignes.push(`EVs: ${evs.map(([k, v]) => `${v} ${STAT_SD[k]}`).join(' / ')}`);
    const nature = m.nature && EN?.natures?.[m.nature];
    if (nature) lignes.push(`${nature} Nature`);
    for (const id of m.moves || []) if (id && EN?.attaques?.[id]) lignes.push(`- ${EN.attaques[id].n}`);
    return lignes.join('\n');
  }).join('\n\n');
}

// Tables inverses, construites une fois : nom réduit → clé.
let INDEX_SD = null;
function indexShowdown() {
  if (INDEX_SD) return INDEX_SD;
  const especes = new Map();
  for (const [id, e] of Object.entries(EN.especes || {})) especes.set(versId(e.name), Number(id));
  // Les formes à clé numérique, par leur identifiant PokéAPI : « Ninetales-Alola »,
  // « Rotom-Wash », « Charizard-Mega-X » se retrouvent ainsi sans table à tenir.
  for (const liste of Object.values(forms)) {
    for (const f of liste) if (typeof f.key === 'number' && f.slug) especes.set(versId(f.slug), f.key);
  }
  const depuis = (obj, nom) => new Map(Object.entries(obj || {}).map(([k, v]) => [versId(nom(v)), k]));
  INDEX_SD = {
    especes,
    attaques: new Map(Object.entries(EN.attaques || {}).map(([k, v]) => [versId(v.n), Number(k)])),
    talents: depuis(EN.talents, (v) => v.n),
    objets: depuis(EN.objets, (v) => v.n),
    natures: depuis(EN.natures, (v) => v),
  };
  return INDEX_SD;
}

// Lit un texte Showdown. Rend les membres reconnus et la liste de ce qui ne l'a pas
// été — on dit ce qu'on a laissé de côté plutôt que de l'avaler en silence.
function lisShowdown(texte) {
  const ix = indexShowdown();
  const inconnus = [];
  const membres = [];
  const blocs = String(texte).replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const bloc of blocs) {
    if (membres.length >= 6) break;
    const lignes = bloc.split('\n').map((l) => l.trim()).filter(Boolean);
    // Première ligne : « Surnom (Espèce) (F) @ Objet » ; surnom, sexe et objet facultatifs.
    let [tete, objet] = lignes[0].split(/\s@\s/);
    tete = tete.replace(/\((M|F)\)\s*$/, '').trim();
    const sexeF = /\(F\)\s*(@|$)/.test(lignes[0]);
    const paren = tete.match(/\(([^()]+)\)\s*$/);
    const nomEspece = paren ? paren[1] : tete;
    let key = ix.especes.get(versId(nomEspece));
    if (key == null) { inconnus.push(nomEspece); continue; }
    if (sexeF && FORM_BY_KEY.has(`${key}-female`)) key = `${key}-female`;
    const m = { key, niv: NIV_DEFAUT, moves: [] };
    if (objet) {
      const k = ix.objets.get(versId(objet));
      if (k) m.objet = k; else inconnus.push(objet.trim());
    }
    for (const l of lignes.slice(1)) {
      let r;
      if ((r = l.match(/^Ability:\s*(.+)$/i))) {
        const k = ix.talents.get(versId(r[1]));
        if (k) m.talent = k; else inconnus.push(r[1]);
      } else if ((r = l.match(/^Level:\s*(\d+)/i))) {
        m.niv = Math.max(1, Math.min(100, Number(r[1])));
      } else if (/^Shiny:\s*Yes/i.test(l)) {
        m.shiny = true;
      } else if ((r = l.match(/^EVs:\s*(.+)$/i))) {
        for (const part of r[1].split('/')) {
          const p = part.trim().match(/^(\d+)\s+(\w+)/);
          const cle = p && Object.keys(STAT_SD).find((c) => STAT_SD[c].toLowerCase() === p[2].toLowerCase());
          if (cle) (m.evs ??= {})[cle] = Math.min(252, Number(p[1]));
        }
      } else if ((r = l.match(/^(\w+)\s+Nature$/i))) {
        const k = ix.natures.get(versId(r[1]));
        if (k) m.nature = k;
      } else if ((r = l.match(/^[-~]\s*(.+)$/))) {
        // « Hidden Power [Fire] » : Showdown précise le type, la base ne connaît que l'attaque.
        const nom = r[1].replace(/\[.*\]/, '');
        const id = ix.attaques.get(versId(nom));
        if (id && m.moves.length < 4 && !m.moves.includes(id)) m.moves.push(id);
        else if (!id) inconnus.push(r[1]);
      }
    }
    if (!cleAdmise(m.key)) { inconnus.push(nomEspece); continue; }
    membres.push(m);
  }
  return { membres, inconnus };
}

function htmlShowdown() {
  const imp = state.bs.mode === 'sd-import';
  if (!EN) return `<h2 class="bs-title">${imp ? t('sdTitreImport') : t('sdTitreExport')}</h2><p class="paper-note">${t('sdChargement')}</p>`;
  if (!imp) {
    const txt = texteShowdown(equipe());
    return `
      <h2 class="bs-title">${t('sdTitreExport')}</h2>
      <p class="paper-note">${t('sdAideExport')}</p>
      ${txt ? `<textarea class="sd-texte" readonly rows="12">${esc(txt)}</textarea>
      <button class="catch-btn" data-act="sd-copier">${t('sdCopier')}</button>`
      : `<p class="none">${t('sdEquipeVide')}</p>`}`;
  }
  return `
    <h2 class="bs-title">${t('sdTitreImport')}</h2>
    <p class="paper-note">${t('sdAideImport', esc(jeuCourant().nom))}</p>
    <textarea class="sd-texte" rows="12" placeholder="${t('sdPlaceholder')}"
              autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
    <p class="sd-erreur" hidden></p>
    <button class="catch-btn" data-act="sd-valider">${t('sdValider')}</button>`;
}

// L'équipe importée REMPLACE celle de la version courante, et le bandeau d'annulation
// la rend telle qu'elle était : pas de question préalable, un geste pour revenir.
function importeShowdown() {
  const zone = corpsCombat();
  const txt = zone.querySelector('.sd-texte')?.value || '';
  const { membres, inconnus } = lisShowdown(txt);
  const err = zone.querySelector('.sd-erreur');
  if (!membres.length) {
    err.hidden = false;
    err.textContent = t('sdVide') + (inconnus.length ? ' ' + t('sdInconnus', inconnus.slice(0, 6).join(', ')) : '');
    return;
  }
  const avant = equipe().slice();
  state.equipes[state.jeu] = [...membres, ...Array(6 - membres.length).fill(null)];
  saveCombat();
  closeBattleSheet();
  render();
  retourHaptique();
  proposeAnnulation(
    t('sdImporte', membres.length) + (inconnus.length ? ' · ' + t('sdInconnus', inconnus.slice(0, 3).join(', ')) : ''),
    () => { state.equipes[state.jeu] = avant; saveCombat(); render(); });
}

async function copieShowdown(bouton) {
  const zone = corpsCombat().querySelector('.sd-texte');
  if (!zone) return;
  try {
    await navigator.clipboard.writeText(zone.value);
  } catch {
    // Repli : sélectionner le texte, que l'on copie alors soi-même — et la commande
    // historique, que certaines vues web acceptent encore.
    zone.focus();
    zone.select();
    try { document.execCommand('copy'); } catch { /* sélection laissée à l'utilisateur */ }
  }
  bouton.textContent = t('sdCopie');
  retourHaptique();
}

function ouvreShowdown(mode) {
  openBattleSheet(mode);
  if (!EN) chargeAnglais().then(() => { if (state.bs?.mode === mode) renderBattleSheet(); });
}

// ---------- Calcul de dégâts ----------
//
// Demandé par les joueurs des applis concurrentes : « combien de coups pour mettre ce
// Pokémon K.O. ? ». Chaque attaque choisie du membre est calculée contre UNE cible,
// commune à toute l'équipe — on compare ainsi ses six Pokémon face à la même menace.
//
// Formule officielle depuis la gén. 3 : ((2N/5 + 2) × Puissance × A/D) / 50 + 2, puis
// le facteur aléatoire (85 à 100 %), le bonus de type identique (×1,5) et l'efficacité
// du type, arrondis vers le bas à chaque étape comme dans les jeux. La catégorie et la
// puissance sont celles de la GÉNÉRATION du jeu (`attaqueEnGen`).
//
// Ce qui n'est PAS compté, et que la fiche dit : talents, objets, météo, coups
// critiques, statuts, modificateurs de stats. C'est un ordre de grandeur fiable, pas
// un simulateur de combat — il dirait faux plus souvent qu'il ne dirait plus.
//
// La cible est prise à IV 31, EV 0, nature neutre, au niveau du membre sauf réglage.
let cibleDegats = null; // { key, niv } — niv null = celui du membre

// La stat réelle d'un membre : celle qu'on a relevée en jeu si elle est saisie, sinon
// celle que donnent son niveau, ses EV et sa nature.
function statMembre(m, cle) {
  const st = statsDe(m.key);
  if (!st) return null;
  if (m.stats?.[cle] != null) return m.stats[cle];
  const niv = m.niv ?? NIV_DEFAUT;
  const ev = m.evs?.[cle] || 0;
  return cle === 'pv'
    ? calcPV(st.pv, niv, speciesOf(m.key), ev)
    : calcStat(st[cle], niv, ev, multNature(cle, m.nature));
}

function calculeDegats(m, idAtq, cible, gen) {
  const mv = attaqueEnGen(idAtq, gen);
  if (!mv || mv.c === 'status' || !mv.p) return null;
  const stC = statsDe(cible.key);
  if (!stC) return null;
  const nivA = m.niv ?? NIV_DEFAUT;
  const nivC = cible.niv ?? nivA;
  // Avant la gén. 2, une seule stat « Spécial » servait à l'attaque comme à la défense.
  const physique = mv.c === 'physical';
  const cleA = physique ? 'att' : 'atts';
  const cleD = physique ? 'def' : gen === 1 ? 'atts' : 'defs';
  const A = statMembre(m, cleA);
  const D = calcStat(stC[cleD], nivC);
  const pv = calcPV(stC.pv, nivC, speciesOf(cible.key));
  const table = typechart.chart[gen];
  const typesA = pokedex[speciesOf(m.key)]?.types || [];
  const typesD = pokedex[speciesOf(cible.key)]?.types || [];
  const eff = typesD.reduce((x, d) => x * (table[mv.t]?.[d] ?? 1), 1);
  const stab = typesA.includes(mv.t) ? 1.5 : 1;
  const base = Math.floor(Math.floor(Math.floor((2 * nivA) / 5 + 2) * mv.p * A / D) / 50) + 2;
  // Les 16 tirages du facteur aléatoire (85 à 100 %), chacun arrondi comme en jeu.
  const tirages = Array.from({ length: 16 }, (_, k) =>
    (eff ? Math.max(1, Math.floor(Math.floor(Math.floor((base * (85 + k)) / 100) * stab) * eff)) : 0));
  return { mv, eff, stab, tirages, min: tirages[0], max: tirages[15], pv };
}

// « 2 coups », « 2 ou 3 coups », « 1 coup (37 %) » : la question que l'on se pose
// vraiment. La chance d'un K.O. en un coup se lit sur les 16 tirages possibles du
// facteur aléatoire, comme dans les jeux.
function texteKo(d) {
  if (!d.eff) return t('degatsSansEffet');
  if (d.min >= d.pv) return t('degatsKo1');
  if (d.max >= d.pv) {
    const n = d.tirages.filter((v) => v >= d.pv).length;
    return t('degatsKo1Chance', Math.round((100 * n) / 16));
  }
  const a = Math.ceil(d.pv / d.max), b = Math.ceil(d.pv / d.min);
  return a === b ? t('degatsKoN', a) : t('degatsKoNM', a, b);
}

function htmlDegats(m) {
  const gen = genDuJeu();
  const ids = (m.moves || []).filter((id) => id && moves[id]);
  const cible = cibleDegats && statsDe(cibleDegats.key) ? cibleDegats : null;
  const nivC = cible ? (cible.niv ?? (m.niv ?? NIV_DEFAUT)) : null;
  const choixCible = `
    <button class="ligne-choix" data-choix="cible">
      ${cible ? `<img class="lc-i lc-mon" src="${sprites.still(spriteKey(cible.key))}" alt="" ${imgFallback(speciesOf(cible.key), false)} />` : ''}
      <span class="lc-t">${cible ? t('degatsContre', esc(monName(cible.key))) : t('degatsChoisirCible')}</span>
      <span class="lc-d">${cible ? t('degatsCibleDetail', nivC) : t('degatsAide')}</span>
    </button>`;
  if (!cible) return choixCible;
  const nivCible = `
    <div class="niv-rang niv-cible">
      <span>${t('degatsNiveauCible')}</span>
      <button data-nivcible="-10">−10</button>
      <button data-nivcible="-1">−1</button>
      <b>${nivC}</b>
      <button data-nivcible="1">+1</button>
      <button data-nivcible="10">+10</button>
    </div>`;
  const lignes = ids.map((id) => {
    const d = calculeDegats(m, id, cible, gen);
    const mv = attaqueEnGen(id, gen) || moves[id];
    const [tn, tc] = TYPES[mv.t] || [mv.t || '—', '#888'];
    if (!d) {
      return `
        <div class="dg">
          <span class="dg-n">${esc(mv.n)} <span class="type mini" style="--t:${tc}">${tn}</span></span>
          <span class="dg-ko muet">${t('degatsNonCalcule')}</span>
        </div>`;
    }
    const pMin = Math.min(100, (100 * d.min) / d.pv), pMax = Math.min(100, (100 * d.max) / d.pv);
    const pc = (x) => Math.round((100 * x) / d.pv);
    return `
      <div class="dg ${d.max >= d.pv ? 'ko' : ''}">
        <span class="dg-n">${esc(mv.n)} <span class="type mini" style="--t:${tc}">${tn}</span>
          ${d.eff > 1 ? `<i class="dg-eff mx">×${d.eff}</i>` : d.eff && d.eff < 1 ? `<i class="dg-eff md">÷${Math.round(1 / d.eff)}</i>` : ''}</span>
        <span class="dg-pc">${d.eff ? `${pc(d.min)}–${pc(d.max)} %` : '0 %'}</span>
        <span class="dg-barre" aria-hidden="true"><i style="width:${pMax}%"></i><b style="width:${pMin}%"></b></span>
        <span class="dg-ko">${texteKo(d)}</span>
      </div>`;
  }).join('');
  return `
    ${choixCible}
    ${nivCible}
    ${ids.length ? `<div class="degats-liste">${lignes}</div>` : `<p class="none">${t('degatsSansAttaque')}</p>`}
    <p class="stat-note">${t('degatsNote')}</p>`;
}

// Saisir une stat ou un EV change les dégâts : on refait le bloc sur place, sans
// reconstruire la fiche (le champ garderait sinon le focus perdu).
function majDegats() {
  const z = battleBody.querySelector('.degats');
  const m = state.bs?.slot != null ? equipe()[state.bs.slot] : null;
  if (z && m) z.innerHTML = htmlDegats(m);
}

function htmlDetail() {
  const m = equipe()[state.bs.slot];
  if (!m) return `<p class="none">${t('emplacementVide')}</p>`;
  const espece = speciesOf(m.key);
  const st = statsDe(m.key);
  const niv = m.niv ?? NIV_DEFAUT;
  const p = pokedex[espece] || {};
  const pool = poolAttaques(m.key, state.jeu);
  const dispo = new Set((pool || []).map((x) => x.id));
  const talents = poolTalents(m.key);
  const talent = m.talent && abilities.list[m.talent] ? abilities.list[m.talent] : null;
  const objet = m.objet && items[m.objet] ? items[m.objet] : null;
  const objetsDispo = poolObjets().length;

  // Chaque stat est saisissable : on y recopie la valeur lue en jeu, et l'appli en
  // déduit l'IV. Laissé vide, le champ retombe sur la valeur calculée à IV 31.
  const perso = m.stats || {};
  const evs = m.evs || {};
  const nature = NATURE_PAR_CLE[m.nature] || null;
  const champ = (cle, lib, base, estPV) => {
    const ev = evs[cle] || 0;
    const mult = estPV ? 1 : multNature(cle, m.nature);
    const calcule = estPV ? calcPV(base, niv, espece, ev) : calcStat(base, niv, ev, mult);
    const saisi = perso[cle];
    const iv = saisi != null ? ivPossibles(base, niv, saisi, estPV, espece, ev, mult) : null;
    const signe = mult > 1 ? '<b class="n-plus">+</b>' : mult < 1 ? '<b class="n-moins">−</b>' : '';
    const libelleIv = saisi == null ? t('calculeIv31')
      : !iv ? t('horsPlage')
      : iv.min === iv.max ? t('ivExact', iv.min)
      : t('ivPlage', iv.min, iv.max);
    return `
      <div class="stat">
        <dt>${lib}${signe}</dt>
        <dd><input class="stat-in" type="number" inputmode="numeric" min="1" max="999"
                   data-stat="${cle}" value="${saisi ?? ''}" placeholder="${calcule}"
                   aria-label="${lib}" /></dd>
        <span class="stat-iv ${saisi != null && !iv ? 'faux' : ''}">${libelleIv}</span>
        <label class="stat-ev">${t('statEV')}
          <input type="number" inputmode="numeric" min="0" max="252"
                 data-ev="${cle}" value="${ev || ''}" placeholder="0"
                 aria-label="${t('evDe', lib)}" />
        </label>
      </div>`;
  };
  const bloc = st ? `
    <dl class="stats">
      ${statLignes().map(([cle, lib]) => champ(cle, lib, st[cle], cle === 'pv')).join('')}
    </dl>
    <p class="stat-note">
      ${t('noteStats')}${Object.keys(perso).length || Object.keys(evs).length
        ? ` <button data-act="stats-reset">${t('toutEffacer')}</button>` : ''}
    </p>` : `<p class="none">${t('statsInconnuesCourt')}</p>`;

  return `
    <div class="sheet-top">
      <div class="portrait">
        <img src="${sprites.still(spriteKey(m.key), !!m.shiny)}" alt=""
             ${imgFallback(espece, !!m.shiny)} />
        <button class="shiny-btn ${m.shiny ? 'on' : ''}" data-act="eq-shiny"
                aria-pressed="${!!m.shiny}"
                title="${m.shiny ? t('voirNormale') : t('voirChromatique')}">&#10022;</button>
      </div>
      <div>
        <h2 class="sheet-name">${esc(monName(m.key))}</h2>
        <div class="types">${(p.types || []).map((t) =>
          `<span class="type" style="--t:${TYPES[t]?.[1] || '#888'}">${TYPES[t]?.[0] || t}</span>`).join('')}</div>
      </div>
    </div>

    <div class="niv-rang">
      <span>${t('niveau')}</span>
      <button data-niv="-10">−10</button>
      <button data-niv="-1">−1</button>
      <b>${niv}</b>
      <button data-niv="1">+1</button>
      <button data-niv="10">+10</button>
    </div>

    <h3>${t('talent')} ${talents.length ? '' : `<small>${t('aucunDansCeJeu')}</small>`}</h3>
    ${talents.length ? `
      <button class="ligne-choix" data-choix="talent">
        <span class="lc-t">${talent ? esc(talent.n) : t('choisirTalent')}</span>
        ${talent?.d ? `<span class="lc-d">${esc(talent.d)}</span>` : ''}
      </button>`
      : `<p class="none">${t('talentsDepuisG3')}</p>`}

    <h3>${t('objetTenu')}</h3>
    ${objetsDispo ? `
      <button class="ligne-choix" data-choix="objet">
        ${objet ? `<img class="lc-i" src="items/${m.objet}.png" alt="" />` : ''}
        <span class="lc-t">${objet ? esc(objet.n) : t('aucunObjet')}</span>
        ${objet?.d ? `<span class="lc-d">${esc(objet.d)}</span>` : ''}
      </button>`
      : `<p class="none">${t('aucunObjetG1')}</p>`}

    <h3>${t('faiblessesEtResistances')} <small>${esc(jeuCourant().nom)}</small></h3>
    ${renderFaiblesses(espece)}

    <h3>${t('nature')}</h3>
    <button class="ligne-choix" data-choix="nature">
      <span class="lc-t">${nature ? esc(nature.n) : t('natureNeutre')}</span>
      <span class="lc-d">${nature && nature.p && nature.p !== nature.m
        ? t('natureEffet', esc(libStat(nature.p)), esc(libStat(nature.m)))
        : t('natureAucunEffet')}</span>
    </button>

    <!-- Le socle de l'espèce, que le niveau ne change pas — à ne pas confondre avec
         les valeurs calculées juste en dessous. Les deux titres se suivent, d'où les
         sous-titres qui les distinguent. -->
    <h3>${t('statsDeBase')} <small>${t('statsIndepNiveau')}</small></h3>
    ${renderStatsBase(m.key)}

    <h3>${t('statistiques')} <small>${t('ivDeduits')}</small></h3>
    ${bloc}

    <h3>${t('attaques')} <small>${esc(jeuCourant().nom)}</small></h3>
    ${pool === null
      ? `<p class="none">${t('pasDansCeJeu', esc(monName(m.key)), esc(jeuCourant().nom))}</p>`
      : `<div class="atq4">
          ${Array.from({ length: 4 }, (_, i) => {
            const id = m.moves?.[i];
            const mv = id ? moves[id] : null;
            if (!mv) return `<button class="atq libre" data-atq="${i}"><b>+</b> ${t('attaqueN', i + 1)}</button>`;
            const [tn, tc] = TYPES[mv.t] || [mv.t || '—', '#888'];
            const ko = !dispo.has(id);
            return `
              <button class="atq ${ko ? 'ko' : ''}" data-atq="${i}">
                <span class="atq-h">
                  <span class="atq-n">${esc(mv.n)}</span>
                  <span class="type mini" style="--t:${tc}">${tn}</span>
                </span>
                <span class="atq-m">${t('puisCourt')} <b>${mv.p ?? '—'}</b> · ${t('precCourt')} <b>${mv.a ?? '—'}</b> · ${t('ppCourt')} <b>${mv.pp ?? '—'}</b>${ko ? ` · <i>${t('indisponibleIci')}</i>` : ''}</span>
              </button>`;
          }).join('')}
        </div>`}

    <h3>${t('degatsTitre')} <small>${esc(jeuCourant().nom)}</small></h3>
    <div class="degats">${htmlDegats(m)}</div>

    <button class="catch-btn retirer" data-act="eq-retirer">${t('retirerDeLequipe')}</button>
  `;
}

// ---------- Menu des attaques ----------
//
// Toutes les attaques qu'on peut apprendre dans les jeux d'une génération — choisie en
// tête du menu —, avec leurs valeurs DE CETTE GÉNÉRATION. Toucher une attaque montre
// qui l'apprend, et comment : niveau, CT/CS, œuf ou maître, jeu par jeu quand ça diffère.
//
// « Disponible dans une génération » = apprenable dans au moins un de ses jeux jouables
// (learnsets-vg.json). Les valeurs sont celles de moves.json, corrigées par génération
// par son champ « h » (scripts/fetch-moves-gen.mjs) : Charge valait 35 de puissance en
// gén. 1, Morsure était Normal. Avant la gén. 4, physique ou spéciale dépendait du TYPE.

const TYPES_PHYSIQUES_AVANT_G4 = new Set(['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel']);
// Sigles des jeux, pour dire en une ligne où un niveau ou une CT diffère.
// Le sigle français est tiré du titre français (« ÉV » pour Écarlate / Violet) : hors
// du français il ne veut plus rien dire. Les autres langues prennent les sigles
// internationaux, ceux de la version anglaise, lus partout — y compris au Japon.
const SIGLES_FR = {
  'red-blue': 'RB', yellow: 'J', 'gold-silver': 'OA', crystal: 'C', 'ruby-sapphire': 'RS', emerald: 'É',
  'firered-leafgreen': 'RFVF', 'diamond-pearl': 'DP', platinum: 'Pt', 'heartgold-soulsilver': 'HGSS',
  'black-white': 'NB', 'black-2-white-2': 'N2B2', 'x-y': 'XY', 'omega-ruby-alpha-sapphire': 'ROSA',
  'sun-moon': 'SL', 'ultra-sun-ultra-moon': 'USUL', 'lets-go-pikachu-lets-go-eevee': 'LGPE',
  'sword-shield': 'ÉB', 'brilliant-diamond-shining-pearl': 'DÉPS', 'legends-arceus': 'LPA', 'scarlet-violet': 'ÉV',
};
const SIGLES_INTL = {
  'red-blue': 'RB', yellow: 'Y', 'gold-silver': 'GS', crystal: 'C', 'ruby-sapphire': 'RS', emerald: 'E',
  'firered-leafgreen': 'FRLG', 'diamond-pearl': 'DP', platinum: 'Pt', 'heartgold-soulsilver': 'HGSS',
  'black-white': 'BW', 'black-2-white-2': 'B2W2', 'x-y': 'XY', 'omega-ruby-alpha-sapphire': 'ORAS',
  'sun-moon': 'SM', 'ultra-sun-ultra-moon': 'USUM', 'lets-go-pikachu-lets-go-eevee': 'LGPE',
  'sword-shield': 'SwSh', 'brilliant-diamond-shining-pearl': 'BDSP', 'legends-arceus': 'LA', 'scarlet-violet': 'SV',
};
const sigleJeu = (k) => (langue() === 'fr' ? SIGLES_FR : SIGLES_INTL)[k] || k;
// Les libellés viennent de la traduction : `groupesApprentissage()` les relit.

// Filtres du menu, gardés en passant à la fiche d'une attaque et en revenant.
const filtreAttaques = { gen: null, type: '', cat: '', tri: 'nom', q: '', y: 0 };

// Valeurs d'une attaque dans une génération.
function attaqueEnGen(id, gen) {
  const b = moves[id];
  if (!b) return null;
  const v = { ...b, ...(b.h?.[gen] || {}) };
  if (gen < 4 && v.c !== 'status' && v.t) v.c = TYPES_PHYSIQUES_AVANT_G4.has(v.t) ? 'physical' : 'special';
  return v;
}

// Index d'une génération : attaque → (clé → { jeu: [sources] }). Construit une fois par
// génération, à la première ouverture.
const INDEX_ATTAQUES = new Map();
function indexAttaques(gen) {
  if (INDEX_ATTAQUES.has(gen)) return INDEX_ATTAQUES.get(gen);
  const jeux = JEUX.filter((v) => NUM_GEN[v.gen] === gen).map((v) => v.k);
  const index = new Map();
  const note = (id, key, jeu, src) => {
    let parCle = index.get(id);
    if (!parCle) index.set(id, (parCle = new Map()));
    let e = parCle.get(key);
    if (!e) parCle.set(key, (e = {}));
    (e[jeu] ??= []).push(src);
  };
  for (const [k, parJeu] of Object.entries(LEARN_VG)) {
    const key = asKey(k);
    for (const jeu of jeux) {
      const l = parJeu[jeu];
      if (!l) continue;
      for (const [id, lv] of l.n) note(id, key, jeu, { r: 0, t: lv > 0 ? t('niveauBadge', lv) : t('depart'), n: lv });
      for (const [id, lab] of l.m) note(id, key, jeu, { r: 1, t: String(lab), n: Number(String(lab).replace(/\D/g, '')) || 0 });
      for (const id of l.o) note(id, key, jeu, { r: 2, t: t('oeuf'), n: 0 });
      for (const id of l.t) note(id, key, jeu, { r: 3, t: t('maitreLong'), n: 0 });
    }
  }
  const res = { jeux, index };
  INDEX_ATTAQUES.set(gen, res);
  return res;
}

function ongletsGenAttaques(gen) {
  return `<div class="paper-gens" role="tablist">
    ${GENS.map((g) => `
      <button class="paper-gen ${g.n === gen ? 'on' : ''}" role="tab" aria-selected="${g.n === gen}" data-atqgen="${g.n}">
        ${t('genCourt', g.n)}<small>${g.name}</small>
      </button>`).join('')}
  </div>`;
}

function ouvreMenuAttaques() {
  openBattleSheet('attaques');
  if (!LEARN_VG) chargeVG().then(() => { if (state.bs && ['attaques', 'infoAttaque'].includes(state.bs.mode)) renderBattleSheet(); });
}

function htmlMenuAttaques() {
  const f = filtreAttaques;
  f.gen ??= genDuJeu();
  f.q = state.bs.q || '';
  const tete = `<h2 class="bs-title">${t('attaques')}</h2>${ongletsGenAttaques(f.gen)}`;
  // Le seul chargement asynchrone de l'appli (les movesets par jeu, 5,7 Mo) : on
  // montre la forme de la liste plutôt qu'une phrase, la page ne saute pas à l'arrivée.
  if (!LEARN_VG) {
    return `${tete}
      <p class="paper-note">${t('chargementAttaques')}</p>
      <ul class="mlist squelette" aria-hidden="true">
        ${Array.from({ length: 8 }, () => `
          <li class="mrow"><span class="move">
            <span class="sq sq-badge"></span>
            <span class="mmain"><span class="sq sq-titre"></span><span class="sq sq-meta"></span></span>
          </span></li>`).join('')}
      </ul>`;
  }
  const { index, jeux } = indexAttaques(f.gen);
  const q = fold(f.q);
  const toutes = [...index.keys()].map((id) => ({ id, v: attaqueEnGen(id, f.gen), qui: index.get(id).size })).filter((x) => x.v);
  const res = toutes.filter(({ v }) => (!q || fold(v.n).includes(q)) && (!f.type || v.t === f.type) && (!f.cat || v.c === f.cat));
  const nom = (a, b) => a.v.n.localeCompare(b.v.n, langue());
  const parValeur = (k) => (a, b) => (b.v[k] ?? -1) - (a.v[k] ?? -1) || nom(a, b);
  res.sort(f.tri === 'puissance' ? parValeur('p') : f.tri === 'precision' ? parValeur('a')
    : f.tri === 'pp' ? parValeur('pp') : f.tri === 'qui' ? (a, b) => b.qui - a.qui || nom(a, b) : nom);
  const nomsJeux = jeux.map((k) => JEUX.find((v) => v.k === k)?.nom).filter(Boolean).join(', ');
  const option = (valeur, libelle, courant) => `<option value="${valeur}" ${valeur === courant ? 'selected' : ''}>${libelle}</option>`;
  return `
    ${tete}
    <p class="paper-note">${t('noteMenuAttaques', toutes.length, f.gen, esc(nomsJeux))}</p>
    <label class="bs-field">
      <span>${t('rechercher')}</span>
      <input class="bs-name bs-q" type="text" value="${esc(f.q)}" placeholder="${t('placeholderAttaque')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
    </label>
    <div class="atq-filtres">
      <select data-atqfiltre="type" aria-label="${t('type')}">
        ${option('', t('type'), f.type)}
        ${typesDeGen(f.gen).map((ty) => option(ty, esc(TYPES[ty]?.[0] || ty), f.type)).join('')}
      </select>
      <select data-atqfiltre="cat" aria-label="${t('categorie')}">
        ${option('', t('categorie'), f.cat)}
        ${Object.entries(CLASSES).map(([k, [n]]) => option(k, esc(n), f.cat)).join('')}
      </select>
      <select data-atqfiltre="tri" aria-label="${t('trierNom')}">
        ${option('nom', t('trierNom'), f.tri)}
        ${option('puissance', t('puissance'), f.tri)}
        ${option('precision', t('precision'), f.tri)}
        ${option('pp', t('ppCourt'), f.tri)}
        ${option('qui', t('trierNbPokemon'), f.tri)}
      </select>
    </div>
    <p class="atq-compte">${res.length === toutes.length ? '' : t('compteSur', res.length, toutes.length)}</p>
    <ul class="mlist">
      ${res.map(({ id, v, qui }) => {
        const [tn, tc] = TYPES[v.t] || [v.t || '—', '#888'];
        const [cn, cc] = CLASSES[v.c] || [v.c || '—', '#888'];
        return `
          <li class="mrow">
            <button class="move" data-infoatq="${id}">
              <span class="mmain">
                <span class="mtitre">
                  <span class="mname">${esc(v.n)}</span>
                  <span class="type mini" style="--t:${tc}">${tn}</span>
                </span>
                <span class="mmeta">
                  <span class="mcls" style="--c:${cc}">${cn}</span>
                  <span>${t('puisCourt')} <b>${v.p ?? '—'}</b></span>
                  <span>${t('precCourt')} <b>${v.a ?? '—'}</b></span>
                  <span>${t('ppCourt')} <b>${v.pp ?? '—'}</b></span>
                  <span>${t('nPokemon', qui)}</span>
                </span>
              </span>
              <span class="mchev">›</span>
            </button>
          </li>`;
      }).join('')}
    </ul>
    ${res.length ? '' : `<p class="paper-note">${t('aucuneAttaqueCorrespond')}</p>`}`;
}

// Fiche d'une attaque : ses valeurs dans la génération choisie, et qui l'apprend.
function htmlInfoAttaque() {
  const id = state.bs.slot;
  const gen = filtreAttaques.gen ?? genDuJeu();
  const v = attaqueEnGen(id, gen);
  if (!v) return `<p class="none">${t('attaqueInconnue')}</p>`;
  const retour = `<button class="atq-retour" data-act="atq-retour">${t('toutesLesAttaques')}</button>`;
  if (!LEARN_VG) return `${retour}<p class="paper-note">${t('chargementAttaques')}</p>`;
  const { index, jeux } = indexAttaques(gen);
  const parCle = index.get(id) || new Map();
  const [tn, tc] = TYPES[v.t] || [v.t || '—', '#888'];
  const [cn, cc] = CLASSES[v.c] || [v.c || '—', '#888'];

  // Ce qui a changé depuis, pour ne pas laisser croire à une erreur.
  const actuel = attaqueEnGen(id, 9);
  const changes = [];
  if (actuel.p !== v.p) changes.push(t('chgPuissance', actuel.p ?? '—'));
  if (actuel.a !== v.a) changes.push(t('chgPrecision', actuel.a ?? '—'));
  if (actuel.pp !== v.pp) changes.push(t('chgPP', actuel.pp));
  if (actuel.t !== v.t) changes.push(t('chgType', TYPES[actuel.t]?.[0] || actuel.t));
  if (actuel.c !== v.c) changes.push((CLASSES[actuel.c]?.[0] || actuel.c).toLowerCase());

  // Un groupe par mode d'apprentissage ; dans chaque groupe, un Pokémon par ligne, avec
  // son niveau ou sa CT — une seule fois si tous les jeux de la génération s'accordent,
  // jeu par jeu sinon.
  const GROUPES = groupesApprentissage();
  const groupes = GROUPES.map(() => []);
  for (const [key, parJeu] of parCle) {
    for (let r = 0; r < 4; r++) {
      const parJeuR = jeux
        .map((j) => [j, (parJeu[j] || []).filter((s) => s.r === r)])
        .filter(([, s]) => s.length);
      if (!parJeuR.length) continue;
      const libelle = (s) => s.map((x) => x.t).join(' / ');
      const differents = new Set(parJeuR.map(([, s]) => libelle(s)));
      // Une seule mention si TOUS les jeux où le Pokémon apparaît s'accordent ; sinon on
      // dit dans lesquels — Pikachu apprend Tonnerre au N.26 dans Rouge/Bleu, pas dans Jaune.
      const present = jeux.filter((j) => LEARN_VG[key]?.[j] || LEARN_VG[speciesOf(key)]?.[j]).length;
      const texte = differents.size === 1
        ? [...differents][0] + (parJeuR.length < present ? ` ${parJeuR.map(([j]) => sigleJeu(j)).join(' ')}` : '')
        : parJeuR.map(([j, s]) => `${libelle(s)} ${sigleJeu(j)}`).join(' · ');
      const tri = Math.min(...parJeuR.flatMap(([, s]) => s.map((x) => x.n)));
      groupes[r].push({ key, texte, tri });
    }
  }
  const ordre = (a, b) => a.tri - b.tri || speciesOf(a.key) - speciesOf(b.key) || String(a.key).localeCompare(String(b.key));
  const nomsJeux = jeux.map((k) => `${sigleJeu(k)} = ${JEUX.find((x) => x.k === k)?.nom || k}`).join(' · ');
  const nbGroupes = groupes.filter((g) => g.length).length;

  return `
    ${retour}
    ${ongletsGenAttaques(gen)}
    <h2 class="bs-title atq-titre">${esc(v.n)}</h2>
    <div class="atq-types-ligne">
      <span class="type" style="--t:${tc}">${tn}</span>
      <span class="mcls" style="--c:${cc}">${cn}</span>
    </div>
    <dl class="atq-fiche">
      <div><dt>${t('puissance')}</dt><dd>${v.p ?? '—'}</dd></div>
      <div><dt>${t('precision')}</dt><dd>${v.a != null ? `${v.a} %` : '—'}</dd></div>
      <div><dt>${t('ppCourt')}</dt><dd>${v.pp ?? '—'}</dd></div>
      <div><dt>${t('categorie')}</dt><dd style="color:${cc}">${cn}</dd></div>
    </dl>
    ${v.d ? `<p class="atq-desc">${esc(v.d)}</p>` : ''}
    <p class="paper-note">${t('valeursGen', gen, v.g)}${changes.length
      ? t('aujourdhui', esc(changes.join(', '))) : ''}${gen < 4 && v.c !== 'status'
      ? t('avantG4') : ''}</p>

    <h3>${t('quiLApprend', gen)} <small>${t('nPokemon', parCle.size)}</small></h3>
    ${parCle.size ? `<p class="paper-note">${esc(nomsJeux)}</p>`
      : `<p class="none">${v.g && v.g > gen ? t('pasEncore', v.g) : t('aucunNeLApprend', gen)}</p>`}
    ${groupes.map((liste, r) => (liste.length ? `
      <details class="mgroup" ${r === 0 || nbGroupes === 1 ? 'open' : ''}>
        <summary>${GROUPES[r]} <b>${liste.length}</b></summary>
        <div class="picks appr">
          ${liste.sort(ordre).map((x) => `
            <div class="pick ${isCaught(x.key) ? '' : 'gris'}">
              <img src="${sprites.still(spriteKey(x.key))}" alt="" loading="lazy" ${imgFallback(speciesOf(x.key), false)} />
              <span>${esc(monName(x.key))}<i>${t('numero', speciesOf(x.key))}</i></span>
              <span class="appr-src">${esc(x.texte)}</span>
            </div>`).join('')}
        </div>
      </details>` : '')).join('')}`;
}

// Choix d'une attaque parmi celles apprenables dans le jeu courant.
function htmlChoixAttaque() {
  const m = equipe()[state.bs.slot];
  if (!m) return `<p class="none">${t('emplacementVide')}</p>`;
  const espece = speciesOf(m.key);
  const pool = poolAttaques(m.key, state.jeu) || [];
  const q = fold(state.bs.q || '');
  const res = pool
    .filter((x) => !q || fold(moves[x.id]?.n || '').includes(q))
    // Le tri de JS est stable : trier sur le seul groupe conserve l'ordre du
    // fichier, donc les attaques par niveau restent classées PAR NIVEAU et les CT
    // par numéro. Trier par nom à l'intérieur d'un groupe affichait N.62 avant N.1.
    .sort((a, b) => a.rang - b.rang);

  return `
    <h2 class="bs-title">${t('attaqueDe', state.bs.emplacement + 1, esc(monName(m.key)))}</h2>
    <p class="paper-note">${t('attaquesDispo', pool.length, esc(jeuCourant().nom))}</p>
    <label class="bs-field">
      <span>${t('rechercher')}</span>
      <input class="bs-name bs-q" type="text" value="${esc(state.bs.q || '')}"
             placeholder="${t('placeholderAttaque')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
    </label>
    <ul class="mlist">
      ${res.map((x) => {
        const mv = moves[x.id];
        if (!mv) return '';
        const [tn, tc] = TYPES[mv.t] || [mv.t || '—', '#888'];
        const [cn, cc] = CLASSES[mv.c] || [mv.c || '—', '#888'];
        const choisie = m.moves?.includes(x.id);
        return `
          <li class="mrow">
            <button class="move ${choisie ? 'ouvert' : ''}" data-pickatq="${x.id}">
              <span class="mbadge">${esc(x.src)}</span>
              <span class="mmain">
                <span class="mtitre">
                  <span class="mname">${esc(mv.n)}</span>
                  <span class="type mini" style="--t:${tc}">${tn}</span>
                </span>
                <span class="mmeta">
                  <span class="mcls" style="--c:${cc}">${cn}</span>
                  <span>${t('puisCourt')} <b>${mv.p ?? '—'}</b></span>
                  <span>${t('precCourt')} <b>${mv.a ?? '—'}</b></span>
                  <span>${t('ppCourt')} <b>${mv.pp ?? '—'}</b></span>
                </span>
              </span>
              ${choisie ? '<span class="mchev">✓</span>' : ''}
            </button>
          </li>`;
      }).join('')}
    </ul>
    ${res.length ? '' : `<p class="paper-note">${t('aucuneAttaqueCorrespond')}</p>`}
  `;
}

// ---------- Interactions ----------

const saisieCombat = (e) => {
  if (e.target.classList.contains('bs-q')) {
    state.bs.q = e.target.value;
    renderBattleSheet(true);
    return;
  }

  // Saisie d'une stat ou d'un EV. On agit sur le DOM plutôt que de reconstruire le
  // panneau : un renderBattleSheet() ferait perdre le focus à chaque frappe.
  const champEv = e.target.closest('[data-ev]');
  if (champEv) {
    const mm = equipe()[state.bs.slot];
    const cle = champEv.dataset.ev;
    const v = Number(champEv.value.trim());
    mm.evs = mm.evs || {};
    if (!champEv.value.trim() || !Number.isFinite(v) || v <= 0) delete mm.evs[cle];
    else mm.evs[cle] = Math.min(252, Math.round(v));
    if (!Object.keys(mm.evs).length) delete mm.evs;
    saveCombat();
    majEtiquetteIv(champEv.closest('.stat'), mm, cle);
    if (cle === 'pv') render();
    return;
  }

  const champ = e.target.closest('[data-stat]');
  if (!champ) return;
  const m = equipe()[state.bs.slot];
  const st = statsDe(m.key);
  if (!st) return;
  const cle = champ.dataset.stat;
  const brut = champ.value.trim();
  const val = brut === '' ? null : Number(brut);

  m.stats = m.stats || {};
  if (val == null || !Number.isFinite(val) || val <= 0) delete m.stats[cle];
  else m.stats[cle] = Math.round(val);
  if (!Object.keys(m.stats).length) delete m.stats;
  saveCombat();

  majEtiquetteIv(champ.closest('.stat'), m, cle);
  // Les PV du panneau suivent la saisie ; le panneau lui-même n'est pas refait.
  if (cle === 'pv') render();
};
for (const c of [battleBody, corpsAtq]) c.addEventListener('input', saisieCombat);

// Recalcule l'étiquette « IV … » d'une cellule, nature et EV compris.
function majEtiquetteIv(cellule, m, cle) {
  if (!cellule) return;
  const st = statsDe(m.key);
  if (!st) return;
  const niv = m.niv ?? NIV_DEFAUT;
  const espece = speciesOf(m.key);
  const base = st[cle];
  const saisi = m.stats?.[cle];
  const ev = m.evs?.[cle] || 0;
  const mult = cle === 'pv' ? 1 : multNature(cle, m.nature);
  const iv = saisi != null ? ivPossibles(base, niv, saisi, cle === 'pv', espece, ev, mult) : null;
  const etiq = cellule.querySelector('.stat-iv');
  if (!etiq) return;
  etiq.textContent = saisi == null ? 'calculé à IV 31'
    : !iv ? 'hors plage'
    : iv.min === iv.max ? `IV ${iv.min}`
    : `IV ${iv.min}–${iv.max}`;
  etiq.classList.toggle('faux', saisi != null && !iv);
  // Le repère grisé du champ suit aussi la nature et les EV.
  const entree = cellule.querySelector('.stat-in');
  if (entree) entree.placeholder = String(cle === 'pv'
    ? calcPV(base, niv, espece, ev) : calcStat(base, niv, ev, mult));
}

// Menu des attaques : type, catégorie et tri se choisissent dans des listes déroulantes.
const filtreCombat = (e) => {
  const filtre = e.target.closest('[data-atqfiltre]');
  if (!filtre || state.bs?.mode !== 'attaques') return;
  filtreAttaques[filtre.dataset.atqfiltre] = filtre.value;
  renderBattleSheet();
};

for (const c of [battleBody, corpsAtq]) c.addEventListener('change', filtreCombat);

// Après la saisie d'une stat ou d'un EV (écoute posée APRÈS celle qui l'enregistre).
battleBody.addEventListener('input', (e) => {
  if (state.bs?.mode === 'detail' && e.target.closest('[data-ev], [data-stat]')) majDegats();
});

const clicCombat = (e) => {
  const bs = state.bs;
  if (!bs) return;

  // ---- Menu des attaques
  const genAtq = e.target.closest('[data-atqgen]');
  if (genAtq) { filtreAttaques.gen = +genAtq.dataset.atqgen; renderBattleSheet(); defileCombat().scrollTop = 0; return; }
  const infoAtq = e.target.closest('[data-infoatq]');
  if (infoAtq) {
    filtreAttaques.y = defileCombat().scrollTop;
    openBattleSheet('infoAttaque', +infoAtq.dataset.infoatq);
    return;
  }
  if (e.target.closest('[data-act="atq-retour"]')) { retourMenuAttaques(); return; }

  const jeu = e.target.closest('[data-jeu]');
  if (jeu) {
    state.jeu = jeu.dataset.jeu;
    saveCombat();
    closeBattleSheet();
    render();
    return;
  }

  const gen = e.target.closest('[data-agen]');
  if (gen) { state.addGen = +gen.dataset.agen; renderBattleSheet(); return; }

  if (e.target.closest('[data-act="sd-valider"]')) { importeShowdown(); return; }
  const copier = e.target.closest('[data-act="sd-copier"]');
  if (copier) { copieShowdown(copier); return; }

  const cib = e.target.closest('[data-ciblepick]');
  if (cib) {
    cibleDegats = { key: asKey(cib.dataset.ciblepick), niv: null };
    retourHaptique();
    openBattleSheet('detail', bs.slot);
    return;
  }

  const nivCib = e.target.closest('[data-nivcible]');
  if (nivCib && cibleDegats) {
    const m = equipe()[bs.slot];
    const depart = cibleDegats.niv ?? (m?.niv ?? NIV_DEFAUT);
    cibleDegats.niv = Math.max(1, Math.min(100, depart + Number(nivCib.dataset.nivcible)));
    majDegats();
    return;
  }

  const pick = e.target.closest('[data-eqpick]');
  if (pick) {
    equipe()[bs.slot] = { key: asKey(pick.dataset.eqpick), niv: NIV_DEFAUT, moves: [] };
    saveCombat();
    render();
    openBattleSheet('detail', bs.slot);
    return;
  }

  const niv = e.target.closest('[data-niv]');
  if (niv) {
    const m = equipe()[bs.slot];
    m.niv = Math.max(1, Math.min(100, (m.niv ?? NIV_DEFAUT) + Number(niv.dataset.niv)));
    saveCombat();
    render();
    renderBattleSheet();
    return;
  }

  const ligneChoix = e.target.closest('[data-choix]');
  if (ligneChoix) { openBattleSheet(ligneChoix.dataset.choix, bs.slot); return; }

  const nat = e.target.closest('[data-picknat]');
  if (nat) {
    equipe()[bs.slot].nature = nat.dataset.picknat || null;
    saveCombat();
    retourHaptique();
    openBattleSheet('detail', bs.slot);
    return;
  }

  const tal = e.target.closest('[data-picktal]');
  if (tal) {
    equipe()[bs.slot].talent = tal.dataset.picktal || null;
    saveCombat();
    retourHaptique();
    openBattleSheet('detail', bs.slot);
    return;
  }

  const obj = e.target.closest('[data-pickobj]');
  if (obj) {
    equipe()[bs.slot].objet = obj.dataset.pickobj || null;
    saveCombat();
    render();
    retourHaptique();
    openBattleSheet('detail', bs.slot);
    return;
  }

  const atq = e.target.closest('[data-atq]');
  if (atq) { openBattleSheet('attaque', bs.slot, +atq.dataset.atq); return; }

  const choix = e.target.closest('[data-pickatq]');
  if (choix) {
    const m = equipe()[bs.slot];
    m.moves = m.moves || [];
    const id = +choix.dataset.pickatq;
    // Déjà dans une autre case : on l'y retire, une attaque ne se met pas en double.
    const ailleurs = m.moves.indexOf(id);
    if (ailleurs >= 0 && ailleurs !== bs.emplacement) m.moves[ailleurs] = undefined;
    m.moves[bs.emplacement] = id;
    saveCombat();
    retourHaptique();
    openBattleSheet('detail', bs.slot);
    return;
  }

  if (e.target.closest('[data-act="eq-shiny"]')) {
    const m = equipe()[bs.slot];
    m.shiny = !m.shiny;
    saveCombat();
    render();
    renderBattleSheet();
    return;
  }

  if (e.target.closest('[data-act="stats-reset"]')) {
    delete equipe()[bs.slot].stats;
    delete equipe()[bs.slot].evs;
    saveCombat();
    render();
    renderBattleSheet();
    return;
  }

  if (e.target.closest('[data-act="eq-retirer"]')) {
    equipe()[bs.slot] = null;
    saveCombat();
    closeBattleSheet();
    render();
  }
};
for (const c of [battleBody, corpsAtq]) c.addEventListener('click', clicCombat);

// Changer de vue referme tout panneau ouvert. Un panneau appartient à sa vue : le
// détail d'un membre d'équipe n'a aucun sens par-dessus la gestion des boîtes, et
// la fiche d'un Pokémon n'en a pas davantage par-dessus la boîte de combat.
function fermeLesPanneaux() {
  closeBattleSheet();
  closeSheet();
  closeBoxSheet();
  closeAddSheet();
  fermeComptePanneau();
  fermeLegal();
}

app.addEventListener('click', (e) => {
  // La bascule de vue est écoutée sur la barre elle-même, qui vit hors de #app.
  if (state.vue !== 'combat') return;

  if (e.target.closest('[data-act="choix-jeu"]')) { openBattleSheet('version'); return; }
  if (e.target.closest('[data-act="sd-export"]')) { ouvreShowdown('sd-export'); return; }
  if (e.target.closest('[data-act="sd-import"]')) { ouvreShowdown('sd-import'); return; }
  if (e.target.closest('[data-act="menu-attaques"]')) { ouvreMenuAttaques(); return; }

  const eq = e.target.closest('[data-eq]');
  if (eq) {
    const i = +eq.dataset.eq;
    state.addGen = ONGLETS[state.gen].n;
    openBattleSheet(equipe()[i] ? 'detail' : 'mon', i);
  }
});

// ---------- Vue Pokédex ----------
//
// Troisième vue, entre les boîtes et le combat. Elle liste les ESPÈCES d'une
// génération, sans leurs formes : c'est le Pokédex national, où Méga-Dracaufeu n'a
// pas d'entrée propre. Les formes restent consultables dans la fiche, qui les liste
// déjà et permet de les ranger.
//
// La fiche ouverte ici est exactement celle des boîtes (`openSheet`) : description,
// famille d'évolution, formes, talents, attaques et lieux de capture.

// Plage d'un Pokédex : 0 est le national, 1 à 9 les générations. Déclarée en
// fonction, donc disponible partout — `voisinFiche` compris.
function plageDex(n) {
  return n ? GENS[n - 1] : { n: 0, name: t('national'), from: 1, to: 1025 };
}

// Taux de remplissage d'un Pokédex, d'après la collection ACTIVE — donc le
// Pokédex chromatique quand la vue chromatique est allumée, comme dans les boîtes.
function progresDex(n) {
  const g = plageDex(n);
  let pris = 0;
  for (let id = g.from; id <= g.to; id++) if (isCaught(id)) pris++;
  return { pris, total: g.to - g.from + 1 };
}

const texteRes = (n) => (n === 0 ? t('aucunCorrespond') : t('nResultats', n));

// Illustrations des cartes du menu : les trois starters de chaque région, dans
// l'ordre Plante, Feu, Eau. Le national prend Évoli et Pikachu.
const STARTERS_DEX = [[133, 25], [1, 4, 7], [152, 155, 158], [252, 255, 258],
  [387, 390, 393], [495, 498, 501], [650, 653, 656], [722, 725, 728], [810, 813, 816],
  [906, 909, 912]];

// Sceau « complet » : un disque dentelé à 12 pointes, découpé par `clip-path` dans un
// simple fond coloré, de sorte que sa couleur reste réglée par la feuille de style.
const SCEAU = (() => {
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 ? 42 : 50;
    pts.push(`${(50 + r * Math.sin(a)).toFixed(1)}% ${(50 - r * Math.cos(a)).toFixed(1)}%`);
  }
  return `polygon(${pts.join(', ')})`;
})();

function carteDex(n) {
  const g = plageDex(n);
  const { pris, total } = progresDex(n);
  const fini = pris === total;
  const sh = shinyView();
  return `
    <button class="dexc" data-dexgen="${n}"
            aria-label="${esc(t('boitesSous', g.name, pris, total))}${fini ? ', ' + t('dexComplet') : ''}">
      <span class="dexc-txt">
        <span class="dexc-haut">
          <span class="dexc-nom">${esc(g.name)}</span>
          <span class="dexc-cpt"><b>${pris}</b>/${total.toLocaleString(langue())}</span>
        </span>
        <span class="dexc-bas">
          <span class="dexc-bar"><i style="width:${(100 * pris) / total}%"></i></span>
          ${fini ? `<span class="dexc-ok" style="clip-path:${SCEAU}" aria-hidden="true"><svg
            viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>` : ''}
        </span>
      </span>
      <span class="dexc-img" aria-hidden="true">${STARTERS_DEX[n].map((id) =>
        `<img src="${sprites.art(id, sh)}" alt="" loading="lazy" ${imgFallback(id, sh)} />`).join('')}</span>
    </button>`;
}

// Menu du Pokédex, repris de la maquette fournie : le champ de recherche en tête,
// puis une carte par Pokédex — le national, puis les neuf régions. Toucher une carte
// ouvre la grille habituelle ; chercher remplace les cartes par les résultats.
function renderMenuDex() {
  const q = state.dexQ.trim();
  const ids = especesDex();
  const tout = progresDex(0);
  poser(
    entete(t('pokedex'), t('pokedexSous', tout.pris, tout.total)),
    h(`
    <section class="dexm">
      <input class="dexm-rech" type="search" data-dexq placeholder="${t('chercherPokemon')}"
             value="${esc(state.dexQ)}" aria-label="${t('chercherPokemon')}"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
      <p class="dex-res" ${q ? '' : 'hidden'}>${q ? texteRes(ids.length) : ''}</p>
      <div class="dex-grid" ${q ? '' : 'hidden'}>${ids.map(caseDex).join('')}</div>
      <div class="dex-cartes" ${q ? 'hidden' : ''}>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(carteDex).join('')}</div>
    </section>`)
  );
}

const caseDex = (id) => {
  const p = pokedex[id] || {};
  const vu = isCaught(id);
  return `
    <button class="dx ${vu ? '' : 'gris'}" data-dex="${id}"
            aria-label="${esc(p.name || t('numero', id))}${vu ? ', ' + t('capture') : ''}">
      <img src="${sprites.still(id, shinyView())}" alt="" loading="lazy"
           ${imgFallback(id, shinyView())} />
      <span class="dx-num">${t('numero', String(id).padStart(4, '0'))}</span>
      <span class="dx-nom">${esc(p.name || '—')}</span>
      ${vu ? '<span class="dx-ok" aria-hidden="true"></span>' : ''}
    </button>`;
};

// La recherche BALAIE LES NEUF GÉNÉRATIONS et ignore donc l'onglet, comme celle du
// sélecteur des boîtes : on cherche justement ce qu'on ne sait pas situer. Sans
// recherche, on s'en tient à la génération affichée.
//
// Le numéro est indexé au même titre que le nom, et `fold` retire les accents :
// « ecaiglaire » doit trouver Écaiglaire.
function especesDex() {
  return filtreDex(especesDexBrutes());
}

function especesDexBrutes() {
  const q = state.dexQ.trim();
  let ids;
  if (!q) {
    if (state.dexGen === null) return []; // dans le menu, sans recherche : les cartes
    const g = plageDex(state.dexGen);
    ids = range(g.from, g.to);
  } else {
    const f = fold(q);
    ids = range(1, 1025).filter((id) =>
      String(id).includes(f) || fold(pokedex[id]?.name || '').includes(f));
  }
  // Le type et le tri n'existent que dans la grille : le menu n'en a pas les commandes,
  // et une recherche lancée depuis le menu ne doit pas hériter d'un filtre invisible.
  if (state.dexGen === null) return ids;
  if (state.dexType) ids = ids.filter((id) => pokedex[id]?.types?.includes(state.dexType));
  return trieDex(ids);
}

// Tri de la grille. Les stats se lisent du plus fort au plus faible : on cherche le
// Pokémon le plus rapide de sa région, pas le plus lent. À égalité, l'ordre du Pokédex.
function trieDex(ids) {
  const tri = state.dexTri;
  if (tri === 'num') return ids;
  if (tri === 'nom') {
    const lg = document.documentElement.lang || 'fr';
    return [...ids].sort((a, b) => (pokedex[a]?.name || '').localeCompare(pokedex[b]?.name || '', lg));
  }
  const val = (id) => {
    const st = statsDe(id);
    if (!st) return -1;
    return tri === 'total' ? STAT_CLES.reduce((n, k) => n + (st[k] || 0), 0) : (st[tri] ?? -1);
  };
  return [...ids].sort((a, b) => val(b) - val(a) || a - b);
}
const STAT_CLES = ['pv', 'att', 'def', 'atts', 'defs', 'vit'];

// Les deux listes déroulantes de la grille, au gabarit des filtres de la page des
// attaques. Le libellé de la position par défaut sert d'intitulé : « Type », « Tri : n° ».
function htmlSelectsDex() {
  const option = (v, lib, courant) => `<option value="${v}" ${v === courant ? 'selected' : ''}>${esc(lib)}</option>`;
  return `
    <div class="atq-filtres dex-selects">
      <select data-dexsel="type" aria-label="${t('type')}">
        ${option('', t('tousLesTypes'), state.dexType)}
        ${typechart.types.map((ty) => option(ty, TYPES[ty]?.[0] || ty, state.dexType)).join('')}
      </select>
      <select data-dexsel="tri" aria-label="${t('trierNumero')}">
        ${option('num', t('trierNumero'), state.dexTri)}
        ${option('nom', t('trierNom'), state.dexTri)}
        ${option('total', t('trierTotal'), state.dexTri)}
        ${statLignes().map(([k, lib]) => option(k, t('trierPar', lib), state.dexTri)).join('')}
      </select>
    </div>`;
}

// LA question d'un Living Dex est « qu'est-ce qui me manque ? ». Sans ce filtre, il
// fallait la poser en parcourant à l'œil une grille de 151 cases à la recherche des
// sprites gris. Il suit la collection ACTIVE (`isCaught`), donc la vue chromatique.
// Le menu n'est pas filtré : ses cartes montrent déjà l'avancement de chaque région.
function filtreDex(ids) {
  if (state.dexGen === null || state.dexFiltre === 'tous') return ids;
  const voulu = state.dexFiltre === 'captures';
  return ids.filter((id) => isCaught(id) === voulu);
}

// Le rail du filtre, avec le nombre d'espèces de chaque position : il dit d'avance ce
// qu'on va trouver, et « Manquants · 0 » annonce une région complète sans qu'on ait à
// y entrer. Même composant que les rails des Réglages, curseur glissant compris.
function htmlFiltreDex() {
  const ids = especesDexBrutes();
  const pris = ids.filter(isCaught).length;
  const options = [
    ['tous', t('dexFiltreTous'), ids.length],
    ['manquants', t('dexFiltreManquants'), ids.length - pris],
    ['captures', t('dexFiltreCaptures'), pris],
  ];
  const i = Math.max(0, options.findIndex(([v]) => v === state.dexFiltre));
  return `
    <div class="reg-rail dex-filtre" role="radiogroup" aria-label="${t('dexFiltreAria')}"
         style="--i:${i};--n:${options.length}">
      ${options.map(([v, lib, n]) => `
        <button class="${v === state.dexFiltre ? 'on' : ''}" role="radio"
                aria-checked="${v === state.dexFiltre}" data-dexfiltre="${v}">
          ${esc(lib)}<small>${n}</small>
        </button>`).join('')}
    </div>`;
}

// Ce qu'affiche une grille vide, selon ce qui l'a vidée.
function videDex() {
  if (state.dexQ.trim()) return '';
  if (state.dexType && !especesDexBrutes().length) return `<p class="dex-vide">${t('dexAucunDeCeType')}</p>`;
  if (state.dexFiltre === 'manquants') return `<p class="dex-vide complet">${t('dexRienNeManque')}</p>`;
  if (state.dexFiltre === 'captures') return `<p class="dex-vide">${t('dexAucunCapture')}</p>`;
  return '';
}

// ---------- Vue Scan ----------
//
// Tout le scan vit dans scan.js : caméra, cadre, analyse. main.js ne fait que poser
// son élément dans la vue et lui fournir de quoi ouvrir une fiche — la même que
// celle du Pokédex. L'élément est créé UNE fois et reposé à chaque rendu : le
// recréer relancerait la caméra à chaque capture cochée depuis la fiche.
const scan = creeScan({
  // Le scan vit à part : il reçoit `t` plutôt que d'importer i18n.js lui-même, ce
  // qui garde main.js seul maître de l'ordre de chargement des traductions.
  t,
  ouvrirFiche: (key) => openSheet(key),
  // Le nom affiché sur un Pokémon suivi : celui de l'ESPÈCE, plus court et plus parlant
  // qu'un nom de forme (« Forme d'Alola ») sur un cadre.
  nomDe: (key) => pokedex[speciesOf(key)]?.name ?? String(key),
  // Sous la fiche, le suivi se met en pause.
  estMasque: () => sheet.classList.contains('open'),
});

function renderScan() {
  poser(scan.element);
  scan.demarre();
}

function renderPokedex() {
  if (state.dexGen === null) return renderMenuDex();
  const n = state.dexGen;
  const g = plageDex(n);
  const { pris, total } = progresDex(n);
  // Le total national, pour situer la génération dans l'ensemble.
  let prisTout = 0;
  for (let id = 1; id <= 1025; id++) if (isCaught(id)) prisTout++;

  const ids = especesDex();
  const cases = ids.map(caseDex).join('');

  poser(
    h(`
      <section class="dex">
        <div class="dex-head">
          <button class="dex-retour" data-dex-retour aria-label="${t('retourMenuDex')}">${ICO.gauche}</button>
          <div class="dex-titre">
            <b>${esc(g.name)}</b>
            <small>${t('numero', g.from)} – ${g.to}</small>
          </div>
          <div class="dex-compte"><b>${pris}</b>/${total}</div>
        </div>
        <div class="bar dex-bar"><span style="width:${total ? (100 * pris) / total : 0}%"></span></div>
        <p class="dex-tout">${n ? t('surTotal', prisTout) : t('toutesGenerations')}${shinyView() ? ' · ' + t('pokedexChromatique') : ''}</p>

        <div class="dex-rech">
          <input type="search" data-dexq placeholder="${t('chercherNomNumero')}"
                 value="${esc(state.dexQ)}" aria-label="${t('chercherPokemon')}"
                 autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
        </div>
        ${htmlSelectsDex()}
        ${htmlFiltreDex()}
        <p class="dex-res" ${state.dexQ.trim() ? '' : 'hidden'}>${state.dexQ.trim() ? texteRes(ids.length) : ''}</p>

        <div class="dex-grid">${cases}</div>
        <div class="dex-vide-zone">${ids.length ? '' : videDex()}</div>

        <p class="hint">${t('aideDex')}</p>
      </section>`),
  );
}

// La frappe agit SUR LE DOM : reconstruire la vue ferait perdre le focus au champ
// à chaque caractère, comme pour le nom de boîte.
app.addEventListener('input', (e) => {
  const champ = e.target.closest('[data-dexq]');
  if (!champ) return;
  state.dexQ = champ.value;
  majGrilleDex();
});

// Met à jour la grille, le rail et l'état vide EN PLACE, sans rendre la vue : la
// frappe garde le focus, et le curseur du rail GLISSE d'une position à l'autre — ce
// qu'il ne peut faire que si l'élément survit au changement.
function majGrilleDex() {
  const ids = especesDex();
  const q = state.dexQ.trim();
  const grille = app.querySelector('.dex-grid');
  if (grille) grille.innerHTML = ids.map(caseDex).join('');
  const rail = app.querySelector('.dex-filtre');
  if (rail) {
    const neuf = h(htmlFiltreDex());
    rail.style.setProperty('--i', neuf.style.getPropertyValue('--i'));
    rail.querySelectorAll('button').forEach((b, k) => {
      const n = neuf.querySelectorAll('button')[k];
      b.className = n.className;
      b.setAttribute('aria-checked', n.getAttribute('aria-checked'));
      b.querySelector('small').textContent = n.querySelector('small').textContent;
    });
  }
  const vide = app.querySelector('.dex-vide-zone');
  if (vide) vide.innerHTML = ids.length ? '' : videDex();
  const info = app.querySelector('.dex-res');
  if (info) { info.hidden = !q; info.textContent = q ? texteRes(ids.length) : ''; }
  // Dans le menu, les résultats prennent la place des cartes, qui reviennent quand
  // le champ se vide.
  const cartes = app.querySelector('.dex-cartes');
  if (cartes && grille) { cartes.hidden = !!q; grille.hidden = !q; }
}

app.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-dexsel]');
  if (!sel) return;
  if (sel.dataset.dexsel === 'type') state.dexType = sel.value;
  else state.dexTri = sel.value;
  majGrilleDex();
});

app.addEventListener('click', (e) => {
  const f = e.target.closest('[data-dexfiltre]');
  if (!f) return;
  state.dexFiltre = f.dataset.dexfiltre;
  retourHaptique();
  majGrilleDex();
});

app.addEventListener('click', (e) => {
  const onglet = e.target.closest('[data-dexgen]');
  if (onglet) {
    // Carte du menu : ouvrir ce Pokédex sort de la recherche. Les onglets de la
    // grille, eux, sont traités sur leur propre barre.
    state.dexQ = '';
    state.dexGen = +onglet.dataset.dexgen;
    render();
    return;
  }
  if (e.target.closest('[data-dex-retour]')) {
    state.dexGen = null;
    state.dexQ = '';
    state.dexType = '';
    render();
    return;
  }
  const carte = e.target.closest('[data-dex]');
  if (carte) openSheet(Number(carte.dataset.dex));
});

// Retour d'une connexion par Google : sur le web, le navigateur a quitté la page
// puis y est revenu. L'appli s'ouvre TOUJOURS sur l'accueil — on retombait donc à la
// case départ, connecté mais sans rien qui le dise, ce qui se vit comme « la page
// s'actualise et il ne se passe rien ». On rouvre les Réglages, là où le compte est.
if (compteUI.revientDeConnexion()) state.vue = 'reglages';

// La surcouche doit être en place AVANT le premier rendu : sinon l'appli s'ouvrirait
// une fraction de seconde en français avant de se retraduire. En français il n'y a
// rien à charger et `chargeLangue` rend la main tout de suite.
poseLangueEtRend(langue());

// Le compte se relit au démarrage. `demarre()` rend la main tout de suite quand rien
// n'est configuré, et n'attend jamais le réseau : le premier rendu n'en dépend pas.
compteUI.branche(app, compteSheet);
// La synchronisation reçoit de quoi lire et poser la collection. Elle ne part que
// s'il y a un compte connecté : sans configuration Supabase, `marqueChange()` est un
// appel vide, et rien ne change pour qui n'a pas de compte.
brancheSync({ lit: donneesCompletes, pose: appliqueDonnees });

// Mise au point : le contrat de la synchronisation, pour le vérifier dans l'aperçu
// sans passer par un fichier ni par un serveur. Retiré du build par Vite.
if (import.meta.env.DEV) window.__donnees = { lit: donneesCompletes, pose: appliqueDonnees };
compteUI.demarre().catch((e) => console.error('compte', e));

// ---------- Outil de calage des fonds (développement seulement) ----------
//
// public/calage.html s'ouvre dans une seconde fenêtre et pilote le calage en direct
// par BroadcastChannel — même origine, donc aucun serveur intermédiaire. Les valeurs
// restent en mémoire : c'est le copier-coller vers src/paper-align.js qui les fige.
// Vite retire tout ce bloc du build de production.
if (import.meta.env.DEV) {
  const canal = new BroadcastChannel('pcbox-calage');

  const fondsPourOutil = () => {
    const out = [];
    for (const [gen, liste] of Object.entries(wallpapers)) {
      for (const w of liste) out.push({ id: w.id, name: w.name, game: w.game, gen: Number(gen), size: w.size });
    }
    return out;
  };

  // Dit à l'outil quel fond est affiché et quelles valeurs le régissent.
  const annoncer = () => {
    const id = boxInfo(state.gen, state.box[state.gen]).paper;
    if (!id) return;
    const gen = paperGen(id), size = paperSize(id);
    const cle = cleDe(gen, size);
    canal.postMessage({
      type: 'courant', id, gen, size, cle,
      valeurs: alignementDe(gen, size),
      duFichier: ALIGNEMENT[cle] ?? ALIGNEMENT[gen] ?? DEFAUT,
      override: REGLAGES.has(cle),
    });
  };

  canal.onmessage = ({ data }) => {
    if (data.type === 'hello') { canal.postMessage({ type: 'catalogue', fonds: fondsPourOutil() }); annoncer(); return; }
    if (data.type === 'apply') { setBox(state.gen, state.box[state.gen], { paper: data.id }); render(); annoncer(); return; }
    if (data.type === 'align') { REGLAGES.set(data.cle, data.valeurs); saveReglages(); render(); return; }
    if (data.type === 'reset') { REGLAGES.delete(data.cle); saveReglages(); render(); annoncer(); return; }
    if (data.type === 'tout') { canal.postMessage({ type: 'tousLesReglages', reglages: Object.fromEntries(REGLAGES) }); return; }
    if (data.type === 'oublier') { REGLAGES.clear(); saveReglages(); render(); annoncer(); return; }
  };

  // L'appli peut changer de boîte de son côté : on tient l'outil au courant.
  window.__annoncerCalage = annoncer;
  canal.postMessage({ type: 'catalogue', fonds: fondsPourOutil() });
  annoncer();
}

