# Guiguidex

Suivi de **Living Dex** personnel, présenté comme les boîtes PC des jeux Pokémon.
Application web sans framework, entièrement hors ligne, utilisable dans un navigateur
ou installée sur iPhone.

**→ [Ouvrir l'application](https://gls13600.github.io/boites-pc/)**

Sur iPhone, ouvrir ce lien dans Safari puis *Partager → Sur l'écran d'accueil* : elle
s'installe comme une vraie application, en plein écran et sans expiration.

---

## Ce qu'elle fait

### Accueil

Une planche de tuiles, une par page : **Pokédex**, **Attaques**, **Boîtes**,
**Équipes**, **Scan** et **Réglages**. Il n'y a pas de barre de navigation : tout part
d'ici, et une barre « ‹ Accueil » ramène au point de départ.

### Boîtes

Les 1025 espèces et leurs 678 formes, rangées en boîtes de 30 comme dans les jeux.

- Un tap capture, un appui long ouvre la fiche — le comportement du tap se règle en bas.
- Le contenu de chaque boîte se réorganise librement : appui long puis glissement pour
  déplacer un Pokémon, n'importe quelle espèce ou forme peut aller n'importe où.
- Une boîte se renomme et reçoit l'un des **236 fonds officiels** des jeux, générations
  III à VIII.
- Deux collections distinctes : Pokédex normal et **Pokédex chromatique**.
- Export et import JSON de la progression.

### Pokédex

Un menu par région, puis les espèces trois par ligne, avec le **taux de remplissage**
calculé d'après tes boîtes. La fiche donne la description, les statistiques de base, la
famille d'évolution, les formes et leur mode d'obtention, les talents, les attaques, les
lieux de capture — et un bouton pour écouter le **cri** du Pokémon.

### Scan

L'appareil photo arrière filme, et un réseau de neurones reconnaît le Pokémon : écran,
impression, carte réelle ou figurine. **Tout le calcul se fait sur l'appareil**, sans
réseau ni API. La page est dessinée comme un Pokédex de Kalos qui s'ouvre.

- **Auto** : chaque Pokémon à l'écran reçoit son cadre, qui le suit et porte son nom ;
  le toucher ouvre sa fiche.
- **Manuel** : on place le cadre de visée et on appuie sur la Poké Ball.
- **IA** (bonus, en essai) : un classifieur plus gros et un suivi plus poussé — jusqu'à
  12 Pokémon suivis, reconnaissance cumulée sur plusieurs vues, cadres lissés.
- **La fiche ouverte depuis le scan est lue à voix haute**, façon Pokédex de l'anime :
  nom, catégorie, types et description, par une voix enregistrée à l'avance et
  embarquée dans l'application.

### Attaques

Les attaques de chaque génération — 164 en gén. 1, 679 en gén. 9 — avec leurs valeurs
**de la génération choisie** et ce qui a changé depuis. Recherche, filtres par type et
catégorie, tri, puis pour chaque attaque la liste des Pokémon qui l'apprennent, par
niveau, par CT/CS, par œuf ou par maître.

### Équipes

Une équipe de six, présentée comme l'écran d'équipe de *Noir 2 / Blanc 2*.

- **Une équipe par version de jeu**, parmi les 21 jeux jouables.
- Attaques, talents et objets tenus **suivent la version choisie** — et la forme :
  Kyurem Blanc n'apprend pas les mêmes attaques que Kyurem.
- Statistiques calculées par les formules officielles ; en y recopiant les valeurs
  lues en jeu, l'application **déduit les IV**, nature et EV compris.
- Analyse de l'équipe : faiblesses et résistances cumulées, couverture offensive
  d'après les attaques réellement choisies, rôles, et des conseils actionnables.
- Table des types complète, par génération.

### Réglages

**Thème clair, sombre, ou celui du téléphone.** La page est faite pour accueillir
d'autres réglages par la suite.

---

## Installation

Deux voies, à partir du même code. La procédure détaillée est dans
[PUBLIER.md](PUBLIER.md).

| | Site web | IPA sideloadé |
|---|---|---|
| Installation | Safari → écran d'accueil | Sideloadly ou SideStore + Apple ID |
| Expiration | aucune | 7 jours, à re-signer |
| Mise à jour | au rechargement | nouvelle compilation |
| Hors ligne | oui, service worker | oui, tout est embarqué |

Le site est le chemin simple. L'IPA existe pour avoir une vraie application native ;
les deux sont compilés à chaque poussée sur `main` par GitHub Actions, et **SideStore**
propose la mise à jour sans câble en interrogeant
`https://gls13600.github.io/boites-pc/source.json`.

Tout étant embarqué — sprites, artworks, fonds, cris, voix et modèles de scan —
l'application est volumineuse : `public/` pèse à lui seul 328 Mo, dont 147 pour le
classifieur du mode IA.

---

## Développement

```bash
npm install
npm run dev      # http://localhost:5173, accessible depuis le téléphone du réseau
npm run build    # produit dist/ et son service worker
```

**Vite + JavaScript, sans framework et sans dépendance à l'exécution.** La logique tient
dans `src/main.js`, le style dans `src/style.css` ; le scan vit à part
(`src/scan.js`, `src/scan-ia.js`, `src/scan-worker.js`, `src/scan-voix.js`).

### Données

Rien n'est téléchargé à l'exécution : tout est aspiré une fois et embarqué. Les
scripts reprennent là où ils se sont arrêtés.

```bash
npm run fetch-data       # les 1025 espèces : noms, types, descriptions, rencontres
npm run fetch-extra      # évolutions et formes
npm run fetch-dex        # Pokédex régionaux des remakes
npm run fetch-sprites    # les sprites et artworks (40 Mo)
npm run fetch-cries      # les 1351 cris, convertis en MP3
npm run fetch-moves      # attaques et movesets
npm run fetch-battle     # stats de base, jeux, movesets par version
npm run fetch-types      # table des types par génération, et leurs symboles
npm run fetch-extras     # talents, objets tenables et natures
npm run fetch-moves-gen  # toutes les attaques des 21 jeux, et leurs valeurs par génération
```

### Reconnaissance et voix

- `ml/` entraîne les réseaux du scan — un classifieur (quel Pokémon) et un détecteur
  (où sont les Pokémon) — et les exporte en ONNX. Voir [ml/LISEZMOI.md](ml/LISEZMOI.md).
- `ml/voix/` produit les 1025 descriptions lues, avec l'effet « haut-parleur » du
  Pokédex. Voir [ml/voix/LISEZMOI.md](ml/voix/LISEZMOI.md).
- Le classifieur du mode IA dépasse la limite de 100 Mo de GitHub : il est versionné en
  morceaux dans `modeles/scan-ia/` et ré-assemblé par `npm run build` comme par
  `npm run dev`.

Le détail des choix de conception et des pièges rencontrés est consigné dans
[CLAUDE.md](CLAUDE.md).

---

## Sources

- **[PokéAPI](https://pokeapi.co)** — noms, types, descriptions, évolutions, formes,
  attaques, talents, objets, statistiques et lieux de capture, en français lorsque
  l'API les fournit. Aucune clé, aucun appel à l'exécution.
- **[cries](https://github.com/PokeAPI/cries)** de PokéAPI — les cris des Pokémon.
- **[pokemon-type-icons](https://github.com/partywhale/pokemon-type-icons)** de James
  Watkins, sous licence MIT — les 18 symboles de type. La licence est conservée dans
  `public/types/LICENCE.txt`.

Les sprites, artworks et fonds de boîte appartiennent à Nintendo, Game Freak et
The Pokémon Company. Ce dépôt est un projet personnel, sans but commercial et sans
lien avec ces sociétés.
