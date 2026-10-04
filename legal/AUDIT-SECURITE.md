# Audit de sécurité

**Réalisé le 4 octobre 2026** sur la révision `93cbafd`, périmètre : application,
site, et service en ligne (base de données et authentification).

Chaque constat a été **vérifié par la pratique**, et non déduit de la lecture du code.
Les tests d'écriture ont été conduits de manière à ne modifier aucune donnée.

---

## Synthèse

| | Constat | Gravité | État |
|---|---|---|---|
| 1 | Exécution de code par une clé de capture fabriquée (sauvegarde importée ou collection synchronisée) | **Élevée** — vol de session | **Corrigé** |
| 2 | Table `profils` lisible par quiconque détient la clé publique : énumération de tous les comptes | **Moyenne** — divulgation | **Correctif fourni, à appliquer** |
| 3 | Absence de politique de sécurité de contenu : aucune limite aux destinations réseau | **Moyenne** — facilite l'exfiltration | **Corrigé** |
| 4 | Failles signalées par l'audit des dépendances dans l'outillage de compilation | Faible — non livré | **Clarifié** |

Contrôles passés sans constat : secrets, écritures en base, service worker, URL des
fonds de boîte, fonctions à privilèges.

---

## 1. Exécution de code par une clé fabriquée — corrigé

### Le défaut

Le repli d'image écrivait l'URL du sprite dans un attribut `onerror`, c'est-à-dire
**dans du code JavaScript entre apostrophes**, lui-même dans un attribut HTML entre
guillemets :

```
onerror="this.onerror=null;this.src='sprites/<clé>.png'"
```

La clé n'était ni validée ni échappée sur ce chemin, et la fonction d'échappement
générale n'échappait pas l'apostrophe. Une clé contenant une apostrophe sortait donc
de la chaîne et exécutait ce qui suivait.

### Vérification

Une charge a été construite et appliquée par le chemin d'import réel, avec la clé
`x';window.__preuve=true;'`. Résultat relevé dans le navigateur :

```
attribut rendu : this.onerror=null;this.src='sprites/x';window.__preuve=true;'.png'
script exécuté : true
```

### Portée

Le jeton de session Supabase est conservé dans `localStorage` sous `pcbox.session`.
Un script exécuté dans l'origine de l'application y accède : **l'exploitation conduit
à la prise de contrôle du compte** — lecture et écriture de la collection, changement
de pseudonyme, suppression du compte.

Deux vecteurs : l'import d'un fichier de sauvegarde d'origine non sûre, et la
collection restituée depuis le compte, qu'un attaquant ayant obtenu un accès pourrait
empoisonner pour viser les autres appareils de la victime.

### Correction

Trois barrières indépendantes, dont chacune suffit :

1. **Filtrage à l'entrée** — `appliqueDonnees` écarte toute clé qui n'est pas un
   entier positif ou un slug. Les cases concernées deviennent des emplacements vides,
   la mise en page des boîtes est préservée.
2. **Liste blanche au plus près du DOM** — `cleSure` n'autorise dans une URL de sprite
   qu'un numéro, un slug ou un chemin de dossier. Toute autre forme retombe sur le
   sprite `0`.
3. **Échappement de l'apostrophe** — la fonction d'échappement traite désormais `'`
   au même titre que `&`, `<`, `>` et `"`.

### Contre-épreuves

- Même charge, par le chemin d'import : **script non exécuté**, clé écartée, et les
  entrées légitimes du même fichier (`25`, `deerling-winter`) conservées à leur place.
- Même charge **écrite directement dans `localStorage`**, contournant le filtre
  d'import : **script non exécuté**, l'attribut rendu vaut
  `this.onerror=null;this.src='sprites/0.png'`.
- Liste blanche éprouvée sur 14 cas : 7 formes de clés légitimes acceptées
  (`25`, `10034`, `585-summer`, `female/902`, `shiny/female/916`…), 7 charges
  d'attaque refusées (apostrophe, guillemet, chevrons, accent grave, espace,
  traversée de répertoire, chaîne vide).

