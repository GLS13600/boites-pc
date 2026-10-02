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

function enHtml(md) {
  const out = [];
  const lignes = md.split(/\r?\n/);
  let liste = null;      // 'ul' ou null
  let tableau = false;
  let citation = false;

  const fermeListe = () => { if (liste) { out.push(`</${liste}>`); liste = null; } };
  const fermeTableau = () => { if (tableau) { out.push('</tbody></table>'); tableau = false; } };
  const fermeCitation = () => { if (citation) { out.push('</blockquote>'); citation = false; } };
  const fermeTout = () => { fermeListe(); fermeTableau(); fermeCitation(); };

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];

    if (!l.trim()) { fermeListe(); fermeTableau(); continue; }

    const titre = /^(#{1,4})\s+(.*)$/.exec(l);
    if (titre) {
      fermeTout();
      const n = titre[1].length;
      out.push(`<h${n}>${enLigne(titre[2])}</h${n}>`);
      continue;
    }

    if (/^---+$/.test(l.trim())) { fermeTout(); out.push('<hr />'); continue; }

    if (l.startsWith('> ')) {
      fermeListe(); fermeTableau();
      if (!citation) { out.push('<blockquote>'); citation = true; }
      out.push(`<p>${enLigne(l.slice(2))}</p>`);
      continue;
    }
    fermeCitation();

    // Tableau : une ligne d'en-tête, une ligne de tirets, puis le corps.
    if (l.startsWith('|') && /^\|[\s:|-]+\|$/.test(lignes[i + 1] ?? '')) {
      fermeListe();
      const cols = (s) => s.split('|').slice(1, -1).map((c) => c.trim());
      out.push('<table><thead><tr>' + cols(l).map((c) => `<th>${enLigne(c)}</th>`).join('') + '</tr></thead><tbody>');
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
      if (liste !== type) { fermeListe(); out.push(`<${type}>`); liste = type; }
      out.push(`<li>${enLigne((puce ?? num)[1])}</li>`);
      continue;
    }
    // Suite d'un paragraphe ou d'un élément de liste : on recolle.
    if (liste) { out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ' ' + enLigne(l.trim()) + '</li>'); continue; }
    if (out.length && out[out.length - 1].startsWith('<p>')) {
      out[out.length - 1] = out[out.length - 1].replace(/<\/p>$/, ' ' + enLigne(l.trim()) + '</p>');
      continue;
    }
    out.push(`<p>${enLigne(l.trim())}</p>`);
  }
  fermeTout();
  return out.join('\n');
}

// La page reprend les couleurs de l'application, en dur : elle doit s'afficher seule,
// sans la feuille de style ni les jetons, et rester lisible dans les deux thèmes.
const gabarit = (titre, corps) => `<!doctype html>
<html lang="fr">
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
  /* Les tableaux défilent plutôt que de déborder : ces pages se lisent au téléphone. */
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; display: block; overflow-x: auto; }
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
  writeFileSync(resolve(RACINE, 'public/legal', html), gabarit(titre, enHtml(source)), 'utf8');
  console.log(`legal/${html} ← ${md}`);
}
