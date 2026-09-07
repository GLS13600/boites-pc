# Guiguidex — Living Dex personnel

Le nom affiché sur l'écran d'accueil est **Guiguidex**. Il vit à trois endroits, à
tenir synchronisés : `CFBundleDisplayName` dans `ios/App/App/Info.plist` — c'est
celui-là qui compte pour l'iPhone —, `appName` dans `capacitor.config.json` pour un
futur `cap add ios`, et le `<title>` plus la balise `apple-mobile-web-app-title`
d'`index.html` pour le navigateur et l'ajout à l'écran d'accueil depuis Safari.
`CFBundleName` reste à `$(PRODUCT_NAME)`, soit « App » : c'est un nom interne, jamais
affiché.

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
| `src/data/moves.json` | Les 731 attaques citées, **généré** |
| `src/data/learnsets.json` | Moveset de chaque espèce, **généré** |
| `scripts/fetch-moves.mjs` | Aspire attaques et movesets (`npm run fetch-moves`) |
| `src/data/stats.json` | Stats de base des 1025 espèces, **généré** |
| `src/data/versions.json` | Les 21 jeux jouables, **généré** |
| `src/data/learnsets-vg.json` | Moveset par espèce ET par jeu, **généré**, 5,7 Mo |
| `scripts/fetch-battle.mjs` | Produit les trois ci-dessus (`npm run fetch-battle`) |
| `src/data/typechart.json` | Table des types par génération, **généré** |
| `scripts/fetch-types.mjs` | Aspire table et symboles (`npm run fetch-types`) |
| `src/data/abilities.json` | 374 talents + ceux de chaque espèce, **généré** |
| `src/data/items.json` | 292 objets tenables en combat, **généré** |
| `public/items/` | Leurs sprites réels, **générés**, 73 Ko |
| `scripts/fetch-extras.mjs` | Produit les trois ci-dessus (`npm run fetch-extras`) |
| `public/types/` | Les 18 symboles de type, **générés**, 22 Ko |
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
- Fiche : artwork officiel **toujours en couleur**, capturé ou non, normal comme
  chromatique. Le gris reste le signal d'état de la **grille** seule ; sur la fiche,
  le bouton de capture dit déjà où l'on en est, et on vient y regarder la bête.
  La classe `.portrait.locked` a été retirée, ne pas la réintroduire.
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

## Attaques

- `npm run fetch-moves` produit `moves.json` (731 attaques : nom, type, catégorie,
  puissance, précision, PP, effet en français) et `learnsets.json` (1025 espèces).
  846 Ko à eux deux. Le script met en cache chaque étape dans `scripts/.cache/` :
  une reprise ne refait pas les 4 300 requêtes.
