// Le compteur PARTAGÉ des favoris : combien de dresseurs ont mis une carte en favori.
//
// Le serveur compte les collections synchronisées qui portent le favori
// (`favoris_carte`, voir la migration du 27/10/2026), en excluant celle du compte
// connecté : on y ajoute le cœur LOCAL, si bien que le nombre suit le toucher à
// l'instant, sans attendre l'envoi de la collection.
//
// Sans compte connecté, rien ne part — c'est la règle de l'appli — et le cœur reste
// purement local. Une base qui n'a pas encore la fonction répond par une erreur : on
// n'affiche alors simplement aucun nombre.

import { sb, etat as compte } from '../compte.js';

const DUREE = 5 * 60 * 1000;
const autres = new Map();   // id → { n, t } : les AUTRES comptes
const enCours = new Map();  // id → promesse
let pourQui = null;         // le compte pour lequel `autres` a été relevé

// Change-t-on de compte, ce qui a été relevé ne vaut plus : on exclut un autre compte.
function verifieCompte() {
  const id = compte.user?.id ?? null;
  if (id !== pourQui) { autres.clear(); enCours.clear(); pourQui = id; }
  return id;
}

// Le nombre d'AUTRES dresseurs déjà connu, sans attendre — pour le rendu. `null` : on
// ne sait pas (pas de compte, pas encore relevé, serveur muet).
export function connu(id) {
  if (!verifieCompte()) return null;
  return autres.get(id)?.n ?? null;
}

// Le relève, une fois par carte et par cinq minutes. Rend `null` si on ne sait pas.
export function releve(id) {
  if (!verifieCompte()) return Promise.resolve(null);
  const x = autres.get(id);
  if (x && Date.now() - x.t < DUREE) return Promise.resolve(x.n);
  if (enCours.has(id)) return enCours.get(id);
  const qui = pourQui;
  const p = (async () => {
    try {
      const c = await sb();
      if (!c) return null;
      const { data, error } = await c.rpc('favoris_carte', { carte: id });
      const n = Number(data);
      if (error || data == null || !Number.isFinite(n) || n < 0) return null;
      if (qui === pourQui) autres.set(id, { n, t: Date.now() });
      return n;
    } catch { return null; } finally { enCours.delete(id); }
  })();
  enCours.set(id, p);
  return p;
}
