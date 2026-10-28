// PokéAdvisor — l'assistant de Cartodex, fondu dans Unydex.
//
// Un agent conversationnel (Mistral, avec la clé de l'UTILISATEUR) qui connaît les deux
// univers : le Living Dex, la collection de cartes, les classeurs. Il répond, et il AGIT
// par des outils (chercher une carte, en lire le prix, l'ajouter, ouvrir une vue…) que
// l'appli lui confie : ce module ne fait que la conversation, les outils et le contexte
// viennent de vues.js.
//
// La CLÉ reste sur l'appareil : elle n'entre ni dans la sauvegarde ni dans la
// synchronisation du compte, et la politique de contenu n'autorise qu'api.mistral.ai à la
// recevoir. Les messages et un résumé de la collection partent chez Mistral AI — l'écran
// le dit avant qu'on y entre sa clé.

const URL_API = 'https://api.mistral.ai/v1/chat/completions';
export const MODELES = [
  ['mistral-small-latest', 'Small'],
  ['mistral-medium-latest', 'Medium'],
  ['mistral-large-latest', 'Large'],
];
// Les styles de réponse de Cartodex, à cocher : ils s'ajoutent à la fin du prompt.
export const STYLES = {
  pote: 'Parle comme un ami passionné de Pokémon : tutoiement, ton détendu, enthousiaste sur les belles cartes.',
  analyste: 'Donne des analyses chiffrées : cite la tendance, compare avec la moyenne sur 30 jours, juge la liquidité et le potentiel.',
  bref: 'Une seule phrase par réponse, jamais plus.',
  coach: 'Ton de coach bienveillant : souligne les bonnes décisions, propose un objectif concret et atteignable.',
  curieux: 'Termine toujours par une courte question de suivi pertinente.',
};

const CLES = {
  cle: 'pcbox.advisor.cle',
  modele: 'pcbox.advisor.modele',
  historique: 'pcbox.advisor.historique',
  memoire: 'pcbox.advisor.memoire',
  styles: 'pcbox.advisor.styles',
  avatar: 'pcbox.advisor.avatar',
};
const lit = (k, defaut) => {
  try { const v = localStorage.getItem(k); return v == null ? defaut : JSON.parse(v); } catch { return defaut; }
};
const ecrit = (k, v) => {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* plein */ }
  if (k !== CLES.cle) surEcriture();
};
// main.js branche ici sa synchronisation (marqueChange) : ce module n'en sait rien.
let surEcriture = () => {};
export function brancheEcriture(f) { surEcriture = f; }

// Pour la sauvegarde : tout SAUF la clé Mistral, qui reste sur l'appareil. Ce qui revient
// du compte est repris par les mêmes setters, donc avec leurs contrôles.
export const exporte = () => ({ modele: lit(CLES.modele, null), styles: styles(), avatar: avatar(), memoire: memoire(), historique: historique() });
export function remet(v) {
  if (!v || typeof v !== 'object') return;
  if (typeof v.modele === 'string') poseModele(v.modele);
  if (Array.isArray(v.styles)) ecrit(CLES.styles, v.styles.filter((x) => STYLES[x]));
  if (Number.isInteger(v.avatar)) poseAvatar(v.avatar);
  if (v.memoire && typeof v.memoire === 'object' && !Array.isArray(v.memoire)) {
    ecrit(CLES.memoire, Object.fromEntries(Object.entries(v.memoire).slice(-30)
      .map(([k, x]) => [String(k).slice(0, 40), String(x ?? '').slice(0, 300)])));
  }
  if (Array.isArray(v.historique)) {
    garde(v.historique.filter((m) => m && ['u', 'a', 'e'].includes(m.r) && typeof m.t === 'string').map((m) => ({ r: m.r, t: m.t.slice(0, 8000) })));
  }
}

// ---------------------------------------------------------------- réglages
export const cle = () => lit(CLES.cle, '') || '';
export function poseCle(v) { ecrit(CLES.cle, String(v || '').trim() || null); }
export const modele = () => {
  const m = lit(CLES.modele, MODELES[0][0]);
  return MODELES.some(([k]) => k === m) ? m : MODELES[0][0];
};
export function poseModele(m) { if (MODELES.some(([k]) => k === m)) ecrit(CLES.modele, m); }
export const styles = () => { const s = lit(CLES.styles, []); return Array.isArray(s) ? s.filter((x) => STYLES[x]) : []; };
export function basculeStyle(id) {
  if (!STYLES[id]) return;
  const s = new Set(styles());
  if (s.has(id)) s.delete(id); else s.add(id);
  ecrit(CLES.styles, [...s]);
}
export const avatar = () => { const n = lit(CLES.avatar, 501); return Number.isInteger(n) && n >= 1 && n <= 1025 ? n : 501; };
export function poseAvatar(n) { if (Number.isInteger(n) && n >= 1 && n <= 1025) ecrit(CLES.avatar, n); }