- **Un seul jeu par espèce.** Une espèce apprend un moveset différent dans chacun des
  25 « version groups » ; tout embarquer ferait des dizaines de Mo pour une information
  que personne ne lit. On garde le jeu le plus récent, et la fiche annonce lequel
  (« D'après Écarlate / Violet »), sans quoi on lirait des niveaux faux.
- **Piège** : le jeu le plus récent n'est pas toujours exploitable. 207 espèces
  tombaient sur « Champions », dont PokéAPI ne connaît les attaques que par la méthode
  `train` — les quatre catégories ressortaient vides et Dracaufeu s'affichait sans une
  seule attaque. On retient donc le jeu le plus récent **qui apprend au moins une
  attaque par niveau**, avec repli sur le plus récent tout court.
- **CT et CS ne se distinguent pas** dans `move_learn_method` : les deux valent
  `machine`. Il faut passer par `/machine`, qui donne l'objet réel (`tm39`, `hm01`) —
  c'est ce qui permet d'écrire « CT39 » plutôt qu'un vague « Machine ». Les CS ne
  subsistent que dans les jeux qui en ont encore (CS01 à CS08, côté DÉ/PS).
- Les attaques sont celles de l'**espèce**, pas de la forme : la fiche d'une forme
  emprunte déjà l'entrée de son espèce pour les types et les lieux de capture.
- Quatre groupes repliables, « Par niveau » seul ouvert : une espèce peut avoir
  soixante CT, les dérouler toutes noierait le reste de la fiche.
- Toucher une attaque déplie son effet. Le gestionnaire agit **sur le DOM**, il ne
  rappelle pas `openSheet()` : reconstruire la fiche refermerait les groupes et
  perdrait la position de défilement au milieu d'une liste de soixante attaques.
- Niveau 0 = attaque connue d'entrée de jeu, affichée « Dép. ». Une attaque de statut
  n'a ni puissance ni précision : « — » plutôt qu'un 0 faux.

## Vue Pokédex

Troisième vue, **entre les boîtes et le combat** dans la barre du bas (`.nav`, trois
onglets). `render()` y bascule comme pour le combat.

- Elle liste les **ESPÈCES** d'une génération, sans leurs formes : c'est le Pokédex
  national, où Méga-Dracaufeu n'a pas d'entrée propre. Les formes restent dans la
  fiche, qui les liste déjà et permet de les ranger en boîte.
- **Trois par ligne**, sprite de 68 px : sur 375 px chaque case fait ~111 px, de quoi
  loger le numéro et le nom sans troncature.
- Neuf onglets de génération seulement — un remake n'a pas d'entrée au Pokédex
  national. Le choix est persisté sous `pcbox.dexgen`.
- **Taux de remplissage** par génération et au total, calculé sur la collection
  ACTIVE (`isCaught`) : il suit donc la bascule normal / chromatique des boîtes.
- La fiche ouverte est exactement celle des boîtes (`openSheet`) : description,
  évolutions, formes, talents, attaques, lieux de capture.
- `voisinFiche()` connaît cette vue : le glissement horizontal parcourt le Pokédex
  dans l'ordre des numéros, et non le contenu d'une boîte.

## Boîte de combat

Seconde vue de l'application, atteinte par la **barre du bas** (`.nav`, deux onglets :
Boîtes et Combat). `render()` bascule dessus dès sa première ligne ; tout le reste de
la fonction ne concerne que la gestion des boîtes.

- L'équipe de six reprend l'**écran d'équipe de Noir 2 / Blanc 2** : panneaux en
  parallélogramme biseauté, épais liseré blanc, fond bleu nuit quadrillé, et colonne
  de droite décalée de 20 px vers le bas. Chaque panneau porte sprite, nom, jauge de
  PV, niveau et PV chiffrés.
- **Le liseré est un fond blanc sur `.eq` plus un `::before` en retrait de 3 px.**
  `clip-path` découpe aussi les bordures : une vraie `border` serait rognée par la
  découpe. Même raison pour la pastille d'alerte, qui doit rester dans la forme.
- La colonne de droite est le **miroir** de la gauche, biseau à gauche au lieu de
  droite, et `.equipe` réserve 32 px de marge basse pour absorber son décalage.
- Un emplacement libre ouvre le sélecteur d'espèces ; un emplacement rempli ouvre son
  détail (niveau, stats calculées, quatre attaques, retrait).
- **Capturé = couleur, non capturé = gris**, dans le sélecteur comme dans les cartes.
  C'est le même signal que la grille des boîtes, on ne l'invente pas ici.
- Persistance : `pcbox.vue`, `pcbox.jeu`, `pcbox.equipe`.

### Movesets par version

- `learnsets-vg.json` donne le moveset de chaque espèce **dans chaque jeu** : 10 050
  couples espèce×jeu, ~11 jeux par espèce, **5,7 Mo**. À ne pas confondre avec
  `learnsets.json` (713 Ko), qui n'en garde qu'un seul et sert à la fiche du Pokédex.
- **Il est chargé par `import()` À LA DEMANDE**, à la première ouverture de la vue.
  Vite en fait un chunk séparé : l'index reste à 5,2 Mo au lieu de 10,8 Mo, et le
  démarrage n'est pas ralenti. Le chunk vit dans `dist/`, donc toujours hors ligne.
  Ne pas repasser en import statique.
- 21 jeux retenus : on écarte les exclusivités japonaises (doublons de Rouge/Bleu),
  les spin-off GameCube, et tout groupe sans une seule attaque par niveau — les DLC
  et les jeux dont PokéAPI ignore encore les movesets ressortiraient vides.
- Changer de version **ne supprime pas** les attaques déjà choisies : celles qui ne
  s'apprennent pas dans le nouveau jeu sont gardées et marquées « indisponible ici »
  (`.atq.ko`). Les effacer en silence ferait perdre le travail d'un simple appui.
