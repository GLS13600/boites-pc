// L'univers Cartes : extensions, recherche, fiche d'une carte, collection et valeur.
//
// Ce sont les vues de Cartodex, RÉÉCRITES au style d'Unydex (voir CLAUDE.md, « Fusion
// avec Cartodex ») et dans le langage visuel commun aux deux univers : en-tête
// « ← titre » à actions, grand sélecteur en pilule, bandeau d'avancement, rangée de
// puces, vignettes à pastilles — les mêmes composants que les vues Jeux. Le module ne
// fait que du rendu et des gestes ; main.js lui fournit ce qui est commun (traduction,
// coquille, en-tête, panneau, annulation), comme à scan.js et à compte-ui.js.
//
// Les données viennent de TCGdex (api.js) et sont gardées en IndexedDB : une extension
// vue une fois se rouvre hors ligne. La collection (collection.js) vit dans
// localStorage, source de vérité comme le Living Dex.

import * as api from './api.js';
import * as coll from './collection.js';
import * as prix from './prix.js';
import * as cls from './classeurs.js';
import * as advisor from './advisor.js';
import * as favoris from './favoris.js';
import { categorie, variantes, CATEGORIES, LANGUES_CARTE, ETATS, VARIANTES, cleEtat, distance } from './regles.js';

const BLOCS_KEY = 'pcbox.cartes.blocs';
// Les blocs, dans l'ordre de Pokécardex : du plus récent au plus ancien, puis les
// ensembles hors blocs. Un bloc regroupe une ou plusieurs séries de TCGdex — Base, Neo
// et e-cards forment « Wizards », comme chez Pokécardex. Pokémon Pocket, numérique et
// absent de Pokécardex, ferme la liste. Une série inconnue d'ici (un bloc à venir) se
// place en tête : ce sera la plus récente.
const BLOCS = [
  { id: 'me', series: ['me'] }, { id: 'sv', series: ['sv'] }, { id: 'swsh', series: ['swsh'] },
  { id: 'sm', series: ['sm'] }, { id: 'xy', series: ['xy'] }, { id: 'bw', series: ['bw'] },
  { id: 'col', series: ['col'] }, { id: 'hgss', series: ['hgss'] }, { id: 'pl', series: ['pl'] },
  { id: 'dp', series: ['dp'] }, { id: 'ex', series: ['ex'] },
  { id: 'wizards', series: ['ecard', 'neo', 'base'], nom: 'cxBlocWizards' },
  { id: 'pop', series: ['pop'], nom: 'cxBlocPop' }, { id: 'tk', series: ['tk'] },
  { id: 'mc', series: ['mc'] }, { id: 'misc', series: ['misc'], nom: 'cxBlocMisc' },
  { id: 'tcgp', series: ['tcgp'] },
];
// Les onze énergies du JCC, nommées en français ou en anglais selon la langue des données.
const TYPES_JCC = {
  Feu: '#e4572e', Fire: '#e4572e', Eau: '#2f8fdc', Water: '#2f8fdc', Plante: '#45a349', Grass: '#45a349',
  'Électrique': '#d9a514', Lightning: '#d9a514', Psy: '#9b59b6', Psychic: '#9b59b6',
  Combat: '#c0703b', Fighting: '#c0703b', 'Obscurité': '#3c4a5a', Darkness: '#3c4a5a',
  'Métal': '#7d8b98', Metal: '#7d8b98', 'Fée': '#e078b4', Fairy: '#e078b4',
  Dragon: '#b39545', Incolore: '#8f8f86', Colorless: '#8f8f86',
};
// Même mouvement que le passage d'une fiche de Pokémon à l'autre (navFiche).
const NAV_OUT = 130, NAV_IN = 210;

// Le prix de RÉFÉRENCE d'une carte, dans l'ordre de Cartodex : la moyenne sur 30 jours
// (la plus stable), puis 7 jours, la tendance, la moyenne, le plus bas. Une reverse
// prend les champs « -holo » de Cardmarket, qui sont les siens.
export function prixDe(d, variante) {
  const cm = d?.pricing?.cardmarket;
  if (!cm) return null;
  const champ = (k) => (cm[k] > 0 ? cm[k] : null);
  if (variante && variante.startsWith('reverse')) {
    const r = champ('avg30-holo') ?? champ('avg7-holo') ?? champ('trend-holo') ?? champ('avg-holo') ?? champ('low-holo');
    if (r != null) return r;
  }
  return champ('avg30') ?? champ('avg7') ?? champ('trend') ?? champ('avg') ?? champ('low');
}

// L'extension d'une carte se lit dans son identifiant : « sv03.5-006 » → « sv03.5 ».
// Une extension que l'appli fusionne à une autre (api.hote) compte pour son hôte.
const setDe = (id) => api.hote(String(id).slice(0, Math.max(0, String(id).lastIndexOf('-'))) || String(id));
const lit = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
function blocsGardes() {
  try {
    const v = JSON.parse(lit(BLOCS_KEY));
    if (Array.isArray(v)) return new Set(v.filter((x) => typeof x === 'string' && /^[a-z0-9.-]{1,24}$/.test(x)));
  } catch { /* illisible : défaut */ }
  return new Set([BLOCS[0].id]);
}

