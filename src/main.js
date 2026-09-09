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

// Service worker : il ne sert QUE la version web hébergée. Sous Capacitor la page
// n'est pas servie en HTTP et tout est déjà embarqué dans l'app — l'enregistrement
// est donc conditionné au protocole, et un échec est sans conséquence.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
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

const ONGLETS = [
  ...GENS.map((g) => ({ ...g, label: `Gén. ${g.n}`, sub: g.name, remake: false })),
  ...Object.entries(remakes).map(([cle, r]) => ({
    n: r.gen, name: r.region, label: r.court, sub: r.region,
    liste: listeRemake(r), titre: r.name, remake: true, cle,
  })),
];

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
const CLASSES = {
  physical: ['Physique', '#b5603a'], special: ['Spéciale', '#4472b5'], status: ['Statut', '#7c7c74'],
};

const METHODS = {
  walk: 'Herbes hautes', surf: 'Surf', 'old-rod': 'Canne', 'good-rod': 'Super canne',
  'super-rod': 'Méga canne', 'rock-smash': 'Éclate-Roc', headbutt: "Coup d'Boule",
  gift: 'Don', 'gift-egg': 'Œuf offert', 'only-one': 'Unique', 'dark-grass': 'Herbes sombres',
  'grass-spots': 'Herbes frémissantes', 'cave-spots': 'Poussière', 'bridge-spots': 'Ombre',
  'super-rod-spots': 'Bulles', 'surf-spots': 'Remous', 'yellow-flowers': 'Fleurs jaunes',
  'purple-flowers': 'Fleurs violettes', 'red-flowers': 'Fleurs rouges',
  'rough-terrain': 'Terrain accidenté', seaweed: 'Algues', 'walk-arena-trap': 'Piège Arène',
};

// ---------- Sprites ----------

// Tout vit dans public/sprites/ : l'appli ne fait AUCUNE requête réseau, et le
// chemin est relatif SANS « / » initial, comme les fonds de boîte — indispensable
// avec base: './', sinon Capacitor ne les trouve pas sur l'iPhone.
// Rapatriement : npm run fetch-sprites
const REPO = 'sprites';
const sprites = {
  still: (id, shiny) => `${REPO}/${shiny ? 'shiny/' : ''}${id}.png`,
  // Les artworks sont recompressés en WebP à 384 px par le script : 260 Mo de PNG
  // tombent à ~37 Mo. D'où l'extension qui diffère de celle des sprites fixes.
  art: (id, shiny) => `${REPO}/other/official-artwork/${shiny ? 'shiny/' : ''}${id}.webp`,
};
// Un gif animé peut manquer pour quelques formes : on retombe sur le sprite fixe.
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
const KIND = {
  mega: 'Méga', gmax: 'Gigamax', region: 'Forme régionale', totem: 'Forme Totem',
  event: 'Événement', combat: 'Forme de combat', cosmetique: 'Variante',
  femelle: 'Femelle', autre: 'Autre forme',
};
// Une clé identifie soit une espèce (numéro du Pokédex), soit une forme.
// Les formes issues de « varieties » gardent leur id numérique ; les formes
// cosmétiques (saisons, lettres d'Zarbi) portent un slug, car les ids de
// /pokemon-form chevauchent ceux de /pokemon et se télescoperaient.
const FORM_BY_KEY = new Map();
for (const [sid, liste] of Object.entries(forms)) {
  for (const f of liste) FORM_BY_KEY.set(f.key, { ...f, species: Number(sid) });
}
// Un attribut HTML revient toujours en chaîne : on rétablit le type d'origine.
const asKey = (v) => (/^[0-9]+$/.test(v) ? Number(v) : v);

const monName = (k) => pokedex[k]?.name || FORM_BY_KEY.get(k)?.name || `N° ${k}`;
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
const paperUrl = (id) => (PAPER_BY_ID.has(id) ? `wallpapers/${encodeURIComponent(id)}.png` : '');

const PAPER_BY_ID = new Map();
const PAPER_GEN = new Map(); // id -> génération, pour rouvrir le sélecteur au bon endroit
for (const [gen, list] of Object.entries(wallpapers)) {
  for (const w of list) { PAPER_BY_ID.set(w.id, w); PAPER_GEN.set(w.id, Number(gen)); }
}

// Un id inconnu (fond retiré, ou ancien catalogue) ne doit pas casser une boîte.
const paperCss = (id) => (paperUrl(id) ? `url(${paperUrl(id)})` : '');
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
const VUE_KEY = 'pcbox.vue';
const EQUIPES_KEY = 'pcbox.equipes';
const JEU_KEY = 'pcbox.jeu';
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
  // Boîte de combat : vue active, jeu de référence, équipe de six, panneau ouvert.
  vue: ['combat', 'pokedex'].includes(localStorage.getItem('pcbox.vue'))
    ? localStorage.getItem('pcbox.vue') : 'boites',
  dexGen: Math.min(9, Math.max(1, Number(localStorage.getItem('pcbox.dexgen')) || 1)),
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
const save = () => {
  localStorage.setItem(STORE_KEY, JSON.stringify([...state.caught]));
  localStorage.setItem(SHINY_KEY, JSON.stringify([...state.caughtShiny]));
};
const saveOrder = () => localStorage.setItem(ORDER_KEY, JSON.stringify(state.order));

// La vue chromatique tient sa propre collection : c'est un shiny dex à part entière.
const shinyView = () => state.view === 'shiny';
const caughtSet = () => (shinyView() ? state.caughtShiny : state.caught);
const isCaught = (k) => caughtSet().has(k);
const saveBoxes = () => localStorage.setItem(BOXES_KEY, JSON.stringify(state.boxes));

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

const saveOrdreOnglets = () =>
  localStorage.setItem(ONGLETS_KEY, JSON.stringify(state.ordreOnglets));

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
  if (dedans && !confirm(`Supprimer cette boîte ? ${dedans} Pokémon y sont rangés et seront retirés de l'onglet.`)) return false;
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
const boxLabel = (gen, box) => boxInfo(gen, box).name || `Boîte ${box + 1}`;
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
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
// Recherche insensible aux accents et à la casse.
const fold = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Catalogue complet pour le sélecteur : les 1025 espèces puis les 326 formes.
// Classé par génération puis par numéro du Pokédex, chaque espèce immédiatement
// suivie de ses formes : c'est l'ordre dans lequel on cherche un Pokémon.
const genDuNumero = (id) => GENS.find((g) => id >= g.from && id <= g.to)?.n ?? 0;
const CATALOGUE = [];
for (const id of Object.keys(pokedex).map(Number).sort((a, b) => a - b)) {
  const p = pokedex[id];
  const gen = p.generation ?? genDuNumero(id);
  CATALOGUE.push({ id, sprite: String(id), name: p.name, sub: `N° ${id}`, gen, num: id });
  for (const f of forms[id] ?? []) {
    CATALOGUE.push({
      id: f.key,
      sprite: f.sprite,
      name: f.name,
      sub: `${p.name} · ${KIND[f.kind] ?? f.kind}`,
      gen,
      num: id,
    });
  }
}
for (const e of CATALOGUE) e.cle = fold(e.name + ' ' + e.sub + ' ' + e.num);

// ---------- Rendu ----------