---

## 2. Table des profils lisible par tous — correctif fourni

### Le défaut

La politique de lecture de `public.profils` était `using (true)`. La clé publiable
étant embarquée dans l'application, donc publique par conception, toute personne la
relevant dans le bundle pouvait interroger la table.

### Vérification

Requête anonyme sur `/rest/v1/profils` : **HTTP 200**, avec la ligne complète du
compte existant — identifiant de compte, pseudonyme, avatar, date de création et date
de dernière activité. La requête n'exige aucune session.

### Portée

Énumération de l'ensemble des comptes, et exposition d'un rythme d'usage par
`modifie_le`. Aucune élévation de privilège : les politiques d'écriture, elles,
étaient correctes (voir plus bas).

### Correction

Migration `supabase/migrations/20261004000000_profils_non_publics.sql` : la lecture
est restreinte à `auth.uid() = id`.

La politique publique était **redondante** : la vérification de disponibilité d'un
pseudonyme ne passe pas par la table mais par la fonction `pseudo_disponible(text)`,
déclarée `security definer`, qui ne rend qu'un booléen et ne permet aucune
énumération. L'application ne lit par ailleurs jamais que son propre profil.

> **Action requise.** Cette migration doit être exécutée dans l'éditeur SQL du projet
> Supabase. Tant qu'elle ne l'est pas, la table reste lisible.

---

## 3. Politique de sécurité de contenu — corrigée

Aucune politique n'était déclarée. Une politique est désormais posée à la compilation
dans une balise `meta` — GitHub Pages ne permet pas d'ajouter d'en-tête HTTP, et sous
Capacitor il n'y a pas de serveur.

**Ce qu'elle apporte réellement** : `connect-src` énumère les seules destinations
joignables, soit l'origine de l'application et le projet Supabase. Un script injecté ne
peut donc plus expédier le jeton de session vers un serveur tiers. `object-src 'none'`,
`base-uri 'self'` et `form-action 'self'` ferment trois autres vecteurs.

**Ce qu'elle n'apporte pas**, et c'est assumé : `script-src` reste permissif.
L'application pose son thème par un script en ligne, ses images portent des
gestionnaires `onerror` en ligne, et le moteur du scan compile du WebAssembly.
Interdire l'exécution en ligne demanderait de réécrire ces trois mécanismes. La
politique ne prétend pas empêcher une injection : elle en limite l'exploitation.
`frame-ancestors` est inopérante dans une balise `meta` ; la protection contre
l'inclusion en cadre tiers n'est pas atteignable sur GitHub Pages.

### Vérification

Depuis la page compilée :

- requête vers le projet Supabase : **aboutie** ;
- requête vers un domaine tiers : **bloquée**, avec le refus explicite du navigateur.

Le script du Worker du scan se charge sans violation. **L'inférence WebAssembly
complète n'a pas pu être exercée ici** : le panneau d'aperçu ne l'exécute pas. Un test
contrôlé a toutefois montré que le blocage observé est **identique avec et sans la
politique**, ce qui écarte la politique comme cause. La directive `script-src` a été
laissée permissive précisément pour ne pas risquer ce chemin.

---

## 4. Audit des dépendances — clarifié

Quatre vulnérabilités étaient signalées, dont une de gravité haute. Toutes se situent
dans la chaîne `@capacitor/cli` → `xcode` → `uuid` et dans `brace-expansion`,
c'est-à-dire dans **l'outillage de compilation**. Aucune n'est livrée : vérifié, zéro
occurrence de ces paquets dans le bundle produit.

`@capacitor/cli` figurait néanmoins en dépendance de production, ce qui faisait
remonter ses failles dans un audit censé ne montrer que le code livré. Il est déplacé
en dépendance de développement. L'audit du périmètre livré rend désormais **zéro
vulnérabilité**, et les deux workflows continuent de l'installer (`npm ci` installe
les dépendances de développement).