export function creeCartes(ctx) {
  const { t, esc, h, fold, euros, ICO, panneau } = ctx;
  api.poseLangue(ctx.langue());

  // ---------------------------------------------------------------- état (de session)
  const etat = {
    blocs: blocsGardes(),       // blocs dépliés dans la liste des extensions
    set: null,                  // extension ouverte (sa grille), ou null
    q: '',                      // recherche d'une carte, toutes extensions confondues
    res: null,                  // ses résultats, ou null tant qu'elle n'a pas abouti
    suggestion: null,           // « Vouliez-vous dire … ? »
    recherche: false,           // une recherche est en vol
    filtre: 'toutes', rarete: '', tri: 'num', master: false,
    selection: null,            // Set de clés « id|variante » en sélection multiple
    liste: [],                  // les cartes affichées, pour passer de l'une à l'autre
    fiche: null,                // { id, liste } : la carte ouverte et sa liste
    ficheEchec: null,           // carte dont le détail n'a pas pu être lu
    ajout: { v: null, l: 'FR', e: 'neuf' },
    colQ: '', colTri: 'extension', colFiltre: 'toutes', colRarete: '', colType: '',
    majPrix: null,              // { fait, total } pendant l'actualisation des prix
    cls: null,                  // classeur ouvert (son livre), ou null (la liste)
    clsPage: 0,                 // page affichée du classeur
    clsSel: null,               // Set des pochettes choisies en sélection
    clsDeplace: false,          // la sélection attend sa pochette d'arrivée
    clsAjout: null,             // le sélecteur d'ajout, ouvert sur une pochette
    clsEdition: null,           // la création ou les réglages d'un classeur
  };

  // Ce qu'on a lu de TCGdex pendant la session. api.js garde le reste sur disque.
  let listeSeries = null;
  // Toutes les extensions : id → { nom, rang de sortie }.
  let toutesExt = null;
  // L'image d'une carte prise dans l'autre langue, quand la sienne manque ('' : aucune).
  const imagesAutres = new Map();
  const detailsSerie = new Map();
  const extensions = new Map();
  const enCours = new Set();
  const echecs = new Set();
  // Position de défilement de chaque page, rendue au retour (de l'extension à la liste).
  const positions = new Map();
  let pageAffichee = null;

  const detail = (id) => api.connuEnMemoire(api.cheminCarte(id));
  const nomVariante = (v) => t(`variante_${v}`);
  const nomEtat = (e) => t(`etat_${cleEtat(e)}`);
  const vueCartes = () => ['extensions', 'collection', 'classeurs', 'valeur', 'advisor'].includes(ctx.vue());

  // Charge une ressource une seule fois, puis redessine la vue si elle est encore là.
  function charge(cle, fabrique, range) {
    if (enCours.has(cle) || echecs.has(cle)) return;
    enCours.add(cle);
    fabrique()
      .then(range)
      .catch(() => echecs.add(cle))
      .finally(() => { enCours.delete(cle); if (vueCartes()) rend(ctx.vue()); });
  }

  // Le nom d'une extension, si on l'a déjà croisée dans une série chargée.
  function nomSetConnu(id) {
    id = api.hote(id);
    if (extensions.has(id)) return extensions.get(id).name;
    if (toutesExt?.has(id)) return toutesExt.get(id).nom;
    for (const s of detailsSerie.values()) {
      const x = s.sets?.find((e) => e.id === id);
      if (x) return x.name;
    }
    return null;
  }
  function serieDuSet(id) {
    const e = extensions.get(id);
    if (e?.serie?.id) return e.serie.id;
    for (const [sid, s] of detailsSerie) if (s.sets?.some((x) => x.id === id)) return sid;
    return undefined;
  }
  // Ce qu'on sait d'une carte sans son détail : l'entrée de son extension ou d'une recherche.
  function brutDe(id) {
    const e = extensions.get(setDe(id));
    return e?.cards?.find((c) => c.id === id) || etat.res?.find((c) => c.id === id) || null;
  }
  function infoCarte(id, d = detail(id)) {
    const brut = brutDe(id);
    const c = coll.carte(id);
    const setId = d?.set?.id || c?.set || setDe(id);
    return {
      id,
      nom: d?.name || brut?.name || c?.n || id,
      num: d?.localId || brut?.localId || c?.num || '',
      img: d?.image || brut?.image || c?.img || imagesAutres.get(id) || '',
      setId,
      setNom: d?.set?.name || extensions.get(setId)?.name || nomSetConnu(setId) || c?.setN || setId,
      total: d?.set?.cardCount?.official || extensions.get(setId)?.cardCount?.official || null,
    };
  }
  // La fiche recopiée dans la collection : de quoi l'afficher hors ligne.
  function ficheDe(id, d = detail(id)) {
    const i = infoCarte(id, d);
    return {
      id, n: i.nom, img: i.img || undefined, set: i.setId, setN: i.setNom, serie: serieDuSet(i.setId),
      num: i.num, rar: d?.rarity,
      // Une carte Dresseur ou Énergie n'a pas de type : liste vide, pour la distinguer
      // d'une carte dont on ne sait encore rien.
      typ: Array.isArray(d?.types) ? d.types.slice(0, 3) : (d ? [] : undefined),
      dex: Array.isArray(d?.dexId) ? d.dexId.filter((n) => Number.isInteger(n) && n >= 1 && n <= 1025) : undefined,
    };
  }
  // Prix unitaire retenu pour une carte possédée : le dernier relevé de la collection,
  // sinon celui du détail en mémoire.
  const prixUnitaire = (id) => coll.carte(id)?.prix?.t ?? prixDe(detail(id));
  const pourcent = (x) => `${Math.round(x)} %`;
  const date = (iso) => {
    try { return new Date(iso).toLocaleDateString(ctx.langue(), { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return String(iso || ''); }
  };

  // ---------------------------------------------------------------- rendu
  function rend(vue) {
    const zone = ctx.zone();
    // On retient la position de la page qu'on QUITTE — si c'est bien une page de cartes.
    if (zone && pageAffichee && zone.querySelector('.cx-page')) positions.set(pageAffichee, zone.scrollTop);
    const cle = `${vue}:${etat.set || etat.cls || ''}:${etat.q ? 'q' : ''}`;
    // Le champ qu'on est en train d'utiliser garde le focus à travers le rendu.
    const actif = document.activeElement;
    const focus = actif?.matches?.('[data-cx-q], [data-cx-colq]')
      ? { sel: actif.matches('[data-cx-q]') ? '[data-cx-q]' : '[data-cx-colq]', a: actif.selectionStart, b: actif.selectionEnd } : null;
    const els = vue === 'extensions' ? (etat.set ? vueSet() : vueExtensions())
      : vue === 'collection' ? vueCollection()
      : vue === 'valeur' ? vueValeur()
      : vue === 'classeurs' ? (etat.cls ? vueLivre() : vueClasseurs())
      : vueAdvisor();
    const z = ctx.poser(...els);
    const y = positions.get(cle) || 0;
    if (z && y) z.scrollTop = y;
    pageAffichee = cle;
    if (focus) {
      const c = document.querySelector(focus.sel);
      if (c) { c.focus({ preventScroll: true }); try { c.setSelectionRange(focus.a, focus.b); } catch { /* champ de recherche */ } }
    }
  }

  const champ = (attr, valeur, place) => `
    <label class="champ">
      ${ICO.chercher}
      <input type="search" ${attr} value="${esc(valeur)}" placeholder="${esc(place)}" aria-label="${esc(place)}"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" />
    </label>`;

  const erreurBloc = (cle) => `
    <div class="cx-vide">
      <p>${navigator.onLine === false ? t('cxHorsLigne') : t('cxErreur')}</p>
      <button class="puce" data-cx-reessaie="${esc(cle)}">${ICO.rafraichir}<span>${t('cxReessayer')}</span></button>
    </div>`;

  const squeletteGrille = (n = 12) => `<div class="cx-grille" aria-hidden="true">${
    '<span class="cx-v squelette"><span class="cx-v-img"></span><span class="cx-v-legende"><i></i></span></span>'.repeat(n)}</div>`;
  const squeletteSets = (n = 6) => `<div class="avances" aria-hidden="true">${
    '<span class="avance squelette"><span class="avance-art"></span><span class="avance-txt"><i></i><i></i></span></span>'.repeat(n)}</div>`;

  // Une vignette : une carte, ou une variante d'une carte en mode master set. Le même
  // signal que la grille du Living Dex : possédée en couleur, manquante en gris, et la
  // Poké Ball dessinée de la boîte pour dire « elle est à moi ».
  function vignette(x, { avecSet = false, choix = null } = {}) {
    const n = x.va ? coll.exemplairesVariante(x.id, x.va) : coll.exemplaires(x.id);
    const cle = x.va ? `${x.id}|${x.va}` : x.id;
    const choisie = choix ? choix.has(x.id) : !!etat.selection?.has(cle);
    const p = prixDe(x.d, x.va) ?? (n ? coll.carte(x.id)?.prix?.t : null) ?? null;
    const legende = avecSet ? (nomSetConnu(setDe(x.id)) || setDe(x.id)) : x.nom;
    return `
      <button class="cx-v ${n ? 'possedee' : 'manque'} ${choisie ? 'choisie' : ''}" data-cx-carte="${esc(x.id)}"
              ${x.va ? `data-cx-var="${esc(x.va)}"` : ''}
              aria-label="${esc(x.nom)} ${esc(x.num)}${x.va ? ', ' + esc(nomVariante(x.va)) : ''}${n ? ', ' + esc(t('cxPossedeeN', n)) : ''}">
        <span class="cx-v-img">
          <img src="${esc(api.image(x.img || imagesAutres.get(x.id), 'low'))}" alt="" loading="lazy" decoding="async" />
          ${p != null ? `<span class="cx-v-prix">${euros(p)}</span>` : ''}
          ${n ? `<span class="cx-v-pos"><i class="marque" aria-hidden="true"></i>${n > 1 ? `<span>×${n}</span>` : ''}</span>` : ''}
          ${x.va ? `<span class="cx-v-var v-${esc(x.va)}">${esc(nomVariante(x.va))}</span>` : ''}
          ${choix || etat.selection ? `<span class="cx-v-coche" aria-hidden="true">${ICO.coche}</span>` : ''}
        </span>
        <span class="cx-v-legende"><span class="cx-v-nom">${esc(legende)}</span><span class="cx-v-num">${esc(x.num)}</span></span>
      </button>`;
  }

  // Une ligne d'avancement : le même composant que les cartes du menu du Pokédex.
  function ligneSet(s, n) {
    const total = s.cardCount?.total || 0;
    const fini = total > 0 && n >= total;
    const pc = total ? Math.min(100, (100 * n) / total) : 0;
    const art = s.logo ? `<img src="${esc(api.logo(s.logo))}" alt="" loading="lazy" />`
      : s.symbol ? `<img class="symbole" src="${esc(api.symbole(s.symbol))}" alt="" loading="lazy" />`
      : `<span class="avance-sigle">${esc(String(s.id).toUpperCase())}</span>`;
    return `
      <button class="avance ${fini ? 'complet' : ''}" data-cx-set="${esc(s.id)}"
              aria-label="${esc(s.name)}, ${n} / ${total}">
        <span class="avance-art logo">${art}</span>
        <span class="avance-txt">
          <span class="avance-haut"><b class="avance-nom">${esc(s.name)}</b><span class="avance-cpt"><b>${n}</b>/${total}</span></span>
          <span class="avance-bas"><span class="avance-barre"><i style="width:${pc}%"></i></span>${fini ? ctx.sceau() : ''}</span>
        </span>
      </button>`;
  }

  // Cartes possédées par extension (distinctes), pour les compteurs.
  function parSet() {
    const m = new Map();
    for (const [id, c] of Object.entries(coll.toutes())) {
      if (!c.ex?.length) continue;
      const s = api.hote(c.set || setDe(id));
      m.set(s, (m.get(s) || 0) + 1);
    }
    return m;
  }

  // ---------------------------------------------------------------- Extensions
  // Les blocs à montrer : ceux dont TCGdex connaît au moins une série, et en tête les
  // séries qu'aucun bloc ne connaît encore.
  function blocsAffiches() {
    const connues = new Set(listeSeries.map((s) => s.id));
    const rangees = new Set(BLOCS.flatMap((b) => b.series));
    const neuves = [...listeSeries].reverse().filter((s) => !rangees.has(s.id)).map((s) => ({ id: s.id, series: [s.id] }));
    return [...neuves, ...BLOCS.map((b) => ({ ...b, series: b.series.filter((x) => connues.has(x)) })).filter((b) => b.series.length)];
  }
  // Les extensions d'un bloc, comme Pokécardex : de la plus récente à la plus ancienne
  // (rang de sortie de la liste des 202 extensions), puis les Énergies, puis les Promos.
  // 0 : extension, 1 : Énergies, 2 : Promos — l'ordre de Pokécardex dans un bloc.
  const genreSet = (id, nom) => (/promo/i.test(nom || '') || /^[a-z]+p$/.test(id) ? 2 : /[ée]nergie|energy/i.test(nom || '') ? 1 : 0);
  function setsDuBloc(b) {
    const sets = b.series.flatMap((sid) => detailsSerie.get(sid)?.sets || []);
    return sets.map((x, i) => ({ x, g: genreSet(x.id, x.name), r: toutesExt?.get(x.id)?.rang ?? i }))
      .sort((a, b) => a.g - b.g || b.r - a.r).map((e) => e.x);
  }
  function htmlBloc(b, possedees, parSerie) {
    const ouvert = etat.blocs.has(b.id);
    const tete = listeSeries.find((x) => x.id === b.series[0]);
    const nom = b.nom ? t(b.nom) : (tete?.name || b.id);
    const n = b.series.reduce((k, sid) => k + (parSerie.get(sid) || 0), 0);
    const nbSets = b.series.every((sid) => detailsSerie.has(sid)) ? b.series.reduce((k, sid) => k + (detailsSerie.get(sid).sets?.length || 0), 0) : 0;
    // Un bloc sans logo (POP, Kits, McDonald's…) prend celui de sa plus récente extension
    // qui en a un : il faut donc ses extensions, même replié.
    if (!tete?.logo) for (const sid of b.series) if (!detailsSerie.has(sid)) charge(`serie:${sid}`, () => api.serie(sid), (d) => detailsSerie.set(sid, d));
    const logoBloc = tete?.logo || (b.series.every((sid) => detailsSerie.has(sid)) ? setsDuBloc(b).find((x) => x.logo)?.logo : '') || '';
    let contenu = '';
    if (ouvert) {
      for (const sid of b.series) if (!detailsSerie.has(sid)) charge(`serie:${sid}`, () => api.serie(sid), (d) => detailsSerie.set(sid, d));
      const rate = b.series.find((sid) => echecs.has(`serie:${sid}`));
      contenu = rate ? erreurBloc(`serie:${rate}`)
        : !b.series.every((sid) => detailsSerie.has(sid)) ? squeletteSets(3)
        : `<div class="avances">${setsDuBloc(b).map((x) => ligneSet(x, possedees.get(x.id) || 0)).join('')}</div>`;
    }
    return `
      <section class="cx-bloc ${ouvert ? 'ouvert' : ''}">
        <button class="pilule ${ouvert ? 'ouverte' : ''}" data-cx-bloc="${esc(b.id)}" aria-expanded="${ouvert}"
                aria-label="${esc(nom)}${n ? ', ' + esc(t('cxPossedeeN', n)) : ''}">
          <span class="pilule-logo">${logoBloc ? `<img class="pilule-img" src="${esc(api.logo(logoBloc))}" alt="" loading="lazy" />` : ''}</span>
          <span class="pilule-txt"><small>${t('cxBloc')}${nbSets ? ` · ${t('cxNbExtensions', nbSets)}` : ''}</small><b>${esc(nom)}</b></span>
          ${n ? `<span class="pilule-cpt"><b>${n}</b></span>` : ''}
          ${ICO.bas}
        </button>
        ${contenu}
      </section>`;
  }

  function vueExtensions() {
    if (!listeSeries) charge('series', api.series, (l) => { listeSeries = Array.isArray(l) ? l : []; });
    // Le rang de sortie de chaque extension, pour l'ordre DANS un bloc.
    if (!toutesExt) charge('toutesExt', chargeToutesExt, () => {});
    const possedees = parSet();
    const parSerie = new Map();
    for (const c of Object.values(coll.toutes())) if (c.ex?.length && c.serie) parSerie.set(c.serie, (parSerie.get(c.serie) || 0) + 1);

    const corps = !listeSeries ? (echecs.has('series') ? erreurBloc('series') : squeletteSets())
      : `<div class="cx-blocs">${blocsAffiches().map((b) => htmlBloc(b, possedees, parSerie)).join('')}</div>
        <p class="cx-note">${t('cxSourceTcgdex')}</p>`;

    return [
      ctx.tete(t('tuileExtensions')),
      h(`<section class="cx-page">
        ${champ('data-cx-q', etat.q, t('cxChercher'))}
        <div class="cx-resultats" ${etat.q ? '' : 'hidden'}>${htmlResultats()}</div>
        <div class="cx-parcours" ${etat.q ? 'hidden' : ''}>
          ${corps}
        </div>
      </section>`),
    ];
  }


  // ---------------------------------------------------------------- recherche
  // TCGdex cherche une partie du nom, sans casse, mais AVEC les accents : « salameche »
  // ne trouve rien. Quand ce qu'on tape se lit dans un nom du Pokédex, on lui rend ses
  // accents en reprenant les mêmes lettres dans ce nom (NFD puis retrait des diacritiques
  // garde une lettre par caractère, les longueurs coïncident).
  function requete(q) {
    const f = fold(q.trim());
    if (!f) return '';
    for (const nom of ctx.nomsPokemon()) {
      const i = fold(nom).indexOf(f);
      if (i >= 0) return nom.slice(i, i + f.length);
    }
    return q.trim();
  }
  // « Vouliez-vous dire … ? » : le nom du Pokédex le plus proche, à la distance d'édition.
  // Cartodex embarquait un dictionnaire de 2 Mo ; les 1025 noms de l'appli suffisent,
  // une carte porte presque toujours le nom d'un Pokémon.
  function proche(q) {
    const f = fold(q.trim());
    let meilleur = null, d = Infinity;
    for (const nom of ctx.nomsPokemon()) {
      const n = fold(nom);
      if (Math.abs(n.length - f.length) > 3) continue;
      const x = distance(f, n);
      if (x < d) { d = x; meilleur = nom; }
    }
    return d > 0 && d <= Math.max(2, Math.floor(f.length / 3)) ? meilleur : null;
  }

  // La liste des extensions, lue une fois : un échec n'empêche pas la recherche.
  function chargeToutesExt() {
    if (toutesExt) return Promise.resolve();
    return api.toutesExtensions().then((l) => {
      toutesExt = new Map((Array.isArray(l) ? l : []).map((x, rang) => [x.id,
        { nom: x.name, rang, logo: x.logo || '', total: x.cardCount?.total || 0 }]));
    }).catch(() => {});
  }

  let minuterie = null, numRecherche = 0;
  function surSaisie(v) {
    etat.q = v;
    clearTimeout(minuterie);
    const q = v.trim();
    document.querySelector('.cx-resultats')?.toggleAttribute('hidden', !v);
    document.querySelector('.cx-parcours')?.toggleAttribute('hidden', !!v);
    if (q.length < 2) {
      numRecherche++;
      etat.res = null; etat.suggestion = null; etat.recherche = false;
      majResultats();
      return;
    }
    etat.recherche = true;
    majResultats();
    minuterie = setTimeout(() => lanceRecherche(q), 350);
  }
  async function lanceRecherche(q) {
    const mon = ++numRecherche;
    etat.recherche = true;
    try {
      const [res] = await Promise.all([api.cherche(requete(q)), chargeToutesExt()]);
      if (mon !== numRecherche) return;
      const rang = (id) => toutesExt?.get(setDe(id))?.rang ?? -1;
      etat.res = (Array.isArray(res) ? res : []).slice()
        .sort((a, b) => rang(b.id) - rang(a.id) || String(a.localId).localeCompare(String(b.localId), undefined, { numeric: true }));
      etat.suggestion = etat.res.length ? null : proche(q);
      chercheImages(etat.res);
    } catch {
      if (mon !== numRecherche) return;
      etat.res = [];
      etat.suggestion = null;
      etat.erreurRecherche = true;
    }
    etat.recherche = false;
    majResultats();
  }
  function htmlResultats() {
    const q = etat.q.trim();
    if (!q) return '';
    if (q.length < 2) return `<p class="dex-res">${t('cxRechercheCourte')}</p>`;
    if (!etat.res) return squeletteGrille(6);
    const vignettes = etat.res.map((c) => ({ id: c.id, num: c.localId, nom: c.name, img: c.image, d: detail(c.id) }));
    etat.liste = vignettes.map((x) => x.id);
    const vide = etat.erreurRecherche && navigator.onLine === false ? t('cxHorsLigne') : t('cxAucuneCarte');
    etat.erreurRecherche = false;
    return `
      <p class="dex-res">${vignettes.length ? t('cxResultats', vignettes.length) : vide}</p>
      ${etat.suggestion ? `<button class="puce cx-suggestion" data-cx-suggestion="${esc(etat.suggestion)}">${t('cxVouliezVous', esc(etat.suggestion))}</button>` : ''}
      <div class="cx-grille">${vignettes.map((x) => vignette(x, { avecSet: true })).join('')}</div>`;
  }
  function majResultats() {
    const zone = document.querySelector('.cx-resultats');
    if (zone) zone.innerHTML = htmlResultats();
  }

  // ---------------------------------------------------------------- une extension
  // Le détail de chaque carte (rareté, variantes, prix) arrive une à une, par la file de
  // quatre requêtes d'api.js, puis reste sur disque trente jours : la deuxième visite ne
  // coûte plus rien. Chaque arrivée met à jour SA vignette ; ce qui dépend de toutes
  // (filtre de rareté, tri par prix, master set) se refait par paquets.
  let jeton = 0;
  let attente = 0;
  function chargeDetails(s) {
    const mon = ++jeton;
    attente = 0;
    chercheImages(s.cards || []);
    for (const c of s.cards || []) {
      if (detail(c.id)) continue;
      attente++;
      api.carteEnFile(c.id).then((d) => {
        if (mon !== jeton) return;
        attente--;
        majVignettes(c.id, d);
        planifieMaj();
      }, () => { if (mon === jeton) { attente--; planifieMaj(); } });
    }
  }
  function quitteSet() {
    jeton++;
    api.videFile();
    etat.set = null;
    etat.selection = null;
  }
  let minuterieMaj = null;
  function planifieMaj() {
    if (minuterieMaj) return;
    minuterieMaj = setTimeout(() => {
      minuterieMaj = null;
      if (ctx.vue() !== 'extensions' || !etat.set) return;
      const dependTout = etat.rarete || etat.tri === 'prix' || etat.tri === 'rarete' || etat.master;
      if (dependTout || attente <= 0) majGrille();
      else majEntete();
    }, 700);
  }
  function chercheImages(cartes) {
    for (const c of cartes) {
      if (c.image || imagesAutres.has(c.id)) continue;
      imagesAutres.set(c.id, '');
      api.carteEnFile(c.id, { autre: true }).then((d) => {
        if (!d?.image) return;
        imagesAutres.set(c.id, d.image);
        majVignettes(c.id, detail(c.id));
      }).catch(() => {});
    }
  }

  // La vignette d'une carte, refaite là où elle s'affiche (grille, résultats, collection).
  function majVignettes(id, d) {
    for (const el of document.querySelectorAll(`#app .cx-v[data-cx-carte="${CSS.escape(id)}"]`)) {
      const va = el.dataset.cxVar || null;
      const i = infoCarte(id, d);
      const avecSet = !!el.closest('.cx-resultats');
      el.outerHTML = vignette({ id, va, num: i.num, nom: i.nom, img: i.img, d }, { avecSet });
    }
  }

  function vignettesDuSet(s) {
    let l = (s.cards || []).map((c, rang) => ({ id: c.id, num: c.localId, nom: c.name, img: c.image, d: detail(c.id), rang }));
    if (etat.rarete) l = l.filter((c) => c.d && categorie(c.d) === etat.rarete);
    let v = etat.master
      ? l.flatMap((c) => variantes(c.d || { name: c.nom, localId: c.num, id: c.id }, s.id, s.name).map((va) => ({ ...c, va })))
      : l;
    const possede = (x) => (x.va ? coll.possedeVariante(x.id, x.va) : coll.possede(x.id));
    const comptes = { toutes: v.length, possedees: v.filter(possede).length };
    comptes.manquantes = comptes.toutes - comptes.possedees;
    if (etat.filtre !== 'toutes') v = v.filter((x) => possede(x) === (etat.filtre === 'possedees'));
    const lg = ctx.langue();
    if (etat.tri === 'nom') v.sort((a, b) => a.nom.localeCompare(b.nom, lg) || a.rang - b.rang);
    else if (etat.tri === 'prix') v.sort((a, b) => (prixDe(b.d, b.va) ?? -1) - (prixDe(a.d, a.va) ?? -1) || a.rang - b.rang);
    else if (etat.tri === 'rarete') {
      const r = (x) => { const k = x.d ? categorie(x.d) : null; return k ? CATEGORIES.indexOf(k) : -1; };
      v.sort((a, b) => r(b) - r(a) || a.rang - b.rang);
    }
    return { v, comptes };
  }

  function bandeauSet(s) {
    const total = s.cardCount?.total || s.cards?.length || 0;
    const n = (s.cards || []).filter((c) => coll.possede(c.id)).length;
    const valeur = (s.cards || []).reduce((acc, c) => acc + (coll.exemplaires(c.id) * (prixUnitaire(c.id) || 0)), 0);
    const pc = total ? Math.min(100, (100 * n) / total) : 0;
    return `
      <div class="bandeau">
        <span class="bandeau-art">${s.logo ? `<img src="${esc(api.logo(s.logo))}" alt="" />`
          : s.symbol ? `<img class="symbole" src="${esc(api.symbole(s.symbol))}" alt="" />` : ''}</span>
        <span class="bandeau-chiffres">
          ${valeur > 0 ? `<span class="bandeau-valeur">${euros(valeur)}</span>` : ''}
          <span class="bandeau-compte"><b>${n}</b> / ${total}<small> · ${pourcent(pc)}</small></span>
        </span>
        <span class="bandeau-barre"><i style="width:${pc}%"></i></span>
        <p class="bandeau-note" data-cx-note>${noteSet(s)}</p>
      </div>`;
  }
  function noteSet(s) {
    const morceaux = [];
    if (s.releaseDate) morceaux.push(t('cxSortie', date(s.releaseDate)));
    if (s.abbreviation?.official) morceaux.push(esc(s.abbreviation.official));
    if (attente > 0) morceaux.push(t('cxDetailsEnCours', (s.cards?.length || 0) - attente, s.cards?.length || 0));
    return morceaux.join(' · ');
  }

  const option = (v, lib, courant) => `<option value="${esc(v)}" ${v === courant ? 'selected' : ''}>${esc(lib)}</option>`;
  function optionsRarete(s) {
    const comptes = Object.fromEntries(CATEGORIES.map((k) => [k, 0]));
    for (const c of s.cards || []) { const d = detail(c.id); const k = d ? categorie(d) : null; if (k) comptes[k]++; }
    return option('', t('cxToutesRaretes'), etat.rarete)
      + CATEGORIES.filter((k) => comptes[k] || etat.rarete === k)
        .map((k) => option(k, `${t(`rarete_${k}`)} · ${comptes[k]}`, etat.rarete)).join('');
  }
  function puces(s) {
    return `
      <div class="puces">
        <select class="puce-select ${etat.rarete ? 'actif' : ''}" data-cx-rarete aria-label="${t('cxRarete')}">${optionsRarete(s)}</select>
        <select class="puce-select ${etat.tri !== 'num' ? 'actif' : ''}" data-cx-tri aria-label="${t('cxTri')}">
          ${option('num', t('cxTriNumero'), etat.tri)}${option('nom', t('cxTriNom'), etat.tri)}
          ${option('prix', t('cxTriPrix'), etat.tri)}${option('rarete', t('cxTriRarete'), etat.tri)}
        </select>
      </div>`;
  }
  // Le rail Toutes / Manquantes / Possédées : le composant du filtre du Pokédex, à
  // l'identique — un Living Dex et une extension se lisent de la même façon.
  function rail(options, actif, attr, aria) {
    const i = Math.max(0, options.findIndex(([k]) => k === actif));
    return `
      <div class="reg-rail dex-filtre" role="radiogroup" aria-label="${esc(aria)}" style="--i:${i};--n:${options.length}">
        ${options.map(([k, lib, n]) => `
          <button class="${k === actif ? 'on' : ''}" role="radio" aria-checked="${k === actif}" ${attr}="${k}">
            ${esc(lib)}<small>${n}</small>
          </button>`).join('')}
      </div>`;
  }
  const railSet = (c) => rail([['toutes', t('cxToutes'), c.toutes], ['manquantes', t('cxManquantes'), c.manquantes],
    ['possedees', t('cxPossedees'), c.possedees]], etat.filtre, 'data-cx-filtre', t('cxFiltreAria'));

  function videSet() {
    if (etat.rarete && attente > 0) return `<p class="dex-vide">${t('cxRaretesEnCours')}</p>`;
    if (etat.filtre === 'manquantes') return `<p class="dex-vide complet">${t('cxRienNeManque')}</p>`;
    if (etat.filtre === 'possedees') return `<p class="dex-vide">${t('cxAucunePossedee')}</p>`;
    return `<p class="dex-vide">${t('cxAucuneCarteIci')}</p>`;
  }

  function vueSet() {
    const id = etat.set;
    const s = extensions.get(id);
    if (!s) charge(`set:${id}`, () => api.extension(id), (d) => { extensions.set(id, d); chargeDetails(d); });
    const actions = `
      <button class="tete-btn ${etat.master ? 'on' : ''}" data-cx-master aria-pressed="${etat.master}"
              title="${t('cxMaster')}" aria-label="${t('cxMaster')}">${ICO.calques}</button>
      <button class="tete-btn ${etat.selection ? 'on' : ''}" data-cx-selection aria-pressed="${!!etat.selection}"
              title="${t('cxSelection')}" aria-label="${t('cxSelection')}">${ICO.selection}</button>`;
    const titre = s?.name || nomSetConnu(id) || id;
    if (!s) {
      return [ctx.tete(titre, actions),
        h(`<section class="cx-page">${echecs.has(`set:${id}`) ? erreurBloc(`set:${id}`) : squeletteGrille()}</section>`)];
    }
    const { v, comptes } = vignettesDuSet(s);
    etat.liste = [...new Set(v.map((x) => x.id))];
    return [
      ctx.tete(titre, actions),
      h(`<section class="cx-page">
        ${bandeauSet(s)}
        ${etat.master ? `<p class="cx-note">${t('cxMasterAide')}</p>` : ''}
        ${puces(s)}
        ${railSet(comptes)}
        <div class="cx-grille" data-cx-grille>${v.map((x) => vignette(x)).join('')}</div>
        <div class="cx-vide-zone">${v.length ? '' : videSet()}</div>
        ${etat.selection ? barreLot() : ''}
      </section>`),
    ];
  }

  // Met à jour la grille, le rail et le bandeau EN PLACE : le curseur du rail glisse, les
  // listes déroulantes ne se referment pas, et la position de lecture ne bouge pas.
  function majGrille() {
    const s = extensions.get(etat.set);
    const grille = document.querySelector('[data-cx-grille]');
    if (!s || !grille) return;
    const { v, comptes } = vignettesDuSet(s);
    etat.liste = [...new Set(v.map((x) => x.id))];
    grille.innerHTML = v.map((x) => vignette(x)).join('');
    const neuf = h(railSet(comptes));
    const railEl = document.querySelector('.cx-page .dex-filtre');
    if (railEl) {
      railEl.style.setProperty('--i', neuf.style.getPropertyValue('--i'));
      railEl.querySelectorAll('button').forEach((b, k) => {
        const n = neuf.querySelectorAll('button')[k];
        b.className = n.className;
        b.setAttribute('aria-checked', n.getAttribute('aria-checked'));
        b.querySelector('small').textContent = n.querySelector('small').textContent;
      });
    }
    const vide = document.querySelector('.cx-vide-zone');
    if (vide) vide.innerHTML = v.length ? '' : videSet();
    majEntete();
    majLot();
  }
  function majEntete() {
    const s = extensions.get(etat.set);
    if (!s) return;
    const b = document.querySelector('.cx-page .bandeau');
    if (b) b.outerHTML = bandeauSet(s);
    const sel = document.querySelector('[data-cx-rarete]');
    // Une liste ouverte ne se réécrit pas sous le doigt.
    if (sel && document.activeElement !== sel) sel.innerHTML = optionsRarete(s);
  }

  // ---------------------------------------------------------------- sélection multiple
  function barreLot() {
    const n = etat.selection?.size || 0;
    return `
      <div class="lot" role="toolbar" aria-label="${t('cxSelection')}">
        <b data-cx-lot-n>${t('cxSelectionN', n)}</b>
        <button data-cx-lot="tout">${t('cxToutSel')}</button>
        <button data-cx-lot="retire" ${n ? '' : 'disabled'}>${t('cxRetirerSel')}</button>
        <button class="primaire" data-cx-lot="ajoute" ${n ? '' : 'disabled'}>${t('cxAjouterSel')}</button>
      </div>`;
  }
  function majLot() {
    const n = etat.selection?.size || 0;
    const b = document.querySelector('[data-cx-lot-n]');
    if (b) b.textContent = t('cxSelectionN', n);
    document.querySelectorAll('[data-cx-lot="retire"], [data-cx-lot="ajoute"]').forEach((x) => { x.disabled = !n; });
  }
  function appliqueLot(ajoute) {
    const s = extensions.get(etat.set);
    if (!s || !etat.selection?.size) return;
    const avant = JSON.parse(JSON.stringify(coll.toutes()));
    let n = 0;
    coll.lot(() => {
      for (const cle of etat.selection) {
        const [id, va] = cle.split('|');
        const d = detail(id);
        const v = va || variantes(d || { id }, s.id, s.name)[0];
        if (ajoute) { coll.ajoute(ficheDe(id, d), v, { langue: etat.ajout.l, etat: etat.ajout.e }); ctx.noteRecent(id); n++; }
        else if (coll.exemplairesVariante(id, v) || (!va && coll.exemplaires(id))) { coll.retire(id, va ? v : null); n++; }
      }
    });
    etat.selection = null;
    ctx.haptique();
    rend('extensions');
    if (n) ctx.annonce(t(ajoute ? 'cxLotAjoute' : 'cxLotRetire', n), () => coll.remplace(avant));
  }

  // ---------------------------------------------------------------- collection
  function vueCollection() {
    const toutes = Object.entries(coll.toutes());
    const st = coll.stats();
    const favoris = toutes.filter(([, c]) => c.fav).length;
    // Le tri vit dans l'en-tête, en icône — comme dans Cartodex — : une liste native
    // posée invisible sur le bouton ouvre le sélecteur du système au toucher.
    const tri = `
      <label class="tete-btn tete-select ${etat.colTri !== 'extension' ? 'on' : ''}" title="${t('cxTri')}">
        ${ICO.trier}
        <select data-cx-coltri aria-label="${t('cxTri')}">
          ${option('extension', t('colTriExtension'), etat.colTri)}${option('recent', t('colTriRecent'), etat.colTri)}
          ${option('nom', t('cxTriNom'), etat.colTri)}${option('valeur', t('colTriValeur'), etat.colTri)}
        </select>
      </label>`;
    rafraichitSiVieux();
    return [
      ctx.tete(t('tuileCollection'), st.distinctes ? tri : ''),
      h(`<section class="cx-page">
        <div class="bandeau">
          <span class="bandeau-art eventail">${toutes.filter(([, c]) => c.ex?.length && c.img)
            .sort(([a, ca], [b, cb]) => (prixUnitaire(b) || 0) - (prixUnitaire(a) || 0)).slice(0, 3)
            .map(([, c]) => `<img src="${esc(api.image(c.img, 'low'))}" alt="" />`).join('')}</span>
          <span class="bandeau-chiffres">
            ${st.valeur > 0 ? `<span class="bandeau-valeur">${euros(st.valeur)}</span>` : ''}
            <span class="bandeau-compte"><b>${st.distinctes}</b> ${t('cxCartesMot', st.distinctes)}</span>
            <span class="bandeau-note">${t('colExemplaires', st.exemplaires)}</span>
          </span>
        </div>
        ${st.distinctes || favoris ? `
          ${champ('data-cx-colq', etat.colQ, t('colChercher'))}
          <div class="puces">${filtresCollection()}</div>
          ${rail([['toutes', t('cxToutes'), st.distinctes], ['favoris', t('colFavoris'), favoris]], etat.colFiltre, 'data-cx-colfiltre', t('cxFiltreAria'))}
          <div data-cx-col>${htmlCollection()}</div>`
        : `<div class="cx-vide">
            <p>${t('colVide')}</p>
            <button class="puce" data-nav-vers="extensions">${ICO.cartes}<span>${t('colOuvrirExtensions')}</span></button>
          </div>`}
      </section>`),
    ];
  }
  // La rareté d'une carte de la collection, d'après ce qu'elle a recopié de TCGdex.
  const rareteDe = (id, c) => categorie({ id, rarity: c.rar, name: c.n, localId: c.num });
  // Rareté et énergie : les deux filtres de « Mes cartes » dans Cartodex. On ne propose
  // que ce que la collection contient, avec le nombre de cartes de chaque choix.
  function filtresCollection() {
    const cartes = Object.entries(coll.toutes()).filter(([, c]) => c.ex?.length);
    const nRar = new Map(), nTyp = new Map();
    for (const [id, c] of cartes) {
      const r = rareteDe(id, c);
      if (r) nRar.set(r, (nRar.get(r) || 0) + 1);
      for (const ty of c.typ || []) nTyp.set(ty, (nTyp.get(ty) || 0) + 1);
    }
    const types = [...nTyp.keys()].sort((a, b) => a.localeCompare(b, ctx.langue()));
    return `
      <select class="puce-select ${etat.colRarete ? 'actif' : ''}" data-cx-colrarete aria-label="${t('cxRarete')}">
        ${option('', t('cxToutesRaretes'), etat.colRarete)}
        ${CATEGORIES.filter((k) => nRar.has(k) || etat.colRarete === k).map((k) => option(k, `${t(`rarete_${k}`)} · ${nRar.get(k) || 0}`, etat.colRarete)).join('')}
      </select>
      <select class="puce-select ${etat.colType ? 'actif' : ''}" data-cx-coltype aria-label="${t('colType')}">
        ${option('', t('colTousTypes'), etat.colType)}
        ${types.map((ty) => option(ty, `${ty} · ${nTyp.get(ty)}`, etat.colType)).join('')}
      </select>`;
  }
  function htmlCollection() {
    if (!listeSeries) charge('series', api.series, (l) => { listeSeries = Array.isArray(l) ? l : []; });
    if (!toutesExt) charge('toutesExt', chargeToutesExt, () => {});
    const q = fold(etat.colQ.trim());
    let l = Object.entries(coll.toutes()).filter(([, c]) => (etat.colFiltre === 'favoris' ? c.fav : c.ex?.length));
    if (q) l = l.filter(([id, c]) => fold(c.n || '').includes(q) || fold(c.setN || '').includes(q) || id.toLowerCase().includes(q));
    if (etat.colRarete) l = l.filter(([id, c]) => rareteDe(id, c) === etat.colRarete);
    if (etat.colType) l = l.filter(([, c]) => (c.typ || []).includes(etat.colType));
    const lg = ctx.langue();
    const dernier = (c) => c.ex?.[c.ex.length - 1]?.d || '';
    if (etat.colTri === 'nom') l.sort(([, a], [, b]) => (a.n || '').localeCompare(b.n || '', lg));
    else if (etat.colTri === 'valeur') l.sort(([a, ca], [b, cb]) => (prixUnitaire(b) || 0) * (cb.ex?.length || 0) - (prixUnitaire(a) || 0) * (ca.ex?.length || 0));
    else if (etat.colTri === 'extension') {
      // Comme Pokécardex : bloc (ordre de BLOCS), puis extensions de la plus récente à la
      // plus ancienne, Énergies et Promos en fin de bloc, puis le numéro de la carte.
      const cle = new Map();
      for (const [id, c] of l) {
        const set = api.hote(c.set || setDe(id));
        const serie = c.serie || serieDuSet(set);
        const bi = BLOCS.findIndex((b) => b.series.includes(serie));
        cle.set(id, { set, bi: bi < 0 ? BLOCS.length : bi, g: genreSet(set, c.setN || nomSetConnu(set)), r: toutesExt?.get(set)?.rang ?? -1 });
      }
      l.sort(([a, ca], [b, cb]) => {
        const x = cle.get(a), y = cle.get(b);
        return x.bi - y.bi || x.g - y.g || y.r - x.r || x.set.localeCompare(y.set)
          || String(ca.num || '').localeCompare(String(cb.num || ''), undefined, { numeric: true });
      });
      etat.colBlocs = cle;
    }
    else l.sort(([, a], [, b]) => (dernier(a) < dernier(b) ? 1 : dernier(a) > dernier(b) ? -1 : 0));
    etat.liste = l.map(([id]) => id);
    if (!l.length) return `<p class="dex-vide">${q || etat.colRarete || etat.colType ? t('colAucuneTrouvee') : t('colAucunFavori')}</p>`;
    const tuile = ([id, c]) => vignette({ id, num: c.num || '', nom: c.n || id, img: c.img, d: detail(id) });
    if (etat.colTri !== 'extension') return `<div class="cx-grille">${l.map(tuile).join('')}</div>`;
    // Groupée comme Pokécardex : un en-tête par BLOC, puis un par extension.
    const groupes = new Map();
    for (const e of l) { const k = api.hote(e[1].set || setDe(e[0])); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(e); }
    const parBloc = new Map();
    for (const [sid, cartes] of groupes) {
      const bi = etat.colBlocs?.get(cartes[0][0])?.bi ?? BLOCS.length;
      if (!parBloc.has(bi)) parBloc.set(bi, []);
      parBloc.get(bi).push([sid, cartes]);
    }
    const nomBloc = (bi) => {
      const b = BLOCS[bi];
      if (!b) return t('cxBlocMisc');
      return b.nom ? t(b.nom) : (listeSeries?.find((x) => x.id === b.series[0])?.name || b.id);
    };
    return [...parBloc].map(([bi, sets]) => `
      <div class="groupe-bloc">
        <b>${esc(nomBloc(bi))}</b>
        <span>${t('cxNbExtensions', sets.length)} · ${t('cxNbCartes', sets.reduce((k, [, c]) => k + c.length, 0))}</span>
      </div>
      ${sets.map(([sid, cartes]) => `
        <div class="groupe-tete">
          <b class="groupe-nom">${esc(cartes[0][1].setN || nomSetConnu(sid) || sid)}</b>
          <span class="groupe-cpt">${cartes.length}</span>
        </div>
        <div class="cx-grille">${cartes.map(tuile).join('')}</div>`).join('')}`).join('');
  }
  function majCollection() {
    const zone = document.querySelector('[data-cx-col]');
    if (zone) zone.innerHTML = htmlCollection();
    const neuf = document.querySelector('.cx-page .dex-filtre');
    if (neuf) {
      const st = coll.stats();
      const favoris = Object.values(coll.toutes()).filter((c) => c.fav).length;
      const ref = h(rail([['toutes', t('cxToutes'), st.distinctes], ['favoris', t('colFavoris'), favoris]], etat.colFiltre, 'data-cx-colfiltre', t('cxFiltreAria')));
      neuf.style.setProperty('--i', ref.style.getPropertyValue('--i'));
      neuf.querySelectorAll('button').forEach((b, k) => {
        const r = ref.querySelectorAll('button')[k];
        b.className = r.className;
        b.setAttribute('aria-checked', r.getAttribute('aria-checked'));
      });
    }
  }

  // ---------------------------------------------------------------- valeur
  // La cote de la collection, et sa courbe : une valeur par jour, relevée ici et à chaque
  // actualisation des prix (collection.js). Le suivi d'une carte précise viendra avec
  // l'historique de Cardmarket.
  function courbe(hist) {
    if (hist.length < 2) return `<p class="cx-note">${t('valCourbeVide')}</p>`;
    const pts = hist.slice(-90);
    const max = Math.max(...pts.map((p) => p.v)), min = Math.min(...pts.map((p) => p.v));
    const ech = (v) => (max === min ? 30 : 56 - ((v - min) / (max - min)) * 48);
    const pas = 300 / (pts.length - 1);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(i * pas).toFixed(1)} ${ech(p.v).toFixed(1)}`).join(' ');
    return `
      <svg class="cx-courbe" viewBox="0 0 300 64" preserveAspectRatio="none" role="img" aria-label="${t('valCourbeAria', pts.length)}">
        <path class="cx-courbe-aire" d="${d} L300 64 L0 64 Z"/>
        <path class="cx-courbe-trait" d="${d}"/>
      </svg>
      <p class="cx-note">${t('valCourbeNote', date(pts[0].d), date(pts[pts.length - 1].d))}</p>`;
  }
  function vueValeur() {
    rafraichitSiVieux();
    const st = coll.stats();
    coll.noteValeurDuJour(st.valeur);
    const l = Object.entries(coll.toutes()).filter(([, c]) => c.ex?.length)
      .map(([id, c]) => ({ id, c, u: prixUnitaire(id), n: c.ex.length }))
      .sort((a, b) => (b.u ?? -1) * b.n - (a.u ?? -1) * a.n);
    const sansPrix = l.filter((x) => x.u == null).length;
    const m = etat.majPrix;
    etat.liste = l.map((x) => x.id);
    return [
      ctx.tete(t('tuileValeur')),
      h(`<section class="cx-page">
        <div class="bandeau cx-valeur">
          <span class="bandeau-chiffres gauche">
            <small>${t('valTotale')}</small>
            <b class="cx-valeur-total">${euros(st.valeur)}</b>
            <span class="bandeau-note">${t('valDetail', st.distinctes, st.exemplaires)}</span>
          </span>
          <div class="cx-courbe-zone">${courbe(coll.historique())}</div>
        </div>
        ${l.length ? `
          <button class="puce large" data-cx-majprix ${m ? 'disabled' : ''}>
            ${ICO.rafraichir}<span>${m ? t('valMajEnCours', m.fait, m.total) : t('valMettreAJour')}</span>
          </button>
          ${sansPrix ? `<p class="cx-note">${t('valSansPrix', sansPrix)}</p>` : ''}
          <h2 class="cx-titre">${t('valPlusCheres')}</h2>
          <div class="reg-lignes cx-top">${l.slice(0, 60).map(({ id, c, u, n }) => `
            <button class="reg-ligne cx-ligne" data-cx-carte="${esc(id)}">
              <img class="cx-mini" src="${esc(api.image(c.img, 'low'))}" alt="" loading="lazy" />
              <span><b>${esc(c.n || id)}</b><small>${esc(c.setN || setDe(id))} · ${esc(c.num || '')}${n > 1 ? ` · ×${n}` : ''}</small></span>
              <span class="cx-ligne-prix">${u != null ? euros(u * n) : '—'}${n > 1 && u != null ? `<small>${euros(u)}</small>` : ''}</span>
            </button>`).join('')}</div>`
        : `<div class="cx-vide"><p>${t('colVide')}</p>
            <button class="puce" data-nav-vers="extensions">${ICO.cartes}<span>${t('colOuvrirExtensions')}</span></button></div>`}
      </section>`),
    ];
  }
  // Actualise le prix de chaque carte possédée, quatre à la fois (la file d'api.js), et
  // relève son point du jour pour la courbe. `discret` : lancée d'elle-même, sans
  // redessiner la page au départ.
  function lanceMajPrix({ discret = false } = {}) {
    const ids = Object.entries(coll.toutes()).filter(([, c]) => c.ex?.length).map(([id]) => id);
    if (!ids.length || etat.majPrix) return;
    etat.majPrix = { fait: 0, total: ids.length };
    if (!discret && ctx.vue() === 'valeur') rend('valeur');
    const fin = () => {
      etat.majPrix.fait++;
      const b = document.querySelector('[data-cx-majprix] span');
      if (b) b.textContent = t('valMajEnCours', etat.majPrix.fait, etat.majPrix.total);
      if (etat.majPrix.fait >= etat.majPrix.total) {
        etat.majPrix = null;
        coll.noteValeurDuJour(coll.stats().valeur);
        if (ctx.vue() === 'valeur' || ctx.vue() === 'collection') rend(ctx.vue());
      }
    };
    for (const id of ids) {
      api.carteEnFile(id, { pourPrix: true }).then((d) => {
        const p = prixDe(d);
        if (p) coll.notePrix(id, p);
        coll.complete(id, ficheDe(id, d));
        prix.notePoint(id, d?.pricing?.cardmarket);
      }).catch(() => {}).finally(fin);
    }
  }
  // Les prix d'une collection vieillissent : en entrant dans la collection ou la page
  // Valeur, ceux de plus de 20 heures sont relevés d'eux-mêmes, au plus une fois toutes
  // les six heures — de même pour une carte dont on ignore encore les types (ajoutée
  // avant qu'on les recopie). Seules les cartes possédées passent par le réseau, et chacune
  // garde son détail un jour (api.js).
  let derniereMaj = 0;
  function rafraichitSiVieux() {
    if (etat.majPrix || Date.now() - derniereMaj < 6 * 36e5) return;
    const vieux = Object.values(coll.toutes())
      .some((c) => c.ex?.length && (!c.prix || !c.typ || Date.now() - Date.parse(c.prix.maj) > 20 * 36e5));
    if (!vieux) return;
    derniereMaj = Date.now();
    // Après le rendu en cours : la page s'affiche d'abord, les prix suivent.
    setTimeout(() => lanceMajPrix({ discret: true }), 0);
  }

  // ---------------------------------------------------------------- classeurs
  //
  // Les classeurs de Cartodex : des pages de pochettes qu'on feuillette. La page
  // courante au centre, ses voisines qui dépassent de chaque côté ; glisser tourne la
  // page, qui bascule légèrement en 3D. Les pochettes suivent la règle de toute l'appli :
  // carte possédée en couleur, manquante en gris, place libre en pointillés.
  const pagesDe = (c) => Math.max(10, Math.ceil(c.cartes.length / c.poches) + 1);
  const possedeCle = (k) => {
    const v = cls.varianteDe(k);
    return v ? coll.possedeVariante(cls.idDe(k), v) : coll.possede(cls.idDe(k));
  };
  const exemplairesCle = (k) => {
    const v = cls.varianteDe(k);
    return v ? coll.exemplairesVariante(cls.idDe(k), v) : coll.exemplaires(cls.idDe(k));
  };
  const LETTRE_VAR = { normal: 'N', holo: 'H', reverse: 'R', premiere: '1', reverse_pokeball: 'PB', reverse_masterball: 'MB' };
  const reduit = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const logoSet = (id) => extensions.get(api.hote(id))?.logo || extensions.get(id)?.logo || toutesExt?.get(api.hote(id))?.logo || '';

  // La valeur d'un classeur, comme dans Cartodex : ce que valent les cartes qu'on y a,
  // et ce que vaudrait le classeur complet. Le prix d'une pochette est celui de sa
  // variante quand on le connaît, sinon celui de la carte, sinon le relevé fait à la
  // préparation du classeur.
  function valeurClasseur(c) {
    let complete = 0, possede = 0, pleines = 0, possedees = 0;
    for (const p of c.cartes) {
      const cles = cls.clesPoche(p);
      if (!cles.length) continue;
      pleines++;
      const id = cls.idDe(cles[0]);
      const v = cls.varianteDe(cles[0]);
      const pr = (v ? prixDe(detail(id), v) : null) ?? prixUnitaire(id) ?? c.prix?.[id] ?? null;
      const a = cles.some(possedeCle);
      if (a) possedees++;
      if (pr != null) { complete += pr; if (a) possede += pr; }
    }
    return { complete, possede, pleines, possedees };
  }

  // La liste des extensions sert aux logos des couvertures : lue une fois par session.
  let essaiExt = false;
  function veilleLogos() {
    if (toutesExt || essaiExt) return;
    essaiExt = true;
    chargeToutesExt().then(() => { if (ctx.vue() === 'classeurs' && !etat.cls && toutesExt) rend('classeurs'); });
  }

  function couverture(c) {
    const v = valeurClasseur(c);
    const logo = c.logo ? logoSet(c.logo) : '';
    const pc = v.pleines ? (100 * v.possedees) / v.pleines : 0;
    return `
      <button class="cl-couv c-${esc(c.couleur)}" data-cl="${esc(c.id)}"
              aria-label="${esc(c.nom)}, ${esc(t('clContenu', v.possedees, v.pleines))}">
        <span class="cl-anneaux" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="cl-couv-art">${logo ? `<img src="${esc(api.logo(logo))}" alt="" loading="lazy" />`
          : `<b aria-hidden="true">${esc((c.nom || '?').slice(0, 1).toUpperCase())}</b>`}</span>
        <span class="cl-couv-txt">
          <b>${esc(c.nom)}</b>
          <small>${t('clContenu', v.possedees, v.pleines)}</small>
          <span class="cl-couv-barre"><i style="width:${pc}%"></i></span>
          ${v.possede > 0 ? `<span class="cl-couv-valeur">${euros(v.possede)}</span>` : ''}
        </span>
      </button>`;
  }

  function vueClasseurs() {
    veilleLogos();
    const liste = cls.tous();
    const actions = `<button class="tete-btn" data-cl-nouveau title="${t('clNouveau')}" aria-label="${t('clNouveau')}">${ICO.plus}</button>`;
    if (!liste.length) {
      return [ctx.tete(t('tuileClasseurs'), actions), h(`
        <section class="cx-page">
          <div class="cx-bientot t-classeurs">${ctx.art('classeurs')}</div>
          <p class="cx-bientot-txt">${t('clVide')}</p>
          <button class="catch-btn" data-cl-nouveau>${t('clCreer')}</button>
        </section>`)];
    }
    return [ctx.tete(t('tuileClasseurs'), actions), h(`
      <section class="cx-page">
        <div class="cl-liste">${liste.map(couverture).join('')}</div>
        <p class="cx-note">${t('clAide')}</p>
      </section>`)];
  }

  // Les cartes d'une page dont on ne sait encore rien (ajoutées depuis une recherche,
  // classeur venu d'un autre appareil) : leur détail est demandé, la page se refait.
  const aCharger = new Set();
  let minuterieLivre = null;
  function chargePoches() {
    const ids = [...aCharger];
    aCharger.clear();
    for (const id of ids) {
      api.carteEnFile(id).then(() => {
        clearTimeout(minuterieLivre);
        minuterieLivre = setTimeout(majLivre, 250);
      }).catch(() => {});
    }
  }

  function poche(c, i) {
    const cles = cls.clesPoche(c.cartes[i]);
    const sel = !!etat.clsSel?.has(i);
    if (!cles.length) {
      return `<button class="cl-poche vide ${sel ? 'choisie' : ''}" data-cl-poche="${i}"
                      aria-label="${t('clPocheVide')}">${etat.clsSel ? '' : ICO.plus}</button>`;
    }
    const cle = cles[0];
    const id = cls.idDe(cle);
    const v = cls.varianteDe(cle);
    const info = infoCarte(id);
    if (!info.img && !detail(id)) aCharger.add(id);
    const a = cles.some(possedeCle);
    const n = cles.length === 1 ? exemplairesCle(cle) : 0;
    return `
      <button class="cl-poche pleine ${a ? '' : 'manque'} ${sel ? 'choisie' : ''}" data-cl-poche="${i}"
              aria-label="${esc(info.nom)} ${esc(info.num)}${v ? ', ' + esc(nomVariante(v)) : ''}${a ? '' : ', ' + esc(t('cxManquantes'))}">
        <img src="${esc(api.image(info.img, 'low'))}" alt="" loading="lazy" decoding="async" />
        ${v ? `<span class="cl-var v-${esc(v)}">${LETTRE_VAR[v] || esc(v.slice(0, 2).toUpperCase())}</span>` : ''}
        ${cles.length > 1 ? `<span class="cl-qte">▦ ${cles.length}</span>` : n > 1 ? `<span class="cl-qte">×${n}</span>` : ''}
        ${etat.clsSel ? `<span class="cx-v-coche" aria-hidden="true">${ICO.coche}</span>` : ''}
      </button>`;
  }

  function feuille(c, page, sorte) {
    let html = '';
    for (let k = 0; k < c.poches; k++) html += poche(c, page * c.poches + k);
    return `
      <div class="cl-feuille ${sorte}" ${sorte === 'cour' ? '' : 'aria-hidden="true"'}>
        <span class="cl-trous" aria-hidden="true"><i></i><i></i><i></i></span>
        <div class="cl-grille g${c.poches}">${html}</div>
      </div>`;
  }

  function htmlLivre(c) {
    const pages = pagesDe(c);
    const p = etat.clsPage;
    return `
      <div class="cl-livre c-${esc(c.couleur)}" data-cl-livre>
        <div class="cl-piste">
          ${p > 0 ? feuille(c, p - 1, 'prec') : ''}
          ${feuille(c, p, 'cour')}
          ${p < pages - 1 ? feuille(c, p + 1, 'suiv') : ''}
        </div>
      </div>
      <div class="cl-nav">
        <button class="tete-btn" data-cl-tourne="-1" ${p === 0 ? 'disabled' : ''} aria-label="${t('clPagePrec')}">${ICO.gauche}</button>
        <span class="cl-nav-txt" aria-live="polite">${t('clPage', p + 1, pages)}</span>
        <button class="tete-btn" data-cl-tourne="1" ${p >= pages - 1 ? 'disabled' : ''} aria-label="${t('clPageSuiv')}">${ICO.droite}</button>
      </div>`;
  }

  function bandeauClasseur(c) {
    const v = valeurClasseur(c);
    const logo = c.logo ? logoSet(c.logo) : '';
    const pc = v.pleines ? (100 * v.possedees) / v.pleines : 0;
    return `
      <div class="bandeau">
        <span class="bandeau-art">${logo ? `<img src="${esc(api.logo(logo))}" alt="" />` : `<span class="cl-mini c-${esc(c.couleur)}"></span>`}</span>
        <span class="bandeau-chiffres">
          ${v.possede > 0 ? `<span class="bandeau-valeur">${euros(v.possede)}</span>` : ''}
          <span class="bandeau-compte"><b>${v.possedees}</b> / ${v.pleines}<small> · ${pourcent(pc)}</small></span>
        </span>
        <span class="bandeau-barre"><i style="width:${pc}%"></i></span>
        <p class="bandeau-note">${v.complete > 0 ? `${t('clComplet', euros(v.complete))} · ` : ''}${t('clPochesPage', c.poches)}</p>
      </div>`;
  }

  function barreLotClasseur() {
    const n = etat.clsSel?.size || 0;
    if (etat.clsDeplace) {
      return `<div class="lot" role="status"><b>${t('clDeplaceAide', n)}</b><button data-cl-lot="annule">${t('annuler')}</button></div>`;
    }
    return `
      <div class="lot" role="toolbar" aria-label="${t('cxSelection')}">
        <b data-cl-lot-n>${t('cxSelectionN', n)}</b>
        <button data-cl-lot="deplace" ${n ? '' : 'disabled'}>${t('clDeplacer')}</button>
        <button class="primaire" data-cl-lot="retire" ${n ? '' : 'disabled'}>${t('cxRetirerSel')}</button>
      </div>`;
  }

  function vueLivre() {
    const c = cls.classeur(etat.cls);
    if (!c) { etat.cls = null; return vueClasseurs(); }
    // Un classeur préparé depuis une extension en connaît les images : on la relit.
    if (c.set && !extensions.has(c.set)) charge(`set:${c.set}`, () => api.extension(c.set), (d) => extensions.set(c.set, d));
    if (!toutesExt) veilleLogos();
    etat.clsPage = Math.min(Math.max(0, etat.clsPage), pagesDe(c) - 1);
    const actions = `
      <button class="tete-btn ${etat.clsSel ? 'on' : ''}" data-cl-selection aria-pressed="${!!etat.clsSel}"
              title="${t('cxSelection')}" aria-label="${t('cxSelection')}">${ICO.selection}</button>
      <button class="tete-btn" data-cl-reglages title="${t('clReglages')}" aria-label="${t('clReglages')}">${ICO.reglages}</button>`;
    const els = [ctx.tete(c.nom, actions), h(`
      <section class="cx-page cl-vue">
        ${bandeauClasseur(c)}
        ${htmlLivre(c)}
        ${etat.clsSel ? barreLotClasseur() : ''}
      </section>`)];
    setTimeout(chargePoches, 0);
    return els;
  }

  // Refait le livre EN PLACE (page tournée, détail arrivé) : le défilement ne bouge pas,
  // et un geste en cours n'est jamais interrompu.
  let livreTouche = false;
  function majLivre() {
    const c = cls.classeur(etat.cls);
    const livre = document.querySelector('[data-cl-livre]');
    if (!c || !livre || livreTouche) return;
    const neuf = h(`<div>${htmlLivre(c)}</div>`);
    const [nLivre, nNav] = [...neuf.children];
    livre.replaceWith(nLivre);
    document.querySelector('.cl-nav')?.replaceWith(nNav);
    const b = document.querySelector('.cl-vue .bandeau');
    if (b) b.outerHTML = bandeauClasseur(c);
    chargePoches();
  }

  // ---- Tourner la page ----
  // La piste porte les trois feuilles ; le doigt la fait glisser, et la feuille courante
  // bascule un peu, comme une page qu'on soulève. Au-delà de 60 px, la page tourne.
  const pisteEl = () => document.querySelector('.cl-piste');
  function poseLivre(dx) {
    const piste = pisteEl();
    if (!piste) return;
    const w = piste.getBoundingClientRect().width || 340;
    piste.style.transform = `translateX(${dx}px)`;
    const cour = piste.querySelector('.cl-feuille.cour');
    if (cour) cour.style.transform = `rotateY(${(-dx / w) * 16}deg)`;
  }
  function remetLivre() {
    const piste = pisteEl();
    if (!piste) return;
    const cour = piste.querySelector('.cl-feuille.cour');
    for (const el of [piste, cour]) {
      if (!el) continue;
      el.style.transition = reduit() ? 'none' : 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)';
      el.style.transform = '';
    }
  }
  function tourne(dir) {
    const c = cls.classeur(etat.cls);
    if (!c) return;
    const cible = etat.clsPage + dir;
    const piste = pisteEl();
    if (cible < 0 || cible >= pagesDe(c) || !piste) { remetLivre(); return; }
    ctx.haptique();
    if (reduit()) { etat.clsPage = cible; majLivre(); return; }
    const cour = piste.querySelector('.cl-feuille.cour');
    const pas = (cour?.getBoundingClientRect().width || 300) + 12;
    const courbe = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
    piste.style.transition = `transform 260ms ${courbe}`;
    piste.style.transform = `translateX(${-dir * pas}px)`;
    if (cour) {
      cour.style.transition = `transform 260ms ${courbe}, opacity 260ms ease`;
      cour.style.transform = `rotateY(${dir * 18}deg) scale(0.94)`;
      cour.style.opacity = '0.55';
    }
    const venant = piste.querySelector(dir > 0 ? '.cl-feuille.suiv' : '.cl-feuille.prec');
    if (venant) {
      venant.style.transition = `transform 260ms ${courbe}, opacity 260ms ease, filter 260ms ease`;
      venant.style.transform = `translateX(${dir > 0 ? 'calc(100% + 12px)' : 'calc(-100% - 12px)'}) scale(1)`;
      venant.style.opacity = '1';
      venant.style.filter = 'none';
    }
    setTimeout(() => { etat.clsPage = cible; majLivre(); }, 270);
  }

  // ---- Ranger des cartes : le sélecteur ----
  function ouvreAjout(depuis) {
    etat.clsAjout = { depuis, choix: new Set(), source: 'collection', q: '', res: null };
    ctx.panneau2.ouvre(htmlAjout());
  }
  function grilleAjout() {
    const a = etat.clsAjout;
    const q = fold(a.q.trim());
    let l;
    if (a.source === 'collection') {
      l = Object.entries(coll.toutes()).filter(([, c]) => c.ex?.length)
        .filter(([id, c]) => !q || fold(c.n || '').includes(q) || fold(c.setN || '').includes(q) || id.toLowerCase().includes(q))
        .sort(([a1, c1], [a2, c2]) => (c1.set || '').localeCompare(c2.set || '') || String(c1.num || '').localeCompare(String(c2.num || ''), undefined, { numeric: true }))
        .map(([id, c]) => ({ id, nom: c.n || id, num: c.num || '', img: c.img, d: detail(id) }));
      if (!l.length) return `<p class="dex-vide">${q ? t('colAucuneTrouvee') : t('colVide')}</p>`;
    } else {
      if (a.q.trim().length < 2) return `<p class="dex-res">${t('cxRechercheCourte')}</p>`;
      if (!a.res) return squeletteGrille(6);
      l = a.res.map((c) => ({ id: c.id, nom: c.name, num: c.localId, img: c.image, d: detail(c.id) }));
      if (!l.length) return `<p class="dex-vide">${t('cxAucuneCarte')}</p>`;
    }
    return `<div class="cx-grille">${l.map((x) => vignette(x, { avecSet: a.source !== 'collection', choix: a.choix })).join('')}</div>`;
  }
  function htmlAjout() {
    const a = etat.clsAjout;
    return `
      <h2 class="bs-title">${t('clAjouterTitre')}</h2>
      ${rail([['collection', t('clSourceCollection'), coll.stats().distinctes], ['recherche', t('clSourceRecherche'), '']],
        a.source, 'data-cl-source', t('clAjouterTitre'))}
      ${champ('data-cl-q', a.q, a.source === 'collection' ? t('colChercher') : t('cxChercher'))}
      <div class="cl-choix" data-cl-choix>${grilleAjout()}</div>
      <div class="lot cl-lot-ajout">
        <b data-cl-choix-n>${t('cxSelectionN', a.choix.size)}</b>
        <button class="primaire" data-cl-ajoute ${a.choix.size ? '' : 'disabled'}>${t('cxAjouterSel')}</button>
      </div>`;
  }
  function majAjout() {
    const zone = ctx.panneau2.corps.querySelector('[data-cl-choix]');
    if (zone) zone.innerHTML = grilleAjout();
    const n = ctx.panneau2.corps.querySelector('[data-cl-choix-n]');
    if (n) n.textContent = t('cxSelectionN', etat.clsAjout.choix.size);
    const b = ctx.panneau2.corps.querySelector('[data-cl-ajoute]');
    if (b) b.disabled = !etat.clsAjout.choix.size;
  }
  let minuterieAjout = null, numAjout = 0;
  function chercheAjout() {
    const a = etat.clsAjout;
    clearTimeout(minuterieAjout);
    const q = a.q.trim();
    if (a.source !== 'recherche' || q.length < 2) { a.res = null; majAjout(); return; }
    a.res = null;
    majAjout();
    const mon = ++numAjout;
    minuterieAjout = setTimeout(async () => {
      try {
        const [res] = await Promise.all([api.cherche(requete(q)), chargeToutesExt()]);
        if (mon !== numAjout || !etat.clsAjout) return;
        const rang = (id) => toutesExt?.get(setDe(id))?.rang ?? -1;
        etat.clsAjout.res = (Array.isArray(res) ? res : []).slice().sort((x, y) => rang(y.id) - rang(x.id));
        chercheImages(etat.clsAjout.res);
      } catch { if (etat.clsAjout) etat.clsAjout.res = []; }
      majAjout();
    }, 350);
  }

  // ---- Créer un classeur, ou en changer les réglages ----
  function ouvreEdition(id) {
    const c = id ? cls.classeur(id) : null;
    etat.clsEdition = c
      ? { id: c.id, nom: c.nom, poches: c.poches, couleur: c.couleur }
      : { nom: '', poches: 9, couleur: 'nuit', contenu: 'vide', set: '', mise: 'simple', qSet: '', prepa: null, erreur: '' };
    if (!c) chargeToutesExt().then(majEdition);
    ctx.panneau2.ouvre(htmlEdition());
  }
  function htmlSetsChoix(e) {
    if (!toutesExt) return squeletteSets(3);
    const q = fold(e.qSet.trim());
    let l = [...toutesExt.entries()].map(([id, x]) => ({ id, ...x })).sort((a, b) => b.rang - a.rang);
    if (q) l = l.filter((x) => fold(x.nom).includes(q) || x.id.toLowerCase().includes(q));
    const choisi = e.set ? [...toutesExt.entries()].map(([id, x]) => ({ id, ...x })).find((x) => x.id === e.set) : null;
    l = l.slice(0, q ? 40 : 8);
    if (choisi && !l.some((x) => x.id === choisi.id)) l.unshift(choisi);
    if (!l.length) return `<p class="dex-vide">${t('clAucuneExtension')}</p>`;
    return l.map((x) => `
      <button class="avance cl-set ${x.id === e.set ? 'complet' : ''}" data-cl-set="${esc(x.id)}" aria-pressed="${x.id === e.set}">
        <span class="avance-art logo">${x.logo ? `<img src="${esc(api.logo(x.logo))}" alt="" loading="lazy" />`
          : `<span class="avance-sigle">${esc(x.id.toUpperCase())}</span>`}</span>
        <span class="avance-txt">
          <span class="avance-haut"><b class="avance-nom">${esc(x.nom)}</b>${x.total ? `<span class="avance-cpt">${t('cxResultats', x.total)}</span>` : ''}</span>
        </span>
        ${x.id === e.set ? `<span class="cl-coche" aria-hidden="true">${ICO.coche}</span>` : ''}
      </button>`).join('');
  }
  function htmlEdition() {
    const e = etat.clsEdition;
    const creation = !e.id;
    return `
      <h2 class="bs-title">${creation ? t('clNouveau') : t('clReglages')}</h2>
      <label class="bs-field"><span>${t('clNom')}</span>
        <input class="bs-name" data-cl-nom value="${esc(e.nom)}" placeholder="${esc(t('clNomPlace'))}" maxlength="60"
               autocomplete="off" autocorrect="off" spellcheck="false" />
      </label>
      <div class="cx-choix">
        <span class="cx-choix-lib">${t('clPoches')}</span>
        <div class="cx-choix-puces">${cls.POCHES.map((n) => `
          <button class="puce ${e.poches === n ? 'on' : ''}" data-cl-poches="${n}" aria-pressed="${e.poches === n}">${t('clPochesN', n)}</button>`).join('')}</div>
      </div>
      <div class="cx-choix">
        <span class="cx-choix-lib">${t('clCouleur')}</span>
        <div class="cx-choix-puces">${cls.COULEURS.map((k) => `
          <button class="cl-teinte c-${k} ${e.couleur === k ? 'on' : ''}" data-cl-couleur="${k}"
                  aria-pressed="${e.couleur === k}" aria-label="${t(`clCouleur_${k}`)}" title="${t(`clCouleur_${k}`)}"></button>`).join('')}</div>
      </div>
      ${creation ? `
        <div class="cx-choix">
          <span class="cx-choix-lib">${t('clContenuLib')}</span>
          <div class="cx-choix-puces">
            <button class="puce ${e.contenu === 'vide' ? 'on' : ''}" data-cl-contenu="vide" aria-pressed="${e.contenu === 'vide'}">${t('clContenuVide')}</button>
            <button class="puce ${e.contenu === 'set' ? 'on' : ''}" data-cl-contenu="set" aria-pressed="${e.contenu === 'set'}">${t('clContenuSet')}</button>
          </div>
        </div>
        ${e.contenu === 'set' ? `
          ${champ('data-cl-qset', e.qSet, t('clChercherExtension'))}
          <div class="avances cl-sets" data-cl-sets>${htmlSetsChoix(e)}</div>
          <div class="cx-choix">
            <span class="cx-choix-lib">${t('clDisposition')}</span>
            <div class="cx-choix-puces">
              <button class="puce ${e.mise === 'simple' ? 'on' : ''}" data-cl-mise="simple" aria-pressed="${e.mise === 'simple'}">${t('clMiseSimple')}</button>
              <button class="puce ${e.mise === 'master' ? 'on' : ''}" data-cl-mise="master" aria-pressed="${e.mise === 'master'}">${t('clMiseMaster')}</button>
            </div>
          </div>
          <p class="cx-note">${e.mise === 'master' ? t('clMiseMasterAide') : t('clMiseSimpleAide')}</p>` : ''}`
      : `
        <div class="reg-lignes cl-actions">
          <button class="reg-ligne" data-cl-monte>${ICO.gauche}<span><b>${t('clMonter')}</b><small>${t('clMonterSous')}</small></span></button>
          <button class="reg-ligne danger" data-cl-supprime>${ICO.croix}<span><b>${t('clSupprimer')}</b><small>${t('clSupprimerSous')}</small></span></button>
        </div>`}
      ${e.erreur ? `<p class="sd-erreur">${esc(e.erreur)}</p>` : ''}
      <button class="catch-btn" data-cl-valide ${e.prepa ? 'disabled' : ''}>${e.prepa
        ? t('clPreparation', e.prepa.fait, e.prepa.total) : creation ? t('clCreer') : t('clEnregistrer')}</button>`;
  }
  function majEdition() {
    if (!etat.clsEdition || !ctx.panneau2.ouvert()) return;
    const nom = ctx.panneau2.corps.querySelector('[data-cl-nom]');
    if (nom) etat.clsEdition.nom = nom.value;
    ctx.panneau2.maj(htmlEdition());
  }
  async function valideEdition() {
    const e = etat.clsEdition;
    if (!e || e.prepa) return;
    const nom = (ctx.panneau2.corps.querySelector('[data-cl-nom]')?.value ?? e.nom).trim();
    if (e.id) {
      cls.modifie(e.id, { nom, poches: e.poches, couleur: e.couleur });
      etat.clsEdition = null;
      ctx.panneau2.ferme();
      rend('classeurs');
      return;
    }
    if (e.contenu === 'set' && !e.set) { e.nom = nom; e.erreur = t('clChoisirExtension'); majEdition(); return; }
    let cartes = [];
    const prixCartes = {};
    if (e.contenu === 'set') {
      e.nom = nom;
      e.erreur = '';
      try {
        const s = extensions.get(e.set) || await api.extension(e.set);
        extensions.set(e.set, s);
        const ids = (s.cards || []).map((x) => x.id);
        // Le détail de chaque carte donne ses variantes (master set) et son prix (la
        // valeur « complète » du classeur) ; gardé trente jours, il ne coûte qu'une fois.
        e.prepa = { fait: 0, total: ids.length };
        majEdition();
        const fin = () => {
          e.prepa.fait++;
          const b = ctx.panneau2.corps.querySelector('[data-cl-valide]');
          if (b) b.textContent = t('clPreparation', e.prepa.fait, e.prepa.total);
        };
        const details = await Promise.all(ids.map((id) => api.carteEnFile(id).then((d) => { fin(); return d; }, () => { fin(); return null; })));
        ids.forEach((id, k) => {
          const d = details[k];
          const p = prixDe(d);
          if (p) prixCartes[id] = Math.round(p * 100) / 100;
          if (e.mise === 'master') for (const v of variantes(d || { id }, s.id, s.name)) cartes.push(`${id}|${v}`);
          else cartes.push(id);
        });
        chercheImages(s.cards || []);
      } catch {
        e.prepa = null;
        e.erreur = t('clErreurPrepa');
        majEdition();
        return;
      }
    }
    const c = cls.cree({
      nom: nom || (e.set ? nomSetConnu(e.set) : '') || t('clNomDefaut'),
      poches: e.poches, couleur: e.couleur, logo: e.contenu === 'set' ? e.set : '', set: e.contenu === 'set' ? e.set : '',
      mise: e.contenu === 'set' ? e.mise : '', cartes, prix: prixCartes,
    });
    etat.clsEdition = null;
    ctx.panneau2.ferme();
    Object.assign(etat, { cls: c.id, clsPage: 0, clsSel: null, clsDeplace: false });
    ctx.haptique();
    rend('classeurs');
  }

  // ---------------------------------------------------------------- PokéAdvisor
  //
  // La page de l'assistant : sa conversation, et ce qu'il faut pour commencer — la clé
  // Mistral de l'utilisateur, comme dans Cartodex. Le moteur vit dans advisor.js ; les
  // OUTILS sont définis ici, ce sont les gestes de l'appli qu'on lui confie. Toute
  // modification de la collection passe par l'« Annuler » habituel.
  const STARTERS_AVATAR = [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501,
    650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912, 25];
  const advUI = { enCours: false, controle: null, outil: '', reglages: false };
  const VUES_OUVRABLES = ['accueil', 'pokedex', 'boites', 'combat', 'attaques', 'types', 'extensions', 'collection', 'classeurs', 'valeur'];
  // Le texte de l'assistant : échappé, puis le gras et les retours à la ligne seulement.
  const texteRiche = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

  function contexteAdvisor() {
    const st = coll.stats();
    const top = Object.entries(coll.toutes()).filter(([, c]) => c.ex?.length)
      .map(([id, c]) => ({ id, c, u: prixUnitaire(id) }))
      .sort((a, b) => (b.u || 0) - (a.u || 0)).slice(0, 15)
      .map(({ id, c, u }) => `${id} ${c.n || ''} ×${c.ex.length}${u ? ` ${u} €` : ''}`).join(' | ');
    const ld = ctx.livingDex(0);
    const lesClasseurs = cls.tous().map((c) => `${c.id} « ${c.nom} » (${c.cartes.filter(Boolean).length} cartes)`).join(' | ') || 'aucun';
    const mem = Object.entries(advisor.memoire()).map(([k, v]) => `[${k} : ${v}]`).join(' ');
    const langue = { fr: 'français', en: 'anglais', ja: 'japonais' }[ctx.langue()] || 'français';
    return `Tu es PokéAdvisor, l'assistant de l'application Unydex : un Living Dex (Pokédex, boîtes PC, équipes de combat) et une collection de cartes Pokémon (JCC) avec leurs prix Cardmarket. Réponds en ${langue}, avec un ton direct et chaleureux, sans titres ni tableaux ; deux ou trois phrases suffisent le plus souvent.
Tu AGIS par tes outils plutôt que d'expliquer comment faire : cherche une carte avant d'en donner le prix, ajoute ou retire une carte quand on te le demande, ouvre la vue utile. Ne devine jamais l'identifiant d'une carte : utilise chercher_carte. Si plusieurs cartes correspondent, demande laquelle.
Living Dex : ${ld.pris} / ${ld.total} espèces capturées.
Collection de cartes : ${st.distinctes} cartes, ${st.exemplaires} exemplaires, valeur ${st.valeur} €. Les plus chères : ${top || 'aucune'}.
Classeurs : ${lesClasseurs}.${mem ? `\nSouvenirs : ${mem}` : ''}`;
  }

  function ouvrePour(cible, valeur) {
    if (cible === 'carte') { ouvre(valeur, [valeur]); return 'Fiche de la carte ouverte.'; }
    if (cible === 'extension') {
      ctx.va('extensions');
      Object.assign(etat, { set: valeur, filtre: 'toutes', rarete: '', tri: 'num', selection: null });
      const s = extensions.get(valeur);
      if (s) chargeDetails(s);
      rend('extensions');
      return 'Extension ouverte.';
    }
    if (cible === 'pokemon') {
      const n = Number(valeur) || ctx.numeroDe(valeur);
      if (!n) return 'Pokémon inconnu.';
      ctx.ficheJeu(n);
      return 'Fiche du Pokémon ouverte.';
    }
    if (cible === 'vue' && VUES_OUVRABLES.includes(valeur)) { ctx.va(valeur); return 'Vue ouverte.'; }
    return 'Cible inconnue.';
  }

  function outilsAdvisor() {
    const id = (x) => String(x || '').trim();
    return [
      { nom: 'chercher_carte', description: 'Cherche des cartes Pokémon par nom, toutes extensions. Rend leurs identifiants TCGdex, extension et numéro, les plus récentes d’abord.',
        parametres: { type: 'object', properties: { nom: { type: 'string', description: 'Nom du Pokémon ou de la carte' } }, required: ['nom'] },
        executer: async ({ nom }) => {
          const [res] = await Promise.all([api.cherche(requete(id(nom))), chargeToutesExt()]);
          const rang = (x) => toutesExt?.get(setDe(x))?.rang ?? -1;
          const l = (Array.isArray(res) ? res : []).slice().sort((a, b) => rang(b.id) - rang(a.id)).slice(0, 20);
          if (!l.length) { const p = proche(id(nom)); return p ? `Aucune carte. Nom proche : ${p}.` : 'Aucune carte.'; }
          return l.map((c) => `${c.id} | ${c.name} | ${nomSetConnu(setDe(c.id)) || setDe(c.id)} | n° ${c.localId}${coll.possede(c.id) ? ' | possédée' : ''}`).join('\n');
        } },
      { nom: 'prix_carte', description: 'Prix Cardmarket actuels d’une carte : référence (moyenne sur 30 jours), tendance, moyennes 7 et 30 jours, plus bas, reverse.',
        parametres: { type: 'object', properties: { id: { type: 'string', description: 'Identifiant TCGdex, par exemple sv03.5-006' } }, required: ['id'] },
        executer: async ({ id: x }) => {
          const d = await api.carte(id(x), { pourPrix: true });
          const cm = d?.pricing?.cardmarket;
          if (!cm) return `${d?.name || x} : pas de prix connu.`;
          const rev = prixDe(d, 'reverse');
          return `${d.name} (${d.set?.name} ${d.localId}) : référence ${prixDe(d) ?? '—'} €, tendance ${cm.trend ?? '—'} €, moyenne 7 j ${cm.avg7 ?? '—'} €, moyenne 30 j ${cm.avg30 ?? '—'} €, plus bas ${cm.low ?? '—'} €${rev && rev !== prixDe(d) ? `, reverse ${rev} €` : ''}.`;
        } },
      { nom: 'extensions_recentes', description: 'Les extensions les plus récentes, avec leur identifiant et leur nombre de cartes.',
        parametres: { type: 'object', properties: {} },
        executer: async () => {
          await chargeToutesExt();
          return [...(toutesExt || new Map()).entries()].sort((a, b) => b[1].rang - a[1].rang).slice(0, 25)
            .map(([x, e]) => `${x} | ${e.nom} | ${e.total} cartes`).join('\n') || 'Liste indisponible.';
        } },
      { nom: 'ma_collection', description: 'Les cartes possédées, filtrées par un mot (nom, extension) si besoin.',
        parametres: { type: 'object', properties: { recherche: { type: 'string' } } },
        executer: ({ recherche }) => {
          const q = fold(id(recherche));
          const l = Object.entries(coll.toutes()).filter(([, c]) => c.ex?.length)
            .filter(([x, c]) => !q || fold(c.n || '').includes(q) || fold(c.setN || '').includes(q) || x.includes(q));
          if (!l.length) return 'Aucune carte possédée ne correspond.';
          return l.slice(0, 40).map(([x, c]) => `${x} | ${c.n} | ${c.setN || ''} | ×${c.ex.length}${prixUnitaire(x) ? ` | ${prixUnitaire(x)} €` : ''}`).join('\n');
        } },
      { nom: 'ajouter_carte', description: 'Ajoute un exemplaire d’une carte à la collection.',
        parametres: { type: 'object', properties: {
          id: { type: 'string', description: 'Identifiant TCGdex' },
          variante: { type: 'string', enum: VARIANTES, description: 'La première variante de la carte par défaut' },
          langue: { type: 'string', enum: LANGUES_CARTE },
          etat: { type: 'string', enum: ETATS } }, required: ['id'] },
        executer: async ({ id: x, variante, langue, etat: e }) => {
          const k = id(x);
          const d = await api.carte(k).catch(() => null);
          if (!d) return `Carte ${k} introuvable.`;
          const vars = variantes(d, d.set?.id, d.set?.name);
          const v = vars.includes(variante) ? variante : vars[0];
          const avant = JSON.parse(JSON.stringify(coll.toutes()));
          coll.ajoute(ficheDe(k, d), v, { langue: LANGUES_CARTE.includes(langue) ? langue : 'FR', etat: ETATS.includes(e) ? e : 'neuf' });
          const p = prixDe(d);
          if (p) coll.notePrix(k, p);
          prix.notePoint(k, d?.pricing?.cardmarket);
          ctx.noteRecent(k);
          ctx.annonce(t('advAjoute', d.name), () => coll.remplace(avant));
          return `Ajouté : ${d.name} (${d.set?.name} ${d.localId}), variante ${v}. Exemplaires : ${coll.exemplaires(k)}.`;
        } },
      { nom: 'retirer_carte', description: 'Retire un exemplaire d’une carte de la collection.',
        parametres: { type: 'object', properties: { id: { type: 'string' }, variante: { type: 'string', enum: VARIANTES } }, required: ['id'] },
        executer: ({ id: x, variante }) => {
          const k = id(x);
          const c = coll.carte(k);
          if (!c?.ex?.length) return `La carte ${k} n’est pas dans la collection.`;
          const avant = JSON.parse(JSON.stringify(coll.toutes()));
          coll.retire(k, VARIANTES.includes(variante) ? variante : null);
          ctx.annonce(t('advRetire', c.n || k), () => coll.remplace(avant));
          return `Retiré : un exemplaire de ${c.n || k}. Il en reste ${coll.exemplaires(k)}.`;
        } },
      { nom: 'living_dex', description: 'Avancement du Living Dex : national (0) ou d’une région (1 Kanto, 2 Johto, 3 Hoenn, 4 Sinnoh, 5 Unys, 6 Kalos, 7 Alola, 8 Galar, 9 Paldea), et les espèces qui manquent.',
        parametres: { type: 'object', properties: { region: { type: 'integer', minimum: 0, maximum: 9 } } },
        executer: ({ region }) => {
          const r = ctx.livingDex(Number.isInteger(region) ? region : 0);
          return `${r.nom} : ${r.pris} / ${r.total}. Manquants (${r.manquants.length}) : ${r.manquants.slice(0, 60).join(', ')}${r.manquants.length > 60 ? '…' : ''}`;
        } },
      { nom: 'classeurs', description: 'Les classeurs de cartes, leur contenu et leur valeur.',
        parametres: { type: 'object', properties: {} },
        executer: () => cls.tous().map((c) => {
          const v = valeurClasseur(c);
          return `${c.id} | ${c.nom} | ${v.possedees} / ${v.pleines} cartes | ${Math.round(v.possede)} € possédés sur ${Math.round(v.complete)} € au complet`;
        }).join('\n') || 'Aucun classeur.' },
      { nom: 'ouvrir', description: 'Ouvre une vue de l’application, la fiche d’une carte, une extension ou la fiche d’un Pokémon.',
        parametres: { type: 'object', properties: {
          cible: { type: 'string', enum: ['vue', 'carte', 'extension', 'pokemon'] },
          valeur: { type: 'string', description: `vue : ${VUES_OUVRABLES.join(', ')} ; carte ou extension : identifiant TCGdex ; pokemon : numéro ou nom` } },
          required: ['cible', 'valeur'] },
        executer: ({ cible, valeur }) => ouvrePour(cible, id(valeur)) },
      { nom: 'memoriser', description: 'Retient une information pour les prochaines conversations : objectif, budget, préférence.',
        parametres: { type: 'object', properties: { cle: { type: 'string' }, valeur: { type: 'string' } }, required: ['cle', 'valeur'] },
        executer: ({ cle: k, valeur }) => { advisor.retiens(k, valeur); return 'Retenu.'; } },
      { nom: 'oublier', description: 'Oublie une information retenue.',
        parametres: { type: 'object', properties: { cle: { type: 'string' } }, required: ['cle'] },
        executer: ({ cle: k }) => { advisor.oublie(k); return 'Oublié.'; } },
    ];
  }

  function htmlMessages() {
    const fil = advisor.historique();
    const av = esc(ctx.sprite(advisor.avatar()));
    if (!fil.length && !advUI.enCours) {
      return `
        <div class="adv-accueil">
          <img class="adv-avatar grand" src="${av}" alt="" />
          <p>${t('advBienvenue')}</p>
          <div class="adv-idees">${['advIdee1', 'advIdee2', 'advIdee3', 'advIdee4'].map((k) => `
            <button class="puce" data-adv-idee="${esc(t(k))}">${esc(t(k))}</button>`).join('')}</div>
        </div>`;
    }
    return fil.map((m) => (m.r === 'u'
      ? `<div class="adv-msg moi"><p>${texteRiche(m.t)}</p></div>`
      : m.r === 'e'
        ? `<div class="adv-msg erreur"><p>${esc(m.t)}</p></div>`
        : `<div class="adv-msg lui"><img class="adv-avatar" src="${av}" alt="" /><p>${texteRiche(m.t)}</p></div>`)).join('')
      + (advUI.enCours ? `
        <div class="adv-msg lui attente"><img class="adv-avatar" src="${av}" alt="" />
          <p><span class="adv-points" aria-label="${t('advReflechit')}"><i></i><i></i><i></i></span>
          ${advUI.outil ? `<small>${esc(t(`advOutil_${advUI.outil}`))}</small>` : ''}</p>
        </div>` : '');
  }

  function vueAdvisor() {
    const actions = `<button class="tete-btn" data-adv-reglages title="${t('advReglages')}" aria-label="${t('advReglages')}">${ICO.reglages}</button>`;
    if (!advisor.cle()) {
      return [ctx.tete(t('tuileAdvisor'), actions), h(`
        <section class="cx-page adv-cle">
          <div class="cx-bientot t-advisor">${ctx.art('advisor')}</div>
          <h2 class="cx-titre">${t('advCommencer')}</h2>
          <p class="adv-texte">${t('advCleAide')}</p>
          <label class="champ">${ICO.cle}
            <input type="password" data-adv-cle placeholder="${esc(t('advClePlace'))}" aria-label="${esc(t('advClePlace'))}"
                   autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
          </label>
          <button class="catch-btn" data-adv-cle-ok>${t('advCleEnregistrer')}</button>
          <button class="puce large" data-cx-lien="https://console.mistral.ai/api-keys">${ICO.externe}<span>${t('advCleObtenir')}</span></button>
          <p class="cx-note">${t('advConfidentialite')}</p>
        </section>`)];
    }
    return [ctx.tete(t('tuileAdvisor'), actions), h(`
      <section class="cx-page adv">
        <div class="adv-fil" data-adv-fil aria-live="polite">${htmlMessages()}</div>
        <form class="adv-saisie" data-adv-form>
          <input type="text" data-adv-q placeholder="${esc(t('advPlace'))}" aria-label="${esc(t('advPlace'))}"
                 autocomplete="off" enterkeyhint="send" ${advUI.enCours ? 'disabled' : ''} />
          ${advUI.enCours
            ? `<button type="button" class="adv-envoi stop" data-adv-stop aria-label="${t('advStop')}">${ICO.croix}</button>`
            : `<button type="submit" class="adv-envoi" aria-label="${t('advEnvoyer')}">${ICO.envoi}</button>`}
        </form>
      </section>`)];
  }

  const defileBas = () => { const z = ctx.zone(); if (z) z.scrollTop = z.scrollHeight; };
  function majFil() {
    const fil = document.querySelector('[data-adv-fil]');
    if (!fil) return;
    fil.innerHTML = htmlMessages();
    defileBas();
  }

  // Une erreur de l'assistant, dite simplement — jamais un message technique seul.
  const MESSAGES_ERREUR = { cle: 'advErrCle', 'cle-refusee': 'advErrRefusee', limite: 'advErrLimite', reseau: 'advErrReseau', vide: 'advErrVide' };
  async function envoie(texte) {
    const q = String(texte || '').trim();
    if (!q || advUI.enCours) return;
    advUI.enCours = true;
    advUI.outil = '';
    advUI.controle = new AbortController();
    rend('advisor');
    try {
      // `demande` inscrit la question dans l'historique AVANT sa première attente : le
      // fil redessiné juste après la montre tout de suite, avec les points d'attente.
      const promesse = advisor.demande(q, {
        outils: outilsAdvisor(),
        systeme: contexteAdvisor(),
        signal: advUI.controle.signal,
        surOutil: (nom) => { advUI.outil = nom; if (ctx.vue() === 'advisor') majFil(); },
      });
      if (ctx.vue() === 'advisor') majFil();
      await promesse;
    } catch (e) {
      const code = e?.code || 'api';
      if (code === 'annule') advisor.noteErreur(t('advAnnule'));
      else advisor.noteErreur(MESSAGES_ERREUR[code] ? t(MESSAGES_ERREUR[code]) : t('advErrApi', e?.message || ''));
    }
    advUI.enCours = false;
    advUI.controle = null;
    advUI.outil = '';
    if (ctx.vue() === 'advisor') {
      rend('advisor');
      defileBas();
      document.querySelector('[data-adv-q]')?.focus({ preventScroll: true });
    }
  }

  function htmlReglagesAdvisor() {
    const mem = Object.entries(advisor.memoire());
    const actifs = new Set(advisor.styles());
    return `
      <h2 class="bs-title">${t('advReglages')}</h2>
      <div class="cx-choix">
        <span class="cx-choix-lib">${t('advModele')}</span>
        <div class="cx-choix-puces">${advisor.MODELES.map(([k, lib]) => `
          <button class="puce ${advisor.modele() === k ? 'on' : ''}" data-adv-modele="${k}" aria-pressed="${advisor.modele() === k}">${esc(lib)}</button>`).join('')}</div>
      </div>
      <div class="cx-choix">
        <span class="cx-choix-lib">${t('advStyle')}</span>
        <div class="cx-choix-puces">${Object.keys(advisor.STYLES).map((k) => `
          <button class="puce ${actifs.has(k) ? 'on' : ''}" data-adv-style="${k}" aria-pressed="${actifs.has(k)}">${t(`advStyle_${k}`)}</button>`).join('')}</div>
      </div>
      <div class="cx-choix">
        <span class="cx-choix-lib">${t('advAvatar')}</span>
        <div class="adv-avatars">${STARTERS_AVATAR.map((n) => `
          <button class="${advisor.avatar() === n ? 'on' : ''}" data-adv-avatar="${n}" aria-pressed="${advisor.avatar() === n}"
                  aria-label="${esc(ctx.nomPokemon(n))}"><img src="${esc(ctx.sprite(n))}" alt="" loading="lazy" /></button>`).join('')}</div>
      </div>
      <div class="cx-choix">
        <span class="cx-choix-lib">${t('advSouvenirs')}</span>
        ${mem.length ? `<div class="adv-souvenirs">${mem.map(([k, v]) => `
          <div class="adv-souvenir"><span><b>${esc(k)}</b> · ${esc(v)}</span>
            <button data-adv-oublie="${esc(k)}" aria-label="${t('advOublier')}">${ICO.croix}</button></div>`).join('')}</div>`
          : `<p class="cx-note">${t('advAucunSouvenir')}</p>`}
      </div>
      <div class="reg-lignes cl-actions">
        <button class="reg-ligne" data-adv-efface>${ICO.rafraichir}<span><b>${t('advEffacer')}</b><small>${t('advEffacerSous')}</small></span></button>
        ${advisor.cle() ? `<button class="reg-ligne danger" data-adv-cle-retire>${ICO.croix}<span><b>${t('advRetirerCle')}</b><small>${t('advRetirerCleSous')}</small></span></button>` : ''}
      </div>
      <p class="cx-note">${t('advConfidentialite')}</p>`;
  }

  // ---------------------------------------------------------------- fiche d'une carte
  function ouvre(id, liste, { variante = null } = {}) {
    etat.fiche = { id, liste: liste && liste.length ? liste : [id] };
    etat.ficheEchec = null;
    gyro.base = null; // chaque carte repart de la position du moment
    etat.ajout.v = variante;
    panneau.ouvre(htmlFiche(id));
    if (gyro.accorde && gyroPossible()) ecouteGyro();
    releveFavoris(id);
    // Le détail du jour : le prix bouge, et une carte possédée relève le sien.
    api.carte(id, { pourPrix: true }).then((d) => {
      if (coll.carte(id)) {
        coll.complete(id, ficheDe(id, d));
        const p = prixDe(d);
        if (p) coll.notePrix(id, p);
        // Une carte suivie relève son point du jour : sa courbe se construit ainsi.
        prix.notePoint(id, d?.pricing?.cardmarket);
      }
      if (etat.fiche?.id === id && panneau.ouvert()) panneau.maj(htmlFiche(id));
      majVignettes(id, d);
    }).catch(() => {
      if (etat.fiche?.id !== id || !panneau.ouvert()) return;
      etat.ficheEchec = id;
      panneau.maj(htmlFiche(id));
    });
  }

  function choix(champNom, valeurs, actuel, libelle, aria) {
    return `
      <div class="cx-choix" role="radiogroup" aria-label="${esc(aria)}">
        <span class="cx-choix-lib">${esc(aria)}</span>
        <div class="cx-choix-puces">${valeurs.map((v) => `
          <button class="puce ${v === actuel ? 'on' : ''}" role="radio" aria-checked="${v === actuel}"
                  data-cx-choix="${champNom}" data-val="${esc(v)}">${esc(libelle(v))}</button>`).join('')}</div>
      </div>`;
  }

  function listeExemplaires(c) {
    const g = new Map();
    for (const x of c.ex) {
      const k = `${x.v}|${x.l}|${cleEtat(x.e)}`;
      g.set(k, (g.get(k) || 0) + 1);
    }
    const rang = (v) => { const i = VARIANTES.indexOf(v); return i < 0 ? 99 : i; };
    const lignes = [...g].map(([k, n]) => { const [v, l, e] = k.split('|'); return { k, v, l, e, n }; })
      .sort((a, b) => rang(a.v) - rang(b.v) || a.l.localeCompare(b.l) || ETATS.indexOf(a.e) - ETATS.indexOf(b.e));
    return `<div class="cx-ex">${lignes.map((x) => `
      <div class="cx-ex-ligne">
        <span class="cx-ex-txt"><b>${esc(nomVariante(x.v))}</b><small>${esc(x.l)} · ${esc(nomEtat(x.e))}</small></span>
        <span class="cx-pas">
          <button data-cx-moins="${esc(x.k)}" aria-label="${t('cxRetirerUn')}">${ICO.moins}</button>
          <b>${x.n}</b>
          <button data-cx-plus="${esc(x.k)}" aria-label="${t('cxAjouterUn')}">${ICO.plus}</button>
        </span>
      </div>`).join('')}</div>`;
  }

  function liens(i) {
    const terme = `${i.nom} ${i.num}${i.total ? '/' + i.total : ''}`;
    const fr = ctx.langue() === 'fr';
    const sites = [
      ['Cardmarket', `https://www.cardmarket.com/${fr ? 'fr' : 'en'}/Pokemon/Products/Search?searchString=${encodeURIComponent(i.nom)}`],
      ['Vinted', `https://www.vinted.${fr ? 'fr' : 'com'}/catalog?search_text=${encodeURIComponent(terme)}`],
      ['eBay', `https://www.ebay.${fr ? 'fr' : 'com'}/sch/i.html?_nkw=${encodeURIComponent(terme)}`],
    ];
    return `<div class="cx-liens">${sites.map(([nom, url]) => `
      <button class="puce" data-cx-lien="${esc(url)}">${ICO.externe}<span>${nom}</span></button>`).join('')}</div>`;
  }

  // Un montant court, pour les repères de la courbe : sans centimes au-delà de 100 €.
  const euroCourt = (v) => {
    try {
      return Number(v).toLocaleString(ctx.langue(), { style: 'currency', currency: 'EUR', maximumFractionDigits: v >= 100 ? 0 : 2 });
    } catch { return euros(v); }
  };
  // La courbe du prix d'une carte : son historique quand elle est suivie (prix.js), sinon
  // les moyennes du marché. Points creux = estimés. Même trait que la courbe de la
  // collection, avec ses repères : le plus haut, le plus bas, la première et la
  // dernière date, et la variation sur la période.
  function courbePrix(id, d) {
    let pts = prix.historique(id);
    if (pts.length < 2) pts = prix.estimation(d?.pricing?.cardmarket);
    if (pts.length < 2) return '';
    const W = 300, H = 116, G = 44, D = 8, HAUT = 10, BAS = 24;
    const ts = pts.map((x) => Date.parse(x.d));
    const ps = pts.map((x) => x.p);
    const t0 = Math.min(...ts), t1 = Math.max(...ts), p0 = Math.min(...ps), p1 = Math.max(...ps);
    const X = (tt) => G + ((tt - t0) / ((t1 - t0) || 1)) * (W - G - D);
    const Y = (p) => HAUT + (1 - (p - p0) / ((p1 - p0) || 1)) * (H - HAUT - BAS);
    const ligne = pts.map((x, k) => `${k ? 'L' : 'M'}${X(ts[k]).toFixed(1)} ${Y(x.p).toFixed(1)}`).join(' ');
    const aire = `${ligne} L${X(t1).toFixed(1)} ${H - BAS} L${X(t0).toFixed(1)} ${H - BAS} Z`;
    const variation = ps[0] > 0 ? ((ps[ps.length - 1] - ps[0]) / ps[0]) * 100 : 0;
    const jours = Math.max(1, Math.round((t1 - t0) / 864e5));
    const dateC = (tt) => new Date(tt).toLocaleDateString(ctx.langue(), { day: 'numeric', month: 'short' });
    const sens = variation > 0.5 ? 'hausse' : variation < -0.5 ? 'baisse' : '';
    return `
      <div class="cx-pc">
        <div class="cx-pc-tete">
          <span>${t('cxEvolution')}</span>
          <span class="cx-pc-var ${sens}">${variation > 0 ? '+' : ''}${Math.round(variation)} % · ${t('cxSurJours', jours)}</span>
        </div>
        <svg class="cx-pc-svg" viewBox="0 0 ${W} ${H}" role="img"
             aria-label="${esc(t('cxCourbeAria', euros(ps[0]), euros(ps[ps.length - 1]), jours))}">
          ${[...new Set([p1, p0])].map((v) => `
            <line class="cx-pc-grille" x1="${G}" x2="${W - D}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>
            <text class="cx-pc-axe" x="${G - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(euroCourt(v))}</text>`).join('')}
          <path class="cx-courbe-aire" d="${aire}"/>
          <path class="cx-courbe-trait" d="${ligne}"/>
          ${pts.map((x, k) => `<circle class="cx-pc-point ${x.e ? 'estime' : ''}" cx="${X(ts[k]).toFixed(1)}" cy="${Y(x.p).toFixed(1)}" r="3"><title>${esc(dateC(ts[k]))} : ${esc(euros(x.p))}</title></circle>`).join('')}
          <text class="cx-pc-axe" x="${G}" y="${H - 7}">${esc(dateC(t0))}</text>
          <text class="cx-pc-axe" x="${W - D}" y="${H - 7}" text-anchor="end">${esc(dateC(t1))}</text>
        </svg>
        ${pts.some((x) => x.e) ? `<p class="cx-note">${t('cxCourbeEstimee')}</p>` : ''}
      </div>`;
  }

  function blocPrix(d, i) {
    if (!d) {
      return `<p class="none">${etat.ficheEchec === i.id ? t('cxPrixHorsLigne') : t('cxPrixChargement')}</p>${liens(i)}`;
    }
    const cm = d.pricing?.cardmarket;
    const ref = prixDe(d);
    if (!cm || ref == null) return `<p class="none">${t('cxPrixAucun')}</p>${liens(i)}`;
    const val = (k) => (cm[k] > 0 ? euros(cm[k]) : '—');
    const rev = prixDe(d, 'reverse');
    return `
      <div class="cx-prix">
        <div class="cx-prix-ref"><small>${t('cxPrixRef')}</small><b>${euros(ref)}</b></div>
        <dl class="cx-prix-grille">
          <div><dt>${t('cxTendance')}</dt><dd>${val('trend')}</dd></div>
          <div><dt>${t('cxMoy7')}</dt><dd>${val('avg7')}</dd></div>
          <div><dt>${t('cxMoy30')}</dt><dd>${val('avg30')}</dd></div>
          <div><dt>${t('cxPlusBas')}</dt><dd>${val('low')}</dd></div>
        </dl>
        ${rev != null && rev !== ref ? `<p class="cx-prix-rev">${t('cxPrixReverse', euros(rev))}</p>` : ''}
      </div>
      ${courbePrix(i.id, d)}
      <p class="cx-note">${t('cxPrixSource', cm.updated ? date(cm.updated) : '—')}</p>
      ${liens(i)}`;
  }

  // Les Pokémon de la carte, dans le Pokédex : la passerelle entre les deux univers. On y
  // voit d'un coup s'il est capturé dans le Living Dex.
  function dansLePokedex(d) {
    const ids = (Array.isArray(d?.dexId) ? d.dexId : []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 1025);
    if (!ids.length) return '';
    return `
      <h3>${t('cxDansPokedex')}</h3>
      <div class="reg-lignes cx-dex">${ids.map((n) => `
        <button class="reg-ligne cx-dex-ligne" data-cx-dex="${n}">
          <img class="${ctx.estCapture(n) ? '' : 'gris'}" src="${esc(ctx.sprite(n))}" alt="" />
          <span><b>${esc(ctx.nomPokemon(n))}</b><small>${t('numero', String(n).padStart(4, '0'))} · ${ctx.estCapture(n) ? t('accCapture') : t('accACapturer')}</small></span>
          ${ICO.droite}
        </button>`).join('')}</div>`;
  }

  function htmlFiche(id) {
    const d = detail(id);
    const i = infoCarte(id, d);
    const c = coll.carte(id);
    const n = c?.ex?.length || 0;
    const cat = d ? categorie(d) : null;
    const vars = variantes(d || { name: i.nom, localId: i.num, id }, i.setId, i.setNom);
    if (!etat.ajout.v || !vars.includes(etat.ajout.v)) etat.ajout.v = vars[0];
    return `
      <div class="cx-fiche-haut">
        <div class="cx-fiche-img" data-cx-incline>
          <img src="${esc(api.image(i.img, 'high'))}" alt="${esc(i.nom)}" />
          <span class="cx-reflet" aria-hidden="true"></span>
        </div>
        ${gyroPossible() && !gyro.accorde && !gyro.refuse ? `<p class="cx-gyro-aide">${t('cxGyroAide')}</p>` : ''}
        ${boutonFavori(id, c)}
      </div>
      <h2 class="sheet-name">${esc(i.nom)}<small>${esc(i.num)}${i.total ? '/' + i.total : ''}</small></h2>
      <p class="sheet-genus">${esc(i.setNom)}${d?.illustrator ? ' · ' + esc(d.illustrator) : ''}</p>
      <div class="types">
        ${cat ? `<span class="cx-rar r-${cat}">${esc(d.rarity || t(`rarete_${cat}`))}</span>` : ''}
        ${(Array.isArray(d?.types) ? d.types : []).map((ty) => `<span class="type" style="--t:${TYPES_JCC[ty] || '#888'}">${esc(ty)}</span>`).join('')}
        ${d?.hp ? `<span class="cx-pv">${t('cxPV')} ${esc(d.hp)}</span>` : ''}
      </div>

      <h3>${t('cxMesExemplaires')}${n ? ` <small>${n}</small>` : ''}</h3>
      ${n ? listeExemplaires(c) : `<p class="none">${t('cxAucunExemplaire')}</p>`}
      <div class="cx-ajout">
        ${choix('v', vars, etat.ajout.v, nomVariante, t('cxVariante'))}
        ${choix('l', LANGUES_CARTE, etat.ajout.l, (l) => l, t('cxLangue'))}
        ${choix('e', ETATS, etat.ajout.e, nomEtat, t('cxEtat'))}
        <button class="catch-btn" data-cx-ajoute>${ICO.plus}<span>${n ? t('cxAjouterExemplaire') : t('cxAjouter')}</span></button>
      </div>

      <h3>${t('cxPrix')}</h3>
      ${blocPrix(d, i)}

      ${dansLePokedex(d)}

      <dl class="facts">
        <div class="fact"><dt>${t('cxExtension')}</dt><dd>${esc(i.setNom)}</dd></div>
        <div class="fact"><dt>${t('cxNumero')}</dt><dd>${esc(i.num)}${i.total ? ' / ' + i.total : ''}</dd></div>
        <div class="fact"><dt>${t('cxRareteLib')}</dt><dd>${esc(d?.rarity || '—')}</dd></div>
        <div class="fact"><dt>${t('cxIllustrateur')}</dt><dd>${esc(d?.illustrator || '—')}</dd></div>
        ${d?.stage ? `<div class="fact"><dt>${t('cxStade')}</dt><dd>${esc(d.stage)}</dd></div>` : ''}
        ${d?.category ? `<div class="fact"><dt>${t('cxCategorie')}</dt><dd>${esc(d.category)}</dd></div>` : ''}
      </dl>`;
  }

  // Ajouter ou retirer un exemplaire depuis la fiche, puis tout redire autour.
  function apresChangement(id) {
    if (panneau.ouvert() && etat.fiche?.id === id) panneau.maj(htmlFiche(id));
  }

  // Le cœur, et à côté le nombre de dresseurs qui ont la carte en favori — avec un
  // compte seulement (voir favoris.js). Les autres comptes viennent du serveur, le sien
  // de la collection locale : le nombre suit le toucher sans attendre la synchronisation.
  // Zéro ne s'affiche pas : un cœur seul dit la même chose, sans la mine triste.
  function boutonFavori(id, c = coll.carte(id)) {
    const autres = favoris.connu(id);
    const n = autres == null ? 0 : autres + (c?.fav ? 1 : 0);
    const libelle = c?.fav ? t('cxRetirerFavori') : t('cxAjouterFavori');
    return `
        <button class="cx-fav ${c?.fav ? 'on' : ''} ${n ? 'avec-nb' : ''}" data-cx-fav aria-pressed="${!!c?.fav}"
                aria-label="${n ? `${libelle} · ${t('cxFavorisPartages', n)}` : libelle}">${ICO.coeur}${n ? `<span>${n}</span>` : ''}</button>`;
  }
  function releveFavoris(id) {
    favoris.releve(id).then((n) => {
      if (n == null || etat.fiche?.id !== id || !panneau.ouvert()) return;
      panneau.corps.querySelector('[data-cx-fav]')?.replaceWith(h(boutonFavori(id)));
    });
  }
  function ajouteDepuisFiche(id, v, l, e) {
    const d = detail(id);
    coll.ajoute(ficheDe(id, d), v, { langue: l, etat: e });
    const p = prixDe(d);
    if (p) coll.notePrix(id, p);
    prix.notePoint(id, d?.pricing?.cardmarket);
    ctx.noteRecent(id);
    ctx.haptique();
    apresChangement(id);
  }
  function retireDepuisFiche(id, v, l, e) {
    const fiche = ficheDe(id);
    coll.retire(id, v, { langue: l, etat: e });
    ctx.haptique();
    apresChangement(id);
    ctx.annonce(t('cxRetireUn', fiche.n), () => { coll.ajoute(fiche, v, { langue: l, etat: e }); apresChangement(id); });
  }

  // ---- Inclinaison au gyroscope ----
  // Sur téléphone, la carte suit l'inclinaison de l'appareil, comme une vraie carte
  // qu'on fait miroiter. iOS ne délivre l'orientation qu'après une permission demandée
  // DANS un geste : le premier toucher sur la carte la demande. La position de départ
  // est relevée à la première mesure — on tient le téléphone comme on veut. Mouvement
  // réduit : rien de tout cela.
  // Une fois la permission ACCORDÉE, chaque fiche ouverte ensuite miroite d'elle-même :
  // redemander un toucher par carte serait une corvée. L'écoute est tout de même coupée
  // à la fermeture — rien ne s'incline hors de la fiche, la batterie n'a pas à payer.
  const gyro = { actif: false, accorde: false, refuse: false, base: null };
  const tactile = () => !!window.matchMedia?.('(pointer: coarse)').matches;
  const gyroPossible = () => typeof window.DeviceOrientationEvent !== 'undefined' && tactile() && !reduit();
  function surOrientation(e) {
    const el = panneau.corps.querySelector('[data-cx-incline]');
    if (!el || !panneau.ouvert() || e.beta == null || e.gamma == null) return;
    if (!gyro.base) gyro.base = { b: e.beta, g: e.gamma };
    const borne = (v) => Math.max(-14, Math.min(14, v));
    const rx = borne((e.beta - gyro.base.b) * 0.6);
    const ry = borne((e.gamma - gyro.base.g) * 0.6);
    el.style.setProperty('--rx', `${(-rx).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(50 + ry * 3).toFixed(1)}%`);
    el.style.setProperty('--my', `${(50 + rx * 3).toFixed(1)}%`);
    el.classList.add('incline', 'gyro');
  }
  async function activeGyro() {
    if (gyro.actif || gyro.refuse || !gyroPossible()) return;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { gyro.refuse = true; return; }
      }
      gyro.accorde = true;
      ecouteGyro();
      panneau.corps.querySelector('.cx-gyro-aide')?.remove();
    } catch { gyro.refuse = true; }
  }
  function ecouteGyro() {
    if (gyro.actif) return;
    gyro.actif = true;
    gyro.base = null;
    window.addEventListener('deviceorientation', surOrientation);
  }
  function coupeGyro() {
    if (!gyro.actif) return;
    window.removeEventListener('deviceorientation', surOrientation);
    gyro.actif = false;
    gyro.base = null;
  }

  // Inclinaison de la carte sous la souris, sur un ordinateur.
  function incline(e) {
    const el = e.target.closest?.('[data-cx-incline]');
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(x * 16).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-y * 16).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
    el.classList.add('incline');
  }
  function redresse(e) {
    const el = e.target.closest?.('[data-cx-incline]');
    if (!el) return;
    el.classList.remove('incline');
    for (const p of ['--rx', '--ry']) el.style.setProperty(p, '0deg');
  }

  // ---------------------------------------------------------------- les cartes d'un Pokémon
  // Dans la fiche du Pokédex, TOUTES les cartes du Pokémon (TCGdex, `dexId` : une carte
  // à plusieurs Pokémon compte pour chacun), de la plus récente à la plus ancienne. La
  // règle du Living Dex : possédée en couleur avec sa Poké Ball, manquante en gris.
  const cartesPokemon = new Map();   // numéro → liste de cartes brutes, triée
  function chargeCartesPokemon(num) {
    if (cartesPokemon.has(num) || enCours.has(`pkm:${num}`)) return;
    enCours.add(`pkm:${num}`);
    Promise.all([api.parPokedex(num), chargeToutesExt().catch(() => {})])
      .then(([l]) => {
        const rang = (id) => toutesExt?.get(setDe(id))?.rang ?? -1;
        cartesPokemon.set(num, (Array.isArray(l) ? l : []).slice()
          .sort((a, b) => rang(b.id) - rang(a.id) || String(a.localId).localeCompare(String(b.localId), undefined, { numeric: true })));
      })
      .catch(() => echecs.add(`pkm:${num}`))
      .finally(() => { enCours.delete(`pkm:${num}`); majCartesPokemon(); });
  }
  function grilleCartesPokemon(num) {
    const l = cartesPokemon.get(num);
    if (!l) return echecs.has(`pkm:${num}`) ? erreurBloc(`pkm:${num}`) : squeletteGrille(6);
    if (!l.length) return `<p class="none">${t('sesCartesAucune')}</p>`;
    return `<div class="cx-grille ses-cartes-grille">${l.map((c) => vignette(
      { id: c.id, num: c.localId, nom: c.name, img: c.image, d: detail(c.id) }, { avecSet: true })).join('')}</div>`;
  }
  const comptePokemon = (num) => {
    const l = cartesPokemon.get(num);
    if (!l) return '';
    const n = l.filter((c) => coll.exemplaires(c.id) > 0).length;
    return ` <small>${n} / ${l.length}</small>`;
  };
  // Le bloc de la fiche, en MENU DÉROULANT (demandé) : replié, il ne coûte rien — la
  // liste n'est demandée qu'à l'ouverture. Ouvert ou fermé, c'est retenu d'une fiche à
  // l'autre (`pcbox.sescartes`). `suite` : ce que main.js y range sous la grille.
  const SES_CARTES_KEY = 'pcbox.sescartes';
  const sesCartesOuvert = () => lit(SES_CARTES_KEY) === '1';
  function sesCartes(num, suite = '') {
    const ouvert = sesCartesOuvert();
    if (ouvert) chargeCartesPokemon(num);
    return `
      <details class="ses-cartes-volet" data-ses-cartes-volet="${num}" ${ouvert ? 'open' : ''}>
        <summary>
          <span data-cartes-pokemon-titre="${num}">${t('sesCartes')}${comptePokemon(num)}</span>
          ${ICO.bas}
        </summary>
        <div data-cartes-pokemon="${num}">${ouvert ? grilleCartesPokemon(num) : ''}</div>
        ${suite}
      </details>`;
  }
  // `toggle` ne remonte pas : écouté en capture sur le document, une fois.
  document.addEventListener('toggle', (e) => {
    const v = e.target;
    if (!v.matches?.('[data-ses-cartes-volet]')) return;
    try { localStorage.setItem(SES_CARTES_KEY, v.open ? '1' : '0'); } catch { /* préférence perdue */ }
    if (v.open) {
      const num = Number(v.dataset.sesCartesVolet);
      chargeCartesPokemon(num);
      v.querySelector('[data-cartes-pokemon]').innerHTML = grilleCartesPokemon(num);
    }
  }, true);
  function majCartesPokemon() {
    for (const el of document.querySelectorAll('[data-cartes-pokemon]')) {
      const num = Number(el.dataset.cartesPokemon);
      if (el.closest('details') && !el.closest('details').open) continue;
      el.innerHTML = grilleCartesPokemon(num);
      const titre = document.querySelector(`[data-cartes-pokemon-titre="${num}"]`);
      if (titre) titre.innerHTML = `${t('sesCartes')}${comptePokemon(num)}`;
    }
  }

  // ---------------------------------------------------------------- navigation de la fiche
  function voisin(dir) {
    const f = etat.fiche;
    if (!f) return null;
    const i = f.liste.indexOf(f.id);
    return i < 0 ? null : (f.liste[i + dir] ?? null);
  }
  let navEnCours = false;
  function aller(dir) {
    const suivant = voisin(dir);
    if (suivant == null || navEnCours) return;
    navEnCours = true;
    const b = panneau.corps;
    const w = b.getBoundingClientRect().width || 340;
    b.style.transition = `transform ${NAV_OUT}ms ease-in, opacity ${NAV_OUT}ms ease-in`;
    b.style.transform = `translateX(${-dir * w * 0.45}px)`;
    b.style.opacity = '0';
    setTimeout(() => {
      ouvre(suivant, etat.fiche.liste);
      b.style.transition = 'none';
      b.style.transform = `translateX(${dir * w * 0.4}px)`;
      b.style.opacity = '0';
      void b.offsetWidth; // pas de requestAnimationFrame, comme navFiche
      b.style.transition = `transform ${NAV_IN}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${NAV_IN}ms ease-out`;
      b.style.transform = '';
      b.style.opacity = '';
      setTimeout(() => { b.style.transition = ''; navEnCours = false; }, NAV_IN);
    }, NAV_OUT);
  }

  // ---------------------------------------------------------------- gestes
  function branche(app) {
    // Une image absente (carte très ancienne, logo manquant) : la haute définition retombe
    // sur la basse, puis sur un dos de carte ; un logo disparaît sans laisser de trou.
    document.addEventListener('error', (e) => {
      const im = e.target;
      if (im?.tagName !== 'IMG' || im.dataset.repli === 'fin') return;
      if (im.closest('.avance-art, .pilule, .cx-serie-logo, .bandeau-art:not(.eventail)')) { im.dataset.repli = 'fin'; im.style.visibility = 'hidden'; return; }
      if (!im.closest('.cx-v-img, .cx-fiche-img, .cx-mini, .acc-recent.carte, .eventail')) return;
      if (im.src.endsWith('/high.webp')) { im.src = im.src.replace('/high.webp', '/low.webp'); return; }
      im.dataset.repli = 'fin';
      im.src = api.DOS;
    }, true);

    app.addEventListener('input', (e) => {
      if (e.target.matches('[data-cx-q]')) surSaisie(e.target.value);
      else if (e.target.matches('[data-cx-colq]')) { etat.colQ = e.target.value; majCollection(); }
    });

    app.addEventListener('change', (e) => {
      const el = e.target;
      if (el.matches('[data-cx-rarete]')) { etat.rarete = el.value; el.classList.toggle('actif', !!el.value); majGrille(); }
      else if (el.matches('[data-cx-tri]')) { etat.tri = el.value; el.classList.toggle('actif', el.value !== 'num'); majGrille(); }
      else if (el.matches('[data-cx-coltri]')) { etat.colTri = el.value; el.closest('.tete-select')?.classList.toggle('on', el.value !== 'extension'); majCollection(); }
      else if (el.matches('[data-cx-colrarete]')) { etat.colRarete = el.value; el.classList.toggle('actif', !!el.value); majCollection(); }
      else if (el.matches('[data-cx-coltype]')) { etat.colType = el.value; el.classList.toggle('actif', !!el.value); majCollection(); }
    });

    app.addEventListener('click', (e) => {
      if (!vueCartes()) return;
      const q = (sel) => e.target.closest(sel);
      let x;
      // ---- PokéAdvisor ----
      if (q('[data-adv-reglages]')) { advUI.reglages = true; ctx.panneau2.ouvre(htmlReglagesAdvisor()); return; }
      if (q('[data-adv-cle-ok]')) {
        const champ = document.querySelector('[data-adv-cle]');
        const v = champ?.value.trim();
        if (!v) { champ?.focus(); return; }
        advisor.poseCle(v);
        ctx.haptique();
        rend('advisor');
        return;
      }
      if ((x = q('[data-adv-idee]'))) { envoie(x.dataset.advIdee); return; }
      if (q('[data-adv-stop]')) { advUI.controle?.abort(); return; }
      if ((x = q('[data-cx-lien]'))) { ctx.ouvreLien(x.dataset.cxLien); return; }
      // ---- classeurs ----
      if (q('[data-cl-nouveau]')) { ouvreEdition(null); return; }
      if ((x = q('[data-cl]'))) {
        Object.assign(etat, { cls: x.dataset.cl, clsPage: 0, clsSel: null, clsDeplace: false });
        ctx.haptique();
        rend('classeurs');
        return;
      }
      if (q('[data-cl-reglages]')) { ouvreEdition(etat.cls); return; }
      if (q('[data-cl-selection]')) {
        etat.clsSel = etat.clsSel ? null : new Set();
        etat.clsDeplace = false;
        ctx.haptique();
        rend('classeurs');
        return;
      }
      if ((x = q('[data-cl-tourne]'))) { tourne(Number(x.dataset.clTourne)); return; }
      if ((x = q('[data-cl-lot]'))) {
        const c = cls.classeur(etat.cls);
        const a = x.dataset.clLot;
        if (!c) return;
        if (a === 'annule') { etat.clsDeplace = false; rend('classeurs'); return; }
        if (a === 'deplace') { if (etat.clsSel?.size) { etat.clsDeplace = true; rend('classeurs'); } return; }
        if (a === 'retire' && etat.clsSel?.size) {
          const avant = c.cartes.slice();
          const n = etat.clsSel.size;
          cls.vide(c.id, [...etat.clsSel]);
          etat.clsSel = null;
          ctx.haptique();
          rend('classeurs');
          ctx.annonce(t('clRetires', n), () => cls.remetCartes(c.id, avant));
        }
        return;
      }
      if ((x = q('[data-cl-poche]'))) {
        const c = cls.classeur(etat.cls);
        if (!c) return;
        const i = Number(x.dataset.clPoche);
        // La sélection attend sa pochette d'arrivée : elle s'y range.
        if (etat.clsDeplace) {
          cls.deplacePoches(c.id, [...etat.clsSel], i);
          Object.assign(etat, { clsSel: null, clsDeplace: false });
          ctx.haptique();
          rend('classeurs');
          return;
        }
        if (etat.clsSel) {
          if (c.cartes[i] == null) return;
          if (etat.clsSel.has(i)) etat.clsSel.delete(i); else etat.clsSel.add(i);
          x.classList.toggle('choisie', etat.clsSel.has(i));
          ctx.haptique();
          const b = document.querySelector('[data-cl-lot-n]');
          if (b) b.textContent = t('cxSelectionN', etat.clsSel.size);
          document.querySelectorAll('[data-cl-lot="deplace"], [data-cl-lot="retire"]').forEach((y) => { y.disabled = !etat.clsSel.size; });
          return;
        }
        const cles = cls.clesPoche(c.cartes[i]);
        if (!cles.length) { ouvreAjout(i); return; }
        // Glisser dans la fiche parcourt le classeur ; une pochette groupée, ses cartes.
        const liste = cles.length > 1 ? cles.map(cls.idDe)
          : c.cartes.flatMap((p) => cls.clesPoche(p).slice(0, 1).map(cls.idDe));
        ouvre(cls.idDe(cles[0]), [...new Set(liste)], { variante: cls.varianteDe(cles[0]) });
        return;
      }
      if ((x = q('[data-cx-bloc]'))) {
        const id = x.dataset.cxBloc;
        if (etat.blocs.has(id)) etat.blocs.delete(id); else etat.blocs.add(id);
        try { localStorage.setItem(BLOCS_KEY, JSON.stringify([...etat.blocs])); } catch { /* préférence perdue, sans gravité */ }
        ctx.haptique();
        rend('extensions');
        return;
      }
      if ((x = q('[data-cx-set]'))) {
        etat.set = x.dataset.cxSet;
        Object.assign(etat, { filtre: 'toutes', rarete: '', tri: 'num', selection: null });
        const s = extensions.get(etat.set);
        if (s) chargeDetails(s);
        ctx.haptique();
        rend('extensions');
        return;
      }
      if ((x = q('[data-cx-carte]'))) {
        const id = x.dataset.cxCarte;
        if (etat.selection && ctx.vue() === 'extensions' && etat.set) {
          const cle = x.dataset.cxVar ? `${id}|${x.dataset.cxVar}` : id;
          if (etat.selection.has(cle)) etat.selection.delete(cle); else etat.selection.add(cle);
          x.classList.toggle('choisie', etat.selection.has(cle));
          ctx.haptique();
          majLot();
          return;
        }
        ouvre(id, etat.liste);
        return;
      }
      if (q('[data-cx-master]')) { etat.master = !etat.master; etat.selection = etat.selection && new Set(); ctx.haptique(); rend('extensions'); return; }
      if (q('[data-cx-selection]')) { etat.selection = etat.selection ? null : new Set(); ctx.haptique(); rend('extensions'); return; }
      if ((x = q('[data-cx-filtre]'))) { etat.filtre = x.dataset.cxFiltre; ctx.haptique(); majGrille(); return; }
      if ((x = q('[data-cx-colfiltre]'))) { etat.colFiltre = x.dataset.cxColfiltre; ctx.haptique(); majCollection(); return; }
      if ((x = q('[data-cx-suggestion]'))) {
        const champQ = document.querySelector('[data-cx-q]');
        if (champQ) champQ.value = x.dataset.cxSuggestion;
        surSaisie(x.dataset.cxSuggestion);
        return;
      }
      if ((x = q('[data-cx-reessaie]'))) { echecs.delete(x.dataset.cxReessaie); rend(ctx.vue()); return; }
      if ((x = q('[data-cx-lot]'))) {
        const a = x.dataset.cxLot;
        if (a === 'tout') {
          const s = extensions.get(etat.set);
          if (s) for (const v of vignettesDuSet(s).v) etat.selection.add(v.va ? `${v.id}|${v.va}` : v.id);
          document.querySelectorAll('[data-cx-grille] .cx-v').forEach((el) => el.classList.add('choisie'));
          majLot();
        } else appliqueLot(a === 'ajoute');
        return;
      }
      if (q('[data-cx-majprix]')) { lanceMajPrix(); }
    });

    // La question tapée à l'assistant part à l'envoi du formulaire (bouton ou Entrée).
    app.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-adv-form]');
      if (!f) return;
      e.preventDefault();
      const champ = f.querySelector('[data-adv-q]');
      const v = champ?.value || '';
      if (champ) champ.value = '';
      envoie(v);
    });

    // ---- Tourner les pages du doigt ----
    // Le geste se décide au premier mouvement, comme partout : horizontal, il tourne la
    // page ; vertical, la vue défile. Depuis le bord gauche, il appartient au retour.
    let lx0 = 0, ly0 = 0, ldx = 0, laxe = null;
    app.addEventListener('touchstart', (e) => {
      if (!e.target.closest('[data-cl-livre]') || e.touches.length !== 1 || e.touches[0].clientX <= 26) return;
      livreTouche = true;
      laxe = null;
      ldx = 0;
      lx0 = e.touches[0].clientX;
      ly0 = e.touches[0].clientY;
      const piste = pisteEl();
      if (piste) {
        piste.style.transition = 'none';
        const cour = piste.querySelector('.cl-feuille.cour');
        if (cour) cour.style.transition = 'none';
      }
    }, { passive: true });
    app.addEventListener('touchmove', (e) => {
      if (!livreTouche) return;
      const mx = e.touches[0].clientX - lx0, my = e.touches[0].clientY - ly0;
      if (!laxe) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        laxe = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
        if (laxe === 'y') { livreTouche = false; return; }
      }
      e.preventDefault();
      const c = cls.classeur(etat.cls);
      // Au bout du classeur, la page résiste : elle ne suit qu'au tiers.
      const bout = !c || (mx > 0 && etat.clsPage === 0) || (mx < 0 && etat.clsPage >= pagesDe(c) - 1);
      ldx = bout ? mx / 3 : mx;
      poseLivre(ldx);
    }, { passive: false });
    const finLivre = () => {
      if (!livreTouche) return;
      livreTouche = false;
      if (laxe !== 'x') return;
      if (Math.abs(ldx) > 60) tourne(ldx < 0 ? 1 : -1); else remetLivre();
    };
    app.addEventListener('touchend', finLivre, { passive: true });
    app.addEventListener('touchcancel', finLivre, { passive: true });

    // ---- Le second panneau : créer un classeur, le régler, y ranger des cartes ----
    const corps2 = ctx.panneau2.corps;
    const majAjoutBarre = () => {
      const n = corps2.querySelector('[data-cl-choix-n]');
      if (n) n.textContent = t('cxSelectionN', etat.clsAjout.choix.size);
      const b = corps2.querySelector('[data-cl-ajoute]');
      if (b) b.disabled = !etat.clsAjout.choix.size;
    };
    corps2.addEventListener('click', (e) => {
      const q = (sel) => e.target.closest(sel);
      let x;
      const ed = etat.clsEdition;
      if (ed) {
        if ((x = q('[data-cl-poches]'))) { ed.poches = Number(x.dataset.clPoches); majEdition(); return; }
        if ((x = q('[data-cl-couleur]'))) { ed.couleur = x.dataset.clCouleur; ctx.haptique(); majEdition(); return; }
        if ((x = q('[data-cl-contenu]'))) { ed.contenu = x.dataset.clContenu; ed.erreur = ''; majEdition(); return; }
        if ((x = q('[data-cl-mise]'))) { ed.mise = x.dataset.clMise; majEdition(); return; }
        if ((x = q('[data-cl-set]'))) { ed.set = x.dataset.clSet; ed.erreur = ''; ctx.haptique(); majEdition(); return; }
        if (q('[data-cl-valide]')) { valideEdition(); return; }
        if (q('[data-cl-monte]')) { cls.deplace(ed.id, -1); ctx.haptique(); return; }
        if (q('[data-cl-supprime]')) {
          const c = cls.classeur(ed.id);
          if (!c) return;
          const index = cls.tous().indexOf(c);
          cls.supprime(c.id);
          etat.clsEdition = null;
          ctx.panneau2.ferme();
          Object.assign(etat, { cls: null, clsSel: null, clsDeplace: false });
          rend('classeurs');
          ctx.annonce(t('clSupprime', c.nom), () => cls.restaure(c, index));
          return;
        }
      }
      if (advUI.reglages) {
        const redessine = () => ctx.panneau2.maj(htmlReglagesAdvisor());
        if ((x = q('[data-adv-modele]'))) { advisor.poseModele(x.dataset.advModele); ctx.haptique(); redessine(); return; }
        if ((x = q('[data-adv-style]'))) { advisor.basculeStyle(x.dataset.advStyle); ctx.haptique(); redessine(); return; }
        if ((x = q('[data-adv-avatar]'))) {
          advisor.poseAvatar(Number(x.dataset.advAvatar));
          ctx.haptique();
          redessine();
          if (ctx.vue() === 'advisor') majFil();
          return;
        }
        if ((x = q('[data-adv-oublie]'))) { advisor.oublie(x.dataset.advOublie); redessine(); return; }
        if (q('[data-adv-efface]')) {
          const avant = advisor.historique();
          advisor.efface();
          ctx.panneau2.ferme();
          if (ctx.vue() === 'advisor') rend('advisor');
          if (avant.length) ctx.annonce(t('advEfface'), () => { advisor.remetHistorique(avant); if (ctx.vue() === 'advisor') rend('advisor'); });
          return;
        }
        if (q('[data-adv-cle-retire]')) {
          advisor.poseCle('');
          ctx.panneau2.ferme();
          if (ctx.vue() === 'advisor') rend('advisor');
          return;
        }
      }
      const a = etat.clsAjout;
      if (a) {
        if ((x = q('[data-cl-source]'))) {
          a.source = x.dataset.clSource;
          a.res = null;
          ctx.panneau2.maj(htmlAjout());
          chercheAjout();
          return;
        }
        if ((x = q('[data-cx-carte]'))) {
          const id = x.dataset.cxCarte;
          if (a.choix.has(id)) a.choix.delete(id); else a.choix.add(id);
          x.classList.toggle('choisie', a.choix.has(id));
          ctx.haptique();
          majAjoutBarre();
          return;
        }
        if (q('[data-cl-ajoute]')) {
          const c = cls.classeur(etat.cls);
          if (!c || !a.choix.size) return;
          cls.range(c.id, a.depuis, [...a.choix]);
          etat.clsAjout = null;
          ctx.panneau2.ferme();
          ctx.haptique();
          rend('classeurs');
        }
      }
    });
    corps2.addEventListener('input', (e) => {
      if (e.target.matches('[data-cl-qset]') && etat.clsEdition) {
        etat.clsEdition.qSet = e.target.value;
        const z = corps2.querySelector('[data-cl-sets]');
        if (z) z.innerHTML = htmlSetsChoix(etat.clsEdition);
      } else if (e.target.matches('[data-cl-nom]') && etat.clsEdition) {
        etat.clsEdition.nom = e.target.value;
      } else if (e.target.matches('[data-cl-q]') && etat.clsAjout) {
        etat.clsAjout.q = e.target.value;
        if (etat.clsAjout.source === 'collection') majAjout(); else chercheAjout();
      }
    });
    // Un classeur change (ici, sur un autre appareil, par un import) : la vue suit.
    cls.surChangement(() => {
      if (ctx.vue() !== 'classeurs' || livreTouche) return;
      rend('classeurs');
    });

    const corps = panneau.corps;
    corps.addEventListener('pointermove', incline);
    corps.addEventListener('pointerleave', redresse, true);
    corps.addEventListener('pointerout', (e) => { if (!e.relatedTarget?.closest?.('[data-cx-incline]')) redresse(e); });
    corps.addEventListener('click', (e) => {
      const f = etat.fiche;
      if (!f) return;
      const q = (sel) => e.target.closest(sel);
      let x;
      if (q('[data-cx-incline]')) { activeGyro(); return; }
      if ((x = q('[data-cx-choix]'))) {
        etat.ajout[x.dataset.cxChoix] = x.dataset.val;
        ctx.haptique();
        panneau.maj(htmlFiche(f.id));
        return;
      }
      if (q('[data-cx-ajoute]')) { ajouteDepuisFiche(f.id, etat.ajout.v, etat.ajout.l, etat.ajout.e); return; }
      if ((x = q('[data-cx-plus]'))) { const [v, l, ee] = x.dataset.cxPlus.split('|'); ajouteDepuisFiche(f.id, v, l, ee); return; }
      if ((x = q('[data-cx-moins]'))) { const [v, l, ee] = x.dataset.cxMoins.split('|'); retireDepuisFiche(f.id, v, l, ee); return; }
      if (q('[data-cx-fav]')) { coll.basculeFavori(ficheDe(f.id)); ctx.haptique(); apresChangement(f.id); return; }
      if ((x = q('[data-cx-lien]'))) { ctx.ouvreLien(x.dataset.cxLien); return; }
      if ((x = q('[data-cx-dex]'))) { ctx.ficheJeu(Number(x.dataset.cxDex)); }
    });

    // La collection a changé (fiche, lot, import, compte) : ce qui est affiché suit.
    coll.surChangement(() => {
      // La fiche d'un Pokémon montre ses cartes : une carte ajoutée depuis la fiche de
      // la carte (ouverte par-dessus) y passe aussitôt en couleur.
      majCartesPokemon();
      // Pendant l'actualisation des prix, chaque relevé écrit : on redessine à la fin.
      if (!vueCartes() || etat.majPrix) return;
      const v = ctx.vue();
      if (v === 'classeurs') { if (etat.cls) majLivre(); else if (!livreTouche) rend(v); return; }
      if (v === 'extensions' && etat.set && document.querySelector('[data-cx-grille]')) majGrille();
      else if (v === 'extensions' && etat.q) majResultats();
      else if (v === 'collection' && document.querySelector('[data-cx-col]')) majCollection();
      else rend(v);
    });
  }

  return {
    rend,
    branche,
    sesCartes,
    listeCartesPokemon: (num) => (cartesPokemon.get(Number(num)) || []).map((c) => c.id),
    reessaieCartesPokemon(num) { echecs.delete(`pkm:${num}`); chargeCartesPokemon(Number(num)); majCartesPokemon(); },
    ouvre,
    voisin,
    aller,
    // On revient d'une extension à la liste, d'une recherche au parcours. Rend vrai si
    // le retour a été traité ici.
    retour() {
      if (ctx.vue() === 'classeurs' && etat.cls) {
        Object.assign(etat, { cls: null, clsSel: null, clsDeplace: false });
        rend('classeurs');
        return true;
      }
      if (ctx.vue() !== 'extensions') return false;
      if (etat.set) { quitteSet(); rend('extensions'); return true; }
      if (etat.q) { etat.q = ''; etat.res = null; etat.suggestion = null; numRecherche++; rend('extensions'); return true; }
      return false;
    },
    // Entrer dans les Extensions depuis ailleurs ramène à la liste, comme le menu du
    // Pokédex : on vient choisir une extension, pas reprendre une grille au milieu.
    entre(vue) {
      if (vue === 'classeurs') Object.assign(etat, { cls: null, clsSel: null, clsDeplace: false });
      if (vue !== 'extensions') return;
      if (etat.set) quitteSet();
      etat.q = ''; etat.res = null; etat.suggestion = null;
      positions.clear();
      pageAffichee = null;
    },
    fermee() { etat.fiche = null; coupeGyro(); },
    // Le second panneau s'est refermé (voile, glissement, retour) : on oublie son état.
    panneau2Ferme() { etat.clsEdition = null; etat.clsAjout = null; advUI.reglages = false; },
    // Lance une recherche dans les extensions (depuis la fiche d'un Pokémon).
    cherche(nom) {
      etat.q = nom;
      etat.res = null;
      rend('extensions');
      surSaisie(nom);
    },
    retraduit() {
      api.poseLangue(ctx.langue());
      listeSeries = null;
      toutesExt = null;
      imagesAutres.clear();
      detailsSerie.clear();
      extensions.clear();
      echecs.clear();
      etat.res = null;
      if (etat.q.trim().length >= 2) lanceRecherche(etat.q.trim());
    },
  };
}
