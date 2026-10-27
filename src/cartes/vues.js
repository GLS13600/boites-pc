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
import { categorie, variantes, CATEGORIES, LANGUES_CARTE, ETATS, VARIANTES, cleEtat, distance } from './regles.js';

const SERIE_KEY = 'pcbox.cartes.serie';
// Séries qu'on n'ouvre pas d'office : « Autre » (produits divers) et Pokémon Pocket,
// dont les cartes sont numériques.
const SECONDAIRES = new Set(['misc', 'tcgp']);
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
const setDe = (id) => String(id).slice(0, Math.max(0, String(id).lastIndexOf('-'))) || String(id);
const lit = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export function creeCartes(ctx) {
  const { t, esc, h, fold, euros, ICO, panneau } = ctx;
  api.poseLangue(ctx.langue());

  // ---------------------------------------------------------------- état (de session)
  const etat = {
    serie: lit(SERIE_KEY),      // série affichée dans la liste des extensions
    seriesOuvert: false,        // le sélecteur de série est déplié
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
    colQ: '', colTri: 'recent', colFiltre: 'toutes', colRarete: '', colType: '',
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

  function serieChoisie() {
    if (!listeSeries) return etat.serie;
    if (etat.serie && listeSeries.some((s) => s.id === etat.serie)) return etat.serie;
    // Par défaut, la série la plus récente : la liste de TCGdex est chronologique.
    return [...listeSeries].reverse().find((s) => !SECONDAIRES.has(s.id))?.id ?? listeSeries[0]?.id ?? null;
  }
  // Le nom d'une extension, si on l'a déjà croisée dans une série chargée.
  function nomSetConnu(id) {
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
      : vueBientot(vue);
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
      const s = c.set || setDe(id);
      m.set(s, (m.get(s) || 0) + 1);
    }
    return m;
  }

  // ---------------------------------------------------------------- Extensions
  function vueExtensions() {
    if (!listeSeries) charge('series', api.series, (l) => { listeSeries = Array.isArray(l) ? l : []; });
    const sid = serieChoisie();
    const det = sid ? detailsSerie.get(sid) : null;
    if (sid && !det) charge(`serie:${sid}`, () => api.serie(sid), (d) => detailsSerie.set(sid, d));
    const s = listeSeries?.find((x) => x.id === sid);
    const possedees = parSet();

    let corps;
    if (!listeSeries) corps = echecs.has('series') ? erreurBloc('series') : squeletteSets();
    else if (!det) corps = echecs.has(`serie:${sid}`) ? erreurBloc(`serie:${sid}`) : squeletteSets();
    else {
      // Les extensions les plus récentes d'abord.
      const sets = [...(det.sets || [])].reverse();
      corps = `<div class="avances">${sets.map((x) => ligneSet(x, possedees.get(x.id) || 0)).join('')}</div>
        <p class="cx-note">${t('cxSourceTcgdex')}</p>`;
    }

    return [
      ctx.tete(t('tuileExtensions')),
      h(`<section class="cx-page">
        ${champ('data-cx-q', etat.q, t('cxChercher'))}
        <div class="cx-resultats" ${etat.q ? '' : 'hidden'}>${htmlResultats()}</div>
        <div class="cx-parcours" ${etat.q ? 'hidden' : ''}>
          <button class="pilule ${etat.seriesOuvert ? 'ouverte' : ''}" data-cx-series aria-expanded="${etat.seriesOuvert}">
            ${s?.logo ? `<img class="pilule-img" src="${esc(api.logo(s.logo))}" alt="" />` : ''}
            <span class="pilule-txt"><small>${t('cxSerie')}</small><b>${esc(s?.name || t('cxChargement'))}</b></span>
            ${ICO.bas}
          </button>
          ${etat.seriesOuvert && listeSeries ? listeDesSeries(sid) : ''}
          ${corps}
        </div>
      </section>`),
    ];
  }

  function listeDesSeries(sid) {
    const parSerie = new Map();
    for (const c of Object.values(coll.toutes())) if (c.ex?.length && c.serie) parSerie.set(c.serie, (parSerie.get(c.serie) || 0) + 1);
    return `
      <div class="cx-series" role="listbox" aria-label="${t('cxSerie')}">
        ${[...listeSeries].reverse().map((s) => {
          const n = parSerie.get(s.id) || 0;
          return `
            <button class="cx-serie ${s.id === sid ? 'on' : ''}" role="option" aria-selected="${s.id === sid}" data-cx-serie="${esc(s.id)}">
              <span class="cx-serie-logo">${s.logo ? `<img src="${esc(api.logo(s.logo))}" alt="" loading="lazy" />` : ''}</span>
              <b>${esc(s.name)}</b>
              ${n ? `<span class="groupe-cpt">${n}</span>` : ''}
            </button>`;
        }).join('')}
      </div>`;
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
      <label class="tete-btn tete-select ${etat.colTri !== 'recent' ? 'on' : ''}" title="${t('cxTri')}">
        ${ICO.trier}
        <select data-cx-coltri aria-label="${t('cxTri')}">
          ${option('recent', t('colTriRecent'), etat.colTri)}${option('extension', t('colTriExtension'), etat.colTri)}
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
    const q = fold(etat.colQ.trim());
    let l = Object.entries(coll.toutes()).filter(([, c]) => (etat.colFiltre === 'favoris' ? c.fav : c.ex?.length));
    if (q) l = l.filter(([id, c]) => fold(c.n || '').includes(q) || fold(c.setN || '').includes(q) || id.toLowerCase().includes(q));
    if (etat.colRarete) l = l.filter(([id, c]) => rareteDe(id, c) === etat.colRarete);
    if (etat.colType) l = l.filter(([, c]) => (c.typ || []).includes(etat.colType));
    const lg = ctx.langue();
    const dernier = (c) => c.ex?.[c.ex.length - 1]?.d || '';
    if (etat.colTri === 'nom') l.sort(([, a], [, b]) => (a.n || '').localeCompare(b.n || '', lg));
    else if (etat.colTri === 'valeur') l.sort(([a, ca], [b, cb]) => (prixUnitaire(b) || 0) * (cb.ex?.length || 0) - (prixUnitaire(a) || 0) * (ca.ex?.length || 0));
    else if (etat.colTri === 'extension') l.sort(([a, ca], [b, cb]) => (ca.set || '').localeCompare(cb.set || '') || String(ca.num || '').localeCompare(String(cb.num || ''), undefined, { numeric: true }));
    else l.sort(([, a], [, b]) => (dernier(a) < dernier(b) ? 1 : dernier(a) > dernier(b) ? -1 : 0));
    etat.liste = l.map(([id]) => id);
    if (!l.length) return `<p class="dex-vide">${q || etat.colRarete || etat.colType ? t('colAucuneTrouvee') : t('colAucunFavori')}</p>`;
    const tuile = ([id, c]) => vignette({ id, num: c.num || '', nom: c.n || id, img: c.img, d: detail(id) });
    if (etat.colTri !== 'extension') return `<div class="cx-grille">${l.map(tuile).join('')}</div>`;
    // Groupée par extension : un en-tête par extension, avec ce qu'on en possède.
    const groupes = new Map();
    for (const e of l) { const k = e[1].set || setDe(e[0]); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(e); }
    return [...groupes].map(([sid, cartes]) => `
      <div class="groupe-tete">
        <b class="groupe-nom">${esc(cartes[0][1].setN || nomSetConnu(sid) || sid)}</b>
        <span class="groupe-cpt">${cartes.length}</span>
      </div>
      <div class="cx-grille">${cartes.map(tuile).join('')}</div>`).join('');
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
  const logoSet = (id) => extensions.get(id)?.logo || toutesExt?.get(id)?.logo || '';

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

  // ---------------------------------------------------------------- à venir
  const A_VENIR = { classeurs: ['tuileClasseurs', 'bientotClasseurs'], advisor: ['tuileAdvisor', 'bientotAdvisor'] };
  function vueBientot(vue) {
    const [titre, texte] = A_VENIR[vue] || ['navCartes', 'bientot'];
    return [ctx.tete(t(titre)), h(`
      <section class="cx-page">
        <div class="cx-bientot t-${esc(vue)}">${ctx.art(vue)}</div>
        <p class="cx-bientot-txt">${t(texte)}</p>
      </section>`)];
  }

  // ---------------------------------------------------------------- fiche d'une carte
  function ouvre(id, liste, { variante = null } = {}) {
    etat.fiche = { id, liste: liste && liste.length ? liste : [id] };
    etat.ficheEchec = null;
    etat.ajout.v = variante;
    panneau.ouvre(htmlFiche(id));
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
        <button class="cx-fav ${c?.fav ? 'on' : ''}" data-cx-fav aria-pressed="${!!c?.fav}"
                aria-label="${c?.fav ? t('cxRetirerFavori') : t('cxAjouterFavori')}">${ICO.coeur}</button>
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

  // Inclinaison de la carte sous la souris — le gyroscope viendra avec l'étape 5.
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
      else if (el.matches('[data-cx-coltri]')) { etat.colTri = el.value; el.closest('.tete-select')?.classList.toggle('on', el.value !== 'recent'); majCollection(); }
      else if (el.matches('[data-cx-colrarete]')) { etat.colRarete = el.value; el.classList.toggle('actif', !!el.value); majCollection(); }
      else if (el.matches('[data-cx-coltype]')) { etat.colType = el.value; el.classList.toggle('actif', !!el.value); majCollection(); }
    });

    app.addEventListener('click', (e) => {
      if (!vueCartes()) return;
      const q = (sel) => e.target.closest(sel);
      let x;
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
      if (q('[data-cx-series]')) { etat.seriesOuvert = !etat.seriesOuvert; ctx.haptique(); rend(ctx.vue()); return; }
      if ((x = q('[data-cx-serie]'))) {
        etat.serie = x.dataset.cxSerie;
        etat.seriesOuvert = false;
        try { localStorage.setItem(SERIE_KEY, etat.serie); } catch { /* préférence perdue, sans gravité */ }
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
      etat.q = ''; etat.res = null; etat.suggestion = null; etat.seriesOuvert = false;
      positions.clear();
      pageAffichee = null;
    },
    fermee() { etat.fiche = null; },
    // Le second panneau s'est refermé (voile, glissement, retour) : on oublie son état.
    panneau2Ferme() { etat.clsEdition = null; etat.clsAjout = null; },
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