---

## Contrôles passés sans constat

### Secrets

- Aucune clé `service_role`, aucun jeton, aucune clé privée dans le dépôt, **ni dans
  l'historique complet des commits** (recherche par motifs sur toutes les révisions).
- `.env` n'est pas suivi par git ; seul `.env.exemple` l'est, sans valeur réelle.
- Le bundle produit ne contient que la clé publiable, l'URL du projet et
  l'identifiant client Google — **publics par conception**. La seule correspondance
  trouvée pour `sb_secret_` est le code de supabase-js qui reconnaît ce format, non un
  secret.

### Écritures en base

Éprouvées sans modifier la moindre donnée, en visant les lignes réelles avec des
valeurs que les contraintes refusent — si la sécurité au niveau des lignes filtre, la
réponse est vide ; si elle ne filtrait pas, c'est la contrainte qui rejetterait, et
rien ne serait écrit dans les deux cas :

| Tentative anonyme | Résultat |
|---|---|
| Lecture de `collections` | `[]` — filtrée |
| Mise à jour de `profils` sur la ligne réelle | `[]` — filtrée, aucune erreur de contrainte |
| Mise à jour de `collections` sur la ligne réelle | `[]` — filtrée, aucune erreur de type |
| Insertion dans `profils` | **HTTP 401** — « new row violates row-level security policy » |
| Appel de `supprime_mon_compte` | **HTTP 400** — « Aucun compte connecté » |

La sécurité au niveau des lignes remplit donc son office en écriture, et la fonction
de suppression n'est pas appelable sans session.

### Service worker

Deux gardes le placent hors de portée des données du compte : il ignore toute méthode
autre que `GET`, et toute requête dont l'origine diffère de la sienne. **Aucune
réponse de l'interface de programmation Supabase ne peut être mise en cache.**

### Fonds de boîte

`paperCss` et `titreCss` n'émettent une URL que si l'identifiant figure au catalogue
embarqué, et la passent par `encodeURIComponent`. Un identifiant fabriqué ne produit
rien. Ce chemin n'est pas exploitable.

### Fonctions à privilèges

`pseudo_disponible`, `cree_profil` et `supprime_mon_compte` sont déclarées
`security definer` avec un `search_path` figé, ce qui empêche un utilisateur de placer
un schéma à lui devant `public` pour détourner la fonction. `supprime_mon_compte` est
retirée au rôle anonyme et n'agit que sur `auth.uid()`, qui provient du jeton vérifié
et ne peut être forgé.

---

## Points de vigilance, sans correctif immédiat

### Le jeton de session vit dans `localStorage`

C'est le fonctionnement par défaut de supabase-js, et il n'existe pas d'alternative
dans une application sans serveur : un cookie `HttpOnly` suppose un serveur pour le
poser. La conséquence est connue — toute injection réussie donne accès au jeton. C'est
ce qui justifie le soin porté au constat n° 1 et la directive `connect-src`.

### Le schéma d'URL `unydex://` n'est pas exclusif

Sur iOS, une autre application peut déclarer le même schéma et intercepter le retour
de connexion. L'échange est protégé par PKCE : le code intercepté est inutilisable sans
le vérificateur, qui ne quitte jamais l'application. Le risque résiduel est un refus de
service, non une usurpation. Un lien universel (« universal link ») y mettrait fin,
mais suppose un domaine et un fichier d'association hébergé.

### Réglages à vérifier dans le tableau de bord Supabase

Hors de portée d'une vérification depuis le code, et à contrôler avant toute
publication :

- confirmation de l'adresse électronique à l'inscription ;
- protection contre les mots de passe compromis (`HaveIBeenPwned`) ;
- longueur minimale du mot de passe ;
- limitation de fréquence sur les points d'authentification ;
- liste des URL de redirection autorisées, strictement limitée aux adresses utiles.
