# Publier Unydex — ce qui bloque, et comment le lever

État au **2 octobre 2026**, vérifié sur le dépôt et sur les règles en vigueur.

Légende : ❌ bloquant · ⚠️ à faire avant soumission · ✅ déjà en place

---

## A. Le préalable

| # | Point | État | Ce qu'il faut faire |
|---|---|---|---|
| A1 | **Droits sur le contenu Pokémon** | ❌ | Lire [DROITS-ET-LICENCES.md](DROITS-ET-LICENCES.md). **Rien de ce qui suit ne sert tant que ce point n'est pas réglé.** Une seule voie réaliste : publier une version sans aucun élément Nintendo |
| A2 | **Compte Apple Developer** | ⚠️ | 99 €/an. Obligatoire pour l'App Store, pour Sign in with Apple et pour les notifications |

---

## B. Obligations légales

| # | Point | État | Ce qu'il faut faire |
|---|---|---|---|
| B1 | **Politique de confidentialité publique** | ⚠️ | Écrite : [POLITIQUE-CONFIDENTIALITE.md](POLITIQUE-CONFIDENTIALITE.md) et [PRIVACY-POLICY.md](PRIVACY-POLICY.md). Reste à **compléter l'identité et la région**, puis à la servir à une URL stable — elle est publiée avec le site, sous `legal/confidentialite.html` |
| B2 | **Lien dans l'application** | ⚠️ | Exigé par 5.1.1(i) : « within the app in an easily accessible manner ». **Pas encore fait** : il faut un bloc « Légal » dans les Réglages, renvoyant aux URL publiques (ouvertes par le greffon Browser en natif) |
| B3 | **Suppression du compte dans l'application** | ✅ | Exigée par 5.1.1(v). Réglages → Compte → Supprimer mon compte. Immédiate, en cascade, par `supprime_mon_compte()` |
| B4 | **Statut de « trader » (DSA)** | ⚠️ | **À ne pas découvrir à la fin.** Depuis le 17 février 2025, une application sans statut de trader vérifié est **retirée de l'App Store dans l'UE**. Il faut déclarer dans App Store Connect **nom, adresse postale, téléphone et e-mail** — et ces informations sont **affichées publiquement sur la fiche**. Pour un particulier, cela veut dire publier son adresse personnelle. Si c'est un problème, la réponse est une structure (micro-entreprise, association) avec une adresse de domiciliation |
| B5 | **Registre des traitements (RGPD art. 30)** | ✅ | [REGISTRE-DES-TRAITEMENTS.md](REGISTRE-DES-TRAITEMENTS.md). À tenir à jour **en même temps que le code** |
| B6 | **Mentions légales du site** | ⚠️ | [MENTIONS-LEGALES.md](MENTIONS-LEGALES.md), à compléter. Obligation de la LCEN pour un site édité depuis la France |
| B7 | **Conditions d'utilisation** | ✅ | [CONDITIONS-UTILISATION.md](CONDITIONS-UTILISATION.md). Facultatives pour Apple, utiles ici : elles disent l'absence de garantie et l'arrêt possible du service |
| B8 | **Région de l'hébergement** | ⚠️ | À vérifier : Supabase → Project Settings → General → **Region**. Une région européenne (Paris, Francfort, Irlande, Stockholm) évite d'avoir à encadrer un transfert hors UE. **Cela se choisit à la création du projet et ne se change pas après** : si la région actuelle est aux États-Unis, c'est maintenant qu'il faut recréer le projet, pas après la première inscription |
| B9 | **Âge minimum** | ⚠️ | Les documents retiennent **16 ans** pour le compte (seuil par défaut du RGPD, valable partout dans l'UE). La France autorise 15. À décider, et à refléter au même endroit dans les trois documents |

---

## C. Règles Apple, techniques

| # | Point | État | Ce qu'il faut faire |
|---|---|---|---|
| C1 | **Sign in with Apple** (4.8) | ❌ | Proposer Google oblige à offrir un service équivalent qui limite la collecte au nom et à l'e-mail et permet de **masquer son adresse**. `connecteApple()` est écrit, mais le greffon `@capacitor-community/apple-sign-in` n'est **pas installé** et le fournisseur Apple n'est pas activé dans Supabase. Certains relecteurs acceptent un compte e-mail + mot de passe maison ; c'est un motif de refus fréquent. **Ne pas parier dessus** |
| C2 | **Manifeste de confidentialité** | ⚠️ | **Pas encore fait** : créer `ios/App/App/PrivacyInfo.xcprivacy`. Exigé depuis mai 2024 pour toute application utilisant des API « à raison requise » — `UserDefaults` en fait partie, et Capacitor s'en sert |
| C3 | **Conformité export (chiffrement)** | ⚠️ | **Pas encore fait** : poser `ITSAppUsesNonExemptEncryption = false` dans `Info.plist` : l'application n'utilise que HTTPS, donc l'exemption standard. Sans cette clé, la question est reposée à **chaque** livraison |
| C4 | **Poids de l'application** | ⚠️ | `dist/` pèse **314 Mo**, dont **196 Mo de modèles** (`scan-ia` 141 Mo, `scan` 53 Mo), 67 Mo de sprites et 20 Mo de cris. C'est énorme pour un téléchargement mobile, et ça rallonge la revue. Trois leviers : retirer le **mode IA** du build publié (−141 Mo, c'est un bonus explicitement retirable), passer les modèles en **On-Demand Resources**, ou quantifier le classifieur en acceptant la perte de précision déjà mesurée |
| C5 | **iPad** | ⚠️ | `Info.plist` déclare les orientations `~ipad` : l'application sera **proposée sur iPad** et doit y fonctionner. Soit on la teste et on corrige la mise en page, soit on la limite à l'iPhone (`TARGETED_DEVICE_FAMILY = 1`). Ne pas laisser le relecteur découvrir une interface cassée |
| C6 | **Signature de distribution** | ⚠️ | Le workflow produit un IPA **non signé** pour SideStore. Pour l'App Store il faut une archive signée avec un certificat de distribution et un profil d'approvisionnement, livrée par Xcode ou Transporter. **C'est un second chemin de compilation**, à ajouter à `ios.yml` ou à faire à la main |
| C7 | **Fonctionnalité minimale** (4.2) | ✅ | Une application qui ne serait qu'un site emballé est refusée. Unydex utilise la caméra, un réseau de neurones embarqué, le retour haptique et le partage de fichiers : elle est native par l'usage, pas seulement par l'emballage |
| C8 | **Pas de code téléchargé** (2.5.2) | ✅ | Les modèles ONNX sont des **données**, embarquées, jamais téléchargées. Rien n'est chargé à l'exécution |
| C9 | **Usage de la caméra** | ✅ | `NSCameraUsageDescription` est présent et **explique** ce qui est fait de l'image — un texte vague est un motif de refus |
| C10 | **Icône** | ✅ | Une icône universelle 1024×1024, ce qui suffit depuis Xcode 14 |
| C11 | **Schéma d'URL** | ✅ | `CFBundleURLTypes` → `unydex`, pour le retour de la connexion |

---

## D. La fiche App Store

| # | Point | État | Ce qu'il faut faire |
|---|---|---|---|
| D1 | **Étiquette de confidentialité** | ✅ | Réponses prêtes à recopier : [ETIQUETTE-APP-STORE.md](ETIQUETTE-APP-STORE.md) |
| D2 | **Captures d'écran** | ⚠️ | Une série par taille d'appareil exigée. Elles doivent montrer l'application réelle, pas une maquette |
| D3 | **Nom, sous-titre, mots-clés** | ❌ | **Ne jamais écrire « Pokémon » ni un nom de créature** dans les métadonnées : c'est 5.2.1 sur les noms trompeurs, et c'est le premier endroit où un relecteur regarde. Le nom « Unydex » lui-même est bâti sur « Unys » (nom français d'Unova) |
| D4 | **URL d'assistance** | ⚠️ | Obligatoire (1.5). Une page du site avec un moyen de te joindre suffit |
| D5 | **Classification par âge** | ⚠️ | **4+**. À revoir si les pseudos deviennent un jour visibles entre utilisateurs : la question « contenu généré par les utilisateurs » changerait de réponse |
| D6 | **Compte de test** | ⚠️ | À fournir dans les notes de revue, avec la mention que l'application marche **entièrement sans compte** |

---

## E. L'ordre dans lequel s'y prendre

1. **Trancher A1.** Tant que la question des droits n'est pas tranchée, le reste est du
   travail à l'aveugle. C'est une décision, pas une tâche.
2. **Vérifier B8** — la région de l'hébergement. Elle ne se change pas après coup, et
   chaque jour qui passe ajoute des comptes à migrer.
3. **Décider B4** — le statut de trader, donc l'adresse qui sera publiée. C'est ce qui
   détermine s'il faut une structure, et une structure prend des semaines.
4. **Compléter les documents** : identité, région, âge, contact. Ils sont écrits, il
   manque quatre informations.
5. **C1** — Sign in with Apple, qui demande le compte développeur (A2).
6. **C4 et C5** — le poids et l'iPad.
7. **C6** — la chaîne de compilation signée.
8. **D** — la fiche, en dernier : c'est la partie la plus rapide.

---

## F. Ce qui est déjà fait

L'application part de loin dans le bon sens, et ce n'est pas un hasard :

- **Fonctionne entièrement hors ligne**, sans compte et sans la moindre requête
  réseau — vérifié : zéro requête après deux captures, déconnecté.
- **Aucune publicité, aucun traceur, aucune mesure d'audience.** Rien à déclarer au
  titre d'ATT, et une étiquette de confidentialité sobre.
- **La caméra ne transmet rien** : tout est analysé sur l'appareil.
- **Suppression du compte dans l'application**, immédiate et en cascade — l'exigence
  5.1.1(v) qui fait trébucher beaucoup d'applications.
- **Export complet des données en un bouton** : c'est le droit à la portabilité
  (RGPD art. 20) rendu, sans avoir rien à demander à personne.
- **Sécurité au niveau des lignes** sur toutes les tables, fonctions `security
  definer` à `search_path` figé, clé publique sans droit propre.
- **Toutes les dépendances sont sous licence MIT**, et les seules illustrations tierces
  (les 18 symboles de type) le sont aussi, avec leur avis de copyright conservé.
