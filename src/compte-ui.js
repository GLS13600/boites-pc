// Interface du compte, dans la page Réglages.
//
// Module à part, comme le scan : main.js ne fait que l'accrocher (un bloc dans
// `renderReglages`, un appel au démarrage). Il reçoit ce dont il a besoin plutôt que
// d'importer main.js — c'est le même contrat que `creeScan`, et ça garde main.js
// seul maître de ses propres aides (`esc`, `sprites`, le catalogue…).
//
// Tout ici est FACULTATIF : sans configuration Supabase, `htmlCompte()` rend une
// chaîne vide et le bloc n'apparaît pas. L'application se comporte alors exactement
// comme avant, sans compte et sans réseau.
//
// MODIFIER SON PROFIL SE FAIT SUR PLACE (02/10/2026). Il y avait deux lignes
// « Changer de photo » et « Changer de pseudo » qui dépliaient un formulaire DANS la
// page : chaque geste la redessinait et l'on repartait du haut, à chercher où l'on
// en était. Désormais on touche directement ce qu'on veut changer —
//   - la PHOTO ouvre un panneau, comme le choix d'un fond de boîte : on y choisit,
//     on voit l'aperçu, on enregistre ; rien n'est écrit tant qu'on n'a pas validé ;
//   - le PSEUDO se modifie en place, à l'endroit où il s'affiche, avec un ✓ et un ✕.
// Les deux se valident explicitement, et aucun des deux ne fait défiler la page.

import {
  configure, etat, demarre, surChangement, estNatif, GOOGLE_CLIENT_ID,
  inscris, connecte, deconnecte, motDePasseOublie,
  changePseudo, changeAvatar, supprimeCompte, pseudoDisponible, PSEUDO_RE, sb,
  revientDeConnexion, erreurDeConnexion,
} from './compte.js';

const AVATAR_DEFAUT = '25';
const MAX_AVATARS = 120;