- Une espèce absente du jeu choisi garde sa place, avec une pastille d'alerte.
- Dans le sélecteur d'attaques, le tri porte sur le **seul groupe** : le tri de JS
  étant stable, l'ordre du fichier est conservé — donc par niveau croissant, et par
  numéro pour les CT. Trier par nom à l'intérieur d'un groupe affichait N.62 avant N.1.

### Talents et objets

- `npm run fetch-extras` produit `abilities.json` (91 Ko : les 374 talents avec leur
  description française, plus ceux de chaque espèce) et `items.json` (49 Ko).
- La **fiche du Pokédex** liste les talents de l'espèce, tous jeux confondus : elle
  décrit l'espèce, pas une partie. Le filtrage par version n'a lieu que dans la boîte
  de combat, où l'on compose pour un jeu précis.
- **Une forme a ses propres STATS DE BASE**, et l'écart est parfois énorme : Kyurem
  Blanc monte à 170 en Atq. Spé. et 100 en Déf. Spé. là où Kyurem plafonne à 130 et 90.
  `statsDe(key)` interroge la clé du membre avant son espèce ; sans lui, une valeur
  relevée en jeu sur une forme ressortait « hors plage » sans raison. 326 formes
  renseignées. Ne jamais lire `stats[...]` directement.
- **Une forme a ses PROPRES talents**, et `poolTalents()` interroge la clé du membre
  avant son espèce. Kyurem Blanc a Turbo Brasier là où Kyurem a Pression,
  Méga-Dracaufeu X a Griffe Dure là où Dracaufeu a Brasier. Sans ça ces talents
  étaient tout simplement inatteignables. Le repli sur l'espèce sert aux formes
  cosmétiques, qui n'ont pas d'entrée `/pokemon` propre. 315 formes renseignées.
- **Le chromatique est propre à chaque membre** de l'équipe (`m.shiny`), indépendant
  de la vue chromatique du Pokédex : on peut vouloir un seul shiny dans une équipe.
- Dans la boîte de combat, talent et objet sont **filtrés par génération** :
  les talents n'existent qu'à partir de la gén. 3, les talents cachés de la gén. 5,
  les objets tenus de la gén. 2. Un talent introduit après le jeu choisi n'est pas
  proposé. Vérifié : 0 gemme Méga en gén. 5, 44 en gén. 6, et 181 → 235 → 292 objets
  de la gén. 5 à la 9.
- **Piège : l'attribut `holdable` de PokéAPI est inexploitable.** Il rate toutes les
  gemmes Méga et les objets modernes (Veste de Combat, Casque Brut, Évoluroc) tout en
  incluant Poké Balls, potions et vitamines. On passe par les **catégories** d'objets,
  fiables et bien découpées (`mega-stones`, `held-items`, `choice`, `plates`…).
- Les objets **sans sprite sont écartés** : ce sont des gemmes Méga présentes dans les
  données des jeux mais jamais distribuées. 358 objets bruts, 292 conservés.
- L'objet tenu se pose au **coin bas-droit du sprite**, en `position: absolute` donc
  HORS DU FLUX. Sa boîte fait 22 px pour environ 15 px d'icône visible, soit la
  hauteur du « N.26 » : les sprites d'objets de PokéAPI portent une large marge
  transparente, si bien qu'une boîte calée sur la hauteur du texte donnerait une
  icône bien plus petite que lui. Dans le flux il faisait grandir le panneau : son gabarit dépassait celui du
  texte de la ligne du bas, et les cases changeaient de taille dès qu'on équipait un
  Pokémon. Vérifié : 59 px de haut avec objet comme sans.
- La règle du sprite est écrite `.eq > img:not(.eq-obj)`. Sans cette exclusion,
  `.eq img` — plus spécifique que `.eq-obj` — imposait 40 px à l'objet et lui collait
  un placement de grille qui déplaçait son ancrage absolu.
- La fiche de combat d'un membre montre ses **faiblesses et résistances** avec la même
  notation que l'analyse d'équipe (`×2`, `×4`, `÷2`, `0`), et suit elle aussi la
  génération du jeu. Les aides de rendu (`fmt`, `jetonsDe`, `badge`, `ligne`) vivent
  donc au niveau du module et non plus dans `renderAnalyse` : elles servent aux deux.
  `jetonsDe` reçoit une liste d'une seule valeur dans ce cas, et la rend telle quelle.
- **L'aide « Touchez un emplacement… » disparaît dès qu'un Pokémon est placé** : elle
  ne sert qu'à la première prise en main, ensuite c'est du bruit sous l'équipe.

