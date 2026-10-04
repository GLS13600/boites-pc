# Étiquette de confidentialité App Store — réponses à recopier

App Store Connect → l'application → **App Privacy**.

Le questionnaire est long et ses intitulés sont trompeurs : une réponse trop large
fait apparaître des mentions alarmantes sur la fiche publique, une réponse trop
étroite constitue une déclaration inexacte. Le présent document consigne les réponses
exactes pour Unydex **dans son état actuel**, ainsi que leur justification.

> **À réviser** en cas d'ajout d'un outil de mesure d'audience, d'un partage de
> données entre utilisateurs, ou de tout kit de développement tiers.

---

## Question d'ouverture

**« Do you or your third-party partners collect data from this app? »**
→ **Yes**

Non négociable : le compte transmet une adresse e-mail et une collection. Répondre
« No » serait faux dès qu'un compte existe, même facultatif.

---

## Données à déclarer

### 1. Contact Info → Email Address

| Champ | Réponse |
|---|---|
| Collectée ? | **Oui** |
| Usage | **App Functionality** uniquement |
| Liée à l'identité de l'utilisateur ? | **Oui** |
| Utilisée pour le suivi (tracking) ? | **Non** |

*Pourquoi* : l'adresse identifie le compte, confirme l'inscription et permet de
réinitialiser le mot de passe. Elle ne sert à rien d'autre.

### 2. Identifiers → User ID

| Champ | Réponse |
|---|---|
| Collectée ? | **Oui** |
| Usage | **App Functionality** |
| Liée à l'identité ? | **Oui** |
| Suivi ? | **Non** |

*Pourquoi* : l'UUID du compte relie le profil et la collection. Il ne circule pas hors
du service.

### 3. User Content → Other User Content

| Champ | Réponse |
|---|---|
| Collectée ? | **Oui** |
| Usage | **App Functionality** |
| Liée à l'identité ? | **Oui** |
| Suivi ? | **Non** |

*Pourquoi* : le pseudo, la photo de profil (un numéro, pas une image) et la collection
sauvegardée. C'est la catégorie d'Apple pour « ce que l'utilisateur a produit dans
l'application ».

---

## Ce qu'il NE faut PAS déclarer, et pourquoi

| Catégorie | Réponse | Raison |
|---|---|---|
| **Location** | Non | Jamais demandée, jamais lue |
| **Photos or Videos** | Non | La caméra sert au scan ; **rien n'est transmis ni conservé**. Apple ne considère comme « collecté » que ce qui quitte l'appareil |
| **Audio Data** | Non | Aucun micro |
| **Contacts** | Non | Aucun accès |
| **Health & Fitness** | Non | — |
| **Financial Info** | Non | Application gratuite, aucun achat intégré |
| **Browsing History** | Non | — |
| **Search History** | Non | La recherche vit en mémoire, n'est pas persistée, et ne part jamais |
| **Device ID / Advertising Data** | Non | Aucun IDFA, aucun identifiant publicitaire |
| **Usage Data** | Non | Aucune mesure d'audience, aucun SDK d'analyse |
| **Diagnostics** | Non | Aucun rapport de plantage envoyé ; rien n'est instrumenté |
| **Name** | **À surveiller** | Voir ci-dessous |

### Le cas du nom

À l'inscription par **Google**, Supabase reçoit le nom du compte Google et s'en sert
pour proposer un pseudo. Le nom brut n'est **pas conservé dans `profils`** — seul le
pseudo nettoyé l'est — mais il atterrit dans `raw_user_meta_data` de `auth.users`, où
Supabase le garde.

**Déclare donc aussi `Contact Info → Name`**, aux mêmes conditions (App Functionality,
lié à l'identité, pas de suivi). C'est le choix honnête : la donnée existe côté
serveur, même si l'application ne l'affiche jamais.

> Pour t'en passer, il faudrait effacer ce champ dans le déclencheur `cree_profil`
> après l'avoir utilisé. C'est faisable, mais ça complique la migration pour un gain
> faible — et déclarer un nom utilisé seulement pour la fonctionnalité de l'app
> n'affiche rien d'inquiétant sur la fiche.

---

## Tracking (App Tracking Transparency)

**« Do you or your partners use data for tracking? »** → **Non.**

Aucune donnée n'est rapprochée de données d'autres sociétés, ni transmise à un courtier
en données, ni utilisée pour de la publicité ciblée. **Pas de `NSUserTrackingUsageDescription`
à ajouter, pas d'invite ATT à afficher.** Ajouter l'invite sans faire de suivi est
d'ailleurs un motif de refus.

---

## Ce que ça donne sur la fiche

Trois lignes, sous « **Données liées à vous** » : *Informations de contact*,
*Identifiants*, *Contenu utilisateur*. Et **rien** sous « Données utilisées pour vous
suivre ». C'est une étiquette sobre, et elle est exacte.

---

## Les autres champs de la fiche

| Champ | Valeur |
|---|---|
| **Privacy Policy URL** | `https://gls13600.github.io/boites-pc/legal/confidentialite.html` — obligatoire (5.1.1(i)), doit être **publique et atteignable sans compte** |
| **Support URL** | Obligatoire (1.5). Une page avec un moyen de te joindre suffit |
| **Marketing URL** | Facultatif |
| **Account Deletion URL** | À renseigner si la suppression n'était pas dans l'application. **Elle y est** (Réglages → Compte → Supprimer mon compte) : rien à fournir, mais prépare une capture pour les notes de revue |
| **Age Rating** | **4+** : aucune violence, aucun thème adulte, aucun contenu généré par les utilisateurs qui serait visible par d'autres. Attention : si un jour les pseudos deviennent visibles entre utilisateurs, la question « contenu généré par les utilisateurs » change de réponse |
| **Export Compliance** | L'application n'utilise que **HTTPS**, donc du chiffrement standard. `ITSAppUsesNonExemptEncryption = false` est posé dans `Info.plist` : la question ne sera plus posée à chaque livraison |
| **Content Rights** | « Does your app contain, show, or access third-party content? » — lis [DROITS-ET-LICENCES.md](DROITS-ET-LICENCES.md) **avant** de répondre. C'est ici que le dossier se joue |

---

## Notes pour le relecteur (App Review Information)

À recopier dans « Notes », en anglais :

> Unydex is a personal collection tracker. It works fully offline and **requires no
> account**: every feature is available without signing in. An optional account
> (email + password, Google, or Apple) only syncs the user's collection between
> devices.
>
> **To review without an account**: just open the app — all features work.
> **Test account** (if you prefer to review the account flow): *[identifiants à
> fournir]*.
>
> **Account deletion** is inside the app: Settings → Account → "Delete my account".
> It is immediate and permanent.
>
> **Camera** is used by the Scan screen to recognise what the user points at. All
> inference runs **on device**, through a bundled neural network. No image is ever
> transmitted or stored.
>
> The app contains **no advertising, no analytics and no tracking SDKs**.
