// Compte utilisateur : connexion, profil, synchronisation.
//
// RÈGLE QUI PRIME SUR TOUT LE RESTE : l'application doit rester utilisable hors ligne
// et sans compte. Ce module est donc entièrement FACULTATIF —
//
//   - sans `VITE_SUPABASE_URL` ni `VITE_SUPABASE_ANON_KEY`, `configure()` rend faux et
//     plus rien ici ne s'exécute. L'appli se comporte exactement comme avant, et ne
//     fait aucune requête réseau ;
//   - le client Supabase est chargé par `import()`, donc dans un chunk à part : qui
//     n'ouvre jamais les Réglages ne le télécharge pas, et le démarrage n'en paie rien ;
//   - `localStorage` reste la SOURCE DE VÉRITÉ. Le compte ne fait que recopier. Une
//     panne de réseau, un serveur éteint ou un compte supprimé ne doivent jamais
//     empêcher de capturer un Pokémon.
//
// La clé « anon » est publique par conception : elle part dans le bundle. Ce n'est pas
// elle qui protège les données — c'est la sécurité au niveau des lignes, déclarée dans
// `supabase/migrations/`. Ne jamais embarquer la clé `service_role`.

// Les valeurs sont NETTOYÉES avant usage : espaces autour, et guillemets qu'on garde
// parfois en recopiant. Collée dans une variable de dépôt GitHub, la clé est arrivée
// avec un espace FINAL — invisible à l'œil, et comme le motif de validation est ancré
// sur la fin, elle était jugée invalide : le bloc Compte ne s'affichait tout
// simplement pas sur le site, alors qu'il marchait en local. Une configuration vient
// toujours d'un copier-coller, le code doit l'absorber.
const propre = (v) => String(v ?? '').trim().replace(/^['"]|['"]$/g, '').trim();

const URL_SB = propre(import.meta.env.VITE_SUPABASE_URL);
const CLE_SB = propre(import.meta.env.VITE_SUPABASE_ANON_KEY);
export const GOOGLE_CLIENT_ID = propre(import.meta.env.VITE_GOOGLE_CLIENT_ID);

// Une URL et une clé qui ressemblent VRAIMENT à quelque chose.
//
// Deux pièges, tous deux rencontrés :
//   - `.env.exemple` porte des valeurs de remplacement (« xxxx », « eyJhbGciOi... »)
//     qui passaient le contrôle : recopier le modèle sans l'éditer donnait une appli
//     « configurée » qui échouait à chaque appel, sans que rien ne l'explique ;
//   - Supabase a DEUX formats de clé publique. L'ancien est un JWT (`eyJ…`, ~200
//     caractères), le nouveau commence par `sb_publishable_` et fait moins de 60
//     caractères — un simple contrôle de longueur rejetait donc les projets récents.
const PLACEHOLDERS = ['xxxx', 'eyJhbGciOi...', 'VOTRE', 'TODO'];
const estGabarit = (v) => PLACEHOLDERS.some((p) => v.includes(p));

const cleValide = (c) =>
  // JWT « anon » historique : trois segments séparés par des points.
  /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(c)
  // Clé « publishable » actuelle.
  || /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(c);

export const configure = () =>
  !!URL_SB && !!CLE_SB
  && !estGabarit(URL_SB) && !estGabarit(CLE_SB)
  && /^https:\/\/[^./]+\.supabase\.(co|in|red)$/.test(URL_SB.replace(/\/+$/, ''))
  && cleValide(CLE_SB);

let client = null;
let chargement = null;

// Le client, chargé à la première utilisation. Rend `null` si rien n'est configuré :
// chaque appelant doit le gérer, aucun ne doit planter.
export async function sb() {
  if (!configure()) return null;
  if (client) return client;
  if (!chargement) {
    chargement = (async () => {
      const { createClient } = await import('@supabase/supabase-js');
      client = createClient(URL_SB, CLE_SB, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // La session vit dans `localStorage`, sous un nom à nous : elle survit donc
          // à la fermeture de l'appli, et se range avec le reste de nos clés.
          storageKey: 'pcbox.session',
          // Les redirections OAuth n'arrivent pas dans l'URL sous Capacitor — c'est
          // le plugin Browser/App qui les rapporte. On lit donc le jeton nous-mêmes.
          detectSessionInUrl: !estNatif(),
          flowType: 'pkce',
        },
      });
      return client;
    })();
  }
  return chargement;
}

