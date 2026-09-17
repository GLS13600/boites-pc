# Voix du Pokédex

Les fichiers lus à l'ouverture d'une fiche depuis le scan : un MP3 par espèce dans
`public/voix/<numéro>.mp3`, **1025 fichiers, 43 Mo**. Ils sont produits ici, sur le PC,
et embarqués comme les sprites et les cris — l'appli ne fait aucune requête au runtime.

## Pourquoi pas la voix du téléphone

La première version lisait la fiche par `speechSynthesis` (voix d'iOS). Rejetée à
l'écoute le 17/09/2026 : **trop robotique**, et elle prononçait mal — « Shurikan » pour
« Sheauriken », « nin-ja ». Surtout, **on ne peut pas lui appliquer d'effet** : son son
ne passe pas par Web Audio, il sort directement du système. Une voix enregistrée permet
le ton « objet » demandé. `src/scan-voix.js` garde la synthèse du système en **secours**,
si un fichier manque.

## Chaîne

1. **`generer.py`** — texte puis voix, un WAV brut par espèce dans `A:\Jeu-scan\voix\brut\`.
   Reprend là où il s'est arrêté ; `generer.py <ids>` régénère ceux-là seulement.
   - Modèle **XTTS-v2** (`coqui-tts`), voix intégrée **« Sofia Hellen »**, français.
     Choisie à l'écoute parmi Kokoro (`ff_siwis`), XTTS Ana Florence, Claribel Dervla et
     Sofia : la plus naturelle et la mieux articulée. Licence CPML, usage personnel.
   - Texte : « <nom>, le <catégorie>, de type <types>. <description> ». Les trois premiers
     éléments sont liés par des **virgules** : séparés par des points, XTTS bafouille en
     fin de phrase courte (« de type Spectre. Crom. »).
   - La **catégorie** des Pokémon de gén. 9 est préfixée « Pokémon » — la donnée n'écrit
     que « Chat Plante ».
   - **Nombres et unités** écrits en toutes lettres (`num2words`) : « mille quatre cents
     mètres », « cent kilomètres », « moins dix degrés ».
   - **`LEXIQUE`** : graphie phonétique des mots mal lus (« Chouriquène », « nindja »,
     « Électrique »). À compléter au fil des cas signalés.
2. **`verifier.py`** — fait **retranscrire chaque WAV par Whisper** (medium, sur la carte
   graphique) et compare au texte attendu. C'est ce qui permet de vérifier 1025 clips sans
   les écouter : XTTS invente parfois des syllabes ou répète un morceau.
   - Whisper écrit mal les noms de Pokémon : la comparaison porte sur la **description**,
     et on mesure surtout ce qui est entendu **EN PLUS** du texte (`tri.py` côté
     `A:\Jeu-scan\voix`). Sans ça, 27 clips sur 1025 ressortaient suspects dont la
     plupart étaient bons.
3. **`propre.py`** — régénère un clip **jusqu'à** ce que sa retranscription colle
   (5 essais au plus, le meilleur est gardé) : XTTS n'est pas déterministe.
4. **`finir.py`** — applique à chaque WAV : **double bip** d'ouverture (synthétisé),
   **vitesse ×1,3** (`atempo`, la hauteur ne bouge pas) et l'effet **« marqué clair »** —
   passe-haut 230 Hz, passe-bas 8 kHz, léger dédoublement, écho court, aigus renforcés
   pour les consonnes. Puis MP3 mono 24 kHz à 40 kb/s, ~42 Ko par Pokémon.
   - Réglages choisis à l'écoute : l'effet « marqué » d'origine brouillait les consonnes,
     l'écho et le dédoublement ont donc été raccourcis et les aigus relevés.
   - Les silences de début et de fin sont retirés : la lecture démarre tout de suite.

## Résultats (17/09/2026)

- 1025 clips, **43 Mo**, de 4 s (une espèce sans description) à ~14 s.
- Vérification : **41 clips régénérés** sur 1025, dont 2 deux fois (Téraclope, Latias).
  Après reprise, aucun clip ne s'écarte franchement de son texte.
- Génération : ~6 s par clip sur la RTX 5060 Ti, soit ~1 h 45 pour les 1025.
  Vérification Whisper : ~1,3 s par clip, ~22 min.

## Environnement

Séparé de celui de `ml/` : `A:\Jeu-scan\voix\.venv`, **Python 3.11** (XTTS ne tourne pas
sous le 3.14 du poste), créé par `uv venv --python 3.11`, avec `torch` cu128,
`coqui-tts`, `openai-whisper`, `soundfile`, `num2words`. `transformers` doit être en
**4.57+** (les versions antérieures cassent l'import de `coqui-tts`). Les scripts lisent
`src/data/pokedex.json` et écrivent dans `public/voix/`.
