# Scan — entraînement du réseau de reconnaissance

Ce dossier produit `public/scan/modele.onnx` et `src/data/scan-classes.json`, les
deux fichiers qu'utilise la vue Scan de l'appli. Rien ici n'est embarqué dans le
build : ce sont des outils de PC.

## Principe

- **Réseau de départ** : la partie image de **MobileCLIP2-S0** (Apple,
  `timm/fastvit_mci0.apple_mclip2_dfndr2b`), 11 M de paramètres, entrée 256×256.
  Appris sur des milliards d'images légendées, il sait déjà reconnaître formes,
  textures et styles — dessin comme photo. Licence Apple AMLR : usage de recherche
  et personnel, pas de redistribution commerciale.
- On remplace sa sortie par **une classe par Pokémon** : 1025 espèces, 286 formes
  visuellement distinctes (Méga, Gigamax, régionales, combat…) et une classe
  « rien » qui apprend à refuser. 1312 classes.
- Chaque classe a un **groupe** = numéro de l'espèce. L'appli additionne les
  probabilités d'un groupe avant de décider : une espèce et ses formes se partagent
  la ressemblance.

## Données (hors dépôt, dans `D:\Code\Jeu-scan`)

| Source | Rôle |
|---|---|
| Artworks officiels (déjà dans `public/sprites`) | style dessin propre |
| Rendus 3D Pokémon HOME (dépôt PokeAPI/sprites) | proches d'une figurine, d'un jeu récent |
| Modèles 3D animés Showdown | écrans de jeu, de face et de dos |
| Dessins Dream World | style illustration, gén. 1 à 5 |
| Sprites en pixels de chaque jeu | écrans des anciens jeux |
| ~16 600 cartes du JCC (TCGdex) | vraies illustrations, styles variés, et banc d'essai |
| Imagenette | scènes sans Pokémon, pour la classe « rien » |

Les cartes ne donnent que l'espèce : leur perte porte sur le **groupe entier**
(`logsumexp` des classes du groupe), pas sur une classe précise — « Goupix d'Alola »
est rangée sous 37.

## Mises en scène (`donnees.py`)

Aucune photo réelle n'est disponible en quantité : chaque référence est
« photographiée » au hasard à chaque passage — fond (photo, uni, dégradé, papier),
cadrage, rotation, perspective, lumière, balance des blancs, flou, bougé, bruit,
compression JPEG, et selon le tirage : trame d'écran (sous-pixels, moiré, reflet),
impression (couleurs ternies, trame), figurine (textures lissées, éclairage
directionnel, reflets spéculaires, ombre portée), reflet holographique sur carte.
`apercu.py` en sort une planche pour juger à l'œil.

## Chaîne complète

```bash
# 1. Données
node ml/fetch-cartes.mjs D:/Code/Jeu-scan
node ml/dessins.mjs D:/Code/Jeu-scan
python ml/classes.py D:/Code/Jeu-scan
# 2. Entraînement (RTX 5060 Ti : ~2 min par époque)
python ml/entrainer.py D:/Code/Jeu-scan --epoques 30 --ouvriers 14 --sortie D:/Code/Jeu-scan/runs/v1
# 3. Export, mesure, calibration du seuil
python ml/exporter.py D:/Code/Jeu-scan/runs/v1 --quantifie
python ml/evaluer.py D:/Code/Jeu-scan/runs/v1/modele-int8.onnx D:/Code/Jeu-scan --echelles 1,0.78
node ml/vitesse-web.mjs D:/Code/Jeu-scan/runs/v1/modele-int8.onnx 2
# 4. Copie dans l'appli
cp D:/Code/Jeu-scan/runs/v1/modele.onnx public/scan/modele.onnx   # float32 : l'int8 perd ~4 points
cp D:/Code/Jeu-scan/runs/v1/scan-classes.json src/data/scan-classes.json
```

Environnement Python : `D:\Code\Jeu-scan\.venv` (Python 3.14, PyTorch 2.14 cu130,
timm, onnx, onnxruntime).

## Résultats (run v1, arrêté à l'époque 24)

Cartes des extensions de test, jamais vues. « Illustration » = fenêtre d'illustration
recadrée proprement ; « photo » = même carte mise en scène (cadrage, perspective,
lumière, flou, reflet…). Échelles 1 et 0,78 moyennées, comme l'appli.

| seuil | illustration : bonnes / non trouvé / fausses | photo : bonnes / non trouvé / fausses | sans Pokémon : fiche ouverte |
|---|---|---|---|
| 0,3 | 92,7 / 2,7 / 4,7 | 83,4 / 5,7 / 10,9 | 0 % |
| **0,4** | **91,8 / 4,5 / 3,6** | **81,9 / 10,0 / 8,1** | **0 %** |
| 0,5 | 90,3 / 7,4 / 2,3 | 79,5 / 15,3 / 5,1 | 0 % |

- Top-1 brut : illustration 93,2 %, photo 84,1 %, refus des scènes sans Pokémon 99,8 %.
- int8 dynamique : 86,0 % contre 89,7 % en float32 sur 300 photos — écarté.
- Évolution de la photo au fil des époques : 41 % (6), 74 % (10), 80 % (16), 84 % (24).
  La courbe montait encore : les 6 époques restantes, ou un run plus long, devraient
  gagner quelques points.

## Rotation libre (run « rotation », modèle actuel)

Constat sur le téléphone : un Pokémon debout était parfaitement reconnu, plus du
tout une fois tourné. L'entraînement ne tournait les images que de ±25°.