export const estNatif = () => !!window.Capacitor?.isNativePlatform?.();

// ---------------------------------------------------------------- retour d'OAuth
//
// Sur le WEB, « Continuer avec Google » QUITTE LA PAGE : le navigateur part chez
// Google, repasse par Supabase, puis revient ici. L'application se recharge donc
// entièrement — et comme elle s'ouvre toujours sur l'accueil, on retombait à la case
// départ sans le moindre signe. Vu de l'utilisateur : « la page s'actualise » et il
// ne se passe rien, alors que la connexion a très bien pu réussir.
//
// Deux renseignements sont à relever À L'IMPORT DU MODULE, donc AVANT que supabase-js
// ne nettoie l'URL — ce qu'il fait dès la création du client (`detectSessionInUrl`) :
//   - revient-on d'une connexion ? l'appli doit alors rouvrir les Réglages ;
//   - le fournisseur a-t-il renvoyé une erreur ? il faut alors la dire.
//
// Rien de tout ceci ne concerne l'IPA : en natif, la connexion passe par un
// navigateur système et revient par un lien profond, sans jamais recharger la page.
const CLE_RETOUR = 'pcbox.oauth';
const RETOUR = litRetour();

function litRetour() {
  if (typeof location === 'undefined') return { revient: false, erreur: null };
  const p = new URLSearchParams(location.search);
  const h = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const lu = (k) => p.get(k) ?? h.get(k);

  // Le repère posé avant de quitter la page. Il se consomme : un rechargement plus
  // tard ne doit pas rouvrir les Réglages.
  let marque = false;
  try {
    marque = sessionStorage.getItem(CLE_RETOUR) === '1';
    if (marque) sessionStorage.removeItem(CLE_RETOUR);
  } catch { /* mode privé : on se rabat sur les paramètres de l'URL */ }

  const erreur = lu('error_description') || lu('error') || null;
  const revient = marque || !!erreur || !!lu('code') || !!lu('access_token');

  // On n'efface QUE l'erreur, jamais le `code` : c'est supabase-js qui l'échange
  // contre une session, et le lui retirer casserait la connexion.
  if (erreur) {
    try {
      for (const k of ['error', 'error_code', 'error_description']) p.delete(k);
      const q = p.toString();
      const hash = h.has('error') || h.has('error_description') ? '' : location.hash;
      history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + hash);
    } catch { /* sans importance : l'erreur est déjà relevée */ }
  }
  return { revient, erreur };
}

// Vrai quand la page vient d'un aller-retour chez un fournisseur. L'appli s'ouvre
// alors sur les Réglages au lieu de l'accueil.
export const revientDeConnexion = () => RETOUR.revient;

// Le `code` est retiré de l'URL UNE FOIS la session relue, et pas avant : c'est
// supabase-js qui l'échange, le lui enlever trop tôt casserait la connexion. Quand
// l'échange échoue, il reste sinon dans l'URL et chaque rechargement rejoue la même
// tentative perdue d'avance.
function nettoieCodeURL() {
  try {
    const p = new URLSearchParams(location.search);
    if (!p.has('code')) return;
    p.delete('code');
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
  } catch { /* sans importance */ }
}

let erreurRetourEnClair;
export function erreurDeConnexion(t) {
  if (!RETOUR.erreur) return null;
  if (erreurRetourEnClair === undefined) erreurRetourEnClair = enClair(RETOUR.erreur, t);
  return erreurRetourEnClair;
}

// ---------------------------------------------------------------- état

// Ce que le reste de l'appli lit. `null` = déconnecté, et c'est l'état par défaut.
export const etat = {
  pret: false,        // la session a été relue au moins une fois
  user: null,         // { id, email } de Supabase
  profil: null,       // { pseudo, avatar, avatar_shiny }
  erreur: null,
};

const abonnes = new Set();
export function surChangement(f) { abonnes.add(f); return () => abonnes.delete(f); }
const previens = () => { for (const f of abonnes) { try { f(etat); } catch (e) { console.error(e); } } };

