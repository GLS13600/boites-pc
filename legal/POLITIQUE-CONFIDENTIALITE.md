# Politique de confidentialité — Unydex

**Dernière mise à jour : 2 octobre 2026.**

Unydex est une application personnelle de suivi de collection. Cette politique dit
exactement ce qu'elle fait de tes données — et, surtout, tout ce qu'elle n'en fait
pas.

---

## En résumé

- **Sans compte, rien ne quitte ton appareil.** Aucune requête réseau, aucune donnée
  envoyée, aucune mesure d'audience. L'application fonctionne entièrement hors ligne.
- **Le compte est facultatif.** Il ne sert qu'à retrouver ta collection sur un autre
  appareil et à la mettre à l'abri d'une réinstallation.
- **Aucune publicité, aucun traceur, aucune mesure d'audience**, ni dans
  l'application ni sur le site.
- **Aucune donnée n'est vendue, louée, ni transmise à des tiers** à des fins
  commerciales.
- **La caméra ne transmet rien.** La reconnaissance tourne sur ton téléphone.
- **Tu peux tout supprimer depuis l'application**, immédiatement et définitivement.

---

## 1. Qui est responsable

Le responsable de traitement est :

- **Nom** : *[à compléter — nom et prénom, ou raison sociale]*
- **Adresse** : *[à compléter — adresse postale]*
- **Contact** : *[à compléter — adresse e-mail de contact]*

> **À compléter avant publication.** Ces trois informations sont obligatoires : au
> titre de l'article 13 du RGPD, et au titre du règlement européen sur les services
> numériques (DSA), qui impose en plus de les déclarer dans App Store Connect où
> elles seront **affichées publiquement** sur la fiche de l'application. Voir
> [PUBLICATION.md](PUBLICATION.md).

---

## 2. Ce que l'application fait SANS compte

Rien ne sort de l'appareil.

Ta progression — Pokémon capturés, boîtes, noms et fonds de boîte, équipes,
préférences — est enregistrée **uniquement dans le stockage local de l'application**
(`localStorage`). Elle n'est lue par personne d'autre que toi, et elle disparaît si tu
désinstalles l'application sans l'avoir exportée.

Toutes les données du jeu (sprites, descriptions, lieux, attaques, sons) sont
**embarquées dans l'application** : elle ne consulte aucun serveur pour les afficher.

### La caméra

La vue Scan utilise l'appareil photo arrière pour reconnaître ce que tu filmes.

- L'analyse se fait **entièrement sur ton téléphone**, par un réseau de neurones
  embarqué dans l'application.
- **Aucune image n'est envoyée nulle part.** Aucune n'est enregistrée : les images
  sont analysées puis jetées, à la volée.
- L'accès à la caméra est demandé par iOS et peut être refusé ou retiré à tout moment
  dans les réglages du téléphone ; le reste de l'application continue de fonctionner.

---

## 3. Ce que l'application fait AVEC un compte

Créer un compte est un choix. Tant que tu n'en crées pas, la section précédente décrit
tout ce qui se passe.

### 3.1. Données traitées

| Donnée | Pourquoi | D'où elle vient |
|---|---|---|
| **Adresse e-mail** | Identifier ton compte, confirmer l'inscription, réinitialiser le mot de passe | Toi, ou ton compte Google / Apple |
| **Mot de passe** | Te connecter. Il est **haché** (bcrypt) : il n'est jamais stocké ni lisible en clair | Toi |
| **Identifiant interne** (UUID) | Relier ton profil et ta collection à ton compte | Généré automatiquement |
| **Pseudo** | T'identifier dans l'application | Toi, ou déduit de ton e-mail / de ton nom Google à l'inscription |
| **Photo de profil** | L'afficher. C'est **un numéro de Pokémon**, pas une image : rien n'est téléversé | Toi |
| **Ta collection** | La retrouver sur un autre appareil : Pokémon capturés, boîtes, ordre, équipes, et préférences (jeu, vue, thème, langue) | Ton usage de l'application |
| **Type d'appareil** | Pouvoir t'écrire « enregistrée depuis iPhone » quand deux appareils divergent. C'est le **type** (« iPhone » ou « Navigateur »), jamais un identifiant ni un nom d'appareil | Déduit |
| **Date du dernier envoi** | Savoir laquelle de deux collections est la plus récente | Automatique |

Si tu te connectes avec **Google** ou **Apple**, le fournisseur transmet ton adresse
e-mail et, le cas échéant, ton nom — rien d'autre. Unydex ne demande aucun autre
accès à ton compte Google ou Apple : ni contacts, ni agenda, ni fichiers.
Avec Apple, tu peux choisir de **masquer ton adresse** : l'application n'en verra
qu'un alias.

### 3.2. Ce qui n'est JAMAIS collecté

Ni localisation, ni carnet d'adresses, ni agenda, ni photos, ni micro, ni santé, ni
identifiant publicitaire, ni historique de navigation, ni liste d'applications
installées, ni données de paiement. L'application n'a aucun achat intégré.

### 3.3. Pas de suivi publicitaire

Aucune donnée n'est utilisée pour te suivre à travers d'autres applications ou sites.
Il n'y a **aucune régie publicitaire, aucun SDK d'analyse, aucun pixel**. Au sens du
cadre « App Tracking Transparency » d'Apple, Unydex **ne fait pas de suivi**.

