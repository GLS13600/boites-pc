# Boîtes PC — Living Dex personnel

Application web perso pour suivre un Living Dex, présentée comme les boîtes PC des jeux
Pokémon. Destinée à finir en `.ipa` sideloadée sur iPhone via Sideloadly.

## Contraintes du poste de travail

- Développement sous **Windows**, pas de Mac. Projet dans `D:\Code\Jeu\`.
- La compilation iOS se fera plus tard sur **GitHub Actions** (runner macOS) ou avec
  **xtool** ; l'IPA sera produit **non signé**, c'est Sideloadly qui signe avec l'Apple ID
  personnel. Certificat gratuit : 3 apps max, à rafraîchir tous les 7 jours.
- Un lanceur `Lancer-Pokedex.bat` démarre le serveur de dev et affiche l'IP réseau pour
  tester depuis l'iPhone (Safari, même Wi-Fi ou partage de connexion).

## Stack

- **Vite + vanilla JS**, aucun framework, aucune dépendance runtime.
- `vite.config.js` a `base: './'` — indispensable pour que Capacitor charge `dist/`
  depuis le système de fichiers de l'iPhone. Ne pas repasser en `/`.
- Pas de TypeScript, pas de bundler additionnel, pas de librairie UI. Garder ça léger.

## Fichiers

| Chemin | Rôle |
|---|---|
| `src/main.js` | Toute la logique : état, rendu, gestes, fiche |
| `src/style.css` | Thème clair, variables CSS en `:root` |
| `src/data/pokedex.json` | Données générées, **ne jamais éditer à la main** |
| `scripts/fetch-data.mjs` | Aspire PokéAPI vers le JSON ci-dessus |
| `src/data/evolutions.json` | Familles d'évolution + conditions, **généré** |
| `src/data/forms.json` | Formes alternatives par espèce, **généré** |
| `src/data/wallpapers.json` | Catalogue des fonds, **généré** |
| `src/paper-align.js` | Calage des fonds par génération, **édité à la main** |
| `calage.html` | Outil à curseurs pour régler ce calage (dev seulement) |
| `Calage-Fonds.bat` | Ouvre l'appli et l'outil côte à côte |
| `public/icon.svg` | Icône de l'application, vectorielle |
| `icone.html` | Aperçu de l'icône aux tailles d'iOS (dev seulement) |
| `scripts/fetch-extra.mjs` | Aspire évolutions et formes (`npm run fetch-extra`) |
| `src/data/dex-remakes.json` | Pokédex régionaux des remakes, **généré** |
| `scripts/fetch-dex.mjs` | Aspire ces Pokédex (`npm run fetch-dex`) |
| `scripts/fetch-sprites.mjs` | Rapatrie tous les sprites (`npm run fetch-sprites`) |
| `public/sprites/` | Les 5 291 sprites, **générés**, 40 Mo |

## Données

- Source unique : **PokéAPI** (`https://pokeapi.co/api/v2`), pas de clé, pas d'appel au
  runtime. Tout est aspiré une fois par `npm run fetch-data` et embarqué dans le bundle.
  L'appli doit rester utilisable hors ligne.
- `npm run fetch-data -- 1 151` limite à une plage d'IDs. Le script **reprend** là où il
  s'est arrêté : les entrées déjà présentes dans le JSON sont conservées.
- Champs par Pokémon : `name`, `genus`, `generation`, `types`, `height`, `weight`,
  `habitat`, `color`, `flavor`, `encounters`.
- `encounters` est groupé par jeu puis par lieu, avec méthodes, niveaux min/max et taux.
  Les noms de lieux, jeux, habitats et catégories sont pris en **français** quand PokéAPI
  les fournit, sinon repli sur l'anglais.
- PokéAPI ne renseigne `habitat` que pour les générations 1 à 3. Au-delà c'est `null` et
  l'interface affiche « Non renseigné » — c'est une limite de la source, pas un bug.

## Sprites

**Tout est local, dans `public/sprites/`.** L'appli ne fait plus **aucune** requête
réseau : pas de sprite distant, pas de police web, pas de CDN, pas de `fetch` au
runtime. Vérifié via l'API Performance : 0 ressource hors origine.

- fixe : `sprites/{id}.png` — chromatique : `sprites/shiny/{id}.png`
- femelle : `sprites/female/{id}.png` (le `shiny/` se préfixe sans cas particulier)
- artwork : `sprites/other/official-artwork/{id}.webp` (+ `shiny/`)

`npm run fetch-sprites` rapatrie les 5 291 fichiers (**40 Mo**) et **reprend** comme
les autres scripts : un fichier déjà présent n'est pas retéléchargé.

