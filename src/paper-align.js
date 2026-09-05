// Calage des fonds de boîte — FICHIER À ÉDITER À LA MAIN.
//
// Chaque entrée dit où poser l'image du fond, en pourcentage de la GRILLE des cases
// (et non du panneau). C'est ce qui garantit que le calage ne bougera plus si les
// marges ou la taille de la boîte changent un jour.
//
//   x : décalage horizontal du bord gauche de l'image. 0 = aligné sur le bord gauche
//       de la grille. Négatif = l'image déborde à gauche.
//   y : décalage vertical du bord haut. Négatif = l'image remonte au-dessus de la
//       grille, ce qui est le cas normal : c'est ainsi que sa bande d'en-tête vient
//       se placer derrière le nom de la boîte.
//   w : largeur de l'image. 100 = exactement la largeur de la grille.
//   h : hauteur de l'image. 100 = exactement la hauteur de la grille.
//
// Pour REMONTER un fond, diminuez y. Pour l'AGRANDIR en hauteur, augmentez h — pensez
// alors à diminuer y de la même moitié si vous voulez garder le bas en place.
//
// La clé est le numéro de génération du fond. Quand une génération contient plusieurs
// formats d'image (3 et 8), chacun a sa propre entrée, clé « génération:format ».
// La recherche essaie « gen:format », puis « gen », puis DEFAUT.
//
// Réglez avec Calage-Fonds.bat : les curseurs modifient l'appli en direct, puis
// « Copier TOUS mes réglages » donne les lignes à coller ici.

export const DEFAUT = { x: 0, y: -24.9, w: 100, h: 137.4 };

export const ALIGNEMENT = {
  // ---- Gén. 3 : quatre formats d'image, calés séparément ----
  // À RÉGLER — valeurs encore issues du calage automatique.
  '3:156x141': { x: 0, y: -23.5, w: 100, h: 123.5 },   // 52 fonds · Rubis/Saphir, RF/VF, Émeraude
  '3:203x214': { x: 0, y: -24.9, w: 100, h: 137.4 },   // 21 fonds · Pokémon Box RS, texture pleine
  '3:384x320': { x: 0, y: -24.9, w: 100, h: 137.4 },   // 8 fonds · XD, texture pleine
  // VALIDÉ à la main.
  '3:406x370': { x: -4, y: -16, w: 108, h: 119.8 },    // 3 fonds · Colosseum

  // ---- Gén. 4 — 40 fonds (162x148) ---- VALIDÉ à la main.
  4: { x: -1.8, y: -24.5, w: 103.4, h: 127.1 },

  // ---- Gén. 5 — 32 fonds (156x142) ---- VALIDÉ à la main.
  5: { x: -4.95, y: -24.4, w: 110, h: 125.3 },

  // ---- Gén. 6 — 32 fonds (211x210 et voisins) ---- VALIDÉ à la main.
  6: { x: -1.1, y: -25.5, w: 102.6, h: 127.3 },

  // ---- Gén. 7 — 16 fonds (208x192) ---- VALIDÉ à la main.
  7: { x: -4.4, y: -24.8, w: 109.2, h: 129.6 },

  // ---- Gén. 8 : deux formats d'image, calés séparément ----
  // VALIDÉ à la main.
  '8:156x150': { x: -4.8, y: -2.5, w: 108.5, h: 110.7 },   // 19 fonds · Épée/Bouclier
  // À RÉGLER — valeur encore issue du calage automatique.
  '8:420x356': { x: -1.3, y: -33.7, w: 102.3, h: 136.4 },  // 32 fonds · Diamant Ét./Perle Sc.

  // ---- Gén. 9 — 21 fonds (174x131) ----
  // À RÉGLER — valeur encore issue du calage automatique.
  9: { x: -4.9, y: -0.4, w: 106.9, h: 103.8 },
};