### Une équipe par version

- `state.equipes` est un objet **indexé par clé de jeu**, et `equipe()` renvoie celle
  du jeu courant, créée à la volée. Changer de version change donc d'équipe.
- L'ancienne équipe unique (`pcbox.equipe`) est **migrée** au chargement vers la clé
  du jeu courant. Ne pas retirer cette migration avant un moment.
- Ne jamais lire `state.equipes` directement dans le rendu : passer par `equipe()`,
  sinon on afficherait l'équipe d'un autre jeu.
- **Export et import propres aux équipes**, dans le bandeau entre la version et le
  compteur. Distincts de ceux des boîtes : on peut vouloir transmettre une composition
  sans donner tout son Living Dex, et inversement. Le fichier porte TOUTES les équipes,
  une par version.
- **L'import fusionne**, il ne remplace pas tout : il écrase les équipes des versions
  présentes dans le fichier et laisse les autres intactes. Importer une seule équipe ne
  doit pas effacer les onze autres.
- Le contenu venant d'un fichier, il est **repris case par case** : une clé de jeu
  inconnue est ignorée, et toute case qui ne ressemble pas à un membre devient `null`.
  Vérifié avec une charge volontairement abîmée.

### Analyse de l'équipe

Sous la grille des six, trois lectures et une liste de conseils.

- **Défense** : pour chacun des 18 types attaquants, le multiplicateur subi par
  **chaque** membre — `×4 ×2 ×2 0` se lit d'un coup d'œil là où un « 3 faibles »
  cachait l'essentiel. Les valeurs neutres sont omises, sinon la grille doublerait de
  hauteur. Trié par danger décroissant ; trois membres faibles ou plus surlignent la
  ligne.
- **Attaque** : le meilleur multiplicateur atteignable sur chaque type défenseur,
  d'après les attaques **réellement choisies** et non ce que l'espèce pourrait
  apprendre. Un membre sans attaque offensive est signalé, sans quoi on lirait une
  couverture flatteuse et fausse.
- Les deux grilles partagent le même gabarit, sur deux colonnes, et **le sens des
  couleurs s'inverse** : en défense un `×2` est rouge, en attaque il est vert.
- **Les multiplicateurs de même nature sont multipliés entre eux** : deux membres
  faibles ×2 donnent un seul jeton `×4`, jamais « ×2 ×2 ». Une ligne se lit d'un
  coup, et `×16` dit immédiatement qu'un type ravage l'équipe. Les valeurs grimpent
  vite (`÷32` pour cinq résistances) : c'est la conséquence assumée de la règle.
- **Les immunités échappent à ce calcul** : un produit contenant 0 vaudrait 0 et
  effacerait les faiblesses. Elles gardent leur propre jeton `0`, avec le nombre de
  membres concernés en exposant.
- Une ligne qui n'a plus rien à montrer disparaît entièrement.
- Chaque type est représenté par son **symbole rond** (`public/types/<type>.svg`).
- **Rôles** : Mur, Tank offensif, Sweeper, Casseur lent, Attaquant ou Polyvalent,
  déduits des stats de base, avec l'orientation physique / spéciale / mixte. Le plus
  solide de l'équipe est nommé explicitement.
- **Conseils** : uniquement des constats actionnables. Deux familles.
  - D'après les **types et les stats de base**, donc ce qu'un Pokémon *est* :
    faiblesse partagée, type sans aucune parade, équipe mono-orientée, aucun
    encaisseur, personne de rapide, types en double.
  - D'après les **attaques réellement choisies**, donc ce qu'on lui a mis en main —
    c'est là que se logent les erreurs les plus coûteuses et les plus faciles à
    corriger : attaquer dans sa mauvaise catégorie (alerte), aucune attaque de son
    propre type donc pas de STAB, toutes ses attaques du même type, aucune attaque de
    statut dans l'équipe entière, moveset incomplet.
  - Aucun défaut détecté est un résultat valide, et il est affiché comme tel.

**Seuils des rôles, calés sur des cas réels.** `encaisse` = PV + Déf + Déf.Spé.
Mur à partir de 270 avec une frappe sous 100, Tank offensif à partir de 260. À 300,
le test ne reconnaissait quasiment que Leuphorie : Airmure et Magnézone plafonnent à
275 et sont pourtant les murs de leur équipe, si bien que l'appli annonçait « aucun
encaisseur » juste après avoir désigné Magnézone comme le plus solide. Ce sont des
heuristiques : elles situent un Pokémon, elles ne tranchent pas à la place du joueur.