- Le chemin est relatif **sans `/` initial**, comme les fonds de boîte : indispensable
  avec `base: './'`, sinon Capacitor ne les trouve pas sur l'iPhone.
- **Les artworks sont en WebP, pas en PNG** — d'où l'extension qui diffère des sprites
  fixes dans `sprites.art()`. Les 2 050 PNG d'origine pèsent 260 Mo (129 Ko pièce),
  impossible dans un IPA sideloadé ; en WebP 384 px qualité 78 ils tombent à ~37 Mo.
  384 px parce que le portrait s'affiche en **108 px CSS**, soit 324 px sur un écran
  ×3 : réduire davantage se verrait, garder le 475 px d'origine ne servirait à rien.
- Les sprites fixes restent en **PNG d'origine**, non recompressés : 1,8 Ko pièce de
  pixel art, il n'y a rien à gagner et tout à abîmer.
- **25 sprites n'existent pas en amont** (casquettes de Pikachu `10158`/`10159`,
  `10264`–`10271`, `10301`, `female/902`, `shiny/female/916`). C'est le repli
  `onerror` qui les couvre — vérifié, les 25 chargent bien le sprite de leur espèce.

Pas de sprites animés : les GIF `other/showdown/` ont été retirés volontairement.

Règles d'affichage, à ne pas casser :

- Grille : toujours le sprite fixe. Non capturé → `filter: grayscale(1)` (**gris**).
  Capturé → **couleur**. C'est le seul signal d'état avec le marqueur Poké Ball.
- Fiche : artwork officiel, grisé aussi tant que non capturé (classe `.portrait.locked`).
- Chaque `<img>` garde un `onerror` de repli, qui doit viser le sprite de l'**espèce**
  (`speciesOf(key)` dans la grille, `e.num` dans le sélecteur). Viser `spriteKey()`
  reconstruit l'URL qui vient justement d'échouer : le repli ne servait alors à rien,
  et les 25 formes sans sprite s'affichaient en image cassée.
- Les sprites dépendent du seul numéro, donc la grille est complète même sans `pokedex.json`.

## Évolutions et formes

- `npm run fetch-extra` produit `evolutions.json` (723 familles, 1025 espèces reliées)
  et `forms.json` (678 formes : 250 cosmétiques, 102 femelles, 97 Méga, 60 régionales,
  34 Gigamax, 22 de combat, 11 Totem, 7 d'événement, 95 autres). 211 Ko à eux deux.
  Le script **reprend** comme `fetch-data`.
- Les chaînes sont **mutualisées** : `evolutions.of[id]` donne l'index dans
  `evolutions.chains`, partagé par toute la famille. Chaque membre porte `from` et
  `how` (condition rédigée en français).
- Les familles se ramifient (Évoli en a huit) : la fiche indente chaque ligne selon sa
  profondeur (`--d`) plutôt que de dessiner un arbre.
- **Piège PokéAPI** : les ids de `/pokemon-form` ne suivent pas ceux de `/pokemon`.
  Interroger `/pokemon-form/<id du pokémon>` renvoie une tout autre forme — le script
  passe par `/pokemon/<id>` puis `forms[0].url`. Ne pas « simplifier » ça.
- La nature d'une forme (`kind`) est déduite du **slug**, pas des drapeaux de PokéAPI :
  `is_mega` est incomplet selon les entrées.
- **Deux gisements de formes chez PokéAPI, il faut les deux :**
  1. `species.varieties` — Méga, Gigamax, formes régionales (de vrais `/pokemon`) ;
  2. `pokemon.forms[]` — formes **cosmétiques** : saisons de Vivaldaim et Haydaim,
     28 lettres d'Zarbi, 20 motifs de Prismillon. Elles n'apparaissent **pas** dans
     `varieties`. Les oublier avait fait rendre Vivaldaim sans aucune forme.
- **Différences mâle/femelle** : 102 espèces ont un sprite femelle distinct
  (Viskuse, Moyade, Pikachu, Déflaisan…). PokéAPI le signale par
  `has_gender_differences` ; le sprite vit dans `female/<id>.png`, et le champ
  `sprite` vaut donc `female/<id>` — le constructeur d'URL insère `shiny/` devant,
  ce qui donne `shiny/female/<id>.png` sans cas particulier. Clé : `<id>-female`.
- L'entrée du Pokédex **est** le mâle pour ces espèces : la fiche l'étiquette « Mâle »
  au lieu de « Forme de base » dès qu'une forme femelle existe.
- **Piège** : PokéAPI modélise aussi ce couple en formes *cosmétiques*
  (`frillish-male`, `frillish-female`…) pour 3 espèces, mais les deux pointent le
  **même** sprite — la femelle y est fausse. Le script les ignore.
- Le repli `onerror` d'une forme vise le sprite de l'**espèce**, pas le sien : viser le
  même fichier ne servait à rien quand il manque (Pikachu Partenaire, `10158.png`).
- **Clé de capture (`key`), à ne pas confondre avec un id :**
  - formes issues de `varieties` : l'id numérique du `/pokemon` (10034…) ;
  - formes cosmétiques : le **slug** (`deerling-winter`), jamais l'id de
    `/pokemon-form` — cette numérotation chevauche celle de `/pokemon` et se
    téléscoperait. Vérifié : 0 collision, 0 clé numérique ≤ 1025.
  - `state.caught` contient donc des nombres **et** des chaînes. `asKey()` rétablit le
    type depuis un attribut HTML ; l'import ne doit **pas** faire `.map(Number)`.
- Le sprite d'une forme cosmétique s'appelle `585-summer.png`, pas `10068.png` : le
  champ `sprite` du catalogue porte le nom de fichier réel, relevé sur l'API. Passer
  par `spriteKey()`, jamais reconstruire l'URL depuis la clé.
- **Absents de PokéAPI, donc absents ici** : les distributions d'événements (Mew de
  1996, etc.). Les formes d'événement présentes dans les jeux (casquettes de Pikachu)
  le sont, elles, sous `kind: 'event'`.

