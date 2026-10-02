# Dossier juridique et conformité

Tout ce qu'il faut pour publier Unydex proprement — et, pour un point, ce qui empêche
de la publier du tout.

**Je ne suis pas juriste.** Ces documents rassemblent des faits vérifiables (ce que
contient l'application, ce que disent les licences, ce qu'exigent Apple et le RGPD) et
les mettent en forme. Pour un engagement qui compte — publier sous ton nom et ton
adresse —, un conseil en propriété intellectuelle vaut son prix.

---

## Par où commencer

| Document | À quoi il sert |
|---|---|
| **[DROITS-ET-LICENCES.md](DROITS-ET-LICENCES.md)** | **Lis celui-ci en premier.** L'audit de ce que contient l'application et à qui ça appartient. C'est lui qui décide si une publication est possible |
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

Quatre informations seulement, mais aucune n'est facultative. Elles reviennent dans
plusieurs documents : cherche `[à compléter]`.

1. **Identité du responsable** — nom, adresse postale. Voir le point B4 de
   [PUBLICATION.md](PUBLICATION.md) avant de choisir : elle sera **publiée sur la
   fiche App Store**.
2. **Adresse e-mail de contact.** Une adresse dédiée vaut mieux qu'une adresse
   personnelle : elle se change sans refaire les documents.
3. **Région du projet Supabase** — à relever dans Project Settings → General.
4. **Âge minimum du compte** — 16 ans par défaut dans les documents.

## La règle de tenue

Ces documents décrivent le code. **Ils deviennent faux dès que le code change.**
À vérifier à chaque fois que l'on touche à :

- une colonne de la base, une table, une politique RLS → [REGISTRE-DES-TRAITEMENTS.md](REGISTRE-DES-TRAITEMENTS.md) et la politique de confidentialité ;
- un service externe appelé par l'application → le registre, la politique, et l'étiquette App Store ;
- une permission iOS demandée → la politique et l'étiquette ;
- un élément visuel ou sonore ajouté → [DROITS-ET-LICENCES.md](DROITS-ET-LICENCES.md).
