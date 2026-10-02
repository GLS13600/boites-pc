# Registre des activités de traitement

**Article 30 du RGPD.** Obligatoire dès lors qu'un traitement de données personnelles
n'est pas occasionnel — ce qui est le cas d'un compte utilisateur, même pour un
service gratuit tenu par une personne seule. Il n'a pas à être publié : il doit être
**tenu, à jour, et produit sur demande** de la CNIL.

Ce document est le registre. Il se met à jour **en même temps que le code** — un
nouveau champ en base, un nouveau sous-traitant, et il est faux.

- **Responsable de traitement** : *[à compléter — nom, adresse, e-mail]*
- **Délégué à la protection des données** : aucun. Non obligatoire ici (art. 37) : pas
  d'autorité publique, pas de suivi à grande échelle, pas de données sensibles.
- **Dernière mise à jour** : 2 octobre 2026.

---

## Traitement n° 1 — Comptes utilisateurs

| | |
|---|---|
| **Finalité** | Permettre à une personne de créer un compte, de s'y connecter, et d'être identifiée dans l'application |
| **Base légale** | Exécution du contrat (art. 6.1.b) |
| **Personnes concernées** | Utilisateurs d'Unydex ayant volontairement créé un compte |
| **Catégories de données** | Adresse e-mail ; mot de passe **haché** (bcrypt) ; identifiant interne (UUID) ; pseudo ; photo de profil (une **clé de Pokémon**, pas une image) ; dates de création et de modification. Pour une connexion Google ou Apple : l'adresse e-mail et, le cas échéant, le nom transmis par le fournisseur |
| **Données sensibles** | Aucune (art. 9) |
| **Mineurs** | Compte réservé aux 16 ans et plus ; l'application est pleinement utilisable sans compte |
| **Destinataires** | Le responsable de traitement. L'hébergeur Supabase comme sous-traitant |
| **Transferts hors UE** | *[à compléter : dépend de la région du projet Supabase]*. Le cas échéant : clauses contractuelles types, via l'addendum de traitement de Supabase |
| **Durée de conservation** | Jusqu'à suppression du compte par l'utilisateur. Effacement immédiat, en cascade |
| **Mesures de sécurité** | HTTPS ; mots de passe hachés par l'hébergeur ; **sécurité au niveau des lignes** (RLS) sur toutes les tables ; clé publique sans droit propre ; fonctions `security definer` à `search_path` figé ; `on delete cascade` depuis `auth.users` |
| **Tables** | `auth.users` (géré par Supabase), `public.profils` |

**Note sur la lisibilité des profils.** La table `profils` est lisible par les comptes
authentifiés : c'est ce qui permet de répondre « ce pseudo est déjà pris ». Elle ne
contient **ni adresse e-mail ni collection** — l'e-mail reste dans `auth.users`,
inaccessible au client. C'est un choix de conception, documenté dans la migration
`supabase/migrations/20261001000000_comptes.sql`.

---

## Traitement n° 2 — Sauvegarde de la collection

| | |
|---|---|
| **Finalité** | Permettre de retrouver sa collection sur un autre appareil et de la mettre à l'abri d'une réinstallation |
| **Base légale** | Exécution du contrat (art. 6.1.b) |
| **Personnes concernées** | Utilisateurs connectés |
| **Catégories de données** | La collection : identifiants des entrées capturées (normales et chromatiques), contenu et personnalisation des boîtes, ordre des onglets, équipes par version, préférences (jeu, vue, thème, langue). Plus : la **date** du dernier envoi et le **type d'appareil** (« iPhone » ou « Navigateur ») |
| **Données sensibles** | Aucune. Ce sont des données de jeu, rattachées à un compte |
| **Destinataires** | Le responsable de traitement. L'hébergeur Supabase comme sous-traitant |
| **Durée de conservation** | Jusqu'à suppression du compte. Effacement immédiat, en cascade |
| **Mesures de sécurité** | RLS : un compte ne lit et n'écrit **que sa propre ligne**. Aucune politique de lecture publique sur cette table |
| **Table** | `public.collections` |

**Note.** `localStorage` reste la source de vérité ; le serveur n'est qu'une copie.
Supprimer le compte n'efface pas la collection locale, et c'est dit à l'utilisateur
au moment de supprimer.

---

## Traitement n° 3 — Journaux techniques (sous-traitant)

| | |
|---|---|
| **Finalité** | Sécurité, diagnostic, lutte contre l'abus |
| **Base légale** | Intérêt légitime (art. 6.1.f) |
| **Catégories de données** | Adresses IP, horodatages et métadonnées des requêtes |
| **Qui les tient** | **Supabase** pour l'API du compte ; **GitHub Pages** pour le site web. Ni l'un ni l'autre n'est consulté par le responsable de traitement, et aucun profil n'en est tiré |
| **Durée** | Celle fixée par chaque hébergeur — quelques jours |

---

## Ce qui N'EST PAS traité

À garder dans le registre : l'absence est une information utile, et c'est elle qu'on
vérifie quand on ajoute une fonctionnalité.

- **Aucune mesure d'audience, aucun traceur, aucune publicité.** Aucun SDK d'analyse
  n'est embarqué, ni dans l'application ni sur le site.
- **Aucune image de la caméra n'est transmise ni conservée.** La reconnaissance tourne
  sur l'appareil, par un modèle embarqué ; les images sont analysées puis jetées.
- **Aucune géolocalisation**, aucun accès au carnet d'adresses, à l'agenda, aux photos,
  au micro, ni aux données de santé.
- **Aucun identifiant publicitaire**, aucun suivi inter-applications. Rien à déclarer
  au titre d'App Tracking Transparency.
- **Aucune donnée de paiement** : l'application est gratuite et sans achat intégré.

---

## Sous-traitants

| Sous-traitant | Rôle | Garanties |
|---|---|---|
| **Supabase, Inc.** | Hébergement de la base, authentification | [Addendum de traitement](https://supabase.com/legal/customer-resources/data-processing-addendum), [liste des sous-traitants ultérieurs](https://supabase.com/legal/customer-resources/subprocessor-list), clauses contractuelles types |
| **GitHub, Inc.** | Hébergement du site et des fichiers | [Addendum de GitHub](https://docs.github.com/site-policy/privacy-policies/github-data-protection-agreement) |
| **Google LLC** | Fournisseur d'identité, si l'utilisateur choisit « Continuer avec Google » | Relation directe entre l'utilisateur et Google au moment de la connexion |
| **Apple Inc.** | Fournisseur d'identité et distribution de l'application | Idem |

**À faire à chaque ajout** : un nouveau service appelé par l'application, même pour
une seule fonction, s'ajoute ici **avant** d'être mis en ligne.

---

## Analyse d'impact (AIPD)

**Non requise.** Les critères de l'article 35 ne sont pas réunis : pas de suivi
systématique à grande échelle, pas de données sensibles, pas de décision automatisée
produisant des effets juridiques, pas de croisement de fichiers, pas de public
vulnérable visé. À réexaminer si l'application ajoute un jour un partage entre
utilisateurs, un classement public, ou la moindre mesure d'audience.