## Fiche d'une forme

- Une forme n'a pas d'entrée propre au Pokédex : la fiche emprunte celle de son espèce
  (`speciesOf()`) pour les types, la description et les lieux, et affiche le sprite de
  la forme en portrait — l'artwork officiel n'existe que pour l'espèce.
- Un bouton **« ‹ Revenir à <espèce> »** ramène à la forme de base. La liste « Formes »
  inclut la base en tête et marque celle affichée (`.forme.ici`), donc on circule
  librement entre formes sans repasser par la grille.
- La famille d'évolution affichée est celle de l'espèce, avec l'espèce surlignée.

## Onglets : générations et remakes

- `ONGLETS` = les 9 générations, puis **5 remakes** : Rouge Feu/Vert Feuille,
  Or HeartGold/Argent SoulSilver, Rubis Oméga/Saphir Alpha, Let's Go, Diamant
  Étincelant/Perle Scintillante.
- Une génération se décrit par une **plage** du Pokédex national ; un remake porte sa
  **propre liste**, dans l'ordre régional du jeu. C'est tout l'intérêt de l'onglet :
  HG/SS classe les Johto avant les Kanto, ROSA a son ordre de Hoenn. Repris tel quel
  depuis `/pokedex/` de PokéAPI (`updated-johto`, `updated-hoenn`, `kanto`,
  `letsgo-kanto`, `original-sinnoh`).
- **L'index dans `ONGLETS` est la clé de `state.order` et `state.box`** : n'ajouter
  qu'à la **fin** du tableau, sinon les boîtes déjà personnalisées changeraient de
  place. Les 9 générations gardent les index 0 à 8.
- Le sous-titre annonce les numéros **nationaux** pour une génération, **régionaux**
  pour un remake, le **rang** dès que l'ordre est personnalisé, et « boîte libre » pour
  la boîte de rab au-delà de la liste — sans quoi la gén. 9 affichait « 1026 à 1025 ».
- `genDe()` et `genDuNumero()` continuent de porter sur `GENS` seul : ils associent une
  **espèce** à sa génération, ce qui n'a rien à voir avec l'onglet affiché.

## Contenu des boîtes : liste ordonnée

- Une génération n'est **plus** un calcul depuis le numéro du Pokédex : c'est une
  **liste ordonnée de clés** (`genList(gen)`). Tant qu'elle n'a pas été modifiée, la
  liste par défaut est `range(g.from, g.to)` et **rien n'est stocké**. À la première
  modification, `editList()` la matérialise et `pcbox.order` la garde en entier.
- `insertAt` / `moveTo` / `removeAt` travaillent sur le **rang absolu** dans cette
  liste, pas sur la case dans la boîte : une insertion décale donc tout ce qui suit,
  y compris dans les boîtes suivantes. C'est le comportement attendu.
- N'importe quelle clé peut aller dans n'importe quelle génération : le sélecteur
  propose les 1025 espèces et les 582 formes, sans filtre.
- La rangée de pastilles porte un **« − »** à gauche et un **« + »** à droite, de même
  gabarit pour que les pastilles restent centrées. Le « + » ajoute 30 cases vides à la
  fin (`ajouteBoite`) ; le « − » retire les 30 rangs de la boîte affichée
  (`supprimeBoite`), ce qui **remonte tout ce qui suit d'une boîte**.
