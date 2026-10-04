# Politique de confidentialité

**Version 1.0 — En vigueur au 4 octobre 2026**

## Préambule

La présente politique a pour objet d'informer l'utilisateur de l'application Unydex
(ci-après « l'Application ») des traitements de données à caractère personnel mis en
œuvre par l'éditeur, conformément aux articles 12 à 14 du règlement (UE) 2016/679 du
27 avril 2016 (ci-après « le RGPD ») et à la loi n° 78-17 du 6 janvier 1978 modifiée,
dite « Informatique et Libertés ».

Elle fait partie intégrante des
[conditions générales d'utilisation](CONDITIONS-UTILISATION.md).

**L'essentiel.** L'Application fonctionne intégralement hors connexion. En l'absence
de compte, **aucune donnée ne quitte le terminal de l'utilisateur** : aucune requête
réseau n'est émise. La création d'un compte est facultative et n'a d'autre objet que
de permettre à l'utilisateur de retrouver sa collection sur un autre terminal.
L'Application ne comporte **aucune publicité, aucun traceur et aucun outil de mesure
d'audience**. Aucune donnée n'est vendue, louée ni communiquée à des tiers à des fins
commerciales.

---

## Article 1 — Responsable du traitement

Le responsable du traitement, au sens de l'article 4.7 du RGPD, est :

- **Nom** : [NOM ET PRÉNOM, OU DÉNOMINATION SOCIALE]
- **Adresse** : [ADRESSE POSTALE COMPLÈTE]
- **Adresse électronique** : [ADRESSE DE CONTACT]

La désignation d'un délégué à la protection des données n'est pas requise au regard
des critères de l'article 37 du RGPD : les traitements mis en œuvre ne constituent ni
un suivi régulier et systématique à grande échelle, ni un traitement à grande échelle
de données relevant de l'article 9 du RGPD.

---

## Article 2 — Traitements mis en œuvre en l'absence de compte

En l'absence de compte, la progression de l'utilisateur — entrées enregistrées,
organisation et personnalisation des boîtes, équipes, préférences d'affichage — est
conservée **exclusivement dans l'espace de stockage local de l'Application**, sur le
terminal. Ces informations ne sont transmises à aucun destinataire et ne font l'objet
d'aucun traitement par le responsable du traitement.

L'ensemble des informations descriptives affichées par l'Application est embarqué dans
celle-ci. Aucune requête n'est adressée à un serveur tiers pour les afficher.

### 2.1. Fonctionnalité de reconnaissance par l'appareil photographique

L'Application comporte une fonctionnalité de reconnaissance d'image utilisant
l'appareil photographique arrière du terminal.

- Le traitement des images est **intégralement exécuté sur le terminal**, au moyen d'un
  modèle d'apprentissage automatique embarqué dans l'Application.
- **Aucune image n'est transmise à un serveur, à l'éditeur ou à un tiers. Aucune image
  n'est enregistrée** : les vues sont analysées puis immédiatement écartées.
- L'accès à l'appareil photographique fait l'objet d'une demande d'autorisation du
  système d'exploitation. Il peut être refusé ou révoqué à tout moment dans les
  réglages du terminal, sans incidence sur le reste de l'Application.

---

## Article 3 — Données traitées en cas de création d'un compte

### 3.1. Catégories de données

- **Données d'identification** — adresse électronique ; mot de passe, conservé sous
  forme de condensat (bcrypt) et jamais accessible en clair ; identifiant interne
  (UUID). *Origine : l'utilisateur, ou son fournisseur d'identité.*
- **Données de profil** — pseudonyme ; image de profil, constituée d'un **identifiant
  numérique** et non d'un fichier image ; dates de création et de modification.
  *Origine : l'utilisateur, ou déduites à l'inscription.*
- **Collection** — entrées enregistrées, organisation et personnalisation des boîtes,
  ordre d'affichage, équipes, préférences d'utilisation (version de jeu, mode
  d'affichage, thème, langue). *Origine : l'usage de l'Application.*
- **Données techniques** — date du dernier enregistrement ; **type** de terminal
  d'origine (« iPhone » ou « Navigateur »), à l'exclusion de tout identifiant ou nom de
  terminal. *Origine : automatique.*

### 3.2. Connexion par un fournisseur d'identité

Lorsque l'utilisateur choisit de se connecter au moyen d'un compte Google ou Apple, le
fournisseur d'identité communique au responsable du traitement **l'adresse électronique
et, le cas échéant, le nom** associés à ce compte, à l'exclusion de toute autre donnée.
Aucun autre accès au compte du fournisseur n'est sollicité : ni aux contacts, ni à
l'agenda, ni aux fichiers, ni aux messages.

Le service d'authentification Apple permet à l'utilisateur de **masquer son adresse
électronique** ; dans ce cas, le responsable du traitement n'a connaissance que d'une
adresse de relais.

La connexion auprès du fournisseur d'identité s'effectue directement entre
l'utilisateur et celui-ci. Les traitements réalisés à cette occasion par le
fournisseur relèvent de sa propre politique de confidentialité.

### 3.3. Données non collectées

Ne font l'objet d'aucune collecte : les données de géolocalisation, le carnet
d'adresses, l'agenda, la photothèque, le microphone, les données de santé, les
identifiants publicitaires, l'historique de navigation, la liste des applications
installées et les données bancaires. L'Application ne comporte aucun achat intégré.

### 3.4. Absence de profilage et de décision automatisée

Aucun profilage au sens de l'article 4.4 du RGPD n'est mis en œuvre. Aucune décision
produisant des effets juridiques ou affectant de manière significative l'utilisateur
n'est prise sur le fondement d'un traitement automatisé, au sens de l'article 22 du
RGPD.

### 3.5. Absence de prospection

Les données collectées ne sont utilisées à aucune fin de prospection commerciale.
Aucun message publicitaire ni lettre d'information n'est adressé à l'utilisateur.

### 3.6. Absence de suivi publicitaire

Aucune donnée n'est rapprochée de données détenues par des tiers, ni transmise à un
courtier en données, ni exploitée à des fins de publicité ciblée. L'Application ne
procède à aucun suivi au sens du cadre « App Tracking Transparency » d'Apple et ne
sollicite, en conséquence, aucune autorisation à ce titre.

---

## Article 4 — Finalités et bases légales

| Finalité | Base légale |
|---|---|
| Création, gestion et authentification du compte | Exécution du contrat — art. 6.1.b du RGPD |
| Conservation et restitution de la collection sur un autre terminal | Exécution du contrat — art. 6.1.b du RGPD |
| Vérification de la disponibilité d'un pseudonyme | Exécution du contrat — art. 6.1.b du RGPD |
| Sécurité des systèmes, journalisation technique, prévention des abus | Intérêt légitime — art. 6.1.f du RGPD |
| Respect des obligations légales incombant au responsable du traitement | Obligation légale — art. 6.1.c du RGPD |

Le consentement n'est pas retenu comme base légale : la création d'un compte est
facultative, et les seules données traitées sont celles nécessaires à la fourniture du
service expressément demandé. L'utilisateur qui ne crée pas de compte ne transmet
aucune donnée.

**Caractère obligatoire des données.** Les données mentionnées à l'article 3.1 sont
nécessaires à la création et au fonctionnement du compte. À défaut de les fournir,
l'utilisateur ne peut bénéficier des fonctionnalités en ligne ; l'Application demeure
pleinement utilisable sans compte.

---

## Article 5 — Destinataires et sous-traitants

Les données sont destinées au seul responsable du traitement et, dans la stricte
limite de l'exécution de leurs prestations, aux sous-traitants suivants :

- **Supabase, Inc.** — hébergement de la base de données et service
  d'authentification. Garanties : addendum de traitement des données et liste publique
  des sous-traitants ultérieurs ; clauses contractuelles types de la Commission
  européenne.
- **GitHub, Inc.** — hébergement du site et des fichiers de l'application. Garanties :
  addendum de protection des données de GitHub.
- **Apple Inc.** — distribution de l'application et, le cas échéant, service
  d'authentification. Garanties : conditions des services Apple Media.

Chaque sous-traitant intervient sur instruction documentée du responsable du
traitement, dans les conditions de l'article 28 du RGPD.

Les données peuvent en outre être communiquées à toute autorité administrative ou
judiciaire habilitée qui en formerait la demande dans les conditions prévues par la
loi.

**Aucune donnée n'est cédée, louée ou échangée à des fins commerciales.**

---

## Article 6 — Transferts hors de l'Union européenne

Les données du compte sont hébergées dans la région **[RÉGION DU PROJET]**.

Lorsque la région d'hébergement est située hors de l'Union européenne, ou lorsqu'un
sous-traitant ultérieur est établi hors de l'Union, le transfert est encadré par les
**clauses contractuelles types** adoptées par la Commission européenne au titre de
l'article 46.2.c du RGPD, incorporées à l'addendum de traitement des données du
sous-traitant concerné, assorties le cas échéant de mesures techniques
supplémentaires.

Une copie des garanties applicables peut être obtenue sur demande adressée au
responsable du traitement.

---

## Article 7 — Durées de conservation

| Donnée | Durée |
|---|---|
| Compte, profil et collection enregistrée sur les serveurs | Jusqu'à la suppression du compte par l'utilisateur. L'effacement est immédiat et en cascade |
| Données enregistrées sur le terminal | Jusqu'à la désinstallation de l'Application, ou jusqu'à l'effacement de ses données par l'utilisateur |
| Journaux techniques des hébergeurs | Durée fixée par chaque hébergeur, de l'ordre de quelques jours |

Aucune conservation en archivage intermédiaire n'est opérée après la suppression d'un
compte, et aucune copie n'est conservée par le responsable du traitement, sous réserve
des sauvegardes techniques des hébergeurs, dont la rotation entraîne l'effacement dans
les délais ci-dessus.

---

## Article 8 — Sécurité

Le responsable du traitement met en œuvre les mesures techniques et organisationnelles
appropriées au sens de l'article 32 du RGPD, et notamment :

- le chiffrement de l'intégralité des communications (protocole HTTPS) ;
- la conservation des mots de passe sous forme de condensat, excluant toute
  restitution en clair ;
- un cloisonnement appliqué **au niveau de la base de données** (sécurité au niveau
  des lignes) garantissant qu'un compte ne peut consulter ni modifier que ses propres
  enregistrements ;
- l'absence de tout privilège attaché à la clé publique embarquée dans l'Application,
  laquelle ne confère par elle-même aucun accès aux données ;
- la limitation des fonctions à privilèges élevés et le verrouillage de leur chemin de
  recherche.

Le pseudonyme et l'image de profil sont accessibles aux comptes authentifiés, ce qui
permet d'indiquer qu'un pseudonyme est déjà attribué. **Ni l'adresse électronique, ni
la collection ne sont accessibles à d'autres utilisateurs.**

Aucun système n'étant à l'abri d'une défaillance, le responsable du traitement
s'engage, en cas de violation de données susceptible d'engendrer un risque élevé pour
les droits et libertés des personnes concernées, à en informer celles-ci dans les
conditions de l'article 34 du RGPD, et à notifier la violation à l'autorité de
contrôle dans les conditions de l'article 33.

---

## Article 9 — Droits des personnes concernées

L'utilisateur dispose, dans les conditions et limites prévues par le RGPD, des droits
suivants : droit d'**accès** (art. 15), de **rectification** (art. 16),
d'**effacement** (art. 17), à la **limitation du traitement** (art. 18), à la
**portabilité** (art. 20) et d'**opposition** (art. 21). Il dispose également du droit
de définir des **directives relatives au sort de ses données après son décès**, en
application de l'article 85 de la loi n° 78-17 du 6 janvier 1978 modifiée.

### 9.1. Modalités d'exercice dans l'Application

| Droit | Modalité |
|---|---|
| Accès et portabilité | Réglages → Sauvegarde → « Exporter toutes mes données ». Un fichier complet, lisible et structuré est remis immédiatement, sans formalité |
| Rectification | Réglages → Compte : le pseudonyme et l'image de profil se modifient directement |
| Effacement | Réglages → Compte → « Supprimer mon compte ». L'effacement du compte, du profil et de la collection conservée sur les serveurs est immédiat et définitif |

La suppression du compte est sans incidence sur la collection enregistrée sur le
terminal, qui demeure accessible hors connexion.

### 9.2. Modalités d'exercice auprès du responsable du traitement

Les autres droits s'exercent par demande adressée à l'adresse électronique figurant à
l'article 1, accompagnée de tout élément permettant de justifier de l'identité du
demandeur en cas de doute raisonnable. Il y est répondu dans le délai d'un mois à
compter de la réception de la demande, prorogeable de deux mois en cas de complexité,
l'utilisateur étant alors informé de cette prorogation et de ses motifs.

### 9.3. Réclamation

L'utilisateur qui estime, après avoir contacté le responsable du traitement, que ses
droits ne sont pas respectés peut introduire une réclamation auprès de la **Commission
nationale de l'informatique et des libertés** (CNIL), 3 place de Fontenoy, TSA 80715,
75334 Paris Cedex 07 — [www.cnil.fr](https://www.cnil.fr), ou auprès de l'autorité de
contrôle de l'État membre de sa résidence habituelle.

### 9.4. Rappel des dispositions pénales protectrices

Les manquements du responsable d'un traitement aux obligations résultant de la
réglementation relative à la protection des données à caractère personnel sont
réprimés par les **articles 226-16 à 226-24 du code pénal**, qui punissent notamment
de **cinq ans d'emprisonnement et de 300 000 euros d'amende** le fait de procéder à un
traitement de données à caractère personnel en méconnaissance des obligations légales,
sans préjudice des amendes administratives pouvant être prononcées par l'autorité de
contrôle sur le fondement de l'article 83 du RGPD.

---

## Article 10 — Mineurs

La création d'un compte est réservée aux personnes âgées de **seize (16) ans
révolus**, ou de l'âge inférieur fixé par la législation nationale applicable en
application de l'article 8.1 du RGPD — quinze (15) ans en France, en application de
l'article 7-1 de la loi n° 78-17 du 6 janvier 1978 modifiée.

En deçà de cet âge, l'Application demeure **intégralement utilisable sans compte** :
l'ensemble de ses fonctionnalités s'exécute localement, sans transmission de données.

L'Application ne s'adresse pas spécifiquement aux enfants et ne collecte sciemment
aucune donnée les concernant. Le titulaire de l'autorité parentale qui constaterait
qu'un compte a été créé en méconnaissance du présent article peut en demander
l'effacement à l'adresse figurant à l'article 1 ; il y est procédé sans délai.

---

## Article 11 — Modification de la présente politique

La présente politique est susceptible d'évoluer, notamment en cas d'évolution des
traitements ou de la réglementation. La version applicable est celle publiée aux
adresses mentionnées dans l'Application. Toute modification substantielle est portée à
la connaissance de l'utilisateur par un moyen approprié au sein de l'Application.

L'historique des versions successives est public et consultable dans le dépôt du code
source.

---

## Article 12 — Contact

Toute question relative à la présente politique peut être adressée au responsable du
traitement à l'adresse figurant à l'article 1.
