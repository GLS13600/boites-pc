# Droits et licences — audit pièce par pièce

> **Document déterminant du dossier.** Il n'expose pas un risque théorique : il
> établit la raison pour laquelle Unydex, **dans son état actuel, ne peut pas être
> publiée sur l'App Store**. Les autres pièces du dossier — confidentialité, RGPD,
> documents Apple — demeurent nécessaires en toute hypothèse, mais aucune ne règle
> ce point.
>
> **Ce document ne constitue pas un avis juridique.** Il réunit des éléments
> vérifiables : la composition de l'application, la provenance de chaque élément, et
> la teneur des licences et des règles applicables. Toute décision d'exploitation
> appelle la consultation d'un conseil en propriété intellectuelle.

Dernière vérification : **02/10/2026**.

---

## 1. La règle qui s'applique

Apple, [App Review Guidelines, 5.2.1](https://developer.apple.com/app-store/review/guidelines/) :

> « Don't use protected third-party material such as trademarks, copyrighted works,
> or patented ideas in your app without permission […] **Apps should be submitted by
> the person or legal entity that owns or has licensed the intellectual property**
> and other relevant rights. »

Et 5.2.2, pour les services tiers :

> « If your app uses, accesses, monetizes access to, or displays content from a
> third-party service, ensure that you are specifically permitted to do so under the
> service's terms of use. **Authorization must be provided upon request.** »

Ce dernier point est décisif : à la demande d'Apple, il faut être capable de
**produire l'autorisation**. Elle n'existe pas ici, et elle n'est pas délivrée aux
particuliers.

---

## 2. Inventaire

| Élément | Volume | Provenance | Titulaire des droits | Statut |
|---|---|---|---|---|
| `public/sprites/` | 5 291 fichiers, 40 Mo | dépôt `PokeAPI/sprites` | **The Pokémon Company** | ❌ bloquant |
| `public/cries/` | 1 351 MP3, 17,8 Mo | dépôt `PokeAPI/cries`, extraits des jeux | **The Pokémon Company** | ❌ bloquant |
| `public/items/` | 292 sprites | PokéAPI | **The Pokémon Company** | ❌ bloquant |
| `public/wallpapers/` | 236 fonds, 4,9 Mo | archives Bulbagarden, extraits des jeux | **The Pokémon Company** | ❌ bloquant |
| Descriptions du Pokédex | 898 entrées | PokéAPI | texte des jeux, **TPC** | ❌ bloquant |
| Noms, catégories, types, lieux | 1 025 espèces | PokéAPI | marques **Nintendo** | ❌ bloquant |
| `public/scan/modele.onnx`, `modeles/scan-ia/` | 196 Mo | entraînés **sur ces images** | œuvre dérivée | ❌ bloquant |
| Le nom **« Unydex »** | — | « Unys » = nom français d'Unova | marque **Nintendo** | ❌ bloquant |
| `public/types/` | 18 SVG, 22 Ko | `partywhale/pokemon-type-icons` | James Watkins | ✅ **MIT**, avis conservé |
| `public/icon.svg` | 1 fichier | dessinée pour l'application | **l'éditeur** | ✅ |
| Code de l'application | — | écrit pour l'application | **l'éditeur** | ✅ |
| `onnxruntime-web`, `@supabase/supabase-js`, Capacitor et ses greffons | — | npm | divers | ✅ **MIT** |

### Le point qui tranche

Le dépôt des sprites est publié sous CC0 — on pourrait croire le problème réglé.
Son propre fichier de licence dit l'inverse, dès la première ligne :

```
All image contents within are Copyright The Pokémon Company.

This repository is distributed under CC0 1.0 Universal
```

Le CC0 porte sur **le dépôt** — la collecte, l'organisation, les noms de fichiers —,
**pas sur les images**. PokéAPI ne peut pas céder des droits qu'il n'a pas. Son site
le dit aussi, en pied de page : « Pokémon and Pokémon character names are trademarks
of Nintendo. »

Il n'existe donc **aucune chaîne de droits** entre The Pokémon Company et cette
application. Ce n'est pas une zone grise : c'est une absence.

### Ce que l'usage privé ne change pas

Tant que l'application demeure installée sur le terminal de son auteur et distribuée
par un IPA sideloadé à son seul usage, la question est pratiquement sans objet. **La
publication change la nature de l'acte** : il s'agit alors d'une mise à disposition du
public, à l'échelle mondiale, sous le nom et l'adresse de l'éditeur, rendus publics au
titre du règlement sur les services numériques (voir [PUBLICATION.md](PUBLICATION.md),
point B4).

---

## 3. Les quatre issues, et ce qu'elles coûtent

### A. Ne pas publier — garder la distribution actuelle

L'IPA sideloadé et le site GitHub Pages, comme aujourd'hui. Rien à changer, rien à
risquer de sérieux. C'est l'option qui conserve l'application **exactement** telle
qu'elle est, avec ses 1 025 espèces, ses sprites, ses cris et son scan.

**Le reste de ce dossier reste utile** : le site est déjà public et le compte traite
déjà des données personnelles — la politique de confidentialité et le registre des
traitements sont dus **dès maintenant**, App Store ou pas.

### B. Obtenir une licence

The Pokémon Company ne concède pas de licence sur ses personnages à des développeurs
individuels, et il n'existe aucun programme de contenu dérivé ouvert aux applications.
Cette voie doit être tenue pour fermée.

### C. Publier une version SANS aucun élément Nintendo

C'est la seule voie de publication envisageable. Le travail est substantiel mais
borné, et **l'essentiel de l'application subsiste** : toute la mécanique — boîtes,
glisser-déposer, équipes, analyse de types, sauvegarde, comptes, traduction — a été
écrite pour elle et ne soulève aucune difficulté.

Ce qu'il faut remplacer :

| À retirer | À mettre à la place | Difficulté |
|---|---|---|
| Les 5 291 sprites | Rien : l'utilisateur **ajoute ses propres images** depuis sa photothèque | moyenne |
| Les noms, descriptions, catégories | L'utilisateur nomme ses propres entrées | faible |
| Les 236 fonds de boîte | Des fonds dessinés, ou des aplats et motifs générés | moyenne |
| Les 1 351 cris | Rien, ou des sons de synthèse (`scan-son.js` fait déjà ça) | faible |
| Les 18 types et la table | **Rien à faire** : les symboles sont MIT, mais les NOMS de types sont génériques (Feu, Eau…) et une table d'efficacité n'est pas protégeable en tant que telle | — |
| Le scan et ses modèles | Retiré, ou réentraîné sur les images de l'utilisateur | élevée |
| Le nom « Unydex » | Un nom sans racine Pokémon | faible |

L'application devient **un outil de suivi de collection générique** : des boîtes, des
emplacements, des équipes, une analyse de types, une synchronisation, l'utilisateur
fournissant lui-même le contenu. Il s'agit d'un produit distinct, mais d'un produit
réel, et publiable sous le seul nom de l'éditeur.

### D. Publier quand même

Voie à écarter. Deux issues sont prévisibles, également défavorables : le refus à la
revue, hypothèse la plus probable dès lors qu'un relecteur identifie l'univers en
cause, ou l'acceptation suivie d'un retrait sur signalement du titulaire des droits.
Dans cette seconde hypothèse, le compte développeur est exposé à une résiliation, et
le nom et l'adresse postale de l'éditeur figurent alors **publiquement sur la fiche
App Store** au titre du règlement sur les services numériques.

---

## 4. Recommandation

**Option A pour l'usage existant, option C pour toute publication.**

Unydex peut être conservée en l'état pour un usage personnel, par distribution
sideloadée : rien ne justifie de l'amputer dans ce cadre. Si la publication constitue
un objectif, elle appelle un produit distinct, bâti sur la même base, dont quatre
cinquièmes du code sont réutilisables sans modification.

Le travail de conformité exposé dans les autres pièces du dossier vaut pour les deux
hypothèses.
