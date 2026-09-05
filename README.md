# Boîtes PC — Living Dex perso

## Lancer sur PC
    npm install
    npm run dev        # http://localhost:5173 (et accessible depuis l'iPhone sur le même réseau)

## Récupérer les vraies données (une seule fois)
    npm run fetch-data              # les 1025 Pokémon, 10–20 min
    npm run fetch-data -- 1 151     # ou juste Kanto pour tester

Le fichier généré est `src/data/pokedex.json`, embarqué dans l'appli (100 % hors-ligne ensuite).
Le script reprend là où il s'est arrêté si tu le relances.

## Utilisation
- Onglets = générations, flèches ou swipe = changer de boîte (30 par boîte).
- Tap sur un Pokémon = capturer / retirer. Appui long (ou clic droit) = fiche avec lieux de capture par jeu.
- Le bouton « Tap : capturer / voir la fiche » inverse le comportement du tap.
- Exporter / Importer = sauvegarde JSON de ta progression (à faire avant de réinstaller l'IPA).

## Plus tard : Capacitor
`npm run build` produit `dist/` avec des chemins relatifs, prêt pour `npx cap add ios`.

## Sprites
- Non capture : sprite fixe, legerement estompe.
- Capture : sprite 2D anime (GIF Showdown via PokeAPI), avec repli automatique sur le sprite fixe si le GIF n'existe pas.
- Dans la fiche, le bouton rond en bas du portrait bascule entre forme normale et forme chromatique.
- Les sprites sont charges depuis GitHub : connexion requise tant qu'on ne les a pas telecharges en local (a faire avant Capacitor).
