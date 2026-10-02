# Droits et licences — audit pièce par pièce

> **Ce document est le plus important du dossier.** Il ne décrit pas un risque
> théorique : il décrit la raison pour laquelle Unydex, **dans son état actuel, ne
> peut pas être publié sur l'App Store**. Tout le reste du dossier (confidentialité,
> RGPD, documents Apple) est valable et nécessaire quoi qu'il arrive — mais aucun ne
> règle celui-ci.
>
> Je ne suis pas juriste et ce document n'est pas un avis juridique. Il rassemble des
> faits vérifiables : ce que contient l'application, d'où ça vient, et ce que disent
> les licences et les règles d'Apple. Pour une décision engageante, un conseil en
> propriété intellectuelle est indiqué.

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
| `public/icon.svg` | 1 fichier | dessinée pour l'application | **toi** | ✅ |
| Code de l'application | — | écrit pour l'application | **toi** | ✅ |
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

Tant que l'application reste installée sur ton téléphone et distribuée par un IPA
sideloadé que toi seul utilises, la question est pratiquement sans objet. **La
publication change la nature de l'acte** : mise à disposition du public, à l'échelle
mondiale, sous ton nom et ton adresse (voir l'obligation DSA, document
[PUBLICATION.md](PUBLICATION.md)).

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

Honnêtement : The Pokémon Company ne licencie pas ses personnages à des développeurs
individuels. Il n'existe pas de programme de contenu dérivé pour les applications.
Cette voie n'est pas réaliste, et je préfère le dire que te laisser écrire.

### C. Publier une version SANS aucun élément Nintendo

C'est la seule voie de publication qui tienne. Le travail n'est pas mince, mais il est
borné, et **l'essentiel de l'application survit** — toute la mécanique (boîtes,
glisser-déposer, équipes, analyse de types, sauvegarde, comptes, traduction) est de
toi et ne pose aucun problème.

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

L'application devient **un suiveur de collection générique** : des boîtes, des
emplacements, des équipes, une analyse de types, une synchronisation. L'utilisateur
y met ce qu'il veut. C'est un produit différent, mais c'en est un, et il est
publiable sous ton seul nom.

### D. Publier quand même

À écarter. Deux issues, et aucune n'est bonne : refus à la revue (le plus probable —
un relecteur reconnaît un Pokémon), ou acceptation suivie d'un retrait sur
signalement. Dans le second cas, ton compte développeur est exposé, et ton nom et
ton adresse postale sont **publiés sur la fiche App Store** au titre du DSA.

---

## 4. Recommandation

**A pour ce que tu as, C pour ce que tu publies.**

Garde Unydex tel quel pour toi, par SideStore — c'est une très bonne application et
elle n'a aucune raison d'être amputée pour un usage privé. Et si la publication
compte vraiment, pars de la même base pour un suiveur de collection générique :
quatre cinquièmes du code se réutilisent sans rien changer.

Le travail de conformité qui suit dans ce dossier sert aux deux.