- `supprimeBoite` refuse la dernière boîte — le bouton est alors `disabled` — et
  **demande confirmation** dès que la boîte contient un Pokémon. Une boîte vide part
  sans un mot ; une boîte pleine, jamais en silence.
- Sur un fond de boîte, les deux boutons restent **opaques et clairs** (`.dot-btn`) :
  la rangée tombe tantôt sous le calque du fond, tantôt sur le panneau blanc selon le
  calage de la génération, et un bouton blanc translucide y devenait invisible.
- Le nombre de boîtes vaut `ceil((longueur + 1) / 30)` : la boîte de rab garantit
  qu'on peut toujours ajouter, même quand la dernière est pleine.
- La progression porte sur la liste entière (`pris / total`), donc un ajout augmente
  le dénominateur. C'est voulu : la liste **est** la collection.
- Le sous-titre affiche la plage du Pokédex tant que l'ordre est celui d'origine, et
  bascule sur le rang (« 91–120 sur 158 ») dès qu'il est personnalisé — sans quoi il
  annoncerait des numéros faux.
- `resetOrder(gen)` rétablit l'ordre du Pokédex ; le bouton vit dans le panneau de la
  boîte et n'apparaît que si la génération a été réarrangée.
- L'ancien format (Pokémon rangés par boîte sous `add`) est **migré au chargement**
  vers la liste, une fois pour toutes. Ne pas retirer `migreAdd` avant un moment.

## Déplacer : glisser-déposer

- **Appui long (450 ms) puis glissement**, dans **tous** les modes. La case saisie
  **brille** (`.tenu` : halo rouge + léger agrandissement) et le téléphone vibre.
  Pendant le glissement, la case d'origine s'efface (`.glisse`) et un fantôme
  (`.drag-ghost`) suit le doigt. Au relâchement, les deux Pokémon **échangent** leur
  place (`swapOrMove`) ; une case libre au-delà de la liste renvoie le Pokémon à la fin.
- Le fantôme est en `pointer-events: none`, sans quoi `elementFromPoint` ne verrait
  que lui et jamais la case visée.
- **L'appui long n'ouvre PAS la fiche** — c'était le cas avant, ça a été retiré : il
  est réservé au déplacement. La fiche s'ouvre par un tap en mode « voir la fiche »,
  ou au clic droit. Seule exception, le mode Ranger : relâcher sans avoir bougé y
  ouvre le sélecteur d'insertion, qui n'a pas d'autre point d'entrée.
- Le relâchement pose un bloqueur de clic `{ once: true, capture: true }` sur la case :
  sans lui, le `click` qui suit tout `pointerup` capturerait le Pokémon. Ne pas le
  retirer.
- Avant l'armement des 450 ms, **tout mouvement annule** : sans ça, un swipe de boîte
  démarrerait un déplacement.
- Le swipe horizontal et `touchstart` se taisent tant que `press.dragging` est vrai,
  sinon la boîte défilerait sous le Pokémon en cours de déplacement.
- `state.held` (mode Ranger, toucher-puis-destination) reste utile pour déplacer d'une
  **boîte à l'autre**, ce que le glissement ne permet pas — on ne peut pas faire défiler
  en tenant un Pokémon. Ne pas retirer ce chemin.

### iPhone : aperçu natif au appui long

- Sur iPhone, un appui long sur une image ouvre l’aperçu de Safari et son menu de
  partage. Safari capte ce geste **avant** notre code : sans contre-mesure, le
  glisser-déposer est inutilisable sur iPhone alors qu’il marche sur PC.
- Neutralisé en CSS sur `.box`, ses descendants et toutes les `img` :
  `-webkit-touch-callout: none`, `user-select: none`, `-webkit-user-drag: none`.
  Ne pas retirer ces règles sans retester sur un vrai iPhone.
- L’événement `contextmenu` ne se déclenche pas sur iOS pour ce geste : le traiter en
  JavaScript ne suffirait pas, la parade est bien côté CSS.

### Retour haptique

- `retourHaptique()` tente **@capacitor/haptics** puis `navigator.vibrate`.
- **iOS Safari n'implémente pas `navigator.vibrate`** : sur iPhone, la vibration
  n'arrivera qu'une fois l'app empaquetée avec Capacitor et le plugin
  `@capacitor/haptics` installé. Rien à corriger côté code, c'est une limite du
  navigateur. À vérifier au moment du `npx cap add ios`.

## Barre du bas

- Pastilles plutôt que liens soulignés : un bouton principal rouge (**+ Ajouter un
  Pokémon**), un **rail à trois positions** pour l'effet du tap (Capturer / Fiche /
  Ranger), une bascule **Normal / Chromatique**, et export/import en retrait.
