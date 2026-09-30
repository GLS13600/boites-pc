// Traduction de l'application : français, anglais, japonais.
//
// DEUX MOITIÉS, séparées exprès.
//
//  1. Les textes de l'INTERFACE (titres, boutons, messages) vivent ici, écrits à la
//     main, une clé par texte. `t('cle')` rend celui de la langue courante, avec
//     repli sur le français : une clé oubliée dans une traduction s'affiche en
//     français plutôt que de laisser un trou. Une valeur peut être une fonction
//     quand le texte dépend d'un nombre ou d'un mot.
//
//  2. Les textes des DONNÉES (noms de Pokémon, catégories, descriptions, lieux,
//     attaques, talents, objets…) vivent dans `src/data/i18n/<langue>.json`, aspirés
//     de PokéAPI par `npm run fetch-i18n`. Le FRANÇAIS RESTE LA BASE : ces fichiers
//     ne portent que les chaînes qui changent, et sont chargés par `import()` — qui
//     reste en français ne télécharge rien de plus.
//
// Ces surcouches sont appliquées EN PLACE, dans les objets importés des JSON
// (`appliqueSurcouche`). C'est ce qui évite de traduire trois cents points de rendu :
// `p.name`, `moves[id].n` ou `items[k].n` continuent de dire ce qu'il faut, quelle
// que soit la langue. L'état français d'origine est photographié au premier
// changement, pour pouvoir y revenir.

import pokedex from './data/pokedex.json';
import forms from './data/forms.json';
import evolutions from './data/evolutions.json';
import moves from './data/moves.json';
import abilities from './data/abilities.json';
import items from './data/items.json';
import JEUX from './data/versions.json';
import NATURES from './data/natures.json';
import learnsets from './data/learnsets.json';

export const LANGUES = [
  ['fr', 'Français'],
  ['en', 'English'],
  ['ja', '日本語'],
];
export const LANGUE_KEY = 'pcbox.langue';
export const estLangue = (l) => LANGUES.some(([c]) => c === l);

// La langue du téléphone si elle est proposée, français sinon : mieux vaut ouvrir
// dans la langue du système que d'imposer le français à qui ne le lit pas.
function langueParDefaut() {
  for (const l of navigator.languages ?? [navigator.language ?? 'fr']) {
    const court = String(l).slice(0, 2).toLowerCase();
    if (estLangue(court)) return court;
  }
  return 'fr';
}

let courante = localStorage.getItem(LANGUE_KEY);
if (!estLangue(courante)) courante = langueParDefaut();
document.documentElement.lang = courante;

export const langue = () => courante;

export function t(cle, ...args) {
  const v = TEXTES[courante]?.[cle] ?? TEXTES.fr[cle];
  if (v === undefined) return cle;      // clé inconnue : visible, donc corrigée
  return typeof v === 'function' ? v(...args) : v;
}

// ---------- La surcouche de données ----------

let surcouche = null;                   // la langue courante, null en français
// Photographie des chaînes françaises, prise au premier changement de langue : c'est
// elle qui permet de revenir au français sans recharger la page.
let base = null;

const photo = (extra) => ({
  especes: Object.fromEntries(Object.entries(pokedex).map(([id, p]) => [id, {
    name: p.name, genus: p.genus, flavor: p.flavor, habitat: p.habitat, color: p.color,
    encounters: (p.encounters ?? []).map((g) => ({
      game: g.game, places: g.places.map((x) => x.location),
    })),
  }])),
  formes: Object.fromEntries(Object.values(forms).flat().map((f) => [f.key, f.name])),
  evolutions: Object.fromEntries(evolutions.chains.flatMap((c) =>
    c.membres.filter((m) => m.how).map((m) => [m.id, m.how]))),
  attaques: Object.fromEntries(Object.entries(moves).map(([id, m]) => [id, { n: m.n, d: m.d }])),
  talents: Object.fromEntries(Object.entries(abilities.list).map(([k, a]) => [k, { n: a.n, d: a.d }])),
  objets: Object.fromEntries(Object.entries(items).map(([k, o]) => [k, { n: o.n, d: o.d }])),
  jeux: JEUX.map((v) => v.nom),
  natures: NATURES.map((n) => n.n),
  learnsets: Object.fromEntries(Object.entries(learnsets).map(([k, l]) => [k, l.j])),
  types: Object.fromEntries(Object.entries(extra.TYPES).map(([k, v]) => [k, v[0]])),
  regions: extra.GENS.map((g) => g.name),
});

// Applique une surcouche (ou rétablit le français quand `s` est nul).
// Chaque champ n'est remplacé que s'il existe dans la surcouche : un trou laisse la
// valeur française, ce qui reste lisible.
function appliqueSurcouche(s, extra) {
  const src = s ?? base;
  if (!src) return;

  for (const [id, p] of Object.entries(pokedex)) {
    const e = src.especes?.[id];
    if (!e) continue;
    if (e.name) p.name = e.name;
    if (e.genus !== undefined) p.genus = e.genus;
    if (e.flavor !== undefined) p.flavor = e.flavor;
    if (e.habitat !== undefined) p.habitat = e.habitat;
    if (e.color !== undefined) p.color = e.color;
    // Les rencontres sont alignées PAR RANG : `fetch-i18n.mjs` reprend exactement le
    // regroupement de `fetch-data.mjs`, jeu par jeu puis lieu par lieu. Vérifié sur
    // les 1025 espèces : aucun désaccord de longueur. Le garde ci-dessous évite
    // malgré tout de décaler les libellés si un jour les deux divergeaient.
    (p.encounters ?? []).forEach((g, i) => {
      const tg = e.encounters?.[i];
      if (!tg || tg.places.length !== g.places.length) return;
      g.game = tg.game;
      g.places.forEach((pl, j) => { pl.location = tg.places[j]; });
    });
  }

  for (const f of Object.values(forms).flat()) {
    const n = src.formes?.[f.key];
    if (n) f.name = n;
  }

  for (const c of evolutions.chains) {
    for (const m of c.membres) {
      if (!m.how) continue;
      const n = src.evolutions?.[m.id];
      if (n) m.how = n;
    }
  }

  for (const [id, m] of Object.entries(moves)) {
    const a = src.attaques?.[id];
    if (!a) continue;
    if (a.n) m.n = a.n;
    if (a.d !== undefined) m.d = a.d;
  }
  for (const [k, a] of Object.entries(abilities.list)) {
    const x = src.talents?.[k];
    if (!x) continue;
    if (x.n) a.n = x.n;
    if (x.d !== undefined) a.d = x.d;
  }
  for (const [k, o] of Object.entries(items)) {
    const x = src.objets?.[k];
    if (!x) continue;
    if (x.n) o.n = x.n;
    if (x.d !== undefined) o.d = x.d;
  }

  // Les jeux et les natures sont indexés par CLÉ dans la surcouche, mais le français
  // en garde une simple liste : on distingue les deux formes.
  //
  // `versions.json` est indexé par GROUPE de versions (« scarlet-violet »), que
  // PokéAPI ne nomme pas : la surcouche porte donc `groupes`, composé par le script
  // en joignant les noms des versions du groupe. `jeux`, indexé par version, sert
  // aux rencontres et reste inutilisé ici.
  JEUX.forEach((v, i) => {
    const n = Array.isArray(src.jeux) ? src.jeux[i] : src.groupes?.[v.k];
    if (n) v.nom = n;
  });
  NATURES.forEach((n, i) => {
    const x = Array.isArray(src.natures) ? src.natures[i] : src.natures?.[n.k];
    if (x) n.n = x;
  });
  // `learnsets[*].j` est un NOM de jeu figé dans les données (« D'après Écarlate /
  // Violet »), sans la clé du groupe. On le retraduit par la table français → langue
  // que les deux tableaux ci-dessus viennent de former : les 21 libellés de JEUX
  // couvrent exactement les valeurs que ce champ prend (vérifié).
  const parNomFr = new Map(base.jeux.map((fr, i) => [fr, JEUX[i].nom]));
  for (const [k, l] of Object.entries(learnsets)) {
    const n = Array.isArray(src.jeux) ? src.learnsets[k] : parNomFr.get(base.learnsets[k]);
    if (n) l.j = n;
  }

  // TYPES et GENS appartiennent à main.js : il les passe pour qu'ils suivent.
  for (const [k, v] of Object.entries(extra.TYPES)) {
    const n = Array.isArray(src.types) ? null : src.types?.[k];
    if (n) v[0] = n;
  }
  // Les régions : la surcouche les indexe par slug anglais, dans l'ordre des
  // générations. Le français en garde une liste.
  extra.GENS.forEach((g, i) => {
    const n = Array.isArray(src.regions) ? src.regions[i] : src.regions?.[REGIONS_SLUG[i]];
    if (n) g.name = n;
  });
  // Les classes d'attaque ne viennent pas de PokéAPI : elles sont écrites ici.
  for (const [k, v] of Object.entries(extra.CLASSES)) v[0] = t(`classe_${k}`);
}
const REGIONS_SLUG = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'];

