# Dossier juridique et conformité

Tout ce qu'il faut pour publier Unydex proprement — et, pour un point, ce qui empêche
de la publier du tout.

**Ces documents ne constituent pas un avis juridique.** Ils réunissent et mettent en
forme des éléments vérifiables : la composition de l'application, la teneur des
licences applicables, et les exigences d'Apple et du RGPD. La publication engageant
l'éditeur sous son nom et son adresse, la consultation d'un conseil en propriété
intellectuelle est recommandée avant toute mise en ligne.

---

## Par où commencer

| Document | À quoi il sert |
|---|---|
| **[DROITS-ET-LICENCES.md](DROITS-ET-LICENCES.md)** | **À consulter en premier.** Audit de la composition de l'application et de la titularité des droits. C'est cette pièce qui détermine si une publication est possible |
| [PUBLICATION.md](PUBLICATION.md) | La liste complète de ce qui bloque, technique et légal, avec l'état et la solution de chaque point, et l'ordre dans lequel s'y prendre |

## Les documents à publier

| Document | Où il doit vivre |
|---|---|
| [POLITIQUE-CONFIDENTIALITE.md](POLITIQUE-CONFIDENTIALITE.md) | URL publique **et** lien dans l'application. Exigé par Apple (5.1.1) et par le RGPD (art. 13) |
| [PRIVACY-POLICY.md](PRIVACY-POLICY.md) | Même chose, en anglais, pour la revue Apple et les utilisateurs hors de France |
| [CONDITIONS-UTILISATION.md](CONDITIONS-UTILISATION.md) | URL publique. Facultatif pour Apple, utile pour dire l'absence de garantie |
| [MENTIONS-LEGALES.md](MENTIONS-LEGALES.md) | URL publique. Obligation de la LCEN pour un site édité depuis la France |

Les versions servies par le site sont dans `public/legal/` et se déploient avec lui :

- `https://gls13600.github.io/boites-pc/legal/confidentialite.html`
- `https://gls13600.github.io/boites-pc/legal/conditions.html`
- `https://gls13600.github.io/boites-pc/legal/mentions.html`

**Elles sont aussi embarquées dans l'application** : les Réglages y renvoient, et
elles s'ouvrent hors ligne.

## Les documents internes

| Document | À quoi il sert |
|---|---|
| [REGISTRE-DES-TRAITEMENTS.md](REGISTRE-DES-TRAITEMENTS.md) | Obligation de l'article 30 du RGPD. Ne se publie pas : se **tient à jour** et se produit sur demande de la CNIL |
| [ETIQUETTE-APP-STORE.md](ETIQUETTE-APP-STORE.md) | Les réponses exactes au questionnaire « App Privacy » d'App Store Connect, avec la raison de chacune |

---

## Ce qu'il reste à compléter

Quatre informations, dont aucune n'est facultative. Elles figurent dans plusieurs
documents sous la forme de mentions entre crochets et en capitales, du type
`[ADRESSE POSTALE COMPLÈTE]`. **Tant qu'elles subsistent, les documents ne doivent pas
être publiés** : une politique de confidentialité sans responsable de traitement
identifié ne satisfait ni l'article 13 du RGPD, ni la règle 5.1.1 d'Apple.

1. **Identité du responsable du traitement** — nom et adresse postale. Le point B4 de
   [PUBLICATION.md](PUBLICATION.md) est à lire avant de trancher : cette adresse sera
   **publiée sur la fiche App Store** au titre du règlement sur les services
   numériques.
2. **Adresse électronique de contact.** Une adresse dédiée est préférable à une
   adresse personnelle : elle se modifie sans refonte des documents.
3. **Région du projet Supabase** — relevée dans Project Settings → General.
4. **Âge minimum du compte** — fixé à 16 ans dans la rédaction actuelle, avec renvoi
   à l'âge inférieur éventuellement fixé par la législation nationale.

## La règle de tenue

Ces documents décrivent l'état réel du code. **Ils deviennent inexacts dès que le code
change**, et un document de conformité inexact est plus dangereux qu'un document
absent. Une vérification s'impose à chaque modification portant sur :

- une colonne de la base, une table, une politique RLS → [REGISTRE-DES-TRAITEMENTS.md](REGISTRE-DES-TRAITEMENTS.md) et la politique de confidentialité ;
- un service externe appelé par l'application → le registre, la politique, et l'étiquette App Store ;
- une permission iOS demandée → la politique et l'étiquette ;
- un élément visuel ou sonore ajouté → [DROITS-ET-LICENCES.md](DROITS-ET-LICENCES.md).