- `angle_libre` : 25 % presque droites (±20°), 20 % en quarts de tour (±10°), le
  reste au hasard sur 360°. Les cartes tournent autour du point visé, fond compris
  (`recadre_tourne` : zone 1,5 fois plus grande, puis recadrée — les coins vides
  tombent dehors).
- Deux jeux d'évaluation ajoutés, `illustration_tournee` et `photo_tournee`. Le
  « meilleur » modèle est désormais choisi sur la moyenne photo debout / tournée.
- Reprise depuis le modèle debout de l'époque 30 (`--reprise`), lr 3e-4, arrêt
  automatique dès 90 % sur l'illustration tournée : atteint à l'**époque 8**.

| | départ (debout, ép. 30) | ép. 2 | ép. 4 | ép. 6 | **ép. 8** |
|---|---|---|---|---|---|
| illustration tournée | 66,9 | 79,0 | 87,2 | 89,8 | **91,0** |
| photo tournée | 55,9 | 65,6 | 74,9 | 79,4 | **80,8** |
| illustration debout | 92,5 | 93,3 | 93,8 | 93,3 | **93,2** |
| photo debout | 84,3 | 84,7 | 84,7 | 84,8 | **84,8** |

Décision de l'appli (deux cadrages, seuil 0,4), bonnes / non trouvé / fausses :
illustration debout 92,8 / 3,6 / 3,6, tournée 90,4 / 4,3 / 5,3 ; photo debout
82,5 / 10,8 / 6,8, tournée 78,2 / 14,5 / 7,3. Sans Pokémon : 0 fiche ouverte.

Quatre orientations analysées côté appli (rot90 × 4) : +1 point tourné, −2 points
debout, deux fois plus lent — écarté.

Reprendre le même calendrier après un arrêt : `--reprise <poids> --depart-epoque N`
avec le même `--epoques` (c'est ainsi que le run debout est allé de 24 à 30).

## Détecteur (suivi en continu)

`detecteur.py`, `scenes.py`, `entrainer_detecteur.py`, `apercu_scenes.py`.

```bash
python ml/apercu_scenes.py D:/Code/Jeu-scan planche.png   # boîtes dessinées, à vérifier à l'œil
python ml/entrainer_detecteur.py D:/Code/Jeu-scan --epoques 20 --par-epoque 20000 --sortie D:/Code/Jeu-scan/runs/detecteur-v1
cp D:/Code/Jeu-scan/runs/detecteur-v1/detecteur.onnx public/scan/detecteur.onnx
```

- MobileNetV4 small (ImageNet) + fusion des pas 8/16/32 + têtes CenterNet (chaleur,
  taille en log, décalage). 1,6 M de paramètres, 6 Mo, **43 ms** en WASM un fil.
  Le medium (7,5 M) prenait 131 ms : trop lent pour suivre.
- 20 époques de 20 000 scènes, ~25 min. Résultat (moyenne lissée, époque 20) :

  | seuil | précision | rappel | faux cadres par image vide |
  |---|---|---|---|
  | 0,2 | 78,4 | 89,9 | 0,083 |
  | 0,3 | 88,3 | 86,5 | 0,028 |
  | 0,4 | 93,5 | 81,7 | 0,014 |
  | 0,5 | 96,5 | 74,5 | 0,007 |

  IoU moyen des boîtes justes : 0,88.
- **Piège, la moyenne lissée des poids** : sans montée progressive (`use_warmup`),
  elle gardait des centaines de pas les poids ET les statistiques de normalisation du
  réseau de départ — zéro détection en évaluation (0,11 partout), alors que le même
  réseau en mode apprentissage montait déjà à 0,76. On évalue désormais le réseau
  lissé et le brut, et on garde le meilleur.
- **Piège, la vitesse des scènes** : tourner et « figuriniser » un rendu HOME de 512 px
  avant de le réduire à 60 coûtait l'essentiel du temps (100 scènes/s au total, la
  carte graphique à 1 %). On réduit d'abord, on tourne ensuite : 41 scènes/s par
  processus au lieu de 14.

## Pièges rencontrés

- **FastViT s'entraîne deux fois plus vite une fois « reparamétré »** (branches
  parallèles fusionnées) : 427 contre 213 img/s. On fusionne avant d'entraîner, et
  le modèle entraîné est directement celui qu'on exporte.
- **Sous Windows, chaque processus de chargement recharge PyTorch** (~700 Mo). Des
  chargeurs d'évaluation à processus dédiés, ajoutés à ceux de l'entraînement,
  épuisaient la mémoire (« bad allocation », décodeur WebP impossible à créer). Les
  jeux d'évaluation sont donc fabriqués une fois, gardés en mémoire et sur disque
  (`eval-*.pt`).
- **Les cartes sont séparées par EXTENSION** entre apprentissage et test : une même
  illustration est réimprimée dans plusieurs cartes d'une extension, un tirage carte
  par carte la mettrait des deux côtés et gonflerait le score.
- **Les logits ONNX s'écartent de quelques dixièmes** de ceux de PyTorch, sur des
  valeurs d'une centaine : arrondis flottants accumulés. Ce sont les probabilités,
  ce que lit l'appli, qu'on compare.
- La lecture des images est le goulot : ~30 img/s par processus. Les cartes sont
  décodées à demi-résolution et le fond n'est fabriqué qu'à la taille de la zone
  cadrée — sans ça, 9 img/s.
