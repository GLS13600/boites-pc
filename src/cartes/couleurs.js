// Couleurs libres des classeurs : la roue chromatique et ce qu'on en déduit.
//
// Une couleur choisie à la roue est gardée en hexadécimal (#rrggbb) : c'est ce qui part
// dans la sauvegarde et le compte. La roue, elle, travaille en TSV (teinte, saturation,
// valeur) : l'angle donne la teinte, la distance au centre la saturation, un curseur la
// luminosité. Les deux dégradés d'un classeur (couverture, pages) en sont déduits ici,
// pour qu'une couleur libre ressemble aux six teintes dessinées à la main.

export const HEX = /^#[0-9a-f]{6}$/;

const borne = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const hex2 = (n) => Math.round(borne(n, 0, 255)).toString(16).padStart(2, '0');

export function rvb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const versHex = ([r, v, b]) => `#${hex2(r)}${hex2(v)}${hex2(b)}`;

// t de 0 à 1 vers `vers` (noir, blanc, ou une autre couleur).
export const melange = (hex, vers, t) => {
  const a = rvb(hex), c = rvb(vers);
  return versHex(a.map((x, i) => x + (c[i] - x) * t));
};

// Luminance relative (WCAG) : de quoi savoir si l'on écrit en blanc ou en noir dessus.
export function luminance(hex) {
  const l = rvb(hex).map((x) => { const c = x / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
export const estClaire = (hex) => luminance(hex) > 0.4;

// TSV : h en degrés, s et v de 0 à 1.
export function tsvVersHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return versHex([f(5), f(3), f(1)].map((x) => x * 255));
}
export function hexVersTsv(hex) {
  const [r, g, b] = rvb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

// Les variables CSS d'un classeur à couleur libre, sur le modèle des six teintes
// (`.c-nuit`…) : la couverture va d'un ton éclairci à un ton profond, les pages sont
// sombres et prises dans la même teinte. Des pages choisies à part remplacent les
// dernières, avec leur propre dégradé vers la reliure.
export function variables(couverture, pages) {
  const vars = {};
  if (couverture && HEX.test(couverture)) {
    // Une couverture claire s'assombrit moins vers le bas : on y écrit en sombre
    // (`couv-claire`), et un dégradé trop profond rendrait ce texte illisible.
    const claire = estClaire(couverture);
    vars['--cl-haut'] = melange(couverture, '#ffffff', claire ? 0.25 : 0.12);
    vars['--cl-bas'] = melange(couverture, '#000000', claire ? 0.18 : 0.55);
    vars['--cl-page'] = melange(couverture, '#000000', 0.72);
    vars['--cl-page-2'] = melange(couverture, '#000000', 0.82);
  }
  if (pages && HEX.test(pages)) {
    vars['--cl-page'] = pages;
    vars['--cl-page-2'] = melange(pages, '#000000', 0.28);
  }
  return vars;
}
export const enStyle = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
