# Registre des activités de traitement

**Article 30 du règlement (UE) 2016/679**

**Version 1.0 — Mis à jour le 4 octobre 2026**

Le présent registre recense les activités de traitement de données à caractère
personnel mises en œuvre dans le cadre de l'application Unydex et du service en ligne
qui lui est associé.

Il n'a pas vocation à être publié. Il est **tenu à jour** et **mis à la disposition de
l'autorité de contrôle** sur demande, conformément à l'article 30.4 du RGPD.

---

## Identification du responsable du traitement

| Rubrique | Information |
|---|---|
| Responsable du traitement | [NOM ET PRÉNOM, OU DÉNOMINATION SOCIALE] |
| Adresse | [ADRESSE POSTALE COMPLÈTE] |
| Adresse électronique | [ADRESSE DE CONTACT] |
| Représentant au sens de l'art. 27 | Sans objet — le responsable est établi dans l'Union |
| Délégué à la protection des données | Non désigné. Les critères de l'article 37 du RGPD ne sont pas réunis : absence de suivi régulier et systématique à grande échelle, absence de traitement à grande échelle de données relevant de l'article 9, absence d'autorité ou d'organisme public |

---

## Traitement n° 1 — Gestion des comptes utilisateurs

| Rubrique | Information |
|---|---|
| **Finalité principale** | Permettre la création d'un compte, l'authentification de son titulaire et son identification au sein de l'application |
| **Finalités secondaires** | Vérification de la disponibilité d'un pseudonyme ; réinitialisation du mot de passe |
| **Base légale** | Exécution du contrat — art. 6.1.b du RGPD |
| **Personnes concernées** | Utilisateurs de l'application ayant volontairement créé un compte |
| **Catégories de données** | Adresse électronique ; mot de passe sous forme de condensat (bcrypt) ; identifiant interne (UUID) ; pseudonyme ; image de profil, constituée d'un identifiant numérique et non d'un fichier ; dates de création et de modification. En cas de connexion par un fournisseur d'identité : adresse électronique et, le cas échéant, nom transmis par celui-ci |
| **Catégories particulières (art. 9)** | Aucune |
| **Données relatives à des condamnations (art. 10)** | Aucune |
| **Mineurs** | Compte réservé aux personnes de 16 ans révolus, ou de l'âge inférieur fixé par la législation nationale applicable (15 ans en France). L'application est pleinement utilisable sans compte |
| **Destinataires** | Le responsable du traitement. Supabase, Inc. en qualité de sous-traitant. Autorités administratives ou judiciaires habilitées, sur réquisition |
| **Transferts hors UE** | [RÉGION DU PROJET — À RENSEIGNER]. Le cas échéant : clauses contractuelles types de la Commission européenne, incorporées à l'addendum de traitement du sous-traitant |
| **Durée de conservation** | Jusqu'à la suppression du compte par l'utilisateur. Effacement immédiat et en cascade, sans archivage intermédiaire |
| **Mesures de sécurité** | Chiffrement des communications (HTTPS) ; mots de passe conservés sous forme de condensat par le sous-traitant ; sécurité au niveau des lignes activée sur l'ensemble des tables ; clé publique dépourvue de tout privilège propre ; fonctions `security definer` à chemin de recherche figé ; suppression en cascade depuis la table des comptes |
| **Supports de traitement** | Tables `auth.users` (gérée par le sous-traitant) et `public.profils` |

**Observation.** La table `public.profils` est accessible en lecture aux comptes
authentifiés, ce qui permet de signaler qu'un pseudonyme est déjà attribué. Elle ne
contient **ni adresse électronique, ni collection** : l'adresse demeure dans la table
`auth.users`, inaccessible au client. Ce choix de conception est documenté dans le
fichier de migration `supabase/migrations/20261001000000_comptes.sql`.

---

## Traitement n° 2 — Sauvegarde et restitution de la collection

| Rubrique | Information |
|---|---|
| **Finalité** | Conserver une copie de la collection constituée par l'utilisateur et la lui restituer sur un autre terminal ou après réinstallation |
| **Base légale** | Exécution du contrat — art. 6.1.b du RGPD |
| **Personnes concernées** | Utilisateurs disposant d'un compte et connectés |
| **Catégories de données** | Identifiants des entrées enregistrées ; organisation et personnalisation des boîtes ; ordre d'affichage des onglets ; équipes par version de jeu ; préférences (version, mode d'affichage, thème, langue) ; date du dernier enregistrement ; type de terminal d'origine (« iPhone » ou « Navigateur »), à l'exclusion de tout identifiant de terminal |
| **Catégories particulières (art. 9)** | Aucune. Les données traitées sont des données d'usage ludique rattachées à un compte |
| **Destinataires** | Le responsable du traitement. Supabase, Inc. en qualité de sous-traitant |
| **Transferts hors UE** | Identiques au traitement n° 1 |
| **Durée de conservation** | Jusqu'à la suppression du compte. Effacement immédiat et en cascade |
| **Mesures de sécurité** | Sécurité au niveau des lignes : un compte ne peut consulter ni modifier que son propre enregistrement. Aucune politique de lecture publique n'est définie sur cette table |
| **Support de traitement** | Table `public.collections` |