// À appeler une fois au démarrage. Ne lance RIEN si rien n'est configuré, et n'attend
// jamais le réseau pour rendre la main : le premier rendu ne doit pas en dépendre.
export async function demarre() {
  if (!configure()) { etat.pret = true; return; }
  const c = await sb();
  if (!c) { etat.pret = true; return; }

  const { data } = await c.auth.getSession();
  await poseSession(data?.session ?? null);
  etat.pret = true;
  previens();
  nettoieCodeURL();

  // Connexion, déconnexion, jeton rafraîchi : on suit.
  c.auth.onAuthStateChange(async (_evt, session) => {
    await poseSession(session ?? null);
    previens();
  });
}

async function poseSession(session) {
  etat.user = session?.user ? { id: session.user.id, email: session.user.email } : null;
  etat.profil = etat.user ? await litProfil(etat.user.id) : null;
}

async function litProfil(id) {
  const c = await sb();
  if (!c) return null;
  const { data, error } = await c
    .from('profils')
    .select('pseudo, avatar, avatar_shiny')
    .eq('id', id)
    .maybeSingle();
  // Le profil est créé par un déclencheur à l'inscription ; s'il manque malgré tout,
  // on ne bloque pas la session pour autant — l'interface proposera de le compléter.
  if (error) { console.error('profil', error.message); return null; }
  return data ?? null;
}

// ---------------------------------------------------------------- inscription

// Les messages d'erreur de Supabase sont en anglais et parfois techniques. On les
// traduit en une phrase utile, et on garde l'original dans la console.
function enClair(e, t) {
  const m = String(e?.message ?? e ?? '');
  console.error('compte', m);
  if (/already registered|already exists/i.test(m)) return t('cpteDejaPris');
  if (/invalid login credentials/i.test(m)) return t('cpteIdentifiantsFaux');
  if (/email not confirmed/i.test(m)) return t('cpteNonConfirme');
  if (/password should be at least/i.test(m)) return t('cpteMotDePasseCourt');
  if (/unable to validate email|invalid format/i.test(m)) return t('cpteMailInvalide');
  if (/profils_pseudo_unique|duplicate key/i.test(m)) return t('cptePseudoPris');
  if (/pseudo_valide|violates check constraint/i.test(m)) return t('cptePseudoInvalide');
  if (/provider is not enabled|unsupported provider/i.test(m)) return t('cpteFournisseurInactif');
  if (/rate limit|too many/i.test(m)) return t('cpteTropDEssais');
  if (/fetch|network|failed to send/i.test(m)) return t('cpteHorsLigne');
  return m;
}

// Rend `true` (libre), `false` (pris) ou `null` quand ON NE SAIT PAS — serveur
// injoignable, par exemple. La distinction compte : annoncer « ce pseudo est libre »
// alors qu'on n'a rien pu vérifier serait un mensonge, et l'inscription échouerait
// ensuite sans que l'utilisateur comprenne pourquoi. C'est l'index unique en base qui
// tranche vraiment ; ceci n'est qu'une politesse d'interface.
export async function pseudoDisponible(nom) {
  const c = await sb();
  if (!c) return null;
  const { data, error } = await c.rpc('pseudo_disponible', { nom });
  if (error) { console.warn('pseudo', error.message); return null; }
  return data === true;
}

export const PSEUDO_RE = /^[A-Za-z0-9_-]{3,16}$/;

export async function inscris({ email, motDePasse, pseudo }, t) {
  const c = await sb();
  if (!c) return { erreur: t('cpteNonConfigure') };
  // On vérifie AVANT de créer le compte : sinon l'utilisateur se retrouve avec un
  // compte valide et un pseudo suffixé d'office par le déclencheur, sans l'avoir voulu.
  if (!PSEUDO_RE.test(pseudo)) return { erreur: t('cptePseudoInvalide') };
  if ((await pseudoDisponible(pseudo)) === false) return { erreur: t('cptePseudoPris') };

  const { error } = await c.auth.signUp({
    email,
    password: motDePasse,
    // Repris par le déclencheur `cree_profil` pour nommer le profil.
    options: { data: { pseudo }, emailRedirectTo: retourWeb() },
  });
  if (error) return { erreur: enClair(error, t) };
  // Confirmation par e-mail activée : il n'y a pas encore de session à ce stade.
  return { ok: true, aConfirmer: true };
}