function render() {
  // La barre du bas commute entre les deux vues. Tout le reste de render() ne
  // concerne que la gestion des boîtes.
  if (state.vue === 'combat') return renderCombat();
  if (state.vue === 'pokedex') return renderPokedex();

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
  // Ordre par défaut : on affiche la plage du Pokédex, plus parlante. Dès que la
  // génération est réarrangée, cette plage ne veut plus rien dire : on montre le rang.
  // Ordre d'origine : on annonce les numéros réels — nationaux pour une génération,
  // régionaux pour un remake. Réarrangé, ces numéros seraient faux : on montre le rang.
  const sous = start >= total
    // Boîte de rab, au-delà de la liste : aucun numéro à annoncer.
    ? `${g.name} · boîte libre`
    : perso
      ? `${g.name} · ${Math.min(start + 1, total)}–${Math.min(start + BOX_SIZE, total)} sur ${total}`
      : g.remake
        ? `${g.name} · N° ${start + 1} à ${Math.min(start + BOX_SIZE, total)}`
        : `${g.name} · ${start + g.from} à ${Math.min(start + g.from + BOX_SIZE - 1, g.to)}`;

  // `poser()` reconstruit la barre d'onglets, qui défile horizontalement : un
  // élément neuf repart à scrollLeft 0, donc tout à gauche sur Gén. 1. On mémorise
  // son décalage pour le lui rendre juste après.
  const defileOnglets = app.querySelector('.gens')?.scrollLeft ?? 0;

  poser(
    renderTabs(),
    h(`
      <section class="box ${paperBg ? 'papered' : ''} ${rang ? 'ranger' : ''} ${state.placing !== null ? 'placement' : ''}">
        ${paperBg ? `<div class="box-paper" data-gen="${paperGen(boxInfo(state.gen, b).paper) ?? ''}" data-size="${paperSize(boxInfo(state.gen, b).paper) ?? ''}" style="background-image:${paperBg}"></div>` : ''}
        <div class="box-head">
          <button class="box-arrow" data-dir="-1" ${b === 0 ? 'disabled' : ''} aria-label="Boîte précédente">&lsaquo;</button>
          <button class="box-title" data-act="box-edit" title="Renommer la boîte et choisir son fond">
            ${esc(boxLabel(state.gen, b))}
            <small>${sous}</small>
          </button>
          <button class="box-arrow" data-dir="1" ${b === boxes - 1 ? 'disabled' : ''} aria-label="Boîte suivante">&rsaquo;</button>
        </div>
        <div class="grid ${paperBg ? 'papered' : ''}">${cases.map((k, i) => renderSlot(k, start + i)).join('')}</div>
        <!-- Les pastilles restent centrées : les deux boutons se font face, de part
             et d'autre, et gardent la même largeur pour ne pas les décaler. -->
        <div class="box-dots">
          <button class="dot-btn" data-act="del-box" ${boxes <= 1 ? 'disabled' : ''}
                  title="Supprimer la boîte affichée" aria-label="Supprimer la boîte affichée">&minus;</button>
          <span class="dots">${Array.from({ length: boxes }, (_, i) => `<i class="${i === b ? 'on' : ''}" data-boite="${i}"></i>`).join('')}</span>
          <button class="dot-btn" data-act="add-box"
                  title="Ajouter une boîte à cet onglet" aria-label="Ajouter une boîte">+</button>
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
            <b>+</b><span>Ajouter un Pokémon</span>
          </button>

          <!-- Trois états sur un seul rail : on voit d'un coup celui qui est actif. -->
          <div class="segmente" role="group" aria-label="Effet du tap">
            ${[['catch', 'Capturer'], ['info', 'Fiche'], ['move', 'Ranger']].map(([m, t]) => `
              <button class="${state.mode === m ? 'on' : ''}" data-act="mode-set" data-mode="${m}"
                      aria-pressed="${state.mode === m}">${t}</button>`).join('')}
          </div>

          <div class="rangee">
            <button class="btn bascule ${shinyView() ? 'on' : ''}" data-act="view"
                    aria-pressed="${shinyView()}" title="Basculer entre Pokédex normal et chromatique">
              <b>&#10022;</b><span>${shinyView() ? 'Chromatique' : 'Normal'}</span>
            </button>
            <div class="paire" role="group" aria-label="Sauvegarde">
              <button class="btn discret" data-act="export" title="Enregistrer une sauvegarde">
                <b>&#8681;</b><span>Exporter</span>
              </button>
              <button class="btn discret" data-act="import" title="Charger une sauvegarde">
                <b>&#8679;</b><span>Importer</span>
              </button>
            </div>
          </div>
        </div>
        ${state.placing !== null ? `<div class="hint placer">
          Touchez l&rsquo;emplacement où placer <b>${esc(monName(state.placing))}</b> — vous pouvez changer de boîte ou de génération.
          <button data-act="annuler-placement">Annuler</button>
        </div>` : ''}
        ${rang ? '<div class="hint">Appui long puis glissement : déplacer un Pokémon ; s’il en croise un autre, les deux échangent de place. Toucher un Pokémon puis sa destination fait de même d’une boîte à l’autre. Appui long sans bouger : insérer ici, tout ce qui suit se décale. × : retirer.</div>' : ''}
        ${hasData ? '' : `<div class="hint">Les sprites viennent de PokéAPI, mais les noms, habitats et lieux de capture ne sont chargés que pour la première boîte. Lance <code>npm run fetch-data</code> pour tout récupérer.</div>`}
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
             aria-label="Emplacement libre">+</button>`;
  }
  const caught = isCaught(key);
  const forme = FORM_BY_KEY.has(key);
  const tenu = rang && state.held === index;
  const name = monName(key);
  // Toujours le sprite 2D fixe ; chromatique si la vue chromatique est active.
  const src = sprites.still(spriteKey(key), shinyView());
  return `
    <button class="slot ${caught ? 'caught' : ''} ${forme ? 'extra' : ''} ${tenu ? 'tenu' : ''} ${rang && state.held !== null && !tenu ? 'cible' : ''}"
            data-id="${key}" data-slot="${index}"
            aria-label="${esc(name)}${caught ? ', capturé' : ''}">
      <span class="num">${forme ? '★' : key}</span>
      <img src="${src}" alt="" loading="lazy" draggable="false" ${imgFallback(speciesOf(key), shinyView())} />
      ${rang ? `<span class="slot-x" data-remove="${index}" role="button" aria-label="Retirer de la boîte">×</span>` : ''}
    </button>`;
}

// ---------- Fiche ----------

const backdrop = h(`<div class="backdrop"></div>`);
const sheet = h(`<aside class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body"></div></aside>`);
document.body.append(backdrop, sheet);
backdrop.addEventListener('click', () => { closeSheet(); closeBoxSheet(); closeAddSheet(); });

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
  // L'artwork officiel EXISTE aussi pour les formes à clé numérique (Méga, Gigamax,
  // régionales) : elles s'affichent donc en grand, comme les espèces. Seules les
  // formes cosmétiques, dont la clé est un slug, gardent leur sprite 2D — c'est de
  // toute façon leur seul visuel propre.
  const grandPortrait = !forme || typeof id === 'number';
  const portrait = grandPortrait ? sprites.art(id, sh) : sprites.still(spriteKey(id), sh);

  sheet.querySelector('.sheet-body').innerHTML = `
    <div class="sheet-top">
      <div class="portrait">
        <img src="${portrait}" alt="${p.name || id}" ${portraitFallback(id, sh)} />
        <button class="shiny-btn ${sh ? 'on' : ''}" data-act="shiny" aria-pressed="${sh}"
                title="${sh ? 'Voir la forme normale' : 'Voir la forme chromatique'}">&#10022;</button>
      </div>
      <div>
        <h2 class="sheet-name">${esc(forme ? forme.name : (p.name || `N° ${id}`))}<small>#${String(base).padStart(4, '0')}</small></h2>
        <p class="sheet-genus">${forme ? `${esc(p.name || '')} · ${KIND[forme.kind] ?? forme.kind}` : (p.genus || '')}${sh ? ' · forme chromatique' : ''}</p>
        <div class="types">${(p.types || []).map((t) => `<span class="type" style="--t:${TYPES[t]?.[1] || '#888'}">${TYPES[t]?.[0] || t}</span>`).join('')}</div>
      </div>
    </div>

    ${forme ? renderObtention(forme, base) : ''}

    ${forme ? `<button class="back-btn" data-evo="${base}">&lsaquo; Revenir à ${esc(p.name || ('N° ' + base))}</button>` : ''}

    <button class="catch-btn ${caught ? 'done' : ''}" data-act="toggle" data-id="${id}">
      ${caught ? 'Retirer de la boîte' : 'Marquer comme capturé'}
    </button>

    <dl class="facts">
      <div class="fact"><dt>Habitat</dt><dd>${cap(p.habitat) || 'Non renseigné'}</dd></div>
      <div class="fact"><dt>Couleur</dt><dd>${p.color || '—'}</dd></div>
      <div class="fact"><dt>Taille</dt><dd>${p.height ? p.height.toFixed(1) + ' m' : '—'}</dd></div>
      <div class="fact"><dt>Poids</dt><dd>${p.weight ? p.weight.toFixed(1) + ' kg' : '—'}</dd></div>
      ${p.flavor ? `<div class="fact wide"><dt>Description</dt><dd>${p.flavor}</dd></div>` : ''}
    </dl>

    <h3>Faiblesses et résistances <small>table actuelle</small></h3>
    ${renderFaiblesses(base, 9)}

    <h3>Famille d'évolution</h3>
    ${renderEvolution(base, id)}

    ${renderForms(base, id)}

    <h3>Talents</h3>
    ${renderTalents(base)}

    <h3>Attaques</h3>
    ${renderMoves(base)}

    <h3>Où le trouver</h3>
    ${renderEncounters(p)}
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
  if (membres.length < 2) return `<p class="none">Ce Pokémon n'évolue pas.</p>`;

  const parId = new Map(membres.map((m) => [m.id, m]));
  const profondeur = (m) => {
    let d = 0, c = m;
    while (c && c.from !== null) { d++; c = parId.get(c.from); }
    return d;
  };

  return '<div class="evo">' + membres.map((m) => `
    <div class="evo-row" style="--d:${profondeur(m)}">
      ${m.how ? `<div class="evo-how">${esc(m.how)}</div>` : ''}
      <button class="evo-mon ${m.id === courant || m.id === id ? 'on' : ''}" data-evo="${m.id}">
        <img src="${sprites.still(spriteKey(m.id))}" alt="" loading="lazy" ${imgFallback(m.id, false)} />
        <span>${esc(monName(m.id))}</span>
        ${isCaught(m.id) ? '<i class="evo-ok" aria-label="capturé"></i>' : ''}
      </button>
    </div>`).join('') + '</div>';
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
    { key: id, name: pokedex[id]?.name ?? `N° ${id}`, kind: aFemelle ? 'male' : 'base' },
    ...liste,
  ];
  return `
    <div class="formes-head">
      <h3>Formes</h3>
      ${manquantes
        ? `<button class="formes-all" data-forms-all="${id}">Ajouter les ${manquantes} formes</button>`
        : ''}
    </div>
    <div class="formes">${entrees.map((f) => {
      const base = f.kind === 'base' || f.kind === 'male';
      const dans = base || dansUneBoite(f.key);
      return `
      <div class="forme ${f.key === courant ? 'ici' : ''} ${isCaught(f.key) ? 'on' : ''}">
        <button class="forme-go" data-evo="${f.key}">
          <img src="${sprites.still(spriteKey(f.key), shinyView())}" alt="" loading="lazy" ${imgFallback(id, shinyView())} />
          <span>${esc(f.name)}<i>${f.kind === 'male' ? 'Mâle'
            : base ? 'Forme de base' : (KIND[f.kind] ?? f.kind)}</i></span>
        </button>
        ${base ? '' : `<button class="forme-add ${dans ? 'on' : ''}" data-form-add="${f.key}"
                aria-label="${dans ? 'Retirer de la boîte' : 'Ajouter à la boîte'}"
                title="${dans ? 'Retirer de la boîte' : 'Ajouter à la boîte'}">${dans ? '&#10003;' : '+'}</button>`}
      </div>`;
    }).join('')}</div>`;
}

