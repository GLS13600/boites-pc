# Guiguidex

Suivi de **Living Dex** personnel, présenté comme les boîtes PC des jeux Pokémon.
Application web sans framework, entièrement hors ligne, utilisable dans un navigateur
ou installée sur iPhone.

**→ [Ouvrir l'application](https://gls13600.github.io/boites-pc/)**

Sur iPhone, ouvrir ce lien dans Safari puis *Partager → Sur l'écran d'accueil* : elle
s'installe comme une vraie application, en plein écran et sans expiration.

---

## Ce qu'elle fait

### Boîtes

Les 1025 espèces et leurs 678 formes, rangées en boîtes de 30 comme dans les jeux.

- Un tap capture, un appui long ouvre la fiche — le comportement du tap se règle en bas.
- Le contenu de chaque boîte se réorganise librement : appui long puis glissement pour
  déplacer un Pokémon, n'importe quelle espèce ou forme peut aller n'importe où.
- Une boîte se renomme et reçoit l'un des **276 fonds officiels** des jeux, générations
  III à IX.
- Deux collections distinctes : Pokédex normal et **Pokédex chromatique**.
- Export et import JSON de la progression.

### Pokédex

Les espèces d'une génération, trois par ligne, avec le **taux de remplissage** calculé
d'après tes boîtes. La fiche donne la description, la famille d'évolution, les formes
et leur mode d'obtention, les talents, les attaques et les lieux de capture.

### Boîte de combat

Une équipe de six, présentée comme l'écran d'équipe de *Noir 2 / Blanc 2*.

- **Une équipe par version de jeu**, parmi les 21 jeux jouables.
- Attaques, talents et objets tenus **suivent la version choisie** — et la forme :
  Kyurem Blanc n'apprend pas les mêmes attaques que Kyurem.
- Statistiques calculées par les formules officielles ; en y recopiant les valeurs
  lues en jeu, l'application **déduit les IV**, nature et EV compris.
- Analyse de l'équipe : faiblesses et résistances cumulées, couverture offensive
  d'après les attaques réellement choisies, rôles, et des conseils actionnables.

---

## Installation

Deux voies, à partir du même code. La procédure détaillée est dans
[PUBLIER.md](PUBLIER.md).

| | Site web | IPA sideloadé |
|---|---|---|
| Installation | Safari → écran d'accueil | Sideloadly + Apple ID |
| Expiration | aucune | 7 jours, à re-signer |
| Mise à jour | au rechargement | nouvelle compilation |
| Hors ligne | oui, service worker | oui, tout est embarqué |

Le site est le chemin simple. L'IPA existe pour avoir une vraie application native.

---

## Développement

```bash
npm install
npm run dev      # http://localhost:5173, accessible depuis le téléphone du réseau
npm run build    # produit dist/ et son service worker
```

**Vite + JavaScript, sans framework et sans dépendance à l'exécution.** Toute la
logique tient dans `src/main.js`, le style dans `src/style.css`.

### Données

Rien n'est téléchargé à l'exécution : tout est aspiré une fois et embarqué. Les
scripts reprennent là où ils se sont arrêtés.

```bash
npm run fetch-data      # les 1025 espèces : noms, types, descriptions, rencontres
npm run fetch-extra     # évolutions et formes
npm run fetch-dex       # Pokédex régionaux des remakes
npm run fetch-sprites   # les sprites et artworks (40 Mo)
npm run fetch-moves     # attaques et movesets
npm run fetch-battle    # stats de base, jeux, movesets par version
npm run fetch-types     # table des types par génération, et leurs symboles
npm run fetch-extras    # talents, objets tenables et natures
```

Le détail des choix de conception et des pièges rencontrés est consigné dans
[CLAUDE.md](CLAUDE.md).

---

## Sources

- **[PokéAPI](https://pokeapi.co)** — noms, types, descriptions, évolutions, formes,
  attaques, talents, objets, statistiques et lieux de capture, en français lorsque
  l'API les fournit. Aucune clé, aucun appel à l'exécution.
- **[pokemon-type-icons](https://github.com/partywhale/pokemon-type-icons)** de James
  Watkins, sous licence MIT — les 18 symboles de type. La licence est conservée dans
  `public/types/LICENCE.txt`.

Les sprites, artworks et fonds de boîte appartiennent à Nintendo, Game Freak et
The Pokémon Company. Ce dépôt est un projet personnel, sans but commercial et sans
lien avec ces sociétés.