// Charge la langue demandée et l'applique. `extra` porte les tables que main.js tient
// lui-même (TYPES, GENS, CLASSES). À appeler AVANT le premier rendu, et à chaque
// changement de langue — main.js reconstruit ensuite son catalogue et rend.
export async function chargeLangue(l, extra) {
  if (!estLangue(l)) l = 'fr';
  if (!base) base = photo(extra);
  courante = l;
  localStorage.setItem(LANGUE_KEY, l);
  document.documentElement.lang = l;
  if (l === 'fr') { surcouche = null; appliqueSurcouche(null, extra); return; }
  // Vite découpe ce `import()` en un chunk par langue : le fichier n'est téléchargé
  // qu'au moment où on choisit cette langue, et reste ensuite dans le bundle hors ligne.
  const mod = await import(`./data/i18n/${l}.json`);
  surcouche = mod.default ?? mod;
  appliqueSurcouche(surcouche, extra);
}

// ---------- Petits dictionnaires, lus par main.js ----------

export const nomKind = (k) => t(`forme_${k}`) || k;
export const obtention = (k) => t(`obtention_${k}`);
export const nomMethode = (m) => {
  const v = TEXTES[courante]?.methodes?.[m] ?? TEXTES.fr.methodes[m];
  return v ?? m;
};
export const libStat = (c) => t(`stat_${c}`);
export const STATS = ['pv', 'att', 'def', 'atts', 'defs', 'vit'];
export const statLignes = () => STATS.map((c) => [c, libStat(c)]);
export const groupesApprentissage = () => [t('apprNiveau'), t('apprCT'), t('apprOeuf'), t('apprMaitre')];
export const nomRole = (r) => t(`role_${r}`);
export const nomOrientation = (o) => t(`orient_${o}`);
// Les cinq remakes : PokéAPI ne publie pas de nom pour un Pokédex régional de remake,
// ces libellés sont donc écrits ici comme le reste de l'interface.
export const nomRemake = (cle, champ) => t(`remake_${cle}_${champ}`);

// ---------- Les textes ----------