### Table des types

- `npm run fetch-types` produit `typechart.json` : **9 générations × 18 × 18**, 32 Ko.
- **Une table par génération, c'est indispensable** puisque l'appli laisse choisir
  Rouge/Bleu. La table a changé deux fois lourdement : en gén. 1 le Spectre ne touchait
  pas le Psy et l'Insecte battait le Poison ; en gén. 6 la Fée apparaît et l'Acier
  cesse de résister au Spectre et aux Ténèbres. Afficher la table actuelle pour une
  partie de gén. 1 donnerait des faiblesses fausses.
- PokéAPI expose `past_damage_relations` : chaque entrée vaut « jusqu'à cette
  génération incluse ». Le script reconstruit une matrice complète par génération.
- Le script **vérifie six faits connus avant d'écrire** et s'interrompt si l'un
  échoue. Sans ce garde-fou, une erreur de lecture des relations passées produirait
  une table plausible mais fausse, impossible à repérer à l'œil.
### Symboles des types

- `public/types/<type>.svg`, 18 fichiers, 22 Ko. Source :
  **github.com/partywhale/pokemon-type-icons, licence MIT** — `LICENCE.txt` est
  embarqué à côté, l'avis de copyright doit être conservé.
- **Ne pas se rabattre sur `sprites/types/` du dépôt PokeAPI** : ce dossier ne
  contient que des bandeaux 200×40 portant le nom du type écrit **en anglais**,
  inutilisables comme pictogrammes.
- **Les symboles d'énergie du JCC ne conviennent pas** : ils ne couvrent qu'une
  dizaine de catégories et fusionnent plusieurs types du jeu vidéo (Vol avec Normal,
  Sol et Roche avec Combat…). Il n'en existe pas 18, la correspondance est impossible.
- Les SVG portent déjà leur couleur : rien à teinter, on les affiche tels quels.
  Chemin relatif **sans `/` initial**, comme les sprites et les fonds.

- **Limite connue** : les types actuels sont utilisés quelle que soit la version. Les
  espèces retypées en gén. 6 (Mélofée devenue Fée) s'afficheront donc avec leur type
  moderne dans une partie de gén. 1. PokéAPI publie `past_types`, non exploité ici.

### Stats

- Formules officielles à **IV 31, EV 0, nature neutre** par défaut : les valeurs d'un
  planificateur, sans imposer un dressage précis.
- **Chaque stat est saisissable** : on y recopie la valeur lue en jeu, et l'appli en
  **déduit l'IV** (`ivPossibles`, force brute sur 0–31). Vide, le champ retombe sur la
  valeur calculée, affichée en gris comme repère. Les PV du panneau suivent la saisie.
- **La réponse est une PLAGE, jamais un chiffre seul.** L'arrondi de la formule fait
  que plusieurs IV donnent la même valeur affichée : à N.32, 96 PV sur Magnézone
  correspond à IV 29–31. À N.100 la réponse devient unique.
- **La nature et les EV se renseignent**, et le calcul en tient compte : sans eux, une
  stat relevée en jeu tombait presque toujours « hors plage ». Une nature déplace la
  valeur de ±10 %, ce qui suffit à faire sortir de la fourchette des IV — vérifié, 56
  en Vitesse sur Gueriaigle N.26 donne « hors plage » en nature Hardi et `IV 17–20`
  en Jovial, le maximum atteignable passant de 54 à 59.
- Les natures viennent de `natures.json` (25, dont 5 neutres qui augmentent et
  diminuent la même stat). Le nom de la stat modifiée porte un `+` ou un `−`.
- « **hors plage** » signifie qu'aucun IV de 0 à 31 ne convient avec la nature et les
  EV renseignés. Ce n'est pas une erreur : c'est le signe qu'il manque des EV, ou que
  la nature choisie n'est pas la bonne.
- Les PV ignorent la nature — seule règle particulière de la formule.
- La saisie agit **sur le DOM**, elle ne rappelle pas `renderBattleSheet()` : le champ
  perdrait le focus à chaque frappe, comme le nom de boîte.