---

## 4. Sur quelle base légale

| Traitement | Base légale (RGPD) |
|---|---|
| Création et tenue du compte, connexion | **Exécution du contrat** (art. 6.1.b) : c'est le service que tu demandes |
| Sauvegarde et restitution de la collection | **Exécution du contrat** (art. 6.1.b) |
| Journaux techniques de l'hébergeur, lutte contre l'abus | **Intérêt légitime** (art. 6.1.f) : garder le service debout et sûr |

Le consentement n'est pas la base retenue, et c'est volontaire : le compte est
facultatif, et les données traitées sont **strictement celles qu'il faut** pour rendre
le service demandé. Ne pas créer de compte est le moyen de ne rien transmettre.

---

## 5. Qui héberge, et où

Les données du compte sont hébergées par **Supabase** (Supabase, Inc.), qui agit comme
sous-traitant au sens de l'article 28 du RGPD.

- Région du projet : *[à compléter — voir Supabase → Project Settings → General →
  Region]*.
- Supabase publie un [addendum de traitement des données](https://supabase.com/legal/customer-resources/data-processing-addendum)
  et la [liste de ses sous-traitants ultérieurs](https://supabase.com/legal/customer-resources/subprocessor-list).
- Si la région choisie est **hors Union européenne**, le transfert est encadré par les
  **clauses contractuelles types** de la Commission européenne, incorporées à cet
  addendum.

> **À vérifier avant publication.** Choisir une région européenne (Paris, Francfort,
> Irlande ou Stockholm) simplifie considérablement ce paragraphe — et c'est un
> changement qui se fait en créant le projet, pas après. Voir
> [PUBLICATION.md](PUBLICATION.md).

L'hébergeur conserve des **journaux techniques** (adresses IP, horodatages des
requêtes) pendant une courte durée, pour la sécurité et le diagnostic. Unydex ne les
consulte pas et n'en tire aucun profil.

Le site `gls13600.github.io` est servi par **GitHub Pages** (GitHub, Inc.), qui tient
ses propres journaux d'accès.

---

## 6. Combien de temps

- **Compte et collection** : conservés tant que le compte existe. Ils sont effacés
  **immédiatement** à sa suppression.
- **Données locales sur l'appareil** : tant que l'application est installée. Les
  désinstaller les efface.
- **Journaux de l'hébergeur** : quelques jours, selon la politique de Supabase.

Il n'y a **aucune conservation « au cas où »** après la suppression d'un compte, ni
sauvegarde parallèle conservée de notre côté.

---

## 7. Tes droits

Tu disposes des droits d'**accès**, de **rectification**, d'**effacement**, de
**limitation**, d'**opposition** et de **portabilité** (RGPD, art. 15 à 22). En
pratique, dans l'application :

| Droit | Comment l'exercer |
|---|---|
| **Accès et portabilité** | Réglages → Sauvegarde → **Exporter toutes mes données**. Tu obtiens un fichier JSON lisible, complet, immédiatement et sans rien demander à personne |
| **Rectification** | Réglages → Compte : le pseudo et la photo se modifient sur place |
| **Effacement** | Réglages → Compte → **Supprimer mon compte**. Immédiat et définitif : compte, profil et collection serveur disparaissent ensemble |
| **Opposition, limitation** | Écris à l'adresse de contact ci-dessus |

La suppression du compte **ne touche pas** à ta collection locale : elle reste sur ton
téléphone, et l'application continue de marcher sans compte.

Tu peux introduire une réclamation auprès de la **CNIL** (3 place de Fontenoy, 75007
Paris — [cnil.fr](https://www.cnil.fr)) si tu estimes que tes droits ne sont pas
respectés.

---

## 8. Sécurité

- Toutes les communications passent en **HTTPS**.
- Les mots de passe sont **hachés** par Supabase ; ils ne sont ni stockés ni
  consultables en clair.
- L'accès aux données est verrouillé au niveau de la base par la **sécurité au niveau
  des lignes** (RLS) : techniquement, un compte ne peut lire ni écrire que ses propres
  lignes. La clé publique embarquée dans l'application ne donne accès à rien par
  elle-même.
- Les profils (pseudo et photo) sont lisibles par les comptes authentifiés : c'est ce
  qui permet de dire « ce pseudo est déjà pris ». **Ni l'adresse e-mail ni la
  collection ne le sont.**

Aucun système n'est infaillible. En cas de violation de données présentant un risque,
tu serais informé conformément à l'article 34 du RGPD.

---

## 9. Âge minimum

Le compte est réservé aux personnes de **16 ans ou plus**. En dessous, l'application
reste parfaitement utilisable **sans compte** : toutes ses fonctions marchent en
local.

Unydex ne s'adresse pas spécifiquement aux enfants et ne collecte sciemment aucune
donnée de personne de moins de 16 ans. Si tu constates qu'un tel compte a été créé,
écris à l'adresse de contact : il sera supprimé.

---

## 10. Modifications

Cette politique peut évoluer. La date en tête indique la dernière version. Un
changement significatif sera annoncé dans l'application. L'historique complet des
modifications est public dans le dépôt du code.

---

## 11. Contact

*[à compléter — adresse e-mail de contact]*