- Le mode se choisit **directement** (`mode-set`), il ne cycle plus : trois clics pour
  revenir en arrière, c'était pénible.
- `.fin` (export/import) est placé juste après le bouton principal et porte
  `order: 1` : sinon il occupait une troisième ligne à lui seul sous 380 px. Ses
  libellés disparaissent alors, les glyphes suffisent.

## Boîtes : ajouter, déplacer

- Une case peut valoir **`null`** : c'est un emplacement vide voulu, ce qui permet
  d'avoir des boîtes entières libres. `renderSlot` le traite comme `undefined`.
- **La progression ignore les `null`**, au numérateur comme au dénominateur : ajouter
  une boîte vide ne doit pas gonfler le total.
- Le **« + »** au bout des pastilles ajoute une boîte (`ajouteBoite`) : la liste est
  d'abord **calée sur un multiple de 30** (`padBoites`), puis 30 `null` sont ajoutés.
- `boxCount` ne réserve **plus** de boîte de rab automatique : elle faisait double
  emploi avec le « + » et en ajoutait deux d'un coup. `render()` appelle désormais
  `boxCount` au lieu de recalculer — la duplication avait masqué la correction.
- **Appui long sur le nom de la boîte** puis glissement sur une pastille : la boîte
  entière change de place (`bougeBoite`, tranches de 30). Les pastilles servent de
  destinations, elles disent déjà où l'on est et combien il y a de boîtes.

## Changer de boîte en plein glissement

- S'attarder `BORD_MS` (550 ms) sur les `BORD_PX` (46 px) du bord gauche ou droit
  bascule vers la boîte voisine **sans lâcher** le Pokémon. Un dégradé rouge signale
  le bord armé.
- **Les écouteurs `pointermove`/`pointerup` sont sur `window`, pas sur `app`** :
  la bascule appelle `render()`, qui détruit la case tenue ; des écouteurs posés sur
  `app` ne verraient plus rien remonter depuis un nœud détaché, et le dépôt serait
  perdu. Ne pas les redescendre sur `app`.
- `veilleBord` réapplique sa classe à chaque mouvement, même sans changement de bord :
  un rendu intermédiaire remplace le panneau et l'effacerait.

## Mode Ranger

- Le bouton de mode cycle sur trois états : **capturer → voir la fiche → ranger**.
- En mode Ranger : toucher un Pokémon le saisit (`state.held`, classe `.tenu`), toucher
  une destination l'y déplace. Appui long sans bouger = insérer **à cet endroit**. La
  croix retire.
- `state.held` est un **rang**, pas une clé : deux exemplaires du même Pokémon dans une
  boîte doivent rester distinguables.
- Hors mode Ranger, une case libre ouvre le sélecteur et **ajoute à la fin**.

## Placer n'importe quel Pokémon n'importe où

- Bouton **« + Ajouter un Pokémon »** dans la barre du bas : il ouvre le sélecteur
  sans emplacement (`openAddSheet(null)`), puis `state.placing` retient le choix et
  la case suivante touchée décide du rang.
- Ce placement **prime sur le mode** : il est testé avant capture, fiche et Ranger.
  Toutes les cases passent en pointillés rouges pour le montrer.
- Il **survit au changement de boîte et de génération** : on peut donc poser un
  Pokémon de Kanto dans les boîtes d'Unys. C'est le seul chemin qui ne dépend pas de
  la boîte affichée au moment du choix.
- Le sélecteur est **classé par génération puis par numéro du Pokédex**, chaque
  espèce immédiatement suivie de ses formes (Vivaldaim, ses quatre saisons, Haydaim…).
  Une rangée d'onglets filtre la génération ; par défaut celle de la boîte affichée.
- **La recherche ignore ce filtre** et balaie les neuf générations : on cherche
  justement ce qu'on ne sait pas situer. Le numéro est indexé, « 448 » trouve Lucario.
- Sans recherche, la génération est affichée **en entier** (jusqu'à 261 entrées pour
  Kanto) : le plafond de 80 ne s'applique qu'aux résultats de recherche. Les images
  sont en `loading="lazy"`, seules les visibles se chargent.
- Trois chemins d'ajout coexistent, volontairement — le premier étant le seul
  évident : ce bouton, la case libre en fin de génération (ajout à la fin), et l'appui
  long sans mouvement en mode Ranger (insertion à cet endroit précis).

## Ranger les formes depuis la fiche

- Chaque forme porte un bouton **+ / ✓** qui la range dans la boîte ou l'en retire, et
  un bouton « Ajouter les N formes » range les manquantes d'un coup.
- `rangeForme()` insère la forme **juste derrière son espèce**, et derrière les formes
  de la même espèce déjà présentes. On obtient donc Vivaldaim, ses quatre saisons dans
  l'ordre, puis Haydaim et la suite — sans toucher au reste de la liste.
