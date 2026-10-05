// Produit les pages légales servies par le site, depuis le Markdown de `legal/`.
//
// POURQUOI UN SCRIPT, ET PAS DES PAGES ÉCRITES À LA MAIN : il y aurait alors deux
// versions de chaque texte, celle du dépôt et celle du site, et c'est toujours la
// seconde qu'on oublie. Le Markdown fait foi ; ces pages en sont le rendu.
//
// Le convertisseur est volontairement minimal — titres, listes, tableaux, gras, liens,
// code — parce que c'est tout ce que ces documents utilisent. Pas de dépendance pour
// ça : l'application n'en a aucune au runtime, ses scripts n'en ont presque aucune.
//
// Lancé par `npm run build`, avant Vite : les pages atterrissent dans `public/legal/`,
// que Vite recopie tel quel dans `dist/`.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, '..');

const PAGES = [
  ['POLITIQUE-CONFIDENTIALITE.md', 'confidentialite.html', 'Politique de confidentialité'],
  ['PRIVACY-POLICY.md', 'privacy.html', 'Privacy Policy'],
  ['CONDITIONS-UTILISATION.md', 'conditions.html', 'Conditions d’utilisation'],
  ['MENTIONS-LEGALES.md', 'mentions.html', 'Mentions légales'],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Les éléments en ligne, dans cet ordre : le code d'abord, pour que son contenu ne
// soit pas réinterprété ensuite.
function enLigne(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    // Un lien vers un autre document du dossier devient un lien vers SA page.
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => {
      const page = PAGES.find(([md]) => u === md);
      const cible = page ? page[1] : u;
      const externe = /^https?:/.test(cible);
      return `<a href="${cible}"${externe ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
    });
}

// Le texte d'un paragraphe ou d'un élément de liste est ACCUMULÉ LIGNE À LIGNE, puis
// converti d'un bloc une fois le bloc achevé.
//
// Convertir ligne par ligne était faux, et le défaut était discret : un passage en
// gras à cheval sur deux lignes — ce que la mise à la marge de 80 colonnes produit
// constamment — n'était reconnu par aucune des deux moitiés, et les astérisques
// s'affichaient tels quels dans la page publiée. Même raison pour un lien ou un
// passage en italique coupés par un retour à la ligne.
function enHtml(md) {
  const out = [];
  const lignes = md.split(/\r?\n/);
  let liste = null;      // 'ul', 'ol' ou null
  let tableau = false;
  let citation = false;
  let tampon = null;     // { balise: 'p' | 'li', texte: [] }

  const videTampon = () => {
    if (!tampon) return;
    out.push(`<${tampon.balise}>${enLigne(tampon.texte.join(' '))}</${tampon.balise}>`);
    tampon = null;
  };
  // Ces trois fermetures sortent SANS RIEN FAIRE quand le bloc n'est pas ouvert.
  // Sans cette garde, `fermeCitation()` — appelée à chaque ligne ordinaire — vidait le
  // tampon à chaque passage, et chaque ligne du Markdown devenait son propre
  // paragraphe : la coupure à 80 colonnes se retrouvait dans la page publiée.
  const fermeListe = () => { if (!liste) return; videTampon(); out.push(`</${liste}>`); liste = null; };
  const fermeTableau = () => { if (!tableau) return; out.push('</tbody></table></div>'); tableau = false; };
  const fermeCitation = () => { if (!citation) return; videTampon(); out.push('</blockquote>'); citation = false; };
  const fermeTout = () => { fermeListe(); fermeTableau(); fermeCitation(); };

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];

    // Ligne vide : elle termine le paragraphe courant, mais pas une citation, dont
    // les lignes vides sont elles-mêmes préfixées par « > ».
    if (!l.trim()) { fermeListe(); fermeTableau(); videTampon(); continue; }

    const titre = /^(#{1,4})\s+(.*)$/.exec(l);
    if (titre) {
      fermeTout();
      const n = titre[1].length;
      out.push(`<h${n}>${enLigne(titre[2])}</h${n}>`);
      continue;
    }

    if (/^---+$/.test(l.trim())) { fermeTout(); out.push('<hr />'); continue; }

    if (l.startsWith('>')) {
      fermeListe(); fermeTableau();
      if (!citation) { out.push('<blockquote>'); citation = true; }
      const contenu = l.replace(/^>\s?/, '');
      if (!contenu.trim()) { videTampon(); continue; }
      if (tampon) tampon.texte.push(contenu.trim());
      else tampon = { balise: 'p', texte: [contenu.trim()] };
      continue;
    }
    fermeCitation();

    // Tableau : une ligne d'en-tête, une ligne de tirets, puis le corps. Une cellule
    // tient sur une seule ligne, elle se convertit donc directement.
    if (l.startsWith('|') && /^\|[\s:|-]+\|$/.test(lignes[i + 1] ?? '')) {
      fermeListe();
      const cols = (t) => t.split('|').slice(1, -1).map((c) => c.trim());
      out.push('<div class="tableau"><table><thead><tr>' + cols(l).map((c) => `<th>${enLigne(c)}</th>`).join('') + '</tr></thead><tbody>');
      tableau = true;
      i++;   // la ligne de séparation
      continue;
    }
    if (tableau && l.startsWith('|')) {
      const cols = l.split('|').slice(1, -1).map((c) => c.trim());
      out.push('<tr>' + cols.map((c) => `<td>${enLigne(c)}</td>`).join('') + '</tr>');
      continue;
    }
    fermeTableau();

    const puce = /^[-*]\s+(.*)$/.exec(l);
    const num = /^\d+\.\s+(.*)$/.exec(l);
    if (puce || num) {
      const type = puce ? 'ul' : 'ol';
      videTampon();
      if (liste !== type) { fermeListe(); out.push(`<${type}>`); liste = type; }
      tampon = { balise: 'li', texte: [(puce ?? num)[1].trim()] };
      continue;
    }

    // Toute autre ligne prolonge le bloc en cours, ou en ouvre un nouveau.
    if (tampon) tampon.texte.push(l.trim());
    else tampon = { balise: 'p', texte: [l.trim()] };
  }
  fermeTout();
  return out.join('\n');
}

// La page reprend les couleurs de l'application, en dur : elle doit s'afficher seule,
// sans la feuille de style ni les jetons, et rester lisible dans les deux thèmes.
// La langue du document compte : la césure et la lecture à voix haute en dépendent,
// et la politique anglaise se déclarait en français.
const gabarit = (titre, corps, lang = 'fr') => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${titre} — Unydex</title>
<meta name="color-scheme" content="light dark" />
<style>
  :root {
    --paper: #f6f5f1; --panel: #fff; --ink: #1b1a17; --muted: #6b675d;
    --rule: #e3e0d6; --ball: #d6453c;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #16191d; --panel: #1c2026; --ink: #eef1f4; --muted: #99a3ad;
      --rule: #2c333b; --ball: #f06056;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: max(24px, env(safe-area-inset-top)) 18px calc(48px + env(safe-area-inset-bottom));
    background: var(--paper);
    color: var(--ink);
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 1rem; }
  h2 { font-size: 1.3rem; margin: 2.2rem 0 .6rem; }
  h3 { font-size: 1.05rem; margin: 1.6rem 0 .4rem; }
  h4 { font-size: .95rem; margin: 1.2rem 0 .3rem; color: var(--muted); }
  p, li { margin: .6rem 0; }
  a { color: var(--ball); }
  hr { border: 0; border-top: 1px solid var(--rule); margin: 2rem 0; }
  code {
    background: var(--panel); border: 1px solid var(--rule); border-radius: 5px;
    padding: 1px 5px; font-size: .88em;
  }
  blockquote {
    margin: 1.2rem 0; padding: .8rem 1rem;
    border-left: 3px solid var(--ball); background: var(--panel);
    border-radius: 0 10px 10px 0;
  }
  blockquote p { margin: .4rem 0; }
  /* Ces pages se lisent au téléphone : les tableaux occupent la largeur disponible et
     leur texte passe à la ligne, plutôt que de déborder et d'imposer un défilement
     horizontal qui masque la dernière colonne. L'enveloppe garde le débordement sous
     le coude pour un tableau qui serait un jour trop large. */
  .tableau { width: 100%; overflow-x: auto; margin: 1rem 0; }
  /* Largeur FIXE et césure autorisée : en disposition automatique, la plus longue
     suite de caractères insécables de chaque colonne impose une largeur minimale, et
     trois colonnes de texte juridique débordaient du cadre — la dernière se trouvait
     coupée au bord de l’écran. */
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  /* La césure vient AVANT la coupure brutale : sans elle, les colonnes étroites
     tranchaient au milieu des mots (« d emprisonne-ment »). La page déclare lang="fr",
     le navigateur coupe donc aux syllabes françaises. */
  th, td { -webkit-hyphens: auto; hyphens: auto; overflow-wrap: break-word; }
  th, td { border: 1px solid var(--rule); padding: 8px 10px; text-align: left; vertical-align: top; font-size: .92rem; }
  th { background: var(--panel); font-weight: 700; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--rule); color: var(--muted); font-size: .85rem; }
  footer a { color: var(--muted); }
</style>
</head>
<body>
<main>
${corps}
<footer>
  <a href="confidentialite.html">Confidentialité</a> ·
  <a href="conditions.html">Conditions</a> ·
  <a href="mentions.html">Mentions légales</a> ·
  <a href="privacy.html" lang="en">Privacy (EN)</a> ·
  <a href="../">Unydex</a>
</footer>
</main>
</body>
</html>
`;

mkdirSync(resolve(RACINE, 'public/legal'), { recursive: true });
for (const [md, html, titre] of PAGES) {
  const source = readFileSync(resolve(RACINE, 'legal', md), 'utf8');
  writeFileSync(resolve(RACINE, 'public/legal', html), gabarit(titre, enHtml(source), html === 'privacy.html' ? 'en' : 'fr'), 'utf8');
  console.log(`legal/${html} ← ${md}`);
}
