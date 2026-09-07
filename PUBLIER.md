# Publier une modification et produire l'IPA

Le cycle complet, à dérouler chaque fois que le code change.
Dépôt : <https://github.com/GLS13600/boites-pc>

---

## 1. Envoyer les modifications sur GitHub

Depuis `D:\Code\Jeu` :

```bash
git status            # ce qui a changé
git add -A            # tout prendre
git commit -m "Décrire ce qui change"
git push
```

Notes utiles :

- **Pas besoin de lancer `npm run build` avant de pousser.** `dist/` est ignoré par
  git, c'est le runner GitHub qui compile. Le build local ne sert qu'à tester.
- Si `git push` demande de s'identifier, c'est le navigateur ou un jeton personnel
  GitHub — pas ton Apple ID.
- Les données générées (`src/data/`, `public/sprites/`, `public/wallpapers/`) **sont**
  versionnées : le runner n'a rien à retélécharger.

---

## 2. Le site en ligne (GitHub Pages)

Le même `dist/` sert au site et à l'IPA : les deux chaînes cohabitent sans se gêner.

**À faire une seule fois :**

1. Rendre le dépôt **public** — Settings → General → tout en bas, *Change
   repository visibility*. GitHub Pages depuis un dépôt privé exige un abonnement
   payant.
2. Settings → **Pages** → *Build and deployment* → Source : **GitHub Actions**.

Ensuite, **chaque `git push` redéploie le site**, en quelques minutes. L'adresse
s'affiche à la fin du run, sous la forme `https://<pseudo>.github.io/<dépôt>/`.

> Le runner Ubuntu du site compte ×1 dans le quota, contre ×10 pour le runner macOS
> de l'IPA. Le site peut donc se redéployer à volonté sans entamer le forfait.

### L'installer sur l'iPhone, sans certificat

Ouvrir l'adresse dans **Safari** → Partager → **Sur l'écran d'accueil**. L'app
s'appelle Guiguidex, s'ouvre en plein écran, et un service worker la garde
utilisable hors ligne.

Cette voie n'a **ni certificat, ni expiration à 7 jours, ni re-signature** : on
pousse sur GitHub, et le téléphone a la nouvelle version au rechargement suivant.

**Ce que le service worker met en cache :** la coquille de l'application (11 Mo,
préchargés à la première visite) la rend fonctionnelle hors ligne tout de suite.
Les sprites et les fonds, eux, se mettent en cache **au fil de la navigation** :
ils sont trop volumineux pour être préchargés d'un bloc. Une génération déjà
consultée reste donc disponible hors ligne, une génération jamais ouverte non.

---

## 3. La compilation de l'IPA

**Elle se lance à la main uniquement** : onglet **Actions** → *IPA non signé* →
**Run workflow**. Le déclenchement automatique a été retiré — avec deux workflows,
un seul push aurait consommé la moitié du quota macOS mensuel.

Compte 6 à 10 minutes. Une coche verte signifie que l'IPA est prêt.

> **Attention aux minutes.** Un compte gratuit donne ~200 minutes de runner macOS
> par mois, les runners macOS comptant ×10. Une compilation en consomme donc une
> soixantaine : environ trois par mois si l'on ne fait que ça. Ne relance ce
> workflow que lorsque tu veux vraiment un nouvel IPA — pour tester une
> modification au quotidien, passe par le site, qui est gratuit.

---

## 4. Récupérer l'IPA

1. Onglet **Actions** → cliquer le run terminé (coche verte).
2. Rester sur la page **Summary** du run — l'encadré n'apparaît pas dans la vue des
   logs.
3. En bas, section **Artifacts** → cliquer `BoitesPC-ipa`.
4. On récupère un **`.zip`** : le décompresser pour obtenir `BoitesPC.ipa`.
   C'est ce fichier-là qu'on donne à Sideloadly, jamais le zip.

L'artefact est supprimé au bout de 30 jours. Garde le `.ipa` sur ton disque : c'est le
même fichier qui resservira à chaque re-signature hebdomadaire.

---

## 5. Installer sur l'iPhone (IPA)

1. iPhone branché en USB, déverrouillé, « Faire confiance à cet ordinateur » accepté.
2. Glisser `BoitesPC.ipa` dans **Sideloadly**, saisir l'Apple ID, **Start**.
   Compte avec double authentification : utiliser un **mot de passe pour application**
   généré sur appleid.apple.com.
3. Sur l'iPhone : **Réglages → Général → VPN et gestion de l'appareil →
   Apple Development: \<email\> → Faire confiance**.
   Sans cette étape l'app est installée mais refuse de s'ouvrir.

---

## 6. Tous les 7 jours (IPA uniquement)

Le certificat gratuit expire au bout d'une semaine (3 apps maximum). Pour prolonger :
rebrancher et re-sideloader **le même `.ipa`, avec le même bundle id**
(`com.guillaume.boitespc`).

- **Ne jamais supprimer l'app pour la réinstaller** : un ré-signage écrase le bundle en
  place et la progression (`localStorage`) survit ; une désinstallation efface tout.
- **Exporter le JSON** depuis l'application avant chaque rafraîchissement, par sécurité.
- Pour automatiser : **AltStore** (rafraîchit par Wi-Fi tant que le PC tourne) ou
  **SideStore** (rafraîchit sur l'appareil, sans PC). Chacun occupe un des 3
  emplacements du certificat.

---

## En cas d'échec de la compilation

Ouvrir le run rouge, dérouler l'étape en erreur, et lire les dernières lignes du log.
Les causes déjà rencontrées sur ce projet :

| Symptôme | Cause |
|---|---|
| `scheme "App" not found` | `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` manque — il **doit** être versionné, Xcode ne le régénère pas sur un runner |
| Erreur sur `npm ci` | `package-lock.json` désynchronisé : relancer `npm install` en local, committer, repousser |
| Échec de résolution Swift Package | Réessayer : le runner n'a pas pu joindre GitHub pour `capacitor-swift-pm` |
