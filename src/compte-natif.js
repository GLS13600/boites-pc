// Connexion OAuth DANS L'APPLICATION iPhone.
//
// Chargé par `import()` depuis compte.js, et seulement en natif : la version web n'en
// embarque donc rien, et les plugins Capacitor restent hors du bundle du site.
//
// Pourquoi ce fichier existe : sur le web, `signInWithOAuth` redirige la page et
// Supabase relit le jeton dans l'URL au retour. Dans l'application il n'y a pas de
// page à rediriger — il faut ouvrir un navigateur système, écouter le lien profond du
// retour (`unydex://auth`, ou `unydexdev://auth` pour Unydex Dev), et poser la
// session à la main.
//
// RÈGLE APPLE : Safari View Controller (plugin Browser) est obligatoire pour une
// connexion OAuth. Une simple WebView intégrée est refusée (règle 4.0), et Google
// bloque de son côté les WebView non conformes.

// Le schéma dépend de la variante (vite.config.js) : `unydex` pour la version de
// l'App Store, `unydexdev` pour « Unydex Dev ». Les deux adresses doivent figurer
// dans les URL de redirection de Supabase.
const SCHEMA = `${__SCHEMA_URL__}://auth`;

// Les plugins sont lus sur `window.Capacitor.Plugins`, comme Haptics, Filesystem et
// Share : aucun import, donc rien dans le bundle web.
const plugins = () => window.Capacitor?.Plugins ?? {};

export async function connecteOAuthNatif(c, fournisseur, t) {
  const { Browser, App } = plugins();
  if (!Browser || !App) return { erreur: t('cpteNatifManquant') };

  // `skipBrowserRedirect` : on veut l'URL, pas que Supabase navigue à notre place.
  const { data, error } = await c.auth.signInWithOAuth({
    provider: fournisseur,
    options: { redirectTo: SCHEMA, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { erreur: error?.message ?? t('cpteOAuthEchec') };

  let fini = false;
  let ecoute, fermeture, resoudre;
  const fin = new Promise((r) => { resoudre = r; });

  const termine = async (resultat) => {
    if (fini) return;
    fini = true;
    ecoute?.remove?.();
    fermeture?.remove?.();
    try { await Browser.close(); } catch { /* déjà fermé */ }
    resoudre(resultat);
  };

  // Le retour : Supabase renvoie un `code` (PKCE) à échanger contre une session.
  //
  // LES DEUX ÉCOUTES SONT POSÉES AVANT D'OUVRIR LA FENÊTRE. `addListener` rend une
  // promesse — il faut un aller-retour par le pont natif —, et ouvrir d'abord
  // laisserait un court instant pendant lequel un retour ne serait entendu par
  // personne. La connexion resterait alors bloquée, fenêtre ouverte, sans erreur.
  ecoute = await App.addListener('appUrlOpen', async ({ url }) => {
    if (!url?.startsWith(SCHEMA)) return;
    const u = new URL(url);
    const code = u.searchParams.get('code');
    const refus = u.searchParams.get('error_description') || u.searchParams.get('error');
    if (refus) return termine({ erreur: refus });
    if (!code) return termine({ erreur: t('cpteOAuthEchec') });
    const { error: e2 } = await c.auth.exchangeCodeForSession(code);
    termine(e2 ? { erreur: e2.message } : { ok: true });
  });

  // Fermer la fenêtre sans aller au bout n'est pas une erreur : on annule, sans
  // message d'échec — l'utilisateur sait très bien ce qu'il vient de faire.
  fermeture = await Browser.addListener('browserFinished', () => termine({ annule: true }));

  await Browser.open({ url: data.url, presentationStyle: 'popover' });
  return fin;
}

// ---------------------------------------------------------------- Sign in with Apple
//
// OBLIGATOIRE sur l'App Store dès qu'un autre fournisseur tiers est proposé (règle
// 4.8). Elle passe par le plugin natif plutôt que par le navigateur : Apple impose sa
// feuille système sur iOS, et c'est de toute façon une bien meilleure expérience.
//
// Le jeton d'identité rendu par Apple est échangé contre une session Supabase
// (`signInWithIdToken`), sans aller-retour par un navigateur.
export async function connecteApple(c, t) {
  const { SignInWithApple } = plugins();
  if (!SignInWithApple) return { erreur: t('cpteNatifManquant') };
  try {
    const { response } = await SignInWithApple.authorize({
      clientId: 'com.guillaume.unydex',
      redirectURI: SCHEMA,
      scopes: 'name email',
      // Apple renvoie ce nonce dans le jeton : Supabase le vérifie pour écarter un
      // jeton rejoué.
      nonce: 'unydex',
    });
    const jeton = response?.identityToken;
    if (!jeton) return { erreur: t('cpteOAuthEchec') };
    const { error } = await c.auth.signInWithIdToken({
      provider: 'apple',
      token: jeton,
      nonce: 'unydex',
    });
    return error ? { erreur: error.message } : { ok: true };
  } catch (e) {
    // L'utilisateur a refusé la feuille : ce n'est pas une erreur à afficher.
    if (/cancel/i.test(String(e?.message ?? e))) return { annule: true };
    return { erreur: String(e?.message ?? e) };
  }
}