// ---------- Obtention d'une forme ----------
//
// PokéAPI décrit l'obtention dans `form_descriptions`, mais pour 34 espèces
// seulement — les cas mécaniquement particuliers : fusion de Kyurem, Chant Antique
// de Meloetta, Orbe Griseous de Giratina. Pour tout le reste (Méga, Gigamax,
// régionales…), on explique par NATURE de forme, ce qui reste exact.
const OBTENTION = {
  mega: 'Méga-Évolution : en combat, en lui faisant tenir sa Gemme Méga.',
  gmax: 'Phénomène Gigamax : en combat, dans les jeux de la 8ᵉ génération.',
  region: 'Forme régionale : elle ne se rencontre que dans la région concernée.',
  totem: 'Pokémon Totem : rencontré lors des épreuves, il ne se capture pas.',
  event: 'Distribution événementielle : elle ne s’obtient pas en jeu normal.',
  combat: 'Changement de forme en combat, selon une condition propre à l’espèce.',
  cosmetique: 'Variante cosmétique : aucun effet sur les statistiques ni le type.',
  femelle: 'Différence entre mâle et femelle : c’est le sexe qui détermine l’aspect.',
  autre: 'Forme particulière à cette espèce.',
};

function renderObtention(forme, base) {
  const officielle = formDesc[base];
  // « Forme particulière à cette espèce » n'apprend rien quand la description
  // officielle dit déjà comment l'obtenir : on ne garde alors que celle-ci.
  const parNature = forme.kind === 'autre' && officielle
    ? null : (OBTENTION[forme.kind] ?? OBTENTION.autre);
  return `
    <p class="obtention">
      <b>Comment l’obtenir</b>
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
  if (!liste.length) return '<p class="none">Aucun talent connu dans PokéAPI.</p>';
  return `<ul class="talents">${liste.map(([slug, cache]) => {
    const t = abilities.list[slug];
    if (!t) return '';
    return `<li>
      <span class="t-nom">${esc(t.n)}${cache ? '<i>caché</i>' : ''}</span>
      ${t.d ? `<span class="t-desc">${esc(t.d)}</span>` : ''}
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
            <span>Puis. <b>${val(m.p)}</b></span>
            <span>Préc. <b>${val(m.a)}</b></span>
            <span>PP <b>${val(m.pp)}</b></span>
          </span>
        </span>
        ${m.d ? '<span class="mchev" aria-hidden="true">&rsaquo;</span>' : ''}
      </button>
      ${m.d ? `<p class="mdesc" hidden>${esc(m.d)}</p>` : ''}
    </li>`;
}

function renderMoves(base) {
  const l = learnsets[base];
  if (!l) return '<p class="none">Attaques non renseignées pour ce Pokémon dans PokéAPI.</p>';

  // Niveau 0 = attaque connue d'entrée de jeu (départ ou juste après évolution).
  const groupes = [
    ['Par niveau', l.n.map(([id, lv]) => [id, lv > 0 ? `N.${lv}` : 'Dép.']), true],
    ['CT et CS', l.m, false],
    ['Par œuf', l.o.map((id) => [id, 'Œuf']), false],
    ['Par maître', l.t.map((id) => [id, 'Maît.']), false],
  ].filter(([, liste]) => liste.length);

  if (!groupes.length) return '<p class="none">Attaques non renseignées pour ce Pokémon dans PokéAPI.</p>';

  return `
    <p class="moves-jeu">D'après ${esc(l.j)}. Touchez une attaque pour son effet.</p>
    ${groupes.map(([titre, liste, ouvert]) => `
      <details class="mgroup" ${ouvert ? 'open' : ''}>
        <summary>${titre}<b>${liste.length}</b></summary>
        <ul class="mlist">${liste.map(([id, badge]) => renderMove(id, badge)).join('')}</ul>
      </details>`).join('')}
  `;
}

function renderEncounters(p) {
  const enc = p.encounters || [];
  if (!enc.length) {
    return `<p class="none">Aucune rencontre sauvage connue dans PokéAPI. Il s'obtient sans doute par évolution, échange, œuf ou événement.</p>`;
  }
  return `<div class="games">${enc.map((g) => `
    <div class="game">
      <div class="game-name">${g.game}</div>
      ${g.places.map((pl) => `
        <div class="loc">
          <div>
            <div class="where">${pl.location}</div>
            <div class="how">${pl.methods.map((m) => METHODS[m.method] || m.method).join(', ')}</div>
          </div>
          <div class="lvl">N. ${pl.min}${pl.max !== pl.min ? '–' + pl.max : ''}${pl.chance ? ` · ${pl.chance} %` : ''}</div>
        </div>`).join('')}
    </div>`).join('')}</div>`;
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
  // Dans la vue Pokédex, les voisins sont les espèces de la génération affichée,
  // pas le contenu d'une boîte : on parcourt le Pokédex national dans l'ordre.
  if (state.vue === 'pokedex') {
    const g = GENS[state.dexGen - 1];
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
  let startY = 0, startX = 0, startTop = 0, fromGrip = false, drag = null;

  el.addEventListener('touchstart', (e) => {
    if (!el.classList.contains('open') || e.touches.length !== 1) { drag = 'no'; return; }
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    startTop = body.scrollTop;
    fromGrip = !e.target.closest('.sheet-body');
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
        drag = nav ? 'nav' : 'no';
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
    || addSheet.classList.contains('open') || battleSheet.classList.contains('open'));
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
    <h2 class="bs-title">${state.addIndex === null ? 'Choisir un Pokémon à placer' : 'Ajouter un Pokémon ici'}</h2>
    <label class="bs-field">
      <span>Rechercher</span>
      <input class="bs-name add-q" type="text" value="${esc(state.addQuery || '')}"
             placeholder="Nom, forme, numéro…" autocomplete="off" />
    </label>
    <div class="paper-gens" role="tablist">
      ${GENS.map((g) => `
        <button class="paper-gen ${!cherche && g.n === state.addGen ? 'on' : ''}" role="tab"
                aria-selected="${!cherche && g.n === state.addGen}" data-agen="${g.n}">
          Gén. ${g.n}<small>${g.name}</small>
        </button>`).join('')}
    </div>
    ${cherche ? '<p class="paper-note">Résultats dans toutes les générations.</p>' : ''}
    <div class="picks">${picksHTML(res)}</div>
    ${res.length ? '' : '<p class="paper-note">Aucun résultat.</p>'}
    ${res.length === 80 ? '<p class="paper-note">80 premiers résultats — affinez la recherche.</p>' : ''}
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
    <h2 class="bs-title">Personnaliser la boîte</h2>

    <label class="bs-field">
      <span>Nom</span>
      <input class="bs-name" type="text" maxlength="24" value="${esc(info.name || '')}"
             placeholder="Boîte ${box + 1}" autocomplete="off" />
    </label>

    ${state.order[state.gen] ? `<button class="reset-btn" data-act="reset-order">Rétablir l'ordre d'origine de ${esc(ONGLETS[state.gen].titre ?? ('la gén. ' + ONGLETS[state.gen].n))}</button>` : ''}

    <h3>Fond</h3>
    <div class="paper-gens" role="tablist">
      ${GENS.map((g) => `
        <button class="paper-gen ${g.n === pg ? 'on' : ''}" role="tab" aria-selected="${g.n === pg}" data-pgen="${g.n}">
          Gén. ${g.n}<small>${g.name}</small>
        </button>`).join('')}
    </div>

    <div class="papers">
      <button class="paper ${!info.paper ? 'on' : ''}" data-paper="">
        <span class="paper-swatch none"></span><small>Aucun</small>
      </button>
      ${(wallpapers[pg] || []).map((w) => `
        <button class="paper ${info.paper === w.id ? 'on' : ''}" data-paper="${w.id}">
          <span class="paper-swatch shot" style="background-image:${paperCss(w.id)}"></span>
          <small>${w.name}<i>${w.game}</i></small>
        </button>`).join('')}
    </div>
    ${wallpapers[pg] ? '' : `<p class="paper-note">Les jeux de la génération ${pg} n'avaient pas de fond de boîte : elles étaient toutes unies. Les fonds apparaissent à la génération III.</p>`}
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

function toggle(id) {
  const set = caughtSet();
  set.has(id) ? set.delete(id) : set.add(id);
  save();
  render();
}

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
    state.mode === 'catch' ? toggle(key) : openSheet(key);
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
    render();
  }
  if (act === 'export') exportProgress();
  if (act === 'import') importProgress();
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

// ---------- Swipe horizontal, sans dérive verticale ----------

let sx = 0, sy = 0, locked = null;
app.addEventListener('touchstart', (e) => {
  if (sliding || press?.dragging || boxPress?.armed || !e.target.closest('.box')) return;
  sx = e.touches[0].clientX;
  sy = e.touches[0].clientY;
  locked = null;
}, { passive: true });

app.addEventListener('touchmove', (e) => {
  if (press?.dragging || boxPress?.armed) return; // un glisser-déposer est en cours
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
  if (locked !== 'x' || !e.target.closest('.box')) return;
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
}

// Relâché sans franchir le seuil : la grille revient en place.
function snapGrid() {
  for (const el of [gridEl(), paperEl()]) {
    if (!el) continue;
    el.classList.remove('no-anim');
    el.style.transform = '';
    if (el.classList.contains('grid')) el.style.opacity = '';
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

    setTimeout(() => {
      n.style.transition = '';
      if (fIn) fIn.style.transition = '';
      sliding = false;
    }, IN_MS);
  }, OUT_MS);
}

// ---------- Sauvegarde ----------

function exportProgress() {
  // Format actuel : objet. Les anciens exports étaient un simple tableau d'IDs.
  const payload = {
    caught: [...state.caught],
    caughtShiny: [...state.caughtShiny],
    boxes: state.boxes,
    order: state.order,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `pcbox-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}
function importProgress() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
  input.onchange = async () => {
    try {
      const data = JSON.parse(await input.files[0].text());
      // Tableau nu = ancien export ; objet = format actuel.
      const ids = Array.isArray(data) ? data : data.caught;
      if (!Array.isArray(ids)) throw new Error('format');
      // Les clés de formes cosmétiques sont des chaînes : ne pas tout forcer en nombre.
      state.caught = new Set(ids.map(asKey));
      state.caughtShiny = new Set((!Array.isArray(data) && data.caughtShiny ? data.caughtShiny : []).map(asKey));
      state.boxes = (!Array.isArray(data) && data.boxes) || {};
      state.order = (!Array.isArray(data) && data.order) || {};
      save();
      saveBoxes();
      saveOrder();
      render();
    } catch {
      alert("Fichier illisible : il faut un export JSON de cette appli.");
    }
  };
  input.click();
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

// ---------- Export et import des équipes ----------
//
// Distinct de l'export des boîtes : on peut vouloir transmettre une composition
// sans donner tout son Living Dex, et inversement. Le fichier porte TOUTES les
// équipes, une par version de jeu.

function exportEquipes() {
  const payload = { type: 'boitespc-equipes', v: 1, equipes: state.equipes };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `equipes-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// L'import FUSIONNE : il remplace les équipes des versions présentes dans le
// fichier et laisse les autres intactes. Importer une seule équipe ne doit pas
// effacer les onze autres.
function importEquipes() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
  input.onchange = async () => {
    try {
      const data = JSON.parse(await input.files[0].text());
      // Format actuel, ou carte nue { jeu: [six cases] } : on reste tolérant.
      const brut = data && data.equipes ? data.equipes : data;
      if (!brut || typeof brut !== 'object' || Array.isArray(brut)) throw new Error('format');

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
      if (!n) throw new Error('vide');
      saveCombat();
      render();
      alert(`${n} équipe${n > 1 ? 's importées' : ' importée'}.`);
    } catch {
      alert("Fichier illisible : il faut un export d'équipes de cette appli.");
    }
  };
  input.click();
}

// ---------- Rendu de la vue ----------

// Icônes de la barre du bas. Dessinées ici plutôt que chargées depuis `public/` :
// trois fichiers de plus pour 2 Ko, alors que l'appli ne fait aucune requête au
// runtime et que ces icônes sont visibles en permanence, donc jamais candidates au
// chargement paresseux.
//
// Elles sont EN COULEUR, contrairement aux glyphes qu'elles remplacent : elles ne
// peuvent donc pas virer au rouge quand l'onglet devient actif. C'est le gris qui
// porte l'état au repos (`filter: grayscale`), exactement comme dans la grille des
// boîtes où le gris dit « pas capturé ». Le libellé et la pastille, eux, rougissent.
//
// Tout est en viewBox 0 0 24 24, sans `width` ni `height` : c'est la feuille de
// style qui décide de la taille, via `--nav-ico`.
const ICONES = {
  // Boîtes : la grille du PC, une case portant une Poké Ball.
  boites: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2.4" y="4" width="19.2" height="16" rx="2.8" fill="#fff" stroke="#1e2227" stroke-width="1.5"/>
    <g fill="#c9cfd8">
      <rect x="5" y="7" width="4.2" height="4.2" rx="1"/><rect x="14.8" y="7" width="4.2" height="4.2" rx="1"/>
      <rect x="5" y="12.8" width="4.2" height="4.2" rx="1"/><rect x="9.9" y="12.8" width="4.2" height="4.2" rx="1"/>
      <rect x="14.8" y="12.8" width="4.2" height="4.2" rx="1"/>
    </g>
    <g transform="translate(9.9 7)">
      <circle cx="2.1" cy="2.1" r="2.1" fill="#fff" stroke="#1e2227" stroke-width=".7"/>
      <path d="M0 2.1a2.1 2.1 0 0 1 4.2 0z" fill="#d6453c"/>
      <rect y="1.75" width="4.2" height=".7" fill="#1e2227"/>
      <circle cx="2.1" cy="2.1" r=".62" fill="#fff" stroke="#1e2227" stroke-width=".5"/>
    </g>
  </svg>`,
  // Pokédex : le boîtier rouge, sa lentille, ses trois voyants, une fiche à droite.
  pokedex: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="1.8" y="4.6" width="20.4" height="14.8" rx="2.6" fill="#d6453c"/>
    <circle cx="5.4" cy="7.6" r=".95" fill="#f4c53c"/>
    <circle cx="7.8" cy="7.6" r=".95" fill="#3fbf6a"/>
    <circle cx="10.2" cy="7.6" r=".95" fill="#ffdad6"/>
    <circle cx="6.8" cy="14" r="3.2" fill="#fff"/>
    <circle cx="6.8" cy="14" r="2.2" fill="#2ea3d8"/>
    <circle cx="6" cy="13.2" r=".7" fill="#fff"/>
    <rect x="12.6" y="6.8" width="7.8" height="10.4" rx="1" fill="#f6f5f1"/>
    <g fill="#c3cad3">
      <rect x="14" y="8.8" width="5" height=".95" rx=".47"/><rect x="14" y="11" width="4" height=".95" rx=".47"/>
      <rect x="14" y="13.2" width="5" height=".95" rx=".47"/><rect x="14" y="15.4" width="3.2" height=".95" rx=".47"/>
    </g>
  </svg>`,
  // Combat : la Potion des jeux. Le liquide monte en dôme au centre, comme sur le
  // sprite d'origine, et déborde volontairement du flacon : c'est `clipPath` qui le
  // recoupe sur la silhouette, plutôt qu'un tracé calculé à la main sur ses courbes.
  combat: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <path id="gd-pot" d="M9.4 3.8H14.6A3 3 0 0 1 17.6 6.8V12.6C17.6 14.4 19.9 15.4 19.9 17.9A3.9 3.9 0 0 1 16 21.8H8A3.9 3.9 0 0 1 4.1 17.9C4.1 15.4 6.4 14.4 6.4 12.6V6.8A3 3 0 0 1 9.4 3.8Z"/>
      <clipPath id="gd-pot-c"><use href="#gd-pot"/></clipPath>
    </defs>
    <rect x="3.4" y="6.4" width="5.6" height="3.6" rx="1.4" fill="#7a68ab" stroke="#1e2227" stroke-width="1.3"/>
    <circle cx="4.8" cy="8.2" r="1.6" fill="#8a78bd" stroke="#1e2227" stroke-width="1.1"/>
    <circle cx="4.8" cy="8.2" r=".6" fill="#54427f"/>
    <use href="#gd-pot" fill="#fbfaf7"/>
    <g clip-path="url(#gd-pot-c)">
      <path d="M2 16C4.8 15.8 6.6 15 7.6 13.4C8.7 11.6 9.9 10.2 12 10.2C14.1 10.2 15.3 11.6 16.4 13.4C17.4 15 19.2 15.8 22 16V23H2Z" fill="#6f5b9e"/>
      <ellipse cx="15.6" cy="17.8" rx="1.6" ry="2" fill="#fff" opacity=".26"/>
    </g>
    <use href="#gd-pot" fill="none" stroke="#1e2227" stroke-width="1.5"/>
  </svg>`,
};

function renderNav() {
  return h(`
    <nav class="nav" role="tablist" aria-label="Vue">
      ${[['boites', 'Boîtes'], ['pokedex', 'Pokédex'], ['combat', 'Combat']].map(([v, lib]) => `
        <button class="nav-btn ${state.vue === v ? 'on' : ''}" role="tab"
                aria-selected="${state.vue === v}" data-vue="${v}">
          ${ICONES[v]}<span>${lib}</span>
        </button>`).join('')}
    </nav>`);
}

// La barre du bas vit DANS <body>, pas dans #app, et n'est construite qu'une fois.
//
// Elle était auparavant recréée à l'intérieur de #app à chaque rendu. Or #app est un
// conteneur flex en min-height: 100%, dont la hauteur suit celle du contenu : la
// barre s'y ancrait différemment selon la longueur de la vue et remontait d'autant
// que la page était courte. Sortie du flux de l'application, elle ne dépend plus que
// du viewport, et se pose au même endroit dans les trois vues.
const nav = renderNav();

// Coquille d'application : le contenu de chaque vue défile DANS une zone dédiée,
// et la barre du bas est le dernier élément d'un conteneur à hauteur d'écran.
//
// Elle était auparavant en `position: fixed`. Sur iPhone, un élément fixe combiné à
// `env(safe-area-inset-bottom)` ne se place pas au même endroit selon que la page
// peut défiler ou non : la barre descendait sur le Pokédex, long, et remontait sur
// Boîtes et Combat, trop courts pour défiler. Remise dans le flux, elle ne dépend
// plus que de la hauteur du conteneur, identique partout.
function poser(...enfants) {
  const vue = document.createElement('div');
  vue.className = 'vue';
  vue.append(...enfants);
  app.replaceChildren(vue, nav);
  majNav();
}

// Seul l'état actif change d'un rendu à l'autre : on le remplace sur place.
function majNav() { nav.innerHTML = renderNav().innerHTML; }

// La barre n'étant plus dans #app, son écoute doit vivre sur elle.
nav.addEventListener('click', (e) => {
  const b = e.target.closest('[data-vue]');
  if (!b || b.dataset.vue === state.vue) return;
  fermeLesPanneaux();
  state.vue = b.dataset.vue;
  localStorage.setItem(VUE_KEY, state.vue);
  render();
});

function renderEquipeSlot(m, i) {
  if (!m) {
    return `<button class="eq vide" data-eq="${i}" aria-label="Emplacement ${i + 1}, libre">
      <b>+</b><small>Libre</small>
    </button>`;
  }
  const espece = speciesOf(m.key);
  const st = statsDe(m.key);
  const niv = m.niv ?? NIV_DEFAUT;
  const pv = m.stats?.pv ?? (st ? calcPV(st.pv, niv, espece) : 0);
  const absent = LEARN_VG && !LEARN_VG[m.key]?.[state.jeu] && !LEARN_VG[espece]?.[state.jeu];
  return `
    <button class="eq ${isCaught(m.key) ? '' : 'gris'} ${absent ? 'absent' : ''}" data-eq="${i}"
            aria-label="${esc(monName(m.key))}, niveau ${niv}">
      <img src="${sprites.still(spriteKey(m.key), !!m.shiny)}" alt=""
           ${imgFallback(espece, !!m.shiny)} />
      <span class="eq-nom">${esc(monName(m.key))}</span>
      <span class="eq-jauge"><i>PV</i><span class="jauge"><b></b></span></span>
      <span class="eq-bas">
        <span class="eq-lv">N.${niv}</span>
        <span class="eq-pv">${pv}/${pv}</span>
      </span>
      ${m.objet && items[m.objet]
        ? `<img class="eq-obj" src="items/${m.objet}.png" alt="" title="${esc(items[m.objet].n)}" />`
        : ''}
      ${absent ? '<span class="eq-alerte" title="Absent de ce jeu">!</span>' : ''}
    </button>`;
}

function renderCombat() {
  const jeu = jeuCourant();
  const pleines = equipe().filter(Boolean).length;

  poser(
    h(`
      <section class="combat">
        <div class="combat-head">
          <button class="jeu-btn" data-act="choix-jeu">
            <small>Version du jeu</small>
            <b>${esc(jeu.nom)}</b>
          </button>
          <div class="eq-io">
            <button data-act="eq-export" title="Exporter toutes mes équipes"
                    aria-label="Exporter toutes mes équipes">&#8681;</button>
            <button data-act="eq-import" title="Importer des équipes"
                    aria-label="Importer des équipes">&#8679;</button>
          </div>
          <div class="combat-compte"><b>${pleines}</b>/6</div>
        </div>

        <div class="equipe">
          ${equipe().map(renderEquipeSlot).join('')}
        </div>

        ${LEARN_VG ? '' : '<p class="combat-charge">Chargement des attaques par version…</p>'}

        <div class="analyse">${renderAnalyse()}</div>

        ${renderTableTypes()}

        <!-- L'aide ne sert qu'à la première prise en main : dès qu'un Pokémon est
             placé, le geste est compris et le pavé n'est plus que du bruit. -->
        ${pleines ? '' : `<p class="hint">
          Touchez un emplacement pour choisir un Pokémon, puis le Pokémon lui-même
          pour régler son niveau, son talent, son objet et ses quatre attaques.
          Tout suit la version choisie, ici <b>${esc(jeu.nom)}</b>.
        </p>`}
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
  const orientation = ecart >= 15 ? 'physique' : ecart <= -15 ? 'spécial' : 'mixte';
  let role;
  // Seuils calés sur des encaisseurs réels : Airmure et Magnézone plafonnent à 275
  // en PV+Déf+Déf.Spé, et ce sont pourtant les murs de leur équipe. À 300 le test ne
  // reconnaissait quasiment que Leuphorie, et l'appli annonçait « aucun encaisseur »
  // juste après avoir désigné Magnézone comme le plus solide.
  if (encaisse >= 270 && frappe < 100) role = 'Mur';
  else if (encaisse >= 260) role = 'Tank offensif';
  else if (st.vit >= 100 && frappe >= 100) role = 'Sweeper';
  else if (st.vit <= 55 && frappe >= 110) role = 'Casseur lent';
  else if (frappe >= 110) role = 'Attaquant';
  else role = 'Polyvalent';
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
    avis.push({ ton: 'alerte', txt: `<b>${membres.length === d.faibles ? 'Toute l’équipe' : d.faibles + ' membres'}</b> sont faibles au type ${TYPES[d.t][0]}. Une seule attaque de ce type peut balayer la partie.` });
  }
  const sansParade = def.filter((d) => !d.resiste && !d.immune && d.faibles > 0);
  if (sansParade.length) {
    avis.push({ ton: 'alerte', txt: `Aucun membre ne résiste au type ${sansParade.map((d) => TYPES[d.t][0]).join(', ')}.` });
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
      categorieRatee.push(`${mb.nom} frappe surtout en spécial alors qu'il a ${mb.st.att} en Attaque contre ${mb.st.atts} en Atq. Spé.`);
    } else if (ecart <= -20 && phys > spec) {
      categorieRatee.push(`${mb.nom} frappe surtout en physique alors qu'il a ${mb.st.atts} en Atq. Spé. contre ${mb.st.att} en Attaque.`);
    }

    // Toutes ses attaques du même type : un seul mur bien choisi l'arrête.
    if (off.length >= 2 && new Set(off.map((mv) => mv.t)).size === 1) monoType.push(mb.nom);
  }

  for (const txt of categorieRatee) avis.push({ ton: 'alerte', txt: esc(txt) });
  if (sansStab.length) {
    avis.push({ ton: 'conseil', txt: `Aucune attaque du type de <b>${sansStab.map(esc).join('</b>, <b>')}</b> : le bonus de 50 % du STAB est perdu.` });
  }
  if (monoType.length) {
    avis.push({ ton: 'conseil', txt: `<b>${monoType.map(esc).join('</b>, <b>')}</b> n'attaque${monoType.length > 1 ? 'nt' : ''} que d'un seul type : un mur bien choisi l'arrête.` });
  }
  if (membres.some((m) => m.moves.length) && !statutQuelquePart) {
    avis.push({ ton: 'conseil', txt: 'Aucune attaque de statut dans l’équipe : ni soin, ni augmentation, ni entrave. Face à un adversaire qui se renforce, rien ne l’en empêchera.' });
  }
  if (incomplets.length) {
    avis.push({ ton: 'info', txt: `Moveset incomplet : <b>${incomplets.map(esc).join('</b>, <b>')}</b>.` });
  }

  const murs = membres.filter((m) => m.role === 'Mur' || m.role === 'Tank offensif');
  if (!murs.length) avis.push({ ton: 'conseil', txt: 'Aucun encaisseur : tout le monde tombe vite. Un Pokémon très défensif donne le temps de reprendre la main.' });

  const rapides = membres.filter((m) => m.st.vit >= 100);
  if (!rapides.length && membres.length >= 3) avis.push({ ton: 'conseil', txt: 'Personne au-dessus de 100 en Vitesse : l’équipe frappera presque toujours en second.' });

  const phys = membres.filter((m) => m.orientation === 'physique').length;
  const spec = membres.filter((m) => m.orientation === 'spécial').length;
  if (membres.length >= 3 && spec === 0) avis.push({ ton: 'conseil', txt: 'Équipe entièrement physique : un adversaire très défensif en Défense vous bloque net.' });
  if (membres.length >= 3 && phys === 0) avis.push({ ton: 'conseil', txt: 'Équipe entièrement spéciale : un adversaire très défensif en Défense Spéciale vous bloque net.' });

  // Deux membres au type identique : les faiblesses se cumulent au lieu de se couvrir.
  const vus = new Map();
  for (const m of membres) {
    const cle = [...m.types].sort().join('/');
    if (vus.has(cle)) avis.push({ ton: 'conseil', txt: `${esc(vus.get(cle))} et ${esc(m.nom)} partagent le même type : leurs faiblesses se cumulent.` });
    else vus.set(cle, m.nom);
  }

  if (sansAttaque) {
    avis.push({ ton: 'info', txt: `${sansAttaque} membre${sansAttaque > 1 ? 's n’ont' : ' n’a'} aucune attaque offensive : la couverture ci-dessus est incomplète.` });
  }
  const nonCouverts = TT.filter((d) => !couverts.has(d));
  if (typesAtq.size && nonCouverts.length) {
    avis.push({ ton: 'info', txt: `Rien ne frappe super efficacement : ${nonCouverts.map((d) => TYPES[d][0]).join(', ')}.` });
  }
  if (!avis.length) avis.push({ ton: 'bon', txt: 'Aucun défaut majeur détecté : pas de faiblesse partagée, un encaisseur, de la vitesse et les deux catégories d’attaque.' });

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
  if (!types.length) return '<p class="none">Types inconnus.</p>';
  const lignes = typesDeGen(gen)
    .map((a) => {
      let mult = 1;
      for (const t of types) mult *= table[a]?.[t] ?? 1;
      return { t: a, mult };
    })
    .filter((x) => x.mult !== 1)
    .sort((x, y) => y.mult - x.mult);
  if (!lignes.length) return '<p class="none">Neutre face à tous les types.</p>';
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
      <summary>Table des types <small>${esc(jeuCourant().nom)}</small></summary>
      <div class="tt-wrap">
        <table class="tt-tab">
          <thead><tr><th></th>${entete}</tr></thead>
          <tbody>${corps}</tbody>
        </table>
      </div>
    </details>`;
}

function renderAnalyse() {
  const a = analyseEquipe();
  if (!a) return '';
  const TT = typechart.types;

  // Le plus solide de l'équipe : la réponse directe à « qui est le tanker ».
  const tank = a.membres.slice().sort((x, y) => y.encaisse - x.encaisse)[0];

  return `
    <h3 class="an-h">Défense <small>ce que l'équipe subit</small></h3>
    <div class="tgrid">
      ${a.def.slice()
        .sort((x, y) => y.faibles - x.faibles || y.pire - x.pire || (y.resiste + y.immune) - (x.resiste + x.immune))
        .map((d) => ligne(d.t, jetonsDe(d.mults), d.faibles >= 3)).join('')}
    </div>

    <h3 class="an-h">Attaque <small>meilleur coup disponible</small></h3>
    ${a.typesAtq.size
      ? `<div class="tgrid off">${a.off.slice()
          .sort((x, y) => y.mult - x.mult)
          .map((o) => ligne(o.t, o.mult === 1 ? [] : [{ v: o.mult, n: 1 }], false)).join('')}</div>`
      : '<p class="none">Aucune attaque offensive choisie : sélectionnez-en pour voir la couverture.</p>'}

    <h3 class="an-h">Rôles</h3>
    <p class="an-tank">Le plus solide : <b>${esc(tank.nom)}</b> (${tank.encaisse} en PV+Déf+Déf.Spé).</p>
    <ul class="roles">
      ${a.membres.map((m) => `
        <li>
          <img src="${sprites.still(spriteKey(m.key), m.shiny)}" alt="" ${imgFallback(m.esp, m.shiny)} />
          <span class="r-nom">${esc(m.nom)}</span>
          <span class="r-role">${m.role}</span>
          <span class="r-det">${m.orientation} · Vit. ${m.st.vit} · encaisse ${m.encaisse}</span>
        </li>`).join('')}
    </ul>

    <h3 class="an-h">Conseils</h3>
    <ul class="avis">
      ${a.avis.map((v) => `<li class="${v.ton}">${v.txt}</li>`).join('')}
    </ul>
  `;
}

// ---------- Panneau de la boîte de combat ----------

const battleSheet = h(`<aside class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body"></div></aside>`);
document.body.append(battleSheet);
const battleBody = battleSheet.querySelector('.sheet-body');
enableSwipeClose(battleSheet, closeBattleSheet);

function closeBattleSheet() {
  battleSheet.classList.remove('open');
  state.bs = null;
  syncBackdrop();
}
function openBattleSheet(mode, slot = null, emplacement = null) {
  state.bs = { mode, slot, emplacement, q: '' };
  renderBattleSheet();
  battleBody.scrollTop = 0;
  battleSheet.classList.add('open');
  syncBackdrop();
}

function renderBattleSheet(gardeFocus) {
  const bs = state.bs;
  if (!bs) return;
  battleBody.innerHTML =
    bs.mode === 'version' ? htmlVersions()
    : bs.mode === 'mon' ? htmlChoixMon()
    : bs.mode === 'detail' ? htmlDetail()
    : bs.mode === 'nature' ? htmlChoixNature()
    : bs.mode === 'talent' ? htmlChoixTalent()
    : bs.mode === 'objet' ? htmlChoixObjet()
    : htmlChoixAttaque();
  if (gardeFocus) {
    const c = battleBody.querySelector('.bs-name');
    if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
  }
}

// Les 21 jeux, groupés par génération pour qu'on s'y retrouve.
function htmlVersions() {
  const parGen = {};
  for (const v of JEUX) (parGen[v.gen] ??= []).push(v);
  return `
    <h2 class="bs-title">Version du jeu</h2>
    <p class="paper-note">Le moveset proposé change d'un jeu à l'autre. Les stats de
      base restent celles des jeux actuels : PokéAPI ne publie pas leur historique.</p>
    ${Object.entries(parGen).map(([gen, liste]) => `
      <div class="vgroupe">
        <h3>Génération ${esc(gen.replace('generation-', '').toUpperCase())}</h3>
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
    <h2 class="bs-title">Choisir un Pokémon</h2>
    <label class="bs-field">
      <span>Rechercher</span>
      <input class="bs-name bs-q" type="text" value="${esc(state.bs.q || '')}"
             placeholder="Nom, forme, numéro…" autocomplete="off" />
    </label>
    ${q ? '' : `<div class="paper-gens" role="tablist">
      ${GENS.map((g) => `
        <button class="paper-gen ${g.n === state.addGen ? 'on' : ''}" role="tab"
                aria-selected="${g.n === state.addGen}" data-agen="${g.n}">
          Gén. ${g.n}<small>${g.name}</small>
        </button>`).join('')}
    </div>`}
    <div class="picks">
      ${res.map((e) => `
        <button class="pick ${isCaught(e.id) ? '' : 'gris'}" data-eqpick="${e.id}">
          <img src="${sprites.still(e.sprite)}" alt="" loading="lazy" ${imgFallback(e.num, false)} />
          <span>${esc(e.name)}<i>${esc(e.sub)}</i></span>
        </button>`).join('')}
    </div>
    ${res.length ? '' : '<p class="paper-note">Aucun résultat.</p>'}
  `;
}

// Libellés courts des stats, pour l'effet d'une nature.
const LIB_STAT = { att: 'Attaque', def: 'Défense', atts: 'Atq. Spé.', defs: 'Déf. Spé.', vit: 'Vitesse' };

function htmlChoixNature() {
  const m = equipe()[state.bs.slot];
  if (!m) return '<p class="none">Emplacement vide.</p>';
  return `
    <h2 class="bs-title">Nature — ${esc(monName(m.key))}</h2>
    <p class="paper-note">Une nature augmente une statistique de 10 % et en diminue
      une autre d'autant. Les cinq neutres n'ont aucun effet.</p>
    <div class="atq4">
      ${NATURES.map((n) => {
        const neutre = !n.p || n.p === n.m;
        return `
          <button class="atq ${m.nature === n.k ? 'choisi' : ''}" data-picknat="${esc(n.k)}">
            <span class="atq-h"><span class="atq-n">${esc(n.n)}</span></span>
            <span class="atq-m">${neutre ? 'Aucun effet'
              : `<b class="n-plus">+10 %</b> ${esc(LIB_STAT[n.p])} · <b class="n-moins">−10 %</b> ${esc(LIB_STAT[n.m])}`}</span>
          </button>`;
      }).join('')}
    </div>`;
}

// Les talents que l'espèce peut avoir dans le jeu choisi.
function htmlChoixTalent() {
  const m = equipe()[state.bs.slot];
  if (!m) return '<p class="none">Emplacement vide.</p>';
  const liste = poolTalents(m.key);
  return `
    <h2 class="bs-title">Talent — ${esc(monName(m.key))}</h2>
    <p class="paper-note">Talents disponibles dans ${esc(jeuCourant().nom)}.</p>
    <div class="atq4">
      ${liste.map(([slug, cache]) => {
        const t = abilities.list[slug];
        if (!t) return '';
        return `
          <button class="atq ${m.talent === slug ? 'choisi' : ''}" data-picktal="${esc(slug)}">
            <span class="atq-h">
              <span class="atq-n">${esc(t.n)}</span>
              ${cache ? '<span class="type mini" style="--t:#7c7c74">caché</span>' : ''}
            </span>
            ${t.d ? `<span class="atq-m">${esc(t.d)}</span>` : ''}
          </button>`;
      }).join('')}
      ${m.talent ? '<button class="atq libre" data-picktal="">Retirer le talent</button>' : ''}
    </div>`;
}

// Les objets tenables en combat, existants dans le jeu choisi.
function htmlChoixObjet() {
  const m = equipe()[state.bs.slot];
  if (!m) return '<p class="none">Emplacement vide.</p>';
  const q = fold(state.bs.q || '');
  const tous = poolObjets();
  const res = q ? tous.filter(([, o]) => fold(o.n).includes(q)) : tous;
  return `
    <h2 class="bs-title">Objet tenu — ${esc(monName(m.key))}</h2>
    <p class="paper-note">${tous.length} objets tenables dans ${esc(jeuCourant().nom)}.</p>
    <label class="bs-field">
      <span>Rechercher</span>
      <input class="bs-name bs-q" type="text" value="${esc(state.bs.q || '')}"
             placeholder="Nom d'objet…" autocomplete="off" />
    </label>
    ${m.objet ? '<button class="atq libre" data-pickobj="">Retirer l\'objet</button>' : ''}
    <div class="objets">
      ${res.map(([slug, o]) => `
        <button class="objet ${m.objet === slug ? 'choisi' : ''}" data-pickobj="${esc(slug)}">
          <img src="items/${slug}.png" alt="" loading="lazy" />
          <span>${esc(o.n)}${o.d ? `<i>${esc(o.d)}</i>` : ''}</span>
        </button>`).join('')}
    </div>
    ${res.length ? '' : '<p class="paper-note">Aucun objet ne correspond.</p>'}`;
}

// Détail d'un membre : niveau, stats calculées, quatre attaques.
function htmlDetail() {
  const m = equipe()[state.bs.slot];
  if (!m) return '<p class="none">Emplacement vide.</p>';
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
    const libelleIv = saisi == null ? 'calculé à IV 31'
      : !iv ? 'hors plage'
      : iv.min === iv.max ? `IV ${iv.min}`
      : `IV ${iv.min}–${iv.max}`;
    return `
      <div class="stat">
        <dt>${lib}${signe}</dt>
        <dd><input class="stat-in" type="number" inputmode="numeric" min="1" max="999"
                   data-stat="${cle}" value="${saisi ?? ''}" placeholder="${calcule}"
                   aria-label="${lib}" /></dd>
        <span class="stat-iv ${saisi != null && !iv ? 'faux' : ''}">${libelleIv}</span>
        <label class="stat-ev">EV
          <input type="number" inputmode="numeric" min="0" max="252"
                 data-ev="${cle}" value="${ev || ''}" placeholder="0"
                 aria-label="EV ${lib}" />
        </label>
      </div>`;
  };
  const bloc = st ? `
    <dl class="stats">
      ${champ('pv', 'PV', st.pv, true)}
      ${champ('att', 'Attaque', st.att, false)}
      ${champ('def', 'Défense', st.def, false)}
      ${champ('atts', 'Atq. Spé.', st.atts, false)}
      ${champ('defs', 'Déf. Spé.', st.defs, false)}
      ${champ('vit', 'Vitesse', st.vit, false)}
    </dl>
    <p class="stat-note">
      Recopiez les valeurs lues en jeu : l'IV est déduit de chacune, en tenant compte
      de la nature et des EV renseignés.${Object.keys(perso).length || Object.keys(evs).length
        ? ' <button data-act="stats-reset">Tout effacer</button>' : ''}
    </p>` : '<p class="none">Stats de base inconnues.</p>';

  return `
    <div class="sheet-top">
      <div class="portrait">
        <img src="${sprites.still(spriteKey(m.key), !!m.shiny)}" alt=""
             ${imgFallback(espece, !!m.shiny)} />
        <button class="shiny-btn ${m.shiny ? 'on' : ''}" data-act="eq-shiny"
                aria-pressed="${!!m.shiny}"
                title="${m.shiny ? 'Voir la forme normale' : 'Voir la forme chromatique'}">&#10022;</button>
      </div>
      <div>
        <h2 class="sheet-name">${esc(monName(m.key))}</h2>
        <div class="types">${(p.types || []).map((t) =>
          `<span class="type" style="--t:${TYPES[t]?.[1] || '#888'}">${TYPES[t]?.[0] || t}</span>`).join('')}</div>
      </div>
    </div>

    <div class="niv-rang">
      <span>Niveau</span>
      <button data-niv="-10">−10</button>
      <button data-niv="-1">−1</button>
      <b>${niv}</b>
      <button data-niv="1">+1</button>
      <button data-niv="10">+10</button>
    </div>

    <h3>Talent ${talents.length ? '' : '<small>aucun dans ce jeu</small>'}</h3>
    ${talents.length ? `
      <button class="ligne-choix" data-choix="talent">
        <span class="lc-t">${talent ? esc(talent.n) : 'Choisir un talent'}</span>
        ${talent?.d ? `<span class="lc-d">${esc(talent.d)}</span>` : ''}
      </button>`
      : '<p class="none">Les talents n\'existent qu\'à partir de la gén. 3.</p>'}

    <h3>Objet tenu</h3>
    ${objetsDispo ? `
      <button class="ligne-choix" data-choix="objet">
        ${objet ? `<img class="lc-i" src="items/${m.objet}.png" alt="" />` : ''}
        <span class="lc-t">${objet ? esc(objet.n) : 'Aucun objet'}</span>
        ${objet?.d ? `<span class="lc-d">${esc(objet.d)}</span>` : ''}
      </button>`
      : '<p class="none">Aucun objet tenu en gén. 1.</p>'}

    <h3>Faiblesses et résistances <small>${esc(jeuCourant().nom)}</small></h3>
    ${renderFaiblesses(espece)}

    <h3>Nature</h3>
    <button class="ligne-choix" data-choix="nature">
      <span class="lc-t">${nature ? esc(nature.n) : 'Neutre (aucune)'}</span>
      <span class="lc-d">${nature && nature.p && nature.p !== nature.m
        ? `+10 % ${esc(LIB_STAT[nature.p])}, −10 % ${esc(LIB_STAT[nature.m])}`
        : 'Aucun effet sur les statistiques'}</span>
    </button>

    <h3>Statistiques <small>IV déduits</small></h3>
    ${bloc}

    <h3>Attaques <small>${esc(jeuCourant().nom)}</small></h3>
    ${pool === null
      ? `<p class="none">${esc(monName(m.key))} n'apparaît pas dans ${esc(jeuCourant().nom)} : aucune attaque à proposer.</p>`
      : `<div class="atq4">
          ${Array.from({ length: 4 }, (_, i) => {
            const id = m.moves?.[i];
            const mv = id ? moves[id] : null;
            if (!mv) return `<button class="atq libre" data-atq="${i}"><b>+</b> Attaque ${i + 1}</button>`;
            const [tn, tc] = TYPES[mv.t] || [mv.t || '—', '#888'];
            const ko = !dispo.has(id);
            return `
              <button class="atq ${ko ? 'ko' : ''}" data-atq="${i}">
                <span class="atq-h">
                  <span class="atq-n">${esc(mv.n)}</span>
                  <span class="type mini" style="--t:${tc}">${tn}</span>
                </span>
                <span class="atq-m">Puis. <b>${mv.p ?? '—'}</b> · Préc. <b>${mv.a ?? '—'}</b> · PP <b>${mv.pp ?? '—'}</b>${ko ? ' · <i>indisponible ici</i>' : ''}</span>
              </button>`;
          }).join('')}
        </div>`}

    <button class="catch-btn retirer" data-act="eq-retirer">Retirer de l'équipe</button>
  `;
}

// Choix d'une attaque parmi celles apprenables dans le jeu courant.
function htmlChoixAttaque() {
  const m = equipe()[state.bs.slot];
  if (!m) return '<p class="none">Emplacement vide.</p>';
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
    <h2 class="bs-title">Attaque ${state.bs.emplacement + 1} — ${esc(monName(m.key))}</h2>
    <p class="paper-note">${pool.length} attaques apprenables dans ${esc(jeuCourant().nom)}.</p>
    <label class="bs-field">
      <span>Rechercher</span>
      <input class="bs-name bs-q" type="text" value="${esc(state.bs.q || '')}"
             placeholder="Nom d'attaque…" autocomplete="off" />
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
                  <span>Puis. <b>${mv.p ?? '—'}</b></span>
                  <span>Préc. <b>${mv.a ?? '—'}</b></span>
                  <span>PP <b>${mv.pp ?? '—'}</b></span>
                </span>
              </span>
              ${choisie ? '<span class="mchev">✓</span>' : ''}
            </button>
          </li>`;
      }).join('')}
    </ul>
    ${res.length ? '' : '<p class="paper-note">Aucune attaque ne correspond.</p>'}
  `;
}

// ---------- Interactions ----------

battleBody.addEventListener('input', (e) => {
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
});

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

battleBody.addEventListener('click', (e) => {
  const bs = state.bs;
  if (!bs) return;

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
});

// Changer de vue referme tout panneau ouvert. Un panneau appartient à sa vue : le
// détail d'un membre d'équipe n'a aucun sens par-dessus la gestion des boîtes, et
// la fiche d'un Pokémon n'en a pas davantage par-dessus la boîte de combat.
function fermeLesPanneaux() {
  closeBattleSheet();
  closeSheet();
  closeBoxSheet();
  closeAddSheet();
}

app.addEventListener('click', (e) => {
  // La bascule de vue est écoutée sur la barre elle-même, qui vit hors de #app.
  if (state.vue !== 'combat') return;

  if (e.target.closest('[data-act="choix-jeu"]')) { openBattleSheet('version'); return; }
  if (e.target.closest('[data-act="eq-export"]')) { exportEquipes(); return; }
  if (e.target.closest('[data-act="eq-import"]')) { importEquipes(); return; }

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

const DEXGEN_KEY = 'pcbox.dexgen';

// Taux de remplissage d'une génération, d'après la collection ACTIVE — donc le
// Pokédex chromatique quand la vue chromatique est allumée, comme dans les boîtes.
function progresDex(n) {
  const g = GENS[n - 1];
  let pris = 0;
  for (let id = g.from; id <= g.to; id++) if (isCaught(id)) pris++;
  return { pris, total: g.to - g.from + 1 };
}

const caseDex = (id) => {
  const p = pokedex[id] || {};
  const vu = isCaught(id);
  return `
    <button class="dx ${vu ? '' : 'gris'}" data-dex="${id}"
            aria-label="${esc(p.name || `N° ${id}`)}${vu ? ', capturé' : ''}">
      <img src="${sprites.still(id, shinyView())}" alt="" loading="lazy"
           ${imgFallback(id, shinyView())} />
      <span class="dx-num">N° ${String(id).padStart(4, '0')}</span>
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
  const q = state.dexQ.trim();
  if (!q) { const g = GENS[state.dexGen - 1]; return range(g.from, g.to); }
  const f = fold(q);
  return range(1, 1025).filter((id) =>
    String(id).includes(f) || fold(pokedex[id]?.name || '').includes(f));
}

function renderPokedex() {
  const n = state.dexGen;
  const g = GENS[n - 1];
  const { pris, total } = progresDex(n);
  // Le total national, pour situer la génération dans l'ensemble.
  let prisTout = 0;
  for (let id = 1; id <= 1025; id++) if (isCaught(id)) prisTout++;

  const cases = especesDex().map(caseDex).join('');

  poser(
    h(`
      <nav class="gens dex-gens" role="tablist" aria-label="Génération">
        ${GENS.map((x) => `
          <button class="gen-tab" role="tab" data-dexgen="${x.n}"
                  aria-selected="${x.n === n}">
            Gén. ${x.n}<small>${esc(x.name)}</small>
          </button>`).join('')}
      </nav>`),
    h(`
      <section class="dex">
        <div class="dex-head">
          <div>
            <b>${esc(g.name)}</b>
            <small>N° ${g.from} à ${g.to}</small>
          </div>
          <div class="dex-compte"><b>${pris}</b>/${total}</div>
        </div>
        <div class="bar dex-bar"><span style="width:${total ? (100 * pris) / total : 0}%"></span></div>
        <p class="dex-tout">${prisTout} sur 1025 au total${shinyView() ? ' · Pokédex chromatique' : ''}</p>

        <div class="dex-rech">
          <input type="search" data-dexq placeholder="Chercher un nom ou un numéro"
                 value="${esc(state.dexQ)}" aria-label="Chercher un Pokémon"
                 autocomplete="off" autocorrect="off" spellcheck="false" />
        </div>
        <p class="dex-res" ${state.dexQ.trim() ? '' : 'hidden'}></p>

        <div class="dex-grid">${cases}</div>

        <p class="hint">
          Les formes alternatives n’ont pas d’entrée au Pokédex : elles sont listées
          dans la fiche de leur espèce, d’où l’on peut aussi les ranger en boîte.
        </p>
      </section>`),
  );

  app.querySelector('.gen-tab[aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// La frappe agit SUR LE DOM : reconstruire la vue ferait perdre le focus au champ
// à chaque caractère, comme pour le nom de boîte.
app.addEventListener('input', (e) => {
  const champ = e.target.closest('[data-dexq]');
  if (!champ) return;
  state.dexQ = champ.value;
  const ids = especesDex();
  const grille = app.querySelector('.dex-grid');
  if (grille) grille.innerHTML = ids.map(caseDex).join('');
  const info = app.querySelector('.dex-res');
  if (info) {
    const q = state.dexQ.trim();
    info.hidden = !q;
    info.textContent = ids.length === 0 ? 'Aucun Pokémon ne correspond.'
      : `${ids.length} résultat${ids.length > 1 ? 's' : ''} sur les neuf générations`;
  }
});

app.addEventListener('click', (e) => {
  const onglet = e.target.closest('[data-dexgen]');
  if (onglet) {
    // Changer de génération sort de la recherche : on vient voir CET onglet.
    state.dexQ = '';
    state.dexGen = +onglet.dataset.dexgen;
    localStorage.setItem(DEXGEN_KEY, String(state.dexGen));
    render();
    return;
  }
  const carte = e.target.closest('[data-dex]');
  if (carte) openSheet(Number(carte.dataset.dex));
});

render();

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