**Observation.** Le stockage local du terminal demeure la source de référence ; le
serveur n'en conserve qu'une copie. La suppression du compte n'entraîne pas
l'effacement de la collection enregistrée sur le terminal, ce dont l'utilisateur est
informé au moment de la suppression.

---

## Traitement n° 3 — Journalisation technique (mise en œuvre par les sous-traitants)

| Rubrique | Information |
|---|---|
| **Finalité** | Sécurité des systèmes, diagnostic des incidents, prévention et détection des abus |
| **Base légale** | Intérêt légitime — art. 6.1.f du RGPD. L'intérêt poursuivi est le maintien en condition opérationnelle et la sécurité du service ; il ne porte pas une atteinte disproportionnée aux droits des personnes, les journaux n'étant ni consultés ni exploités par le responsable du traitement |
| **Catégories de données** | Adresses IP, horodatages et métadonnées des requêtes |
| **Responsabilité** | Journaux tenus par Supabase, Inc. pour l'interface de programmation du compte, et par GitHub, Inc. pour le site. Aucun profil n'en est tiré |
| **Durée de conservation** | Durée fixée par chaque hébergeur, de l'ordre de quelques jours |

---

## Traitements expressément écartés

Le présent registre consigne également ce qui **n'est pas** traité. Cette rubrique sert
de référence lors de l'ajout de toute nouvelle fonctionnalité.

- **Aucune mesure d'audience, aucun traceur, aucune publicité.** Aucun outil d'analyse
  tiers n'est intégré, ni dans l'application ni sur le site.
- **Aucune image issue de l'appareil photographique n'est transmise ni conservée.** La
  reconnaissance s'exécute sur le terminal, au moyen d'un modèle embarqué ; les vues
  sont analysées puis immédiatement écartées.
- **Aucune donnée de géolocalisation**, aucun accès au carnet d'adresses, à l'agenda, à
  la photothèque, au microphone ni aux données de santé.
- **Aucun identifiant publicitaire**, aucun suivi inter-applications. Aucune
  déclaration n'est requise au titre du cadre « App Tracking Transparency ».
- **Aucune donnée bancaire** : l'application est gratuite et ne comporte aucun achat
  intégré.
- **Aucun profilage ni décision automatisée** au sens des articles 4.4 et 22 du RGPD.
- **Aucune prospection commerciale.**

---

## Sous-traitants et destinataires

| Sous-traitant | Prestation | Garanties contractuelles |
|---|---|---|
| **Supabase, Inc.** | Hébergement de la base de données, service d'authentification | Addendum de traitement des données ; liste publique des sous-traitants ultérieurs ; clauses contractuelles types |
| **GitHub, Inc.** | Hébergement du site et des fichiers de l'application | Addendum de protection des données de GitHub |
| **Apple Inc.** | Distribution de l'application ; service d'authentification, le cas échéant | Conditions des services Apple Media |
| **Google LLC** | Fournisseur d'identité, lorsque l'utilisateur choisit ce mode de connexion | Relation directe entre l'utilisateur et le fournisseur au moment de la connexion |

**Règle de tenue.** Tout service externe appelé par l'application, fût-ce pour une
seule fonctionnalité, est inscrit au présent registre **préalablement** à sa mise en
production.

---

## Analyse d'impact relative à la protection des données

**Non requise.** Les critères de l'article 35 du RGPD, précisés par la délibération de
la CNIL n° 2018-327 du 11 octobre 2018, ne sont pas réunis : absence d'évaluation ou de
notation, absence de décision automatisée avec effet juridique, absence de
surveillance systématique, absence de données sensibles ou à caractère hautement
personnel, absence de traitement à grande échelle, absence de croisement d'ensembles de
données, absence de public vulnérable, absence d'usage innovant faisant obstacle à
l'exercice d'un droit.

Une nouvelle analyse de la nécessité d'une étude d'impact sera conduite en cas
d'évolution du service, notamment en cas d'introduction d'un partage de données entre
utilisateurs, d'un classement public, d'une fonctionnalité de mise en relation ou d'un
outil de mesure d'audience.

---

## Historique des versions

| Version | Date | Objet |
|---|---|---|
| 1.0 | 4 octobre 2026 | Établissement du registre |