- Munja (`292`) est le cas particulier : 1 PV quel que soit le niveau.
- **Les stats de base ne changent pas avec la version choisie** : PokéAPI ne publie
  pas leur historique, alors que plusieurs espèces ont été rééquilibrées en gén. 6.
  Le panneau des versions le dit explicitement. Même limite pour la puissance et la
  précision des attaques, données dans leurs valeurs actuelles.

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
### Porter une boîte

- **Appui long sur le nom de la boîte** : on la « porte » (`.tenu` sur le titre,
  `.porte` sur la boîte). Deux façons de la déplacer ensuite, sans jamais relâcher :
  - **glisser vers la gauche ou la droite** : chaque `PAS_BOITE` (70 px) parcourus la
    font avancer d'un cran, et l'affichage la suit — on garde la boîte sous les yeux ;
  - **appuyer sur une flèche avec un SECOND doigt** : un cran par appui.
- Relâcher sans avoir rien déplacé ouvre le panneau de la boîte, comme avant.
- **Le pointeur qui tient le nom est le seul à terminer le geste** (`boxPress.id`
  comparé à `e.pointerId`). Sans ce filtre, lever le second doigt après avoir touché
  une flèche lâchait la boîte dès le premier appui, et le geste à deux doigts était
  inutilisable. Même filtre sur `pointermove` et `pointercancel`.
- `render()` détruit le titre tenu à chaque cran : `marqueTenue()` reprend le nouveau
  et lui rend ses classes, sinon la boîte cesserait visuellement d'être portée.
- Les écouteurs sont sur `window`, comme pour les Pokémon : après un `render()`, un
  écouteur posé sur `app` ne verrait plus rien remonter depuis un nœud détaché.
- **Les pastilles ne sont plus des cibles de dépôt.** L'ancienne version demandait de
  lâcher la boîte sur l'une d'elles : 6 px (12 px une fois armées), sous toute la
  grille — viser au doigt était irréaliste, et c'est ce qui rendait la fonction
  inutilisable. Elles restent un indicateur de position, grossies pendant le geste.
- **`bougeBoite(gen, de, vers)` : `vers` est la position FINALE**, une fois la boîte
  retirée de la liste — pas un point d'insertion dans la numérotation d'origine.
  L'ancienne version corrigeait `vers - 1` en allant vers la droite, ce qui rendait
  tout déplacement d'un cran vers la droite parfaitement inopérant (0 → 1 laissait
  ABCD inchangé) et faisait atterrir 0 → 3 en position 2. Ne pas réintroduire ce
  décalage.

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
- **Tout panneau réserve la hauteur de la barre du bas** (`--nav-h`, 59 px) dans le
  `padding-bottom` de `.sheet-body`. Cette barre est `position: fixed` avec un
  `z-index` supérieur aux panneaux : sans cette réserve elle recouvre leurs derniers
  59 px. Le bouton « Retirer de l'équipe » finissait dessous et, le contenu tenant
  dans la hauteur, aucun défilement ne pouvait aller le chercher — il était
  simplement inaccessible. La même variable sert au `padding-bottom` du `body`.
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
- **Glissement horizontal = fiche voisine** (`navFiche`), au-delà de 60 px. Les
  voisins sont les Pokémon de la **boîte affichée**, cases vides exclues : une fiche
  ouverte depuis une chaîne d'évolution peut ne pas s'y trouver, le geste ne fait
  alors rien plutôt que de sauter n'importe où. Sans voisin de ce côté, le contenu ne
  suit qu'au tiers — le geste répond, mais on sent qu'il n'ira nulle part.
- Ce glissement porte sur **`.sheet-body`, jamais sur `.sheet`** : ce dernier réserve
  son `transform` au `translateY` d'ouverture, et un `translateX` l'écraserait — le
  panneau resterait collé en bas de l'écran. `.sheet` est donc en `overflow: hidden`
  pour clipper le contenu qui glisse.
- Comme pour les boîtes, l'entrée passe par un `void offsetWidth` et **non** par
  `requestAnimationFrame`, qui ne se déclenche pas onglet en arrière-plan.
- Les trois gestes se décident **au premier mouvement**, une fois pour toutes :
  vertical vers le bas depuis le haut du contenu = fermeture, horizontal = fiche
  voisine, tout le reste = défilement normal. Ne pas rendre cette décision continue.
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
- **Choisir un fond referme le panneau** : le choix est fait, et rester ouvert cachait
  justement la boîte dont on venait de changer le fond.
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