const TEXTES = {

  // ================================================================= FRANÇAIS
  fr: {
    // -- Navigation, accueil
    accueil: 'Accueil',
    retourAccueil: "Revenir à l'accueil",
    appTitre: 'Guiguidex',
    accueilSous: (pris, shiny) => `${pris} Pokémon sur 1025${shiny ? ' · chromatique' : ''}`,
    tuilePokedex: 'Pokédex',
    tuilePokedexSous: 'Toutes les espèces, région par région',
    tuileBoites: 'Boîtes',
    tuileBoitesSous: (pris, total, onglet) => `${pris} sur ${total} · ${onglet}`,
    tuileEquipes: 'Équipes',
    tuileEquipesSous: (n, jeu) => `${n} sur 6 · ${jeu}`,
    tuileAttaques: 'Attaques',
    tuileAttaquesSous: (n) => `${n} attaques recensées`,
    tuileScan: 'Scan',
    tuileScanSous: (mode) => `Mode ${mode}`,
    tuileReglages: 'Réglages',
    tuileReglagesSous: (theme) => `Thème ${theme}`,

    // -- Onglets
    genCourt: (n) => `Gén. ${n}`,
    genLongue: (n) => `Génération ${n}`,
    remake_frlg_nom: 'Rouge Feu / Vert Feuille', remake_frlg_court: 'RF/VF',
    remake_hgss_nom: 'Or HeartGold / Argent SoulSilver', remake_hgss_court: 'HG/SS',
    remake_rosa_nom: 'Rubis Oméga / Saphir Alpha', remake_rosa_court: 'RO/SA',
    remake_lgpe_nom: "Let's Go Pikachu / Évoli", remake_lgpe_court: "Let's Go",
    remake_deps_nom: 'Diamant Étincelant / Perle Scintillante', remake_deps_court: 'DÉ/PS',

    // -- Boîtes
    boites: 'Boîtes',
    boitesSous: (region, pris, total) => `${region} · ${pris} sur ${total}`,
    boiteN: (n) => `Boîte ${n}`,
    boitePrecedente: 'Boîte précédente',
    boiteSuivante: 'Boîte suivante',
    boiteLibre: (region) => `${region} · boîte libre`,
    boiteRang: (region, a, b, total) => `${region} · ${a}–${b} sur ${total}`,
    boiteNumRegional: (region, a, b) => `${region} · N° ${a} à ${b}`,
    boiteNumNational: (region, a, b) => `${region} · ${a} à ${b}`,
    renommerBoite: 'Renommer la boîte et choisir son fond',
    supprimerBoite: 'Supprimer la boîte affichée',
    ajouterBoite: 'Ajouter une boîte à cet onglet',
    ajouterBoiteCourt: 'Ajouter une boîte',
    confirmeSupprBoite: (n) => `Supprimer cette boîte ? ${n} Pokémon y sont rangés et seront retirés de l'onglet.`,
    emplacementLibre: 'Emplacement libre',
    retirerDeLaBoite: 'Retirer de la boîte',
    capture: 'capturé',
    ajouterPokemon: 'Ajouter un Pokémon',
    effetDuTap: 'Effet du tap',
    modeCapturer: 'Capturer',
    modeFiche: 'Fiche',
    modeRanger: 'Ranger',
    basculeChromatique: 'Basculer entre Pokédex normal et chromatique',
    vueNormale: 'Normal',
    vueChromatique: 'Chromatique',
    aidePlacer: (nom) => `Touchez l’emplacement où placer <b>${nom}</b> — vous pouvez changer de boîte ou de génération.`,
    annuler: 'Annuler',
    aideRanger: 'Appui long puis glissement : déplacer un Pokémon ; s’il en croise un autre, les deux échangent de place. Toucher un Pokémon puis sa destination fait de même d’une boîte à l’autre. Appui long sans bouger : insérer ici, tout ce qui suit se décale. × : retirer.',
    aideSansDonnees: 'Les sprites viennent de PokéAPI, mais les noms, habitats et lieux de capture ne sont chargés que pour la première boîte. Lance <code>npm run fetch-data</code> pour tout récupérer.',

    // -- Panneau « personnaliser la boîte »
    personnaliserBoite: 'Personnaliser la boîte',
    nom: 'Nom',
    fond: 'Fond',
    aucunFond: 'Aucun',
    retablirOrdre: (quoi) => `Rétablir l'ordre d'origine de ${quoi}`,
    laGen: (n) => `la gén. ${n}`,
    sansFond: (n) => `Les jeux de la génération ${n} n'avaient pas de fond de boîte : elles étaient toutes unies. Les fonds apparaissent à la génération III.`,

    // -- Sélecteur de Pokémon
    choisirAPlacer: 'Choisir un Pokémon à placer',
    ajouterIci: 'Ajouter un Pokémon ici',
    choisirPokemon: 'Choisir un Pokémon',
    rechercher: 'Rechercher',
    placeholderPokemon: 'Nom, forme, numéro…',
    resultatsToutesGens: 'Résultats dans toutes les générations.',
    aucunResultat: 'Aucun résultat.',
    premiers80: '80 premiers résultats — affinez la recherche.',

    // -- Fiche d'un Pokémon
    voirNormale: 'Voir la forme normale',
    voirChromatique: 'Voir la forme chromatique',
    ecouterCri: 'Écouter le cri',
    ecouterCriDe: (nom) => `Écouter le cri de ${nom}`,
    numero: (id) => `N° ${id}`,
    formeChromatique: 'forme chromatique',
    revenirA: (nom) => `‹ Revenir à ${nom}`,
    marquerCapture: 'Marquer comme capturé',
    habitat: 'Habitat',
    habitatInconnu: 'Non renseigné',
    couleur: 'Couleur',
    taille: 'Taille',
    poids: 'Poids',
    description: 'Description',
    statsDeBase: 'Statistiques de base',
    faiblessesEtResistances: 'Faiblesses et résistances',
    tableActuelle: 'table actuelle',
    familleEvolution: "Famille d'évolution",
    talents: 'Talents',
    attaques: 'Attaques',
    ouLeTrouver: 'Où le trouver',
    total: 'Total',
    statsInconnues: 'Statistiques inconnues.',
    typesInconnus: 'Types inconnus.',
    neutrePartout: 'Neutre face à tous les types.',
    nEvoluePas: "Ce Pokémon n'évolue pas.",
    aucunTalent: 'Aucun talent connu dans PokéAPI.',
    talentCache: 'caché',
    attaquesInconnues: 'Attaques non renseignées pour ce Pokémon dans PokéAPI.',
    dApres: (jeu) => `D'après ${jeu}. Touchez une attaque pour son effet.`,
    aucuneRencontre: "Aucune rencontre sauvage connue dans PokéAPI. Il s'obtient sans doute par évolution, échange, œuf ou événement.",
    niveauCourt: (min, max) => `N. ${min}${max}`,

    // -- Formes
    formes: 'Formes',
    ajouterLesFormes: (n) => `Ajouter les ${n} formes`,
    formeDeBase: 'Forme de base',
    male: 'Mâle',
    ajouterALaBoite: 'Ajouter à la boîte',
    commentObtenir: 'Comment l’obtenir',
    forme_mega: 'Méga', forme_gmax: 'Gigamax', forme_region: 'Forme régionale',
    forme_totem: 'Forme Totem', forme_event: 'Événement', forme_combat: 'Forme de combat',
    forme_cosmetique: 'Variante', forme_femelle: 'Femelle', forme_autre: 'Autre forme',
    obtention_mega: 'Méga-Évolution : en combat, en lui faisant tenir sa Gemme Méga.',
    obtention_gmax: 'Phénomène Gigamax : en combat, dans les jeux de la 8ᵉ génération.',
    obtention_region: 'Forme régionale : elle ne se rencontre que dans la région concernée.',
    obtention_totem: 'Pokémon Totem : rencontré lors des épreuves, il ne se capture pas.',
    obtention_event: 'Distribution événementielle : elle ne s’obtient pas en jeu normal.',
    obtention_combat: 'Changement de forme en combat, selon une condition propre à l’espèce.',
    obtention_cosmetique: 'Variante cosmétique : aucun effet sur les statistiques ni le type.',
    obtention_femelle: 'Différence entre mâle et femelle : c’est le sexe qui détermine l’aspect.',
    obtention_autre: 'Forme particulière à cette espèce.',

    // -- Attaques : colonnes et groupes
    classe_physical: 'Physique', classe_special: 'Spéciale', classe_status: 'Statut',
    puisCourt: 'Puis.', precCourt: 'Préc.', ppCourt: 'PP',
    puissance: 'Puissance', precision: 'Précision',
    categorie: 'Catégorie', type: 'Type',
    niveauBadge: (n) => `N.${n}`,
    depart: 'Dép.',
    oeuf: 'Œuf',
    maitre: 'Maît.',
    maitreLong: 'Maître',
    apprNiveau: 'Par niveau', apprCT: 'Par CT / CS', apprOeuf: 'Par œuf', apprMaitre: 'Par maître',
    ctEtCs: 'CT et CS',

    // -- Méthodes de rencontre
    methodes: {
      walk: 'Herbes hautes', surf: 'Surf', 'old-rod': 'Canne', 'good-rod': 'Super canne',
      'super-rod': 'Méga canne', 'rock-smash': 'Éclate-Roc', headbutt: "Coup d'Boule",
      gift: 'Don', 'gift-egg': 'Œuf offert', 'only-one': 'Unique', 'dark-grass': 'Herbes sombres',
      'grass-spots': 'Herbes frémissantes', 'cave-spots': 'Poussière', 'bridge-spots': 'Ombre',
      'super-rod-spots': 'Bulles', 'surf-spots': 'Remous', 'yellow-flowers': 'Fleurs jaunes',
      'purple-flowers': 'Fleurs violettes', 'red-flowers': 'Fleurs rouges',
      'rough-terrain': 'Terrain accidenté', seaweed: 'Algues', 'walk-arena-trap': 'Piège Arène',
    },

    // -- Statistiques
    stat_pv: 'PV', stat_att: 'Attaque', stat_def: 'Défense',
    stat_atts: 'Atq. Spé.', stat_defs: 'Déf. Spé.', stat_vit: 'Vitesse',
    statEV: 'EV', evDe: (lib) => `EV ${lib}`,

    // -- Équipes
    equipes: 'Équipes',
    equipesSous: (n, jeu) => `${n} Pokémon sur 6 · ${jeu}`,
    versionDuJeu: 'Version du jeu',
    emplacementLibreN: (n) => `Emplacement ${n}, libre`,
    libre: 'Libre',
    niveauDe: (nom, n) => `${nom}, niveau ${n}`,
    absentDeCeJeu: 'Absent de ce jeu',
    chargementAttaques: 'Chargement des attaques par version…',
    aideEquipe: (jeu) => `Touchez un emplacement pour choisir un Pokémon, puis le Pokémon lui-même pour régler son niveau, son talent, son objet et ses quatre attaques. Tout suit la version choisie, ici <b>${jeu}</b>.`,
    noteVersions: "Le moveset proposé change d'un jeu à l'autre. Les stats de base restent celles des jeux actuels : PokéAPI ne publie pas leur historique.",

    // -- Analyse d'équipe
    defense: 'Défense', defenseSous: "ce que l'équipe subit",
    attaque: 'Attaque', attaqueSous: 'meilleur coup disponible',
    roles: 'Rôles', conseils: 'Conseils',
    aucuneOffensive: 'Aucune attaque offensive choisie : sélectionnez-en pour voir la couverture.',
    plusSolide: (nom, v) => `Le plus solide : <b>${nom}</b> (${v} en PV+Déf+Déf.Spé).`,
    detailRole: (orientation, vit, enc) => `${orientation} · Vit. ${vit} · encaisse ${enc}`,
    role_mur: 'Mur', role_tank: 'Tank offensif', role_sweeper: 'Sweeper',
    role_casseur: 'Casseur lent', role_attaquant: 'Attaquant', role_polyvalent: 'Polyvalent',
    orient_physique: 'physique', orient_special: 'spécial', orient_mixte: 'mixte',
    tableDesTypes: 'Table des types',
    avisFaiblesse: (qui, type) => `<b>${qui}</b> sont faibles au type ${type}. Une seule attaque de ce type peut balayer la partie.`,
    touteLequipe: 'Toute l’équipe',
    nMembres: (n) => `${n} membres`,
    avisSansParade: (types) => `Aucun membre ne résiste au type ${types}.`,
    avisCategorie: (nom, mode, a, b, libA, libB) => `${nom} frappe surtout en ${mode} alors qu'il a ${a} en ${libA} contre ${b} en ${libB}.`,
    physique: 'physique', special: 'spécial',
    avisSansStab: (noms) => `Aucune attaque du type de <b>${noms}</b> : le bonus de 50 % du STAB est perdu.`,
    avisMonoType: (noms, plusieurs) => `<b>${noms}</b> n'attaque${plusieurs ? 'nt' : ''} que d'un seul type : un mur bien choisi l'arrête.`,
    avisSansStatut: 'Aucune attaque de statut dans l’équipe : ni soin, ni augmentation, ni entrave. Face à un adversaire qui se renforce, rien ne l’en empêchera.',
    avisIncomplet: (noms) => `Moveset incomplet : <b>${noms}</b>.`,
    avisSansMur: 'Aucun encaisseur : tout le monde tombe vite. Un Pokémon très défensif donne le temps de reprendre la main.',
    avisSansVitesse: 'Personne au-dessus de 100 en Vitesse : l’équipe frappera presque toujours en second.',
    avisToutPhysique: 'Équipe entièrement physique : un adversaire très défensif en Défense vous bloque net.',
    avisToutSpecial: 'Équipe entièrement spéciale : un adversaire très défensif en Défense Spéciale vous bloque net.',
    avisMemeType: (a, b) => `${a} et ${b} partagent le même type : leurs faiblesses se cumulent.`,
    avisSansAttaque: (n) => `${n} membre${n > 1 ? 's n’ont' : ' n’a'} aucune attaque offensive : la couverture ci-dessus est incomplète.`,
    avisNonCouverts: (types) => `Rien ne frappe super efficacement : ${types}.`,
    avisRien: 'Aucun défaut majeur détecté : pas de faiblesse partagée, un encaisseur, de la vitesse et les deux catégories d’attaque.',

    // -- Fiche d'un membre d'équipe
    emplacementVide: 'Emplacement vide.',
    niveau: 'Niveau',
    talent: 'Talent',
    aucunDansCeJeu: 'aucun dans ce jeu',
    choisirTalent: 'Choisir un talent',
    talentsDepuisG3: "Les talents n'existent qu'à partir de la gén. 3.",
    objetTenu: 'Objet tenu',
    aucunObjet: 'Aucun objet',
    aucunObjetG1: 'Aucun objet tenu en gén. 1.',
    nature: 'Nature',
    natureNeutre: 'Neutre (aucune)',
    natureAucunEffet: 'Aucun effet sur les statistiques',
    natureEffet: (p, m) => `+10 % ${p}, −10 % ${m}`,
    statsIndepNiveau: 'indépendantes du niveau',
    statistiques: 'Statistiques',
    ivDeduits: 'IV déduits',
    noteStats: "Recopiez les valeurs lues en jeu : l'IV est déduit de chacune, en tenant compte de la nature et des EV renseignés.",
    toutEffacer: 'Tout effacer',
    statsInconnuesCourt: 'Stats de base inconnues.',
    calculeIv31: 'calculé à IV 31',
    horsPlage: 'hors plage',
    ivExact: (v) => `IV ${v}`,
    ivPlage: (a, b) => `IV ${a}–${b}`,
    attaqueN: (n) => `Attaque ${n}`,
    indisponibleIci: 'indisponible ici',
    pasDansCeJeu: (nom, jeu) => `${nom} n'apparaît pas dans ${jeu} : aucune attaque à proposer.`,
    retirerDeLequipe: "Retirer de l'équipe",
    natureDe: (nom) => `Nature — ${nom}`,
    noteNature: "Une nature augmente une statistique de 10 % et en diminue une autre d'autant. Les cinq neutres n'ont aucun effet.",
    aucunEffet: 'Aucun effet',
    talentDe: (nom) => `Talent — ${nom}`,
    talentsDispo: (jeu) => `Talents disponibles dans ${jeu}.`,
    retirerTalent: 'Retirer le talent',
    objetDe: (nom) => `Objet tenu — ${nom}`,
    objetsDispo: (n, jeu) => `${n} objets tenables dans ${jeu}.`,
    placeholderObjet: "Nom d'objet…",
    retirerObjet: "Retirer l'objet",
    aucunObjetCorrespond: 'Aucun objet ne correspond.',
    attaqueDe: (n, nom) => `Attaque ${n} — ${nom}`,
    attaquesDispo: (n, jeu) => `${n} attaques apprenables dans ${jeu}.`,
    placeholderAttaque: "Nom d'attaque…",
    aucuneAttaqueCorrespond: 'Aucune attaque ne correspond.',

    // -- Page des attaques
    toutesLesAttaques: '‹ Toutes les attaques',
    attaqueInconnue: 'Attaque inconnue.',
    trierNom: 'Tri : nom', trierNbPokemon: 'Nb de Pokémon',
    compteSur: (a, b) => `${a} sur ${b}`,
    nPokemon: (n) => `${n} Pokémon`,
    noteMenuAttaques: (n, gen, jeux) => `${n} attaques apprenables en génération ${gen} (${jeux}), avec leurs valeurs de cette génération. Touchez une attaque pour voir qui l'apprend.`,
    valeursGen: (gen, apparue) => `Valeurs de la génération ${gen}${apparue ? `, attaque apparue en génération ${apparue}` : ''}.`,
    aujourdhui: (changes) => ` Aujourd'hui : ${changes}.`,
    avantG4: " Avant la gén. 4, physique ou spéciale dépendait du type de l'attaque.",
    chgPuissance: (v) => `puissance ${v}`,
    chgPrecision: (v) => `précision ${v}`,
    chgPP: (v) => `${v} PP`,
    chgType: (v) => `type ${v}`,
    quiLApprend: (gen) => `Qui l'apprend en génération ${gen}`,
    pasEncore: (gen) => `Cette attaque n'existe pas encore : elle apparaît en génération ${gen}.`,
    aucunNeLApprend: (gen) => `Aucun Pokémon ne l'apprend dans les jeux de la génération ${gen}.`,

    // -- Pokédex
    pokedex: 'Pokédex',
    national: 'National',
    pokedexSous: (pris, total) => `${pris} espèce${pris > 1 ? 's' : ''} sur ${total}`,
    chercherPokemon: 'Rechercher un Pokémon',
    chercherNomNumero: 'Chercher un nom ou un numéro',
    aucunCorrespond: 'Aucun Pokémon ne correspond.',
    nResultats: (n) => `${n} résultat${n > 1 ? 's' : ''} sur les neuf générations`,
    retourMenuDex: 'Revenir au menu du Pokédex',
    surTotal: (n) => `${n} sur 1025 au total`,
    toutesGenerations: 'Toutes générations',
    pokedexChromatique: 'Pokédex chromatique',
    dexComplet: 'complet',
    aideDex: 'Les formes alternatives n’ont pas d’entrée au Pokédex : elles sont listées dans la fiche de leur espèce, d’où l’on peut aussi les ranger en boîte.',

    // -- Scan
    scannerPokemon: 'Scanner un Pokémon',
    scanner: 'Scanner',
    aideCadre: "Touchez l'image pour placer le cadre sur le Pokémon",
    aideToucherPokemon: 'Touchez un Pokémon pour ouvrir sa fiche',
    pasDeCamera: 'Aucune caméra disponible sur cet appareil.',
    cameraHttps: 'La caméra demande une connexion sécurisée (https).',
    ouvertureCamera: 'Ouverture de la caméra…',
    cameraRefusee: "L'accès à la caméra a été refusé. Autorisez-le dans Réglages › Guiguidex.",
    cameraImpossible: 'Impossible d’ouvrir la caméra.',
    chargementModele: 'Chargement du modèle…',
    cameraPasPrete: 'La caméra n’est pas prête',
    pokemonNonTrouve: 'Pokémon non trouvé',
    analyseImpossible: 'Analyse impossible',
    modeTitre: 'Mode', modeAuto: 'Auto', modeManuel: 'Manuel', modeIA: 'IA',
    aideModeAuto: 'Mode temps réel : les Pokémon sont suivis automatiquement. Toucher pour passer en manuel.',
    aideModeManuel: 'Mode manuel : placer le cadre puis appuyer sur la Poké Ball. Toucher pour passer au mode IA.',
    aideModeIA: 'Mode IA, en essai : plusieurs Pokémon reconnus sur la puce du téléphone. Toucher pour revenir au temps réel.',
    toastAuto: 'Temps réel : les Pokémon sont suivis',
    toastManuel: 'Manuel : appuyez sur la Poké Ball',
    toastIA: 'Mode IA (essai) : plusieurs Pokémon à la fois',
    iaIndispo: 'Mode IA indisponible : aucun moteur',
    iaPreparation: 'Mode IA : préparation des modèles…',
    iaPret: (moteur, ms) => `Mode IA : ${moteur}, prêt en ${ms} ms`,
    iaDiag: (moteur, det, rec) => `IA · ${moteur} · détection ${det} ms · reconnaissance ${rec} ms`,
    iaErreur: (msg) => `Mode IA en erreur : ${msg}`,

    // -- Réglages
    reglages: 'Réglages',
    apparence: 'Apparence',
    apparenceAide: "Le thème sombre s'applique à toute l'application.",
    theme: 'Thème',
    themeClair: 'Clair', themeSombre: 'Sombre', themeAuto: 'Celui du téléphone',
    langue: 'Langue',
    langueAide: "Menus, noms de Pokémon, descriptions et lieux de capture suivent ce choix. Les textes viennent de PokéAPI ; ce qu'elle ne traduit pas reste en anglais.",
    sauvegarde: 'Sauvegarde',
    sauvegardeAide: "L'application est réinstallée tous les 7 jours : sans fichier exporté, la progression serait perdue. Pensez à exporter de temps en temps.",
    exportTout: 'Exporter toutes mes données',
    exportToutSous: 'Boîtes, équipes et préférences, en un fichier',
    importTout: 'Importer une sauvegarde',
    importToutSous: 'Restaure ce que le fichier contient',
    aVenir: 'À venir',
    aVenirSous: "D'autres réglages s'ajouteront ici.",
    restaure: (parties) => `Sauvegarde restaurée : ${parties}.`,
    fichierIllisible: 'Fichier illisible : il faut un export JSON de cette appli.',
    exportImpossible: (msg) => `Export impossible : ${msg}`,
    partieBoites: 'boîtes',
    partieEquipes: (n) => `${n} équipe${n > 1 ? 's' : ''}`,
  },

  // ================================================================== ANGLAIS
  en: {
    accueil: 'Home',
    retourAccueil: 'Back to home',
    appTitre: 'Guiguidex',
    accueilSous: (pris, shiny) => `${pris} Pokémon out of 1025${shiny ? ' · shiny' : ''}`,
    tuilePokedex: 'Pokédex',
    tuilePokedexSous: 'Every species, region by region',
    tuileBoites: 'Boxes',
    tuileBoitesSous: (pris, total, onglet) => `${pris} of ${total} · ${onglet}`,
    tuileEquipes: 'Teams',
    tuileEquipesSous: (n, jeu) => `${n} of 6 · ${jeu}`,
    tuileAttaques: 'Moves',
    tuileAttaquesSous: (n) => `${n} moves listed`,
    tuileScan: 'Scan',
    tuileScanSous: (mode) => `${mode} mode`,
    tuileReglages: 'Settings',
    tuileReglagesSous: (theme) => `${theme} theme`,

    genCourt: (n) => `Gen ${n}`,
    genLongue: (n) => `Generation ${n}`,
    remake_frlg_nom: 'FireRed / LeafGreen', remake_frlg_court: 'FR/LG',
    remake_hgss_nom: 'HeartGold / SoulSilver', remake_hgss_court: 'HG/SS',
    remake_rosa_nom: 'Omega Ruby / Alpha Sapphire', remake_rosa_court: 'OR/AS',
    remake_lgpe_nom: "Let's Go Pikachu / Eevee", remake_lgpe_court: "Let's Go",
    remake_deps_nom: 'Brilliant Diamond / Shining Pearl', remake_deps_court: 'BD/SP',

    boites: 'Boxes',
    boitesSous: (region, pris, total) => `${region} · ${pris} of ${total}`,
    boiteN: (n) => `Box ${n}`,
    boitePrecedente: 'Previous box',
    boiteSuivante: 'Next box',
    boiteLibre: (region) => `${region} · spare box`,
    boiteRang: (region, a, b, total) => `${region} · ${a}–${b} of ${total}`,
    boiteNumRegional: (region, a, b) => `${region} · No. ${a} to ${b}`,
    boiteNumNational: (region, a, b) => `${region} · ${a} to ${b}`,
    renommerBoite: 'Rename the box and pick its wallpaper',
    supprimerBoite: 'Delete the box shown',
    ajouterBoite: 'Add a box to this tab',
    ajouterBoiteCourt: 'Add a box',
    confirmeSupprBoite: (n) => `Delete this box? ${n} Pokémon are stored in it and will be removed from the tab.`,
    emplacementLibre: 'Empty slot',
    retirerDeLaBoite: 'Remove from the box',
    capture: 'caught',
    ajouterPokemon: 'Add a Pokémon',
    effetDuTap: 'What a tap does',
    modeCapturer: 'Catch',
    modeFiche: 'Details',
    modeRanger: 'Arrange',
    basculeChromatique: 'Switch between normal and shiny Pokédex',
    vueNormale: 'Normal',
    vueChromatique: 'Shiny',
    aidePlacer: (nom) => `Tap the slot where <b>${nom}</b> should go — you can change box or generation first.`,
    annuler: 'Cancel',
    aideRanger: 'Long press then drag to move a Pokémon; drop it on another and the two swap places. Tapping a Pokémon then its destination does the same from one box to another. Long press without moving: insert here, everything after shifts along. ×: remove.',
    aideSansDonnees: 'Sprites come from PokéAPI, but names, habitats and encounter locations are only loaded for the first box. Run <code>npm run fetch-data</code> to get everything.',

    personnaliserBoite: 'Customise the box',
    nom: 'Name',
    fond: 'Wallpaper',
    aucunFond: 'None',
    retablirOrdre: (quoi) => `Restore the original order of ${quoi}`,
    laGen: (n) => `Gen ${n}`,
    sansFond: (n) => `Generation ${n} games had no box wallpapers: boxes were plain. Wallpapers start in generation III.`,

    choisirAPlacer: 'Pick a Pokémon to place',
    ajouterIci: 'Add a Pokémon here',
    choisirPokemon: 'Pick a Pokémon',
    rechercher: 'Search',
    placeholderPokemon: 'Name, form, number…',
    resultatsToutesGens: 'Results across every generation.',
    aucunResultat: 'No results.',
    premiers80: 'First 80 results — narrow the search.',

    voirNormale: 'Show the normal form',
    voirChromatique: 'Show the shiny form',
    ecouterCri: 'Play the cry',
    ecouterCriDe: (nom) => `Play ${nom}'s cry`,
    numero: (id) => `No. ${id}`,
    formeChromatique: 'shiny form',
    revenirA: (nom) => `‹ Back to ${nom}`,
    marquerCapture: 'Mark as caught',
    habitat: 'Habitat',
    habitatInconnu: 'Not recorded',
    couleur: 'Colour',
    taille: 'Height',
    poids: 'Weight',
    description: 'Description',
    statsDeBase: 'Base stats',
    faiblessesEtResistances: 'Weaknesses and resistances',
    tableActuelle: 'current chart',
    familleEvolution: 'Evolution family',
    talents: 'Abilities',
    attaques: 'Moves',
    ouLeTrouver: 'Where to find it',
    total: 'Total',
    statsInconnues: 'Base stats unknown.',
    typesInconnus: 'Types unknown.',
    neutrePartout: 'Neutral against every type.',
    nEvoluePas: 'This Pokémon does not evolve.',
    aucunTalent: 'No ability listed in PokéAPI.',
    talentCache: 'hidden',
    attaquesInconnues: 'No moves listed for this Pokémon in PokéAPI.',
    dApres: (jeu) => `From ${jeu}. Tap a move for its effect.`,
    aucuneRencontre: 'No wild encounter listed in PokéAPI. It is probably obtained by evolution, trade, egg or event.',
    niveauCourt: (min, max) => `Lv. ${min}${max}`,

    formes: 'Forms',
    ajouterLesFormes: (n) => `Add the ${n} forms`,
    formeDeBase: 'Base form',
    male: 'Male',
    ajouterALaBoite: 'Add to the box',
    commentObtenir: 'How to get it',
    forme_mega: 'Mega', forme_gmax: 'Gigantamax', forme_region: 'Regional form',
    forme_totem: 'Totem form', forme_event: 'Event', forme_combat: 'Battle form',
    forme_cosmetique: 'Variant', forme_femelle: 'Female', forme_autre: 'Other form',
    obtention_mega: 'Mega Evolution: in battle, while holding its Mega Stone.',
    obtention_gmax: 'Gigantamax phenomenon: in battle, in the generation VIII games.',
    obtention_region: 'Regional form: found only in the region concerned.',
    obtention_totem: 'Totem Pokémon: met during trials, it cannot be caught.',
    obtention_event: 'Event distribution: it cannot be obtained in normal play.',
    obtention_combat: 'Form change in battle, under a condition specific to the species.',
    obtention_cosmetique: 'Cosmetic variant: no effect on stats or typing.',
    obtention_femelle: 'Male / female difference: the gender decides the appearance.',
    obtention_autre: 'A form specific to this species.',

    classe_physical: 'Physical', classe_special: 'Special', classe_status: 'Status',
    puisCourt: 'Pow.', precCourt: 'Acc.', ppCourt: 'PP',
    puissance: 'Power', precision: 'Accuracy',
    categorie: 'Category', type: 'Type',
    niveauBadge: (n) => `Lv.${n}`,
    depart: 'Start',
    oeuf: 'Egg',
    maitre: 'Tutor',
    maitreLong: 'Tutor',
    apprNiveau: 'By level', apprCT: 'By TM / HM', apprOeuf: 'By breeding', apprMaitre: 'By tutor',
    ctEtCs: 'TM and HM',

    methodes: {
      walk: 'Tall grass', surf: 'Surf', 'old-rod': 'Old Rod', 'good-rod': 'Good Rod',
      'super-rod': 'Super Rod', 'rock-smash': 'Rock Smash', headbutt: 'Headbutt',
      gift: 'Gift', 'gift-egg': 'Gift egg', 'only-one': 'One only', 'dark-grass': 'Dark grass',
      'grass-spots': 'Rustling grass', 'cave-spots': 'Dust cloud', 'bridge-spots': 'Shadow',
      'super-rod-spots': 'Bubbles', 'surf-spots': 'Rippling water', 'yellow-flowers': 'Yellow flowers',
      'purple-flowers': 'Purple flowers', 'red-flowers': 'Red flowers',
      'rough-terrain': 'Rough terrain', seaweed: 'Seaweed', 'walk-arena-trap': 'Arena Trap',
    },

    stat_pv: 'HP', stat_att: 'Attack', stat_def: 'Defense',
    stat_atts: 'Sp. Atk', stat_defs: 'Sp. Def', stat_vit: 'Speed',
    statEV: 'EV', evDe: (lib) => `${lib} EV`,

    equipes: 'Teams',
    equipesSous: (n, jeu) => `${n} Pokémon of 6 · ${jeu}`,
    versionDuJeu: 'Game version',
    emplacementLibreN: (n) => `Slot ${n}, empty`,
    libre: 'Empty',
    niveauDe: (nom, n) => `${nom}, level ${n}`,
    absentDeCeJeu: 'Not in this game',
    chargementAttaques: 'Loading moves per version…',
    aideEquipe: (jeu) => `Tap a slot to pick a Pokémon, then the Pokémon itself to set its level, ability, held item and four moves. Everything follows the chosen version, here <b>${jeu}</b>.`,
    noteVersions: 'The available moveset changes from game to game. Base stats stay those of the current games: PokéAPI does not publish their history.',

    defense: 'Defense', defenseSous: 'what the team takes',
    attaque: 'Offense', attaqueSous: 'best available hit',
    roles: 'Roles', conseils: 'Advice',
    aucuneOffensive: 'No offensive move selected: pick some to see the coverage.',
    plusSolide: (nom, v) => `Bulkiest: <b>${nom}</b> (${v} in HP+Def+Sp.Def).`,
    detailRole: (orientation, vit, enc) => `${orientation} · Spe. ${vit} · bulk ${enc}`,
    role_mur: 'Wall', role_tank: 'Offensive tank', role_sweeper: 'Sweeper',
    role_casseur: 'Slow breaker', role_attaquant: 'Attacker', role_polyvalent: 'All-rounder',
    orient_physique: 'physical', orient_special: 'special', orient_mixte: 'mixed',
    tableDesTypes: 'Type chart',
    avisFaiblesse: (qui, type) => `<b>${qui}</b> are weak to ${type}. A single move of that type can sweep the match.`,
    touteLequipe: 'The whole team',
    nMembres: (n) => `${n} members`,
    avisSansParade: (types) => `No member resists ${types}.`,
    avisCategorie: (nom, mode, a, b, libA, libB) => `${nom} attacks mostly ${mode} although it has ${a} ${libA} against ${b} ${libB}.`,
    physique: 'physically', special: 'specially',
    avisSansStab: (noms) => `No move of <b>${noms}</b>'s own type: the 50 % STAB bonus is lost.`,
    avisMonoType: (noms, plusieurs) => `<b>${noms}</b> only attack${plusieurs ? '' : 's'} with a single type: one well-chosen wall stops it.`,
    avisSansStatut: 'No status move on the team: no healing, no boosting, no disruption. Against an opponent that sets up, nothing will stop it.',
    avisIncomplet: (noms) => `Incomplete moveset: <b>${noms}</b>.`,
    avisSansMur: 'No bulky member: everyone falls fast. A very defensive Pokémon buys time to take back control.',
    avisSansVitesse: 'Nobody above 100 Speed: the team will almost always move second.',
    avisToutPhysique: 'Fully physical team: a very Defense-heavy opponent stops you dead.',
    avisToutSpecial: 'Fully special team: a very Sp. Def-heavy opponent stops you dead.',
    avisMemeType: (a, b) => `${a} and ${b} share the same typing: their weaknesses stack.`,
    avisSansAttaque: (n) => `${n} member${n > 1 ? 's have' : ' has'} no offensive move: the coverage above is incomplete.`,
    avisNonCouverts: (types) => `Nothing hits super effectively: ${types}.`,
    avisRien: 'No major flaw found: no shared weakness, a bulky member, some speed and both attacking categories.',

    emplacementVide: 'Empty slot.',
    niveau: 'Level',
    talent: 'Ability',
    aucunDansCeJeu: 'none in this game',
    choisirTalent: 'Choose an ability',
    talentsDepuisG3: 'Abilities only exist from generation III onwards.',
    objetTenu: 'Held item',
    aucunObjet: 'No item',
    aucunObjetG1: 'No held item in generation I.',
    nature: 'Nature',
    natureNeutre: 'Neutral (none)',
    natureAucunEffet: 'No effect on stats',
    natureEffet: (p, m) => `+10 % ${p}, −10 % ${m}`,
    statsIndepNiveau: 'independent of level',
    statistiques: 'Stats',
    ivDeduits: 'IVs deduced',
    noteStats: 'Copy the values read in game: the IV is deduced from each one, taking the nature and the EVs into account.',
    toutEffacer: 'Clear all',
    statsInconnuesCourt: 'Base stats unknown.',
    calculeIv31: 'computed at IV 31',
    horsPlage: 'out of range',
    ivExact: (v) => `IV ${v}`,
    ivPlage: (a, b) => `IV ${a}–${b}`,
    attaqueN: (n) => `Move ${n}`,
    indisponibleIci: 'unavailable here',
    pasDansCeJeu: (nom, jeu) => `${nom} does not appear in ${jeu}: no move to offer.`,
    retirerDeLequipe: 'Remove from the team',
    natureDe: (nom) => `Nature — ${nom}`,
    noteNature: 'A nature raises one stat by 10 % and lowers another by as much. The five neutral ones have no effect.',
    aucunEffet: 'No effect',
    talentDe: (nom) => `Ability — ${nom}`,
    talentsDispo: (jeu) => `Abilities available in ${jeu}.`,
    retirerTalent: 'Remove the ability',
    objetDe: (nom) => `Held item — ${nom}`,
    objetsDispo: (n, jeu) => `${n} holdable items in ${jeu}.`,
    placeholderObjet: 'Item name…',
    retirerObjet: 'Remove the item',
    aucunObjetCorrespond: 'No item matches.',
    attaqueDe: (n, nom) => `Move ${n} — ${nom}`,
    attaquesDispo: (n, jeu) => `${n} moves learnable in ${jeu}.`,
    placeholderAttaque: 'Move name…',
    aucuneAttaqueCorrespond: 'No move matches.',

    toutesLesAttaques: '‹ All moves',
    attaqueInconnue: 'Unknown move.',
    trierNom: 'Sort: name', trierNbPokemon: 'Pokémon count',
    compteSur: (a, b) => `${a} of ${b}`,
    nPokemon: (n) => `${n} Pokémon`,
    noteMenuAttaques: (n, gen, jeux) => `${n} moves learnable in generation ${gen} (${jeux}), with their values for that generation. Tap a move to see who learns it.`,
    valeursGen: (gen, apparue) => `Generation ${gen} values${apparue ? `, move introduced in generation ${apparue}` : ''}.`,
    aujourdhui: (changes) => ` Today: ${changes}.`,
    avantG4: ' Before generation IV, physical or special depended on the move’s type.',
    chgPuissance: (v) => `power ${v}`,
    chgPrecision: (v) => `accuracy ${v}`,
    chgPP: (v) => `${v} PP`,
    chgType: (v) => `${v} type`,
    quiLApprend: (gen) => `Who learns it in generation ${gen}`,
    pasEncore: (gen) => `This move does not exist yet: it appears in generation ${gen}.`,
    aucunNeLApprend: (gen) => `No Pokémon learns it in the generation ${gen} games.`,

    pokedex: 'Pokédex',
    national: 'National',
    pokedexSous: (pris, total) => `${pris} species of ${total}`,
    chercherPokemon: 'Search for a Pokémon',
    chercherNomNumero: 'Search a name or a number',
    aucunCorrespond: 'No Pokémon matches.',
    nResultats: (n) => `${n} result${n > 1 ? 's' : ''} across the nine generations`,
    retourMenuDex: 'Back to the Pokédex menu',
    surTotal: (n) => `${n} of 1025 in total`,
    toutesGenerations: 'Every generation',
    pokedexChromatique: 'Shiny Pokédex',
    dexComplet: 'complete',
    aideDex: 'Alternate forms have no Pokédex entry of their own: they are listed on their species’ page, from where they can also be stored in a box.',

    scannerPokemon: 'Scan a Pokémon',
    scanner: 'Scan',
    aideCadre: 'Tap the image to put the frame on the Pokémon',
    aideToucherPokemon: 'Tap a Pokémon to open its page',
    pasDeCamera: 'No camera available on this device.',
    cameraHttps: 'The camera needs a secure connection (https).',
    ouvertureCamera: 'Opening the camera…',
    cameraRefusee: 'Camera access was denied. Allow it in Settings › Guiguidex.',
    cameraImpossible: 'Could not open the camera.',
    chargementModele: 'Loading the model…',
    cameraPasPrete: 'The camera is not ready',
    pokemonNonTrouve: 'Pokémon not found',
    analyseImpossible: 'Analysis failed',
    modeTitre: 'Mode', modeAuto: 'Auto', modeManuel: 'Manual', modeIA: 'AI',
    aideModeAuto: 'Real-time mode: Pokémon are tracked automatically. Tap to switch to manual.',
    aideModeManuel: 'Manual mode: place the frame then press the Poké Ball. Tap to switch to AI mode.',
    aideModeIA: 'AI mode, experimental: several Pokémon recognised on the phone’s chip. Tap to go back to real time.',
    toastAuto: 'Real time: Pokémon are tracked',
    toastManuel: 'Manual: press the Poké Ball',
    toastIA: 'AI mode (trial): several Pokémon at once',
    iaIndispo: 'AI mode unavailable: no engine',
    iaPreparation: 'AI mode: preparing the models…',
    iaPret: (moteur, ms) => `AI mode: ${moteur}, ready in ${ms} ms`,
    iaDiag: (moteur, det, rec) => `AI · ${moteur} · detection ${det} ms · recognition ${rec} ms`,
    iaErreur: (msg) => `AI mode error: ${msg}`,

    reglages: 'Settings',
    apparence: 'Appearance',
    apparenceAide: 'Dark mode applies to the whole app.',
    theme: 'Theme',
    themeClair: 'Light', themeSombre: 'Dark', themeAuto: 'Match phone',
    langue: 'Language',
    langueAide: 'Menus, Pokémon names, descriptions and encounter locations follow this choice. The texts come from PokéAPI; whatever it does not translate stays in English.',
    sauvegarde: 'Backup',
    sauvegardeAide: 'The app is reinstalled every 7 days: without an exported file, your progress would be lost. Export it from time to time.',
    exportTout: 'Export all my data',
    exportToutSous: 'Boxes, teams and preferences, in one file',
    importTout: 'Import a backup',
    importToutSous: 'Restores whatever the file holds',
    aVenir: 'Coming soon',
    aVenirSous: 'More settings will land here.',
    restaure: (parties) => `Backup restored: ${parties}.`,
    fichierIllisible: 'Unreadable file: it must be a JSON export from this app.',
    exportImpossible: (msg) => `Export failed: ${msg}`,
    partieBoites: 'boxes',
    partieEquipes: (n) => `${n} team${n > 1 ? 's' : ''}`,
  },

  // ================================================================= JAPONAIS
  ja: {
    accueil: 'ホーム',
    retourAccueil: 'ホームに戻る',
    appTitre: 'Guiguidex',
    accueilSous: (pris, shiny) => `1025匹中 ${pris}匹${shiny ? ' · 色違い' : ''}`,
    tuilePokedex: 'ずかん',
    tuilePokedexSous: 'すべてのポケモンを 地方ごとに',
    tuileBoites: 'ボックス',
    tuileBoitesSous: (pris, total, onglet) => `${total}匹中 ${pris}匹 · ${onglet}`,
    tuileEquipes: 'てもち',
    tuileEquipesSous: (n, jeu) => `6匹中 ${n}匹 · ${jeu}`,
    tuileAttaques: 'わざ',
    tuileAttaquesSous: (n) => `わざ ${n}件`,
    tuileScan: 'スキャン',
    tuileScanSous: (mode) => `${mode}モード`,
    tuileReglages: 'せってい',
    tuileReglagesSous: (theme) => `テーマ：${theme}`,

    genCourt: (n) => `第${n}世代`,
    genLongue: (n) => `第${n}世代`,
    remake_frlg_nom: 'ファイアレッド / リーフグリーン', remake_frlg_court: 'FR/LG',
    remake_hgss_nom: 'ハートゴールド / ソウルシルバー', remake_hgss_court: 'HG/SS',
    remake_rosa_nom: 'オメガルビー / アルファサファイア', remake_rosa_court: 'OR/AS',
    remake_lgpe_nom: "Let's Go ピカチュウ / イーブイ", remake_lgpe_court: "Let's Go",
    remake_deps_nom: 'ブリリアントダイヤモンド / シャイニングパール', remake_deps_court: 'BD/SP',

    boites: 'ボックス',
    boitesSous: (region, pris, total) => `${region} · ${total}匹中 ${pris}匹`,
    boiteN: (n) => `ボックス${n}`,
    boitePrecedente: '前のボックス',
    boiteSuivante: '次のボックス',
    boiteLibre: (region) => `${region} · 空きボックス`,
    boiteRang: (region, a, b, total) => `${region} · ${total}件中 ${a}–${b}`,
    boiteNumRegional: (region, a, b) => `${region} · No.${a}〜${b}`,
    boiteNumNational: (region, a, b) => `${region} · ${a}〜${b}`,
    renommerBoite: 'ボックスの名前と かべがみを かえる',
    supprimerBoite: '表示中のボックスを 消す',
    ajouterBoite: 'このタブに ボックスを 追加',
    ajouterBoiteCourt: 'ボックスを 追加',
    confirmeSupprBoite: (n) => `このボックスを 消しますか？ ${n}匹が 入っていて、タブから 外れます。`,
    emplacementLibre: '空き',
    retirerDeLaBoite: 'ボックスから 外す',
    capture: 'つかまえた',
    ajouterPokemon: 'ポケモンを 追加',
    effetDuTap: 'タップしたときの 動作',
    modeCapturer: 'つかまえる',
    modeFiche: 'ずかん',
    modeRanger: 'ならべる',
    basculeChromatique: '通常ずかんと 色違いずかんを 切りかえ',
    vueNormale: '通常',
    vueChromatique: '色違い',
    aidePlacer: (nom) => `<b>${nom}</b> を 置く場所を タップしてください。ボックスや 世代を 変えても かまいません。`,
    annuler: 'やめる',
    aideRanger: '長押ししてから ドラッグで ポケモンを 移動します。ほかのポケモンに 重ねると 入れかわります。ポケモンを タップしてから 行き先を タップすると、ボックスをまたいで 同じことが できます。長押ししたまま 動かさなければ その位置に 挿入され、後ろが ずれます。× で 外します。',
    aideSansDonnees: 'スプライトは PokéAPI のものですが、名前・生息地・出現場所は 最初のボックス分しか 読み込まれていません。<code>npm run fetch-data</code> で すべて取得できます。',

    personnaliserBoite: 'ボックスの せってい',
    nom: 'なまえ',
    fond: 'かべがみ',
    aucunFond: 'なし',
    retablirOrdre: (quoi) => `${quoi} の 元の並びに 戻す`,
    laGen: (n) => `第${n}世代`,
    sansFond: (n) => `第${n}世代の ゲームには ボックスの かべがみが ありません。無地でした。かべがみは 第3世代から 登場します。`,

    choisirAPlacer: '置くポケモンを 選ぶ',
    ajouterIci: 'ここに ポケモンを 追加',
    choisirPokemon: 'ポケモンを 選ぶ',
    rechercher: 'けんさく',
    placeholderPokemon: '名前・すがた・番号…',
    resultatsToutesGens: '全世代からの 結果です。',
    aucunResultat: '見つかりません。',
    premiers80: '上位80件です。条件を しぼってください。',

    voirNormale: '通常の すがたを 見る',
    voirChromatique: '色違いの すがたを 見る',
    ecouterCri: '鳴き声を 聞く',
    ecouterCriDe: (nom) => `${nom}の 鳴き声を 聞く`,
    numero: (id) => `No.${id}`,
    formeChromatique: '色違い',
    revenirA: (nom) => `‹ ${nom}に 戻る`,
    marquerCapture: 'つかまえた ことにする',
    habitat: '生息地',
    habitatInconnu: '未収録',
    couleur: 'いろ',
    taille: 'たかさ',
    poids: 'おもさ',
    description: 'せつめい',
    statsDeBase: '種族値',
    faiblessesEtResistances: '弱点と 耐性',
    tableActuelle: '現在の 相性表',
    familleEvolution: '進化',
    talents: 'とくせい',
    attaques: 'わざ',
    ouLeTrouver: '出現場所',
    total: '合計',
    statsInconnues: '種族値が わかりません。',
    typesInconnus: 'タイプが わかりません。',
    neutrePartout: 'すべてのタイプに 等倍です。',
    nEvoluePas: 'このポケモンは 進化しません。',
    aucunTalent: 'PokéAPI に とくせいの 記録が ありません。',
    talentCache: 'かくれ',
    attaquesInconnues: 'PokéAPI に このポケモンの わざが ありません。',
    dApres: (jeu) => `${jeu} より。わざを タップすると 効果が 出ます。`,
    aucuneRencontre: 'PokéAPI に 野生での 出現記録が ありません。進化・交換・タマゴ・配布で 入手すると 思われます。',
    niveauCourt: (min, max) => `Lv.${min}${max}`,

    formes: 'すがた',
    ajouterLesFormes: (n) => `${n}件の すがたを 追加`,
    formeDeBase: '通常のすがた',
    male: 'オス',
    ajouterALaBoite: 'ボックスに 入れる',
    commentObtenir: '入手方法',
    forme_mega: 'メガシンカ', forme_gmax: 'キョダイマックス', forme_region: 'リージョンフォーム',
    forme_totem: 'ぬしポケモン', forme_event: '配布', forme_combat: '戦闘中のすがた',
    forme_cosmetique: 'すがた違い', forme_femelle: 'メス', forme_autre: 'そのほかのすがた',
    obtention_mega: 'メガシンカ：戦闘中に メガストーンを 持たせると 変化します。',
    obtention_gmax: 'キョダイマックス：第8世代の ゲームの 戦闘中に 起こります。',
    obtention_region: 'リージョンフォーム：その地方でしか 出会えません。',
    obtention_totem: 'ぬしポケモン：試練で 出会いますが つかまえられません。',
    obtention_event: '配布限定：通常のプレイでは 手に入りません。',
    obtention_combat: '戦闘中に すがたが 変わります。条件は 種族ごとに 異なります。',
    obtention_cosmetique: '見た目だけの 違いです。能力や タイプは 変わりません。',
    obtention_femelle: 'オスとメスの 違いです。性別で 見た目が 決まります。',
    obtention_autre: 'この種族 特有の すがたです。',

    classe_physical: 'ぶつり', classe_special: 'とくしゅ', classe_status: 'へんか',
    puisCourt: '威力', precCourt: '命中', ppCourt: 'PP',
    puissance: '威力', precision: '命中',
    categorie: '分類', type: 'タイプ',
    niveauBadge: (n) => `Lv.${n}`,
    depart: '初期',
    oeuf: 'タマゴ',
    maitre: '教え',
    maitreLong: '教えわざ',
    apprNiveau: 'レベルアップ', apprCT: 'わざマシン', apprOeuf: 'タマゴわざ', apprMaitre: '教えわざ',
    ctEtCs: 'わざマシン',

    methodes: {
      walk: 'くさむら', surf: 'なみのり', 'old-rod': 'ボロのつりざお', 'good-rod': 'いいつりざお',
      'super-rod': 'すごいつりざお', 'rock-smash': 'いわくだき', headbutt: 'ずつき',
      gift: 'もらう', 'gift-egg': 'もらうタマゴ', 'only-one': '1匹のみ', 'dark-grass': '濃いくさむら',
      'grass-spots': 'ゆれるくさむら', 'cave-spots': 'すなぼこり', 'bridge-spots': 'かげ',
      'super-rod-spots': 'あわ', 'surf-spots': 'なみしぶき', 'yellow-flowers': '黄色い花',
      'purple-flowers': '紫の花', 'red-flowers': '赤い花',
      'rough-terrain': 'あらい地面', seaweed: '海藻', 'walk-arena-trap': 'ありじごく',
    },

    stat_pv: 'HP', stat_att: 'こうげき', stat_def: 'ぼうぎょ',
    stat_atts: 'とくこう', stat_defs: 'とくぼう', stat_vit: 'すばやさ',
    statEV: '努力値', evDe: (lib) => `${lib}の 努力値`,

    equipes: 'てもち',
    equipesSous: (n, jeu) => `6匹中 ${n}匹 · ${jeu}`,
    versionDuJeu: 'ソフト',
    emplacementLibreN: (n) => `${n}番目、空き`,
    libre: '空き',
    niveauDe: (nom, n) => `${nom}、レベル${n}`,
    absentDeCeJeu: 'このソフトには いません',
    chargementAttaques: 'ソフトごとの わざを 読み込み中…',
    aideEquipe: (jeu) => `枠を タップして ポケモンを 選び、そのポケモンを タップすると レベル・とくせい・持ち物・わざ4つを 設定できます。すべて 選んだソフト（ここでは <b>${jeu}</b>）に 合わせて 変わります。`,
    noteVersions: '覚えられる わざは ソフトごとに 変わります。種族値は 現在の ゲームの値です。PokéAPI が その履歴を 公開していないためです。',

    defense: 'ぼうぎょ面', defenseSous: '受けるダメージ',
    attaque: 'こうげき面', attaqueSous: '出せる 最大倍率',
    roles: '役割', conseils: 'アドバイス',
    aucuneOffensive: '攻撃わざが 選ばれていません。選ぶと 範囲が 表示されます。',
    plusSolide: (nom, v) => `いちばん 硬いのは <b>${nom}</b>（HP+ぼうぎょ+とくぼう が ${v}）。`,
    detailRole: (orientation, vit, enc) => `${orientation} · すばやさ ${vit} · 耐久 ${enc}`,
    role_mur: 'かべ', role_tank: '耐久アタッカー', role_sweeper: 'スイーパー',
    role_casseur: '低速アタッカー', role_attaquant: 'アタッカー', role_polyvalent: 'バランス型',
    orient_physique: 'ぶつり', orient_special: 'とくしゅ', orient_mixte: 'りょうづかい',
    tableDesTypes: 'タイプ相性表',
    avisFaiblesse: (qui, type) => `<b>${qui}</b> が ${type}タイプに 弱いです。この1タイプで 全滅しかねません。`,
    touteLequipe: 'てもち全員',
    nMembres: (n) => `${n}匹`,
    avisSansParade: (types) => `${types}タイプを 受けられる ポケモンが いません。`,
    avisCategorie: (nom, mode, a, b, libA, libB) => `${nom} は ${libA}が${a}、${libB}が${b} なのに ${mode}わざ中心です。`,
    physique: 'ぶつり', special: 'とくしゅ',
    avisSansStab: (noms) => `<b>${noms}</b> に 自分のタイプの わざが ありません。1.5倍の タイプ一致補正が 活きていません。`,
    avisMonoType: (noms, plusieurs) => `<b>${noms}</b> の 攻撃わざが 1タイプだけです。相性の よい かべ1匹で 止まります。`,
    avisSansStatut: '変化わざが 1つも ありません。回復も 能力上昇も 妨害も できず、積んでくる 相手を 止められません。',
    avisIncomplet: (noms) => `わざが 4つ そろっていません：<b>${noms}</b>。`,
    avisSansMur: '耐久役が いません。誰も すぐ倒れます。硬いポケモンが 1匹いると 立て直せます。',
    avisSansVitesse: 'すばやさ100を 超える ポケモンが いません。ほぼ 後攻になります。',
    avisToutPhysique: 'ぶつり一辺倒です。ぼうぎょの 高い 相手に 止められます。',
    avisToutSpecial: 'とくしゅ一辺倒です。とくぼうの 高い 相手に 止められます。',
    avisMemeType: (a, b) => `${a} と ${b} は 同じタイプです。弱点が 重なります。`,
    avisSansAttaque: (n) => `${n}匹に 攻撃わざが ありません。上の 攻撃範囲は 不完全です。`,
    avisNonCouverts: (types) => `効果ばつぐんを 取れない タイプ：${types}。`,
    avisRien: '大きな 弱点は 見つかりません。弱点の重なりも なく、耐久役も 速さも ぶつり・とくしゅ 両方の わざも あります。',

    emplacementVide: '空きです。',
    niveau: 'レベル',
    talent: 'とくせい',
    aucunDansCeJeu: 'このソフトには なし',
    choisirTalent: 'とくせいを 選ぶ',
    talentsDepuisG3: 'とくせいは 第3世代から 登場します。',
    objetTenu: 'もちもの',
    aucunObjet: 'なし',
    aucunObjetG1: '第1世代に もちものは ありません。',
    nature: 'せいかく',
    natureNeutre: '無補正（なし）',
    natureAucunEffet: '能力に 影響しません',
    natureEffet: (p, m) => `${p} +10 %、${m} −10 %`,
    statsIndepNiveau: 'レベルに よらない値',
    statistiques: '能力値',
    ivDeduits: '個体値の 推定',
    noteStats: 'ゲームで 見た値を 入力すると、せいかくと 努力値を 考慮して 個体値を 推定します。',
    toutEffacer: 'すべて消す',
    statsInconnuesCourt: '種族値が わかりません。',
    calculeIv31: '個体値31での 計算値',
    horsPlage: '範囲外',
    ivExact: (v) => `個体値 ${v}`,
    ivPlage: (a, b) => `個体値 ${a}〜${b}`,
    attaqueN: (n) => `わざ ${n}`,
    indisponibleIci: 'このソフトでは 覚えません',
    pasDansCeJeu: (nom, jeu) => `${nom} は ${jeu} に 登場しません。提案できる わざが ありません。`,
    retirerDeLequipe: 'てもちから 外す',
    natureDe: (nom) => `せいかく — ${nom}`,
    noteNature: 'せいかくは ひとつの 能力を 10 % 上げ、別の 能力を 10 % 下げます。無補正の 5つは 影響しません。',
    aucunEffet: '影響なし',
    talentDe: (nom) => `とくせい — ${nom}`,
    talentsDispo: (jeu) => `${jeu} で 使える とくせい。`,
    retirerTalent: 'とくせいを 外す',
    objetDe: (nom) => `もちもの — ${nom}`,
    objetsDispo: (n, jeu) => `${jeu} で 持たせられる 道具 ${n}件。`,
    placeholderObjet: '道具の 名前…',
    retirerObjet: 'もちものを 外す',
    aucunObjetCorrespond: '該当する 道具が ありません。',
    attaqueDe: (n, nom) => `わざ ${n} — ${nom}`,
    attaquesDispo: (n, jeu) => `${jeu} で 覚えられる わざ ${n}件。`,
    placeholderAttaque: 'わざの 名前…',
    aucuneAttaqueCorrespond: '該当する わざが ありません。',

    toutesLesAttaques: '‹ わざ一覧',
    attaqueInconnue: '不明な わざです。',
    trierNom: '並び：名前', trierNbPokemon: '覚える数',
    compteSur: (a, b) => `${b}件中 ${a}件`,
    nPokemon: (n) => `${n}匹`,
    noteMenuAttaques: (n, gen, jeux) => `第${gen}世代（${jeux}）で 覚えられる わざ ${n}件を、その世代の 値で 表示しています。タップすると 覚えるポケモンが 出ます。`,
    valeursGen: (gen, apparue) => `第${gen}世代の 値${apparue ? `。第${apparue}世代で 登場` : ''}。`,
    aujourdhui: (changes) => ` 現在は ${changes}。`,
    avantG4: ' 第4世代より前は、ぶつりか とくしゅかは わざの タイプで 決まっていました。',
    chgPuissance: (v) => `威力 ${v}`,
    chgPrecision: (v) => `命中 ${v}`,
    chgPP: (v) => `PP ${v}`,
    chgType: (v) => `${v}タイプ`,
    quiLApprend: (gen) => `第${gen}世代で 覚えるポケモン`,
    pasEncore: (gen) => `この わざは まだ ありません。第${gen}世代で 登場します。`,
    aucunNeLApprend: (gen) => `第${gen}世代の ソフトでは どのポケモンも 覚えません。`,

    pokedex: 'ずかん',
    national: '全国',
    pokedexSous: (pris, total) => `${total}匹中 ${pris}匹`,
    chercherPokemon: 'ポケモンを さがす',
    chercherNomNumero: '名前か 番号で さがす',
    aucunCorrespond: '該当する ポケモンが いません。',
    nResultats: (n) => `全9世代から ${n}件`,
    retourMenuDex: 'ずかんメニューに 戻る',
    surTotal: (n) => `全体で 1025匹中 ${n}匹`,
    toutesGenerations: '全世代',
    pokedexChromatique: '色違いずかん',
    dexComplet: 'コンプリート',
    aideDex: 'すがた違いには ずかん番号が ありません。その種族の ページに まとめて 載っていて、そこから ボックスにも 入れられます。',

    scannerPokemon: 'ポケモンを スキャン',
    scanner: 'スキャン',
    aideCadre: '画面を タップして ポケモンに 枠を 合わせてください',
    aideToucherPokemon: 'ポケモンを タップすると ずかんが 開きます',
    pasDeCamera: 'この端末には カメラが ありません。',
    cameraHttps: 'カメラには 安全な接続（https）が 必要です。',
    ouvertureCamera: 'カメラを 起動中…',
    cameraRefusee: 'カメラの 使用が 拒否されました。設定 › Guiguidex で 許可してください。',
    cameraImpossible: 'カメラを 起動できません。',
    chargementModele: 'モデルを 読み込み中…',
    cameraPasPrete: 'カメラの 準備が できていません',
    pokemonNonTrouve: 'ポケモンが 見つかりません',
    analyseImpossible: '解析できません',
    modeTitre: 'モード', modeAuto: 'オート', modeManuel: 'てどう', modeIA: 'AI',
    aideModeAuto: 'リアルタイム：ポケモンを 自動で 追いかけます。タップで てどうに 切りかえ。',
    aideModeManuel: 'てどう：枠を 合わせて モンスターボールを 押します。タップで AIモードに 切りかえ。',
    aideModeIA: 'AIモード（試験）：端末のチップで 複数の ポケモンを 認識します。タップで リアルタイムに 戻ります。',
    toastAuto: 'リアルタイム：ポケモンを 追跡します',
    toastManuel: 'てどう：モンスターボールを 押してください',
    toastIA: 'AIモード（試験）：複数の ポケモンを 同時に',
    iaIndispo: 'AIモードは 使えません：エンジンが ありません',
    iaPreparation: 'AIモード：モデルを 準備中…',
    iaPret: (moteur, ms) => `AIモード：${moteur}、${ms} ms で 準備完了`,
    iaDiag: (moteur, det, rec) => `AI · ${moteur} · 検出 ${det} ms · 認識 ${rec} ms`,
    iaErreur: (msg) => `AIモードの エラー：${msg}`,

    reglages: 'せってい',
    apparence: 'ひょうじ',
    apparenceAide: 'ダークテーマは アプリ全体に 適用されます。',
    theme: 'テーマ',
    themeClair: 'ライト', themeSombre: 'ダーク', themeAuto: '端末に合わせる',
    langue: 'ことば',
    langueAide: 'メニュー・ポケモンの名前・説明・出現場所が この言語に なります。文章は PokéAPI のもので、翻訳が ないものは 英語のままです。',
    sauvegarde: 'バックアップ',
    sauvegardeAide: 'アプリは 7日ごとに 入れ直します。書き出しておかないと 記録が 消えます。ときどき 書き出してください。',
    exportTout: 'すべてのデータを 書き出す',
    exportToutSous: 'ボックス・てもち・せってい を 1つのファイルに',
    importTout: 'バックアップを 読み込む',
    importToutSous: 'ファイルに あるものを 戻します',
    aVenir: '今後 追加',
    aVenirSous: 'ほかの 設定も ここに 増えていきます。',
    restaure: (parties) => `復元しました：${parties}。`,
    fichierIllisible: 'ファイルを 読めません。このアプリで 書き出した JSON が 必要です。',
    exportImpossible: (msg) => `書き出せません：${msg}`,
    partieBoites: 'ボックス',
    partieEquipes: (n) => `てもち ${n}件`,
  },
};
