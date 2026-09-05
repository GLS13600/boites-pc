import './style.css';
import pokedex from './data/pokedex.json';
import wallpapers from './data/wallpapers.json';
import { ALIGNEMENT, DEFAUT } from './paper-align.js';
import evolutions from './data/evolutions.json';
import forms from './data/forms.json';
import remakes from './data/dex-remakes.json';

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
const ONGLETS = [
  ...GENS.map((g) => ({ ...g, label: `Gén. ${g.n}`, sub: g.name, remake: false })),
  ...Object.entries(remakes).map(([cle, r]) => ({
    n: r.gen, name: r.region, label: r.court, sub: r.region,
    liste: r.liste, titre: r.name, remake: true, cle,
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
const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

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
  held: null, // case saisie en mode Ranger
  // Réglages par boîte, clé « gén:boîte » -> { name, paper }.
  boxes: readJSON(BOXES_KEY, {}),
  paperGen: null, // génération ouverte dans le sélecteur de fond
  addIndex: null, // rang où insérer, dans la liste de la génération
  addQuery: '',
  addGen: 1,      // génération listée dans le sélecteur
  placing: null, // Pokémon choisi, en attente d'un emplacement
  open: null,
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
// Déplacement : après le retrait, une destination située plus loin recule d'un cran.
// Dépôt : deux Pokémon échangent leur place. Une case libre au-delà de la liste
// signifie « mettre à la fin ».
function swapOrMove(gen, from, to) {
  const l = editList(gen);
  if (from < 0 || from >= l.length || from === to) return;
  if (to >= l.length) {
    const [k] = l.splice(from, 1);
    l.push(k);
  } else {
    [l[from], l[to]] = [l[to], l[from]];
  }
  saveOrder();
}

function moveTo(gen, from, to) {
  const l = editList(gen);
  if (from === to || from < 0 || from >= l.length) return;
  const [k] = l.splice(from, 1);
  l.splice(Math.max(0, Math.min(from < to ? to - 1 : to, l.length)), 0, k);
  saveOrder();
}
function resetOrder(gen) { delete state.order[gen]; saveOrder(); }

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
function bougeBoite(gen, de, vers) {
  if (de === vers) return;
  const l = padBoites(editList(gen));
  const bloc = l.splice(de * BOX_SIZE, BOX_SIZE);
  const cible = de < vers ? (vers - 1) * BOX_SIZE : vers * BOX_SIZE;
  l.splice(cible, 0, ...bloc);
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

  app.replaceChildren(
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
        <div class="tools">
          <button class="btn primaire" data-act="add">
            <b>+</b><span>Ajouter un Pokémon</span>
          </button>

          <div class="fin">
            <button class="btn discret" data-act="export" title="Enregistrer une sauvegarde">
              <b>&#8681;</b><span>Exporter</span>
            </button>
            <button class="btn discret" data-act="import" title="Charger une sauvegarde">
              <b>&#8679;</b><span>Importer</span>
            </button>
          </div>

          <!-- Trois états sur un seul rail : on voit d'un coup celui qui est actif. -->
          <div class="segmente" role="group" aria-label="Effet du tap">
            ${[['catch', 'Capturer'], ['info', 'Fiche'], ['move', 'Ranger']].map(([m, t]) => `
              <button class="${state.mode === m ? 'on' : ''}" data-act="mode-set" data-mode="${m}"
                      aria-pressed="${state.mode === m}">${t}</button>`).join('')}
          </div>

          <button class="btn bascule ${shinyView() ? 'on' : ''}" data-act="view"
                  aria-pressed="${shinyView()}" title="Basculer entre Pokédex normal et chromatique">
            <b>&#10022;</b><span>${shinyView() ? 'Chromatique' : 'Normal'}</span>
          </button>

        </div>
        ${state.placing !== null ? `<div class="hint placer">
          Touchez l&rsquo;emplacement où placer <b>${esc(monName(state.placing))}</b> — vous pouvez changer de boîte ou de génération.
          <button data-act="annuler-placement">Annuler</button>
        </div>` : ''}
        ${rang ? '<div class="hint">Appui long puis glissement : déplacer un Pokémon ; s’il en croise un autre, les deux échangent de place. Toucher un Pokémon puis sa destination fait de même d’une boîte à l’autre. Appui long sans bouger : insérer ici, tout ce qui suit se décale. × : retirer.</div>' : ''}
        ${hasData ? '' : `<div class="hint">Les sprites viennent de PokéAPI, mais les noms, habitats et lieux de capture ne sont chargés que pour la première boîte. Lance <code>npm run fetch-data</code> pour tout récupérer.</div>`}
      </footer>
    `),
  );

  calePaper();
  if (import.meta.env.DEV) window.__annoncerCalage?.();

  // Garde l'onglet de génération actif visible dans la barre (utile après un swipe).
  app.querySelector('.gen-tab[aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'center' });
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

function renderTabs() {
  const el = h(`<nav class="gens" role="tablist"></nav>`);
  ONGLETS.forEach((o, i) => {
    el.append(h(`
      <button class="gen-tab ${o.remake ? 'remake' : ''}" role="tab" data-gen="${i}"
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
  // Artwork officiel, grisé tant que non capturé (couleur une fois capturé).
  // L'artwork officiel n'existe que pour l'espèce : une forme montre son sprite,
  // seul visuel qui lui soit propre.
  const portrait = forme ? sprites.still(spriteKey(id), sh) : sprites.art(id, sh);

  sheet.querySelector('.sheet-body').innerHTML = `
    <div class="sheet-top">
      <div class="portrait ${caught ? '' : 'locked'}">
        <img src="${portrait}" alt="${p.name || id}" ${imgFallback(id, sh)} />
        <button class="shiny-btn ${sh ? 'on' : ''}" data-act="shiny" aria-pressed="${sh}"
                title="${sh ? 'Voir la forme normale' : 'Voir la forme chromatique'}">&#10022;</button>
      </div>
      <div>
        <h2 class="sheet-name">${esc(forme ? forme.name : (p.name || `N° ${id}`))}<small>#${String(base).padStart(4, '0')}</small></h2>
        <p class="sheet-genus">${forme ? `${esc(p.name || '')} · ${KIND[forme.kind] ?? forme.kind}` : (p.genus || '')}${sh ? ' · forme chromatique' : ''}</p>
        <div class="types">${(p.types || []).map((t) => `<span class="type" style="--t:${TYPES[t]?.[1] || '#888'}">${TYPES[t]?.[0] || t}</span>`).join('')}</div>
      </div>
    </div>

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

    <h3>Famille d'évolution</h3>
    ${renderEvolution(base, id)}

    ${renderForms(base, id)}

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

function enableSwipeClose(el, close) {
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

    // Premier mouvement : on décide une fois pour toutes s'il s'agit d'une fermeture.
    if (drag === null) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      const atTop = startTop <= 0 && body.scrollTop <= 0;
      drag = Math.abs(dy) > Math.abs(dx) && dy > 0 && (fromGrip || atTop) ? 'close' : 'no';
      if (drag === 'close') el.style.transition = 'none';
      else return;
    }

    e.preventDefault(); // pendant la fermeture, la page ne doit pas bouger
    el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / 340));
  }, { passive: false });

  const end = (e) => {
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
enableSwipeClose(sheet, closeSheet);

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
    || addSheet.classList.contains('open'));
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
    renderBoxSheet();
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
  if (arrow) { slide(+arrow.dataset.dir); return; }

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
// Appui long sur le NOM de la boîte, puis glissement sur les pastilles du bas : chaque
// pastille est une position. On réutilise les pastilles plutôt que d'inventer une zone
// de dépôt, elles disent déjà où l'on est et combien il y a de boîtes.

let boxTimer;
let boxPress = null; // { titre, de, x, y, armed, dragging }

const finBoxPress = () => {
  clearTimeout(boxTimer);
  if (boxPress?.titre) boxPress.titre.classList.remove('tenu');
  app.querySelector('.box-dots')?.classList.remove('cible');
  app.querySelectorAll('.box-dots i.survol').forEach((n) => n.classList.remove('survol'));
  boxPress = null;
};

const pastilleSous = (x, y) =>
  document.elementFromPoint(x, y)?.closest('.box-dots i[data-boite]') ?? null;

app.addEventListener('pointerdown', (e) => {
  const titre = e.target.closest('.box-title');
  if (!titre || e.button > 0) return;
  finBoxPress();
  boxPress = { titre, de: state.box[state.gen], x: e.clientX, y: e.clientY, armed: false, dragging: false };
  boxTimer = setTimeout(() => {
    boxTimer = null;
    if (!boxPress) return;
    boxPress.armed = true;
    boxPress.titre.classList.add('tenu');
    app.querySelector('.box-dots')?.classList.add('cible');
    retourHaptique();
  }, 450);
});

window.addEventListener('pointermove', (e) => {
  if (!boxPress) return;
  const dx = e.clientX - boxPress.x, dy = e.clientY - boxPress.y;
  if (!boxPress.armed) {
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) finBoxPress();
    return;
  }
  boxPress.dragging = true;
  e.preventDefault();
  app.querySelectorAll('.box-dots i.survol').forEach((n) => n.classList.remove('survol'));
  pastilleSous(e.clientX, e.clientY)?.classList.add('survol');
}, { passive: false });

window.addEventListener('pointerup', (e) => {
  if (!boxPress) return;
  const b = boxPress;
  clearTimeout(boxTimer);
  const dot = b.armed ? pastilleSous(e.clientX, e.clientY) : null;
  finBoxPress();
  if (!b.armed) return;

  // Relâché sans avoir bougé, ou hors des pastilles : on ouvre le panneau de la boîte.
  if (!dot) {
    // Le clic qui suit tout pointerup rouvrirait le panneau une seconde fois.
    b.titre.addEventListener('click', (ev) => ev.stopPropagation(), { once: true, capture: true });
    if (!b.dragging) openBoxSheet();
    return;
  }
  const vers = +dot.dataset.boite;
  bougeBoite(state.gen, b.de, vers);
  state.box[state.gen] = vers;
  render();
  b.titre.addEventListener('click', (ev) => ev.stopPropagation(), { once: true, capture: true });
});

window.addEventListener('pointercancel', finBoxPress);
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
  if (dir > 0 && state.gen < ONGLETS.length - 1) return { gen: state.gen + 1, box: 0 };
  if (dir < 0 && state.gen > 0) return { gen: state.gen - 1, box: boxCount(state.gen - 1) - 1 };
  return null;
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