export async function connecte({ email, motDePasse }, t) {
  const c = await sb();
  if (!c) return { erreur: t('cpteNonConfigure') };
  const { error } = await c.auth.signInWithPassword({ email, password: motDePasse });
  return error ? { erreur: enClair(error, t) } : { ok: true };
}

export async function motDePasseOublie(email, t) {
  const c = await sb();
  if (!c) return { erreur: t('cpteNonConfigure') };
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: retourWeb() });
  return error ? { erreur: enClair(error, t) } : { ok: true };
}

export async function deconnecte() {
  const c = await sb();
  await c?.auth.signOut();
}

// ---------------------------------------------------------------- profil

export async function changePseudo(pseudo, t) {
  const c = await sb();
  if (!c || !etat.user) return { erreur: t('cpteNonConnecte') };
  if (!PSEUDO_RE.test(pseudo)) return { erreur: t('cptePseudoInvalide') };
  if (pseudo.toLowerCase() === (etat.profil?.pseudo ?? '').toLowerCase()) return { ok: true };
  if ((await pseudoDisponible(pseudo)) === false) return { erreur: t('cptePseudoPris') };

  const { error } = await c.from('profils').update({ pseudo }).eq('id', etat.user.id);
  // On revérifie après coup : entre la vérification et l'écriture, quelqu'un a pu
  // prendre le pseudo. C'est l'index unique qui tranche, pas notre contrôle.
  if (error) return { erreur: enClair(error, t) };
  etat.profil = { ...etat.profil, pseudo };
  previens();
  return { ok: true };
}

export async function changeAvatar(cle, shiny, t) {
  const c = await sb();
  if (!c || !etat.user) return { erreur: t('cpteNonConnecte') };
  const { error } = await c
    .from('profils')
    .update({ avatar: String(cle), avatar_shiny: !!shiny })
    .eq('id', etat.user.id);
  if (error) return { erreur: enClair(error, t) };
  etat.profil = { ...etat.profil, avatar: String(cle), avatar_shiny: !!shiny };
  previens();
  return { ok: true };
}

// Exigée par l'App Store (5.1.1(v)) : la suppression doit se faire DANS l'application.
// Le travail est fait côté base par `supprime_mon_compte`, qui n'efface que le compte
// authentifié — `auth.users` n'est pas modifiable depuis le client.
export async function supprimeCompte(t) {
  const c = await sb();
  if (!c || !etat.user) return { erreur: t('cpteNonConnecte') };
  const { error } = await c.rpc('supprime_mon_compte');
  if (error) return { erreur: enClair(error, t) };
  await c.auth.signOut();
  return { ok: true };
}

// ---------------------------------------------------------------- OAuth
//
// Sur le web, Supabase redirige la page et revient avec le jeton : rien à faire.
// Dans l'application native, la redirection ouvre un navigateur système et revient par
// un lien profond (`unydex://auth`) — c'est `src/compte-natif.js` qui l'écoute,
// chargé seulement là, pour que le web n'embarque pas les plugins Capacitor.
const retourWeb = () => `${location.origin}${location.pathname}`;

export async function connecteAvec(fournisseur, t) {
  const c = await sb();
  if (!c) return { erreur: t('cpteNonConfigure') };
  if (estNatif()) {
    const { connecteOAuthNatif } = await import('./compte-natif.js');
    return connecteOAuthNatif(c, fournisseur, t);
  }
  // Posé AVANT de partir : la page va être quittée et rechargée au retour, et
  // l'appli s'ouvre toujours sur l'accueil. Sans ce repère, on revenait connecté
  // mais sur la page d'accueil, sans rien qui dise que ça avait marché.
  try { sessionStorage.setItem(CLE_RETOUR, '1'); } catch { /* mode privé */ }
  const { error } = await c.auth.signInWithOAuth({
    provider: fournisseur,
    options: { redirectTo: retourWeb() },
  });
  if (!error) return { ok: true };
  try { sessionStorage.removeItem(CLE_RETOUR); } catch { /* mode privé */ }
  return { erreur: enClair(error, t) };
}