export function creeCompteUI({ t, esc, sprites, spriteKey, imgFallback, CATALOGUE, ICO, ICO_REG, rend, panneau }) {
  // L'état de l'interface seulement — jamais les données du compte, qui vivent dans
  // `etat` de compte.js. Deux sources de vérité se désynchroniseraient.
  const ui = {
    mode: 'connexion',   // 'connexion' | 'inscription'
    message: null,       // confirmation, en vert
    erreur: null,        // en rouge
    occupe: false,
    pseudoEdit: false,   // le pseudo est en cours de modification, sur place
    pseudoEtat: null,    // 'libre' | 'pris' | 'invalide'
    avatarOuvert: false,
    avatarQ: '',
    avatarChoix: null,   // choix EN ATTENTE de validation, jamais encore enregistré
    avatarShiny: false,
    retourVu: false,   // l'erreur venue de l'URL de retour a eu sa chance d'être lue
  };

  let racine = null;     // l'application, où vit le bloc des Réglages

  // Erreur rapportée par le fournisseur DANS l'URL de retour, relevée au chargement
  // de compte.js avant que le client ne nettoie l'URL : sans elle, un Google mal
  // configuré se traduisait par un simple rechargement muet.
  //
  // Elle vit À PART de `ui.erreur`, et ce n'est pas un détail : `surChangement` vide
  // `ui.erreur` à chaque notification, et `demarre()` en émet une dès la session
  // relue — le message aurait donc clignoté puis disparu avant d'être lu. Elle
  // s'efface quand on est connecté, ou dès qu'on tente autre chose.
  //
  // Lue au RENDU et non à la création du module : la langue n'est chargée qu'après,
  // et le message serait sinon figé en français.
  const erreurRetour = () => (ui.retourVu || etat.user ? null : erreurDeConnexion(t));

  // On revient de Google et la session n'est pas encore relue : on annonce l'attente
  // plutôt que de faire clignoter le formulaire de connexion, qui donnerait à croire
  // qu'il ne s'est rien passé.
  const attenteRetour = () => revientDeConnexion() && !etat.pret && !erreurRetour();

  // Un rendu suffit : le bloc est reconstruit avec le reste de la page.
  surChangement(() => { ui.erreur = null; rafraichit(); });

  const avatarUrl = (cle, shiny) => sprites.still(spriteKey(cle), !!shiny);
  const entreeDe = (cle) => CATALOGUE.find((e) => String(e.id) === String(cle));
  const nomDe = (cle) => entreeDe(cle)?.name ?? String(cle);

  // La page ET le panneau, quand il est ouvert : les deux montrent le même profil.
  function rafraichit() {
    rend();
    if (ui.avatarOuvert) panneau.maj(htmlPanneauAvatar());
  }

  // ------------------------------------------------------------ rendu de la page
  function htmlCompte() {
    if (!configure()) return '';
    const erreur = ui.erreur ?? erreurRetour();
    return `
      <div class="reg-bloc cpte b-compte" style="--i:3">
        <h3><span class="reg-pastille">${ICO_REG.compte}</span>${t('compte')}</h3>
        ${etat.user ? htmlConnecte()
          : attenteRetour() ? `<p class="reg-aide">${t('cpteConnexionEnCours')}</p>`
          : htmlDeconnecte()}
        ${erreur ? `<p class="cpte-err">${esc(erreur)}</p>` : ''}
        ${ui.message ? `<p class="cpte-ok">${esc(ui.message)}</p>` : ''}
      </div>`;
  }

  function htmlDeconnecte() {
    const inscription = ui.mode === 'inscription';
    return `
      <p class="reg-aide">${t('compteAide')}</p>

      <div class="cpte-oauth">
        ${/* `VITE_GOOGLE_CLIENT_ID` est l'interrupteur unique de Google, sur le web
             comme en natif. Sans lui, le bouton n'apparaît PAS : il était affiché
             d'office sur le web, et Supabase répondait « Unsupported provider:
             provider is not enabled » tant que le fournisseur n'y était pas activé —
             un bouton qui ne peut pas marcher ne doit pas être proposé.
             Côté web, Supabase n'a pas besoin de cet identifiant pour l'échange
             OAuth ; il sert ici de déclaration « Google est prêt ». */
          GOOGLE_CLIENT_ID ? `
          <button class="cpte-fourn google" data-oauth="google">
            <svg viewBox="0 0 24 24" aria-hidden="true" class="cpte-logo"><path fill="#4285F4" d="M21.6 12.23c0-.73-.07-1.43-.19-2.1H12v4h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.42z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.75-5.59-4.1H3.08v2.58A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.5H3.08a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.99 14.7 2 12 2a10 10 0 0 0-8.92 5.5l3.33 2.58C7.2 7.73 9.4 5.98 12 5.98z"/></svg>
            ${t('cpteGoogle')}
          </button>` : ''}
        ${estNatif() ? `
          <button class="cpte-fourn apple" data-oauth="apple">
            <svg viewBox="0 0 24 24" aria-hidden="true" class="cpte-logo"><path fill="currentColor" d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.6 2.3 2.8 2.2 1.1 0 1.6-.7 2.9-.7s1.7.7 2.9.7c1.2 0 2-1.1 2.7-2.2.9-1.2 1.2-2.5 1.2-2.5s-2-.8-2-3.6zM14.3 5.3c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.3-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.6-1.1z"/></svg>
            ${t('cpteApple')}
          </button>` : ''}
      </div>

      ${/* Le séparateur n'a de sens que s'il sépare vraiment deux choses : sans
           aucun bouton de fournisseur, il flottait au-dessus du formulaire. */
        GOOGLE_CLIENT_ID || estNatif()
          ? `<div class="cpte-sep"><span>${t('cpteOu')}</span></div>` : ''}

      <form class="cpte-form" data-cpte-form>
        ${inscription ? `
          <label class="bs-field">
            <span>${t('cptePseudo')}</span>
            <input class="bs-name" type="text" name="pseudo" autocomplete="username"
                   minlength="3" maxlength="16" required />
            <small class="cpte-note ${ui.pseudoEtat ?? ''}">${texteNote()}</small>
          </label>` : ''}
        <label class="bs-field">
          <span>${t('cpteMail')}</span>
          <input class="bs-name" type="email" name="email" autocomplete="email"
                 inputmode="email" required />
        </label>
        <label class="bs-field">
          <span>${t('cpteMotDePasse')}</span>
          <input class="bs-name" type="password" name="motDePasse" required minlength="6"
                 autocomplete="${inscription ? 'new-password' : 'current-password'}" />
        </label>
        <button class="btn primaire" type="submit" ${ui.occupe ? 'disabled' : ''}>
          ${inscription ? t('cpteCreer') : t('cpteSeConnecter')}
        </button>
      </form>

      <div class="cpte-liens">
        <button data-cpte-mode>${inscription ? t('cpteDejaUnCompte') : t('cptePasDeCompte')}</button>
        ${inscription ? '' : `<button data-cpte-oubli>${t('cpteOublie')}</button>`}
      </div>`;
  }

  const texteNote = () =>
    ui.pseudoEtat === 'libre' ? t('cptePseudoLibre')
    : ui.pseudoEtat === 'pris' ? t('cptePseudoPris')
    : ui.pseudoEtat === 'invalide' ? t('cptePseudoInvalide')
    : t('cptePseudoAide');

  function htmlConnecte() {
    const p = etat.profil ?? {};
    return `
      ${ui.pseudoEdit ? htmlPseudoEnPlace(p) : htmlIdentite(p)}

      <div class="cpte-liens">
        <button data-cpte-sortir>${t('cpteDeconnexion')}</button>
        <button class="danger" data-cpte-supprimer>${t('cpteSupprimer')}</button>
      </div>
      <p class="reg-aide">${t('cpteSupprimerAide')}</p>`;
  }

  // La photo et le pseudo SONT les commandes : on touche ce qu'on veut changer.
  // Le crayon le dit sans ajouter de ligne, ce qui laisse le bandeau lisible.
  function htmlIdentite(p) {
    return `
      <div class="cpte-moi">
        <button class="cpte-avatar" data-cpte-avatar aria-label="${t('cpteChangerPhoto')}">
          <img src="${avatarUrl(p.avatar ?? AVATAR_DEFAUT, p.avatar_shiny)}" alt=""
               ${imgFallback(p.avatar ?? AVATAR_DEFAUT, false)} />
          <span class="cpte-crayon">${ICO.crayon}</span>
        </button>
        <div class="cpte-ident">
          <button class="cpte-nom" data-cpte-pseudo-ouvre aria-label="${t('cpteChangerPseudo')}">
            <b>${esc(p.pseudo ?? '—')}</b>${ICO.crayon}
          </button>
          <small>${esc(etat.user.email ?? '')}</small>
        </div>
      </div>
      <p class="reg-aide">${t('cpteToucherModifier')}</p>`;
  }

  // Modification SUR PLACE : le champ prend la place du nom, les deux boutons sont
  // à côté. Rien n'est envoyé tant que ✓ n'est pas touché — ✕ rend le nom d'avant.
  function htmlPseudoEnPlace(p) {
    return `
      <form class="cpte-moi cpte-edite" data-cpte-pseudo>
        <div class="cpte-ident">
          <input class="bs-name" type="text" name="pseudo" maxlength="16" minlength="3"
                 value="${esc(p.pseudo ?? '')}" autocomplete="off" spellcheck="false"
                 aria-label="${t('cptePseudo')}" />
          <small class="cpte-note ${ui.pseudoEtat ?? ''}">${texteNote()}</small>
        </div>
        <div class="cpte-edite-btns">
          <button type="button" data-cpte-annule-pseudo
                  title="${t('annuler')}" aria-label="${t('annuler')}">${ICO.croix}</button>
          <button type="submit" class="ok" ${ui.occupe ? 'disabled' : ''}
                  title="${t('cpteEnregistrer')}" aria-label="${t('cpteEnregistrer')}">${ICO.coche}</button>
        </div>
      </form>`;
  }

  // ------------------------------------------------------------ panneau de l'avatar
  //
  // Il réutilise le CATALOGUE du sélecteur de Pokémon : même recherche, mêmes
  // sprites, aucun téléversement. L'avatar est une CLÉ, pas une image — il s'affiche
  // donc hors ligne, et ne coûte rien à stocker.
  function listeAvatars() {
    const q = ui.avatarQ.trim().toLowerCase();
    return (q ? CATALOGUE.filter((e) => e.cle.includes(q)) : CATALOGUE).slice(0, MAX_AVATARS);
  }

  function htmlPicks() {
    const choix = String(ui.avatarChoix ?? '');
    return listeAvatars().map((e) => `
      <button class="cpte-av ${String(e.id) === choix ? 'on' : ''}" data-cpte-pick="${esc(String(e.id))}">
        <img src="${sprites.still(e.sprite, ui.avatarShiny)}" alt="" loading="lazy" ${imgFallback(e.num, false)} />
        <span>${esc(e.name)}</span>
      </button>`).join('');
  }

  function htmlPanneauAvatar() {
    const cle = ui.avatarChoix ?? AVATAR_DEFAUT;
    return `
      <!-- L'aperçu et le bouton d'enregistrement restent COLLÉS en haut : la grille
           fait plusieurs écrans, et il ne faut pas remonter pour valider son choix. -->
      <div class="cpte-barre">
        <img class="cpte-apercu" src="${avatarUrl(cle, ui.avatarShiny)}" alt="" ${imgFallback(cle, false)} />
        <div class="cpte-barre-txt">
          <b>${esc(nomDe(cle))}</b>
          <small>${t('cpteChoisirAvatar')}</small>
        </div>
        <button class="btn primaire" data-cpte-valide ${ui.occupe ? 'disabled' : ''}>
          ${t('cpteEnregistrer')}
        </button>
      </div>

      ${/* L'erreur est reprise ICI : le panneau couvre la page, et le message posé
           dans le bloc des Réglages resterait invisible tant qu'il est ouvert. */
        ui.erreur ? `<p class="cpte-err">${esc(ui.erreur)}</p>` : ''}

      <button class="btn bascule ${ui.avatarShiny ? 'on' : ''}" data-cpte-shiny
              aria-pressed="${ui.avatarShiny}">&#10022; ${t('vueChromatique')}</button>

      <label class="bs-field">
        <span>${t('rechercher')}</span>
        <input class="bs-name" type="text" data-cpte-avatarq value="${esc(ui.avatarQ)}"
               placeholder="${t('placeholderPokemon')}" autocomplete="off" />
      </label>

      <div class="cpte-grille">${htmlPicks()}</div>`;
  }

  function ouvreAvatar() {
    const p = etat.profil ?? {};
    ui.avatarOuvert = true;
    ui.avatarQ = '';
    ui.avatarChoix = p.avatar ?? AVATAR_DEFAUT;
    ui.avatarShiny = !!p.avatar_shiny;
    panneau.ouvre(htmlPanneauAvatar());
  }

  // Appelé par main.js : le panneau se ferme aussi par le voile et par le
  // glissement vers le bas, qu'on ne voit pas d'ici.
  function panneauFerme() { ui.avatarOuvert = false; }

  // Un choix ne redessine QUE ce qui change : refaire le panneau entier rendrait la
  // frappe et le défilement de la grille désagréables.
  function majChoix() {
    const corps = panneau.corps();
    if (!corps) return;
    const cle = ui.avatarChoix ?? AVATAR_DEFAUT;
    const img = corps.querySelector('.cpte-apercu');
    if (img) img.src = avatarUrl(cle, ui.avatarShiny);
    const nom = corps.querySelector('.cpte-barre-txt b');
    if (nom) nom.textContent = nomDe(cle);
    for (const b of corps.querySelectorAll('[data-cpte-pick]')) {
      b.classList.toggle('on', b.dataset.cptePick === String(cle));
    }
  }

  function majPicks() {
    const grille = panneau.corps()?.querySelector('.cpte-grille');
    if (grille) grille.innerHTML = htmlPicks();
  }

  // ------------------------------------------------------------ interactions
  function branche(app, panneauEl) {
    racine = app;
    for (const cible of [app, panneauEl]) if (cible) ecoute(cible);
  }

  function ecoute(cible) {
    cible.addEventListener('click', async (e) => {
      const oauth = e.target.closest('[data-oauth]');
      if (oauth) return lance(async () => {
        const quoi = oauth.dataset.oauth;
        if (quoi === 'apple' && estNatif()) {
          const { connecteApple } = await import('./compte-natif.js');
          return connecteApple(await sb(), t);
        }
        const { connecteAvec } = await import('./compte.js');
        return connecteAvec(quoi, t);
      });

      if (e.target.closest('[data-cpte-mode]')) {
        ui.mode = ui.mode === 'connexion' ? 'inscription' : 'connexion';
        ui.erreur = ui.message = ui.pseudoEtat = null;
        return rend();
      }

      if (e.target.closest('[data-cpte-avatar]')) return ouvreAvatar();
      if (e.target.closest('[data-cpte-shiny]')) {
        ui.avatarShiny = !ui.avatarShiny;
        const b = panneau.corps()?.querySelector('[data-cpte-shiny]');
        b?.classList.toggle('on', ui.avatarShiny);
        b?.setAttribute('aria-pressed', String(ui.avatarShiny));
        majPicks();              // les vignettes passent au chromatique
        return majChoix();
      }
      const pick = e.target.closest('[data-cpte-pick]');
      if (pick) { ui.avatarChoix = pick.dataset.cptePick; return majChoix(); }

      if (e.target.closest('[data-cpte-valide]')) return lance(async () => {
        const r = await changeAvatar(ui.avatarChoix ?? AVATAR_DEFAUT, ui.avatarShiny, t);
        if (r.ok) panneau.ferme();
        return r;
      });

      // Le pseudo s'ouvre en place, et le champ prend le focus tout de suite : on
      // vient de toucher son nom pour l'écrire, il n'y a rien d'autre à faire ensuite.
      if (e.target.closest('[data-cpte-pseudo-ouvre]')) {
        ui.pseudoEdit = true;
        ui.pseudoEtat = ui.erreur = ui.message = null;
        rend();
        const champ = racine?.querySelector('[data-cpte-pseudo] [name="pseudo"]');
        champ?.focus();
        champ?.select();
        return;
      }
      if (e.target.closest('[data-cpte-annule-pseudo]')) {
        ui.pseudoEdit = false;
        ui.pseudoEtat = null;
        return rend();
      }

      if (e.target.closest('[data-cpte-sortir]')) {
        await deconnecte();
        ui.pseudoEdit = false;
        return rend();
      }

      if (e.target.closest('[data-cpte-oubli]')) {
        const champ = racine?.querySelector('[data-cpte-form] [name="email"]');
        const mail = champ?.value?.trim();
        if (!mail) { ui.erreur = t('cpteMailInvalide'); return rend(); }
        return lance(async () => {
          const r = await motDePasseOublie(mail, t);
          if (r.ok) ui.message = t('cpteOublieEnvoye');
          return r;
        });
      }

      if (e.target.closest('[data-cpte-supprimer]')) {
        if (!confirm(t('cpteSupprimerSur'))) return;
        return lance(async () => {
          const r = await supprimeCompte(t);
          if (r.ok) ui.message = t('cpteSupprime');
          return r;
        });
      }
    });

    cible.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-cpte-form], [data-cpte-pseudo]');
      if (!form) return;
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));

      if (form.hasAttribute('data-cpte-pseudo')) {
        return lance(async () => {
          const r = await changePseudo(String(d.pseudo ?? '').trim(), t);
          if (r.ok) { ui.pseudoEdit = false; ui.pseudoEtat = null; }
          return r;
        });
      }
      return lance(async () => {
        const args = { email: String(d.email ?? '').trim(), motDePasse: String(d.motDePasse ?? '') };
        if (ui.mode !== 'inscription') return connecte(args, t);
        const r = await inscris({ ...args, pseudo: String(d.pseudo ?? '').trim() }, t);
        if (r.ok) ui.message = t('cpteConfirme');
        return r;
      });
    });

    // Disponibilité du pseudo PENDANT la frappe. On agit sur le DOM et on ne rappelle
    // pas `rend()` : le champ perdrait le focus à chaque caractère, comme pour le nom
    // de boîte et la recherche du Pokédex.
    let minuteur = 0;
    cible.addEventListener('input', (e) => {
      const q = e.target.closest('[data-cpte-avatarq]');
      if (q) { ui.avatarQ = q.value; return majPicks(); }

      const champ = e.target.closest('[data-cpte-form] [name="pseudo"], [data-cpte-pseudo] [name="pseudo"]');
      if (!champ) return;
      const nom = champ.value.trim();
      const note = champ.parentElement.querySelector('.cpte-note');
      clearTimeout(minuteur);
      if (!PSEUDO_RE.test(nom)) {
        ui.pseudoEtat = nom ? 'invalide' : null;
        return poseNote(note, ui.pseudoEtat, nom ? t('cptePseudoInvalide') : t('cptePseudoAide'));
      }
      // On laisse retomber la frappe avant d'interroger le serveur.
      minuteur = setTimeout(async () => {
        const libre = await pseudoDisponible(nom);
        if (champ.value.trim() !== nom) return;   // il a continué d'écrire
        // `null` = vérification impossible : on n'affirme rien, et on laisse
        // l'index unique de la base trancher à l'inscription.
        ui.pseudoEtat = libre === null ? null : libre ? 'libre' : 'pris';
        poseNote(note, ui.pseudoEtat,
          libre === null ? t('cptePseudoAide') : libre ? t('cptePseudoLibre') : t('cptePseudoPris'));
      }, 400);
    });
  }

  function poseNote(note, classe, texte) {
    if (!note) return;
    note.className = `cpte-note ${classe ?? ''}`;
    note.textContent = texte;
  }

  // Enveloppe commune : état occupé, erreur affichée, rendu à la fin. Sans elle,
  // chaque action répéterait les mêmes six lignes.
  async function lance(action) {
    if (ui.occupe) return;
    ui.occupe = true;
    ui.retourVu = true;
    ui.erreur = ui.message = null;
    rafraichit();
    try {
      const r = await action();
      if (r?.erreur) ui.erreur = r.erreur;
    } catch (e) {
      ui.erreur = String(e?.message ?? e);
    } finally {
      ui.occupe = false;
      rafraichit();
    }
  }

  return { htmlCompte, branche, demarre, panneauFerme, revientDeConnexion };
}