- La génération visée est celle de l'espèce (`genDe`), pas celle affichée : ranger une
  forme depuis n'importe où la met au bon endroit.
- Si l'espèce a été retirée de sa liste, la forme est ajoutée en fin plutôt que perdue.
- `dansUneBoite()` ne balaie que `state.order` : une forme n'est jamais dans une liste
  par défaut, qui ne contient que des numéros du Pokédex.

## Vue chromatique (shiny dex)

- `state.view` vaut `normal` ou `shiny`, persisté sous `pcbox.view`.
- Deux collections **séparées** : `pcbox.caught` et `pcbox.caught.shiny`. `caughtSet()`
  donne l'active, `isCaught()` interroge celle-là. Ne jamais lire `state.caught`
  directement dans le rendu, sinon le shiny dex afficherait les captures normales.
- Les sprites chromatiques existent aussi pour les formes cosmétiques
  (`shiny/585-winter.png`, vérifié).
- Basculer la vue aligne aussi `state.shiny` (affichage de la fiche).
- L'export contient `caught`, `caughtShiny`, `boxes` et `order`. Le repli sur les
  anciens exports (tableau nu d'IDs) reste en place.

## Interface

- 9 onglets de génération, boîtes de **30** en grille 6×5, comme le PC des jeux.
- La barre d'onglets est en `position: sticky; top: 0` — elle ne doit pas défiler.
- Gestes : tap = capturer, appui long 450 ms ou clic droit = fiche. Un bouton en bas
  inverse le comportement du tap. Swipe horizontal = boîte suivante/précédente.
- Le swipe est verrouillé sur un axe : au premier mouvement on décide `x` ou `y`, et en
  mode `x` on `preventDefault()` (listener `touchmove` non passif) pour supprimer toute
  dérive verticale. Ne pas remettre ce listener en `passive: true`.
- `navigate(dir)` enchaîne les boîtes puis **déborde sur la génération voisine** aux
  extrémités ; l'onglet actif est recentré via `scrollIntoView` après chaque rendu.
  `target(dir)` donne la destination sans l'appliquer — c'est lui qui dit s'il faut
  freiner le geste en bout de Pokédex.
- **Le fond de boîte glisse avec la grille** : `dragGrid` le translate à `× 0,85`
  (le calque est plus large, un déplacement identique le ferait paraître plus rapide)
  et `slide()` lui applique les mêmes sorties et entrées. `snapGrid` remet les deux
  à zéro ; seule la grille reprend son opacité, le calque n'en a pas au repos.
- Le passage d'une boîte à l'autre est animé : la grille suit le doigt (`dragGrid`),
  puis `slide()` prolonge la sortie (150 ms) et fait entrer la suivante (230 ms).
  Les flèches passent par le même chemin. `.box` est en `overflow: hidden` pour clipper.
- Dans `slide()`, la position de départ de la grille entrante est validée par un
  `void n.offsetWidth` et **non** par `requestAnimationFrame` : rAF ne se déclenche pas
  onglet en arrière-plan, la grille resterait invisible et `sliding` bloqué. Ne pas
  repasser en rAF.
- `sliding` ignore les gestes pendant les ~380 ms de l'animation ; un enchaînement très
  rapide de swipes perd donc les intermédiaires. Rendre l'animation interruptible si ça
  devient gênant.
- `.box` a `touch-action: none` — c'est volontaire, on gère les gestes nous-mêmes.
- Fermeture de la fiche par glissement vers le bas, au-delà de 110 px. Le geste n'est
  retenu que si le contenu est **déjà en haut** (ou si l'on part de la poignée) et que
  le mouvement est vertical descendant ; sinon `.sheet-body` défile normalement et on
  ne `preventDefault()` pas. Décidé une seule fois au premier mouvement, comme le swipe
  des boîtes. Pendant le glissement, la transition CSS est coupée puis rendue au CSS.
- Ouvrir un autre Pokémon remet la fiche en haut ; une bascule shiny/capture garde la
  position de défilement (`keepScroll` dans `openSheet`).
- Fiche en bottom sheet : portrait (couleur si capturé), bascule **forme chromatique**,
  bloc habitat/couleur/taille/poids/description, puis lieux de capture par jeu.

## Icône

- `public/icon.svg`, vectorielle, en 1024×1024. Trois signes disent « Pokédex » :
  la grande lentille bleue cerclée de blanc, les trois voyants, la bande du bas.
- **Carré plein, sans transparence ni coins arrondis** : iOS applique lui-même son
  masque. Une icône pré-arrondie donnerait des bords noirs.
- `icone.html` (racine, hors build) la montre à toutes les tailles réelles d'iOS,
  jusqu'à 29 px : c'est là qu'on juge si les voyants tiennent encore.
- Le `theme-color` de `index.html` suit l'icône (`#d6453c`), plus le bleu d'avant.
- **Les PNG ne sont pas encore générés.** Au moment du `npx cap add ios`, les produire
  depuis ce SVG avec `@capacitor/assets` — il sort toutes les déclinaisons d'un coup.
  D'ici là, pas de balise `apple-touch-icon` : elle pointerait dans le vide.

## Direction visuelle

Thème clair : papier `#f6f5f1`, panneaux blancs, filets beiges `#e3e0d6`.
Le rouge Poké Ball `#d6453c` est réservé aux marqueurs de capture, à la barre de
progression et au soulignement de l'onglet actif. Le reste reste neutre : **la couleur
vient des sprites**, pas du décor. Toutes les valeurs sont des variables dans `:root`.

## Personnalisation des boîtes

- Chaque boîte a un **nom** et un **fond**, réglés en tapant sur le titre de la boîte.
- Les fonds sont les **276 fonds officiels des jeux**, générations III à IX, tirés des
  archives Bulbagarden, dans `public/wallpapers/<id>.png` (6,1 Mo). Trop volumineux pour
  être inlinés : Vite les copie tels quels dans `dist/`, donc embarqués et hors ligne.
- Le fond vit dans une **couche dédiée** (`.box-paper`, positionnée en absolu dans
  `.box`), dont `calePaper()` pose position et taille **après rendu** : la taille des
  cases dépend de la largeur de l'écran.
- **Le calage se règle à la main dans `src/paper-align.js`**, pas dans le code de
  rendu. Une entrée par génération de fond, avec `{ x, y, w, h }` exprimés en
  **pourcentage de la grille des cases** — et non du panneau : c'est ce qui fige le
  calage même si les marges de la boîte changent plus tard.
  - `y` négatif = l'image remonte au-dessus de la grille, ce qui place sa bande
    d'en-tête derrière le nom de la boîte. Pour remonter un fond, **diminuer `y`**.
  - Clé `'gen:format'` quand une génération contient plusieurs mises en page (3 et 8).
    La recherche essaie `gen:format`, puis `gen`, puis `DEFAUT`.
  - Les valeurs de départ reprennent le calage automatique précédent, pour ne rien
    changer visuellement tant que personne n'y touche.
### Outil de calage

- `Calage-Fonds.bat` démarre le serveur si besoin et ouvre **deux fenêtres** côte à
  côte : l'appli à gauche, `calage.html` à droite. Il réutilise le serveur s'il tourne
  déjà, et retombe sur le navigateur par défaut si aucun Chromium n'est trouvé.
- Les deux pages dialoguent par **`BroadcastChannel('pcbox-calage')`** — même origine,
  donc aucun serveur intermédiaire. Messages : `hello` / `catalogue`, `apply`,
  `align`, `reset`, `courant`.
- Les valeurs poussées par l'outil vivent dans `REGLAGES` (une Map, **en mémoire**) et
  priment sur `ALIGNEMENT`. Rien n'est écrit dans `paper-align.js` : c'est le bouton
  « Copier la ligne » puis un collage manuel qui fige le réglage. Volontaire — le
  calage doit rester un choix explicite, versionné dans le fichier.
- Tout ce bloc est sous `import.meta.env.DEV` : **Vite le retire du build** (vérifié,
  zéro occurrence dans `dist/`). `calage.html` est à la racine et non dans `public/`,
  donc il n'est pas copié dans `dist/` non plus.
- Chaque axe a un **curseur ET un champ chiffré saisissable**. Le champ fait foi :
  on peut y taper une valeur **hors de la course du curseur**, qui se borne alors
  seulement pour l’affichage. Un champ vide ou en cours de saisie (« - ») n’envoie
  rien, pour ne pas pousser un 0 parasite à chaque frappe.
- Le pas des curseurs est de **0,1** : à 0,5 les valeurs du fichier étaient arrondies
  au chargement (`-4.9` devenait `-5`) et un simple copier-coller les aurait altérées.
- `calePaper()` appelle `window.__annoncerCalage()` après chaque rendu : l'outil suit
  donc aussi les changements faits depuis l'appli elle-même.

- `wallpapers.json` porte `size` (« 156x142 ») et la génération, qui servent de clés.
  Les champs `band` et `grid` y subsistent mais **ne sont plus lus** par le rendu.
- **Piège de nommage** : la couche s'appelle `.box-paper`, pas `.paper` — ce dernier
  désigne les BOUTONS du sélecteur de fond. Les deux ont déjà été confondus une fois,
  et le `position: absolute` de la couche sortait alors les 85 vignettes du flux : le
  panneau se réduisait à 256 px et le sélecteur paraissait vide.
- Les vignettes posent leur image via `background-image` et **non** le raccourci
  `background` : en ligne, ce raccourci remet `background-size`/`repeat` par défaut et
  l'emporte sur la feuille de style, l'image se répétant à sa taille naturelle.
- Le panneau fait ~351×375 (ratio **0,935**) et le fond est plaqué en `100% 100%`, donc
  toute image est étirée verticalement. Les 14 mises en page tiennent entre ×1,01 et
  ×1,42 — imperceptible sur une texture. **Vérifier ce facteur avant d'ajouter un fond
  d'un nouveau format** : au-delà de ×1,6 la déformation se voit.
- Les 21 fonds « Pokémon Box RS » sont recadrés (203×214) : les originaux font 420×196,
  avec le nom de boîte du jeu **incrusté** (« BOX 9 »), ses flèches et son curseur. Tels
  quels ils s'étiraient ×2,29 et leur texte se superposait au nôtre.
- Les URL sont **relatives sans `/` initial** (`wallpapers/x.png`), pour rester
  compatibles avec `base: './'` — sinon Capacitor ne les trouve pas sur l'iPhone. Et
  elles passent par `encodeURIComponent` : 30 noms de fichiers ont des accents.
- `src/data/wallpapers.json` est **généré** depuis les fichiers, indexé par numéro de
  génération. L'`id` est le nom de fichier et part en `localStorage` : le renommer
  casse les boîtes personnalisées. `paperCss()` ignore un id inconnu, donc retirer un
  fond ne casse pas une boîte enregistrée.
- Voir `reference/LISEZMOI.md` pour la provenance et la chaîne de traitement des
  images (réduction, recadrage des captures de menu). Le dossier `reference/` est hors
  build et hors versionnage.
- **Les gén. I et II n'ont aucun fond** : les boîtes y étaient unies. Le sélecteur
  l'explique au lieu d'afficher une liste vide. Les fonds arrivent en gén. III.
- Le sélecteur va en deux temps : génération, puis fonds de cette génération. Il
  s'ouvre sur la génération du fond **déjà posé** (`PAPER_GEN`), sinon sur celle de la
  boîte, en remontant à la III — sans ça le fond courant n'apparaîtrait pas
  sélectionné, ou on ouvrirait sur une génération vide.
- Plusieurs fonds partagent le même nom d'une génération à l'autre (« Forêt » existe
  en III, IV, V…) : la vignette affiche donc aussi le jeu d'origine.
- Le nom passe par `esc()` avant `innerHTML`. La frappe met à jour le titre par
  `nodeValue` sans reconstruire le panneau, sinon le champ perdrait le focus.
- `.bs-name` est en `font-size: 16px` : en dessous, iOS zoome tout seul à la saisie.
- `setBox()` supprime les valeurs vides et la clé devenue vide : le défaut doit rester
  le défaut, et `pcbox.boxes` ne doit pas se remplir d'entrées inertes.

## Conventions

- Interface et commentaires **en français**.
- Progression stockée dans `localStorage` sous `pcbox.caught` (tableau d'IDs) et
  `pcbox.boxes` (réglages par boîte, clé « génération:boîte »).
  Export/import JSON prévus pour survivre aux réinstallations tous les 7 jours.
- L'export est un objet `{ caught, boxes }`. Les anciens exports étaient un tableau nu
  d'IDs : l'import accepte **les deux**, ne pas retirer ce repli.
- Marges de sécurité iOS via `env(safe-area-inset-*)` : à conserver sur la barre du haut
  et le bas de page.
- Respecter `prefers-reduced-motion` (déjà en place en fin de feuille de style).

## Reste à faire

1. ~~Lancer `npm run fetch-data` en entier (1 → 1025).~~ **Fait** : 1025 entrées,
   846 avec rencontres, 386 avec habitat (limite gén. 1–3), 898 avec description.
   Le JSON pèse ~4,9 Mo, le bundle ~4,3 Mo (355 kB gzip).
2. ~~Rapatrier les sprites en local dans `public/`.~~ **Fait** : 5 291 fichiers, 40 Mo,
   artworks recompressés en WebP. L'appli est autonome hors ligne, `dist/` pèse 62 Mo.
3. `npx cap add ios`, puis workflow GitHub Actions produisant un IPA non signé.
   Générer les PNG de l'icône : `npx @capacitor/assets generate` depuis `public/icon.svg`.
   Installer aussi `@capacitor/haptics` : sans lui, pas de vibration sur iPhone.
4. Installer via Sideloadly.