// ---------------------------------------------------------------- mémoire et historique
// La mémoire : ce que l'assistant a choisi de retenir (budget, objectif…), d'une
// conversation à l'autre. Il la tient lui-même par deux outils.
export const memoire = () => { const m = lit(CLES.memoire, {}); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; };
export function retiens(k, v) {
  const m = memoire();
  const cleM = String(k || '').trim().slice(0, 40);
  if (!cleM) return;
  m[cleM] = String(v || '').slice(0, 300);
  const entrees = Object.entries(m).slice(-30);
  ecrit(CLES.memoire, Object.fromEntries(entrees));
}
export function oublie(k) { const m = memoire(); delete m[k]; ecrit(CLES.memoire, m); }
export function oublieTout() { ecrit(CLES.memoire, null); }

// Les messages : { r: 'u' | 'a' | 'e' (erreur), t: texte }. Soixante gardés.
export const historique = () => { const h = lit(CLES.historique, []); return Array.isArray(h) ? h : []; };
const garde = (h) => ecrit(CLES.historique, h.slice(-60));
export function efface() { ecrit(CLES.historique, null); }
// « Annuler » après un effacement : la conversation revient telle quelle.
export function remetHistorique(h) { if (Array.isArray(h)) garde(h); }
export function noteErreur(texte) { garde([...historique(), { r: 'e', t: texte }]); }

// ---------------------------------------------------------------- la conversation
export class ErreurAssistant extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

// Pose une question. `outils` : [{ nom, description, parametres, executer(args) }].
// `systeme` : le prompt, contexte compris. Rend la réponse finale, et tient l'historique.
export async function demande(texte, { outils = [], systeme = '', signal, surOutil } = {}) {
  const k = cle();
  if (!k) throw new ErreurAssistant('cle');
  const h = historique();
  h.push({ r: 'u', t: texte });
  garde(h);
  // Les six derniers échanges suffisent au fil de la conversation, et tiennent le
  // nombre de jetons envoyés à chaque question.
  const msgs = h.filter((m) => m.r === 'u' || m.r === 'a').slice(-12)
    .map((m) => ({ role: m.r === 'u' ? 'user' : 'assistant', content: m.t }));
  const tools = outils.map((o) => ({
    type: 'function',
    function: { name: o.nom, description: o.description, parameters: o.parametres || { type: 'object', properties: {} } },
  }));
  const extra = styles().map((s) => `• ${STYLES[s]}`).join('\n');
  const prompt = systeme + (extra ? `\n\nSTYLE DE RÉPONSE, prioritaire :\n${extra}` : '');

  let finale = null;
  for (let tour = 0; tour < 6 && finale == null; tour++) {
    let r;
    try {
      r = await fetch(URL_API, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
        body: JSON.stringify({
          model: modele(),
          max_tokens: 700,
          temperature: 0.4,
          ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
          messages: [{ role: 'system', content: prompt }, ...msgs],
        }),
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw new ErreurAssistant('annule');
      throw new ErreurAssistant('reseau');
    }
    if (!r.ok) {
      const corps = await r.json().catch(() => ({}));
      throw new ErreurAssistant(r.status === 401 ? 'cle-refusee' : r.status === 429 ? 'limite' : 'api',
        corps?.message || corps?.error?.message || `HTTP ${r.status}`);
    }
    const data = await r.json();
    const m = data?.choices?.[0]?.message;
    if (!m) throw new ErreurAssistant('vide');
    if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
      msgs.push({ role: 'assistant', content: m.content || '', tool_calls: m.tool_calls });
      for (const tc of m.tool_calls) {
        const nom = tc.function?.name;
        let args = {};
        try {
          const brut = tc.function?.arguments;
          args = typeof brut === 'string' ? JSON.parse(brut || '{}') : (brut || {});
        } catch { /* arguments illisibles : l'outil recevra un objet vide */ }
        const outil = outils.find((o) => o.nom === nom);
        let res;
        try { res = outil ? await outil.executer(args) : 'Outil inconnu.'; } catch (e) { res = `Erreur : ${e?.message || e}`; }
        surOutil?.(nom);
        msgs.push({ role: 'tool', name: nom, tool_call_id: tc.id, content: String(res).slice(0, 6000) });
      }
      continue;
    }
    finale = typeof m.content === 'string' ? m.content : (Array.isArray(m.content)
      ? m.content.map((p) => p?.text || '').join('') : '');
  }
  const rep = (finale || '').trim() || '…';
  garde([...historique(), { r: 'a', t: rep }]);
  return rep;
}
