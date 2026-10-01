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

import {
  configure, etat, demarre, surChangement, estNatif, GOOGLE_CLIENT_ID,
  inscris, connecte, deconnecte, motDePasseOublie,
  changePseudo, changeAvatar, supprimeCompte, pseudoDisponible, PSEUDO_RE, sb,
} from './compte.js';

export function creeCompteUI({ t, esc, sprites, spriteKey, CATALOGUE, ICO, rend }) {
  // L'état de l'interface seulement — jamais les données du compte, qui vivent dans
  // `etat` de compte.js. Deux sources de vérité se désynchroniseraient.
  const ui = {
    mode: 'connexion',   // 'connexion' | 'inscription'
    message: null,       // confirmation, en vert
    erreur: null,        // en rouge
    occupe: false,
    avatarOuvert: false,
    avatarQ: '',
    pseudoOuvert: false,
    pseudoEtat: null,    // 'libre' | 'pris' | 'invalide'
  };

  // Un rendu suffit : le bloc est reconstruit avec le reste de la page.
  surChangement(() => { ui.erreur = null; rend(); });

  const avatarUrl = (cle, shiny) => sprites.still(spriteKey(cle), !!shiny);

  // ------------------------------------------------------------ rendu
  function htmlCompte() {
    if (!configure()) return '';
    return `
      <div class="reg-bloc cpte">
        <h3>${t('compte')}</h3>
        ${etat.user ? htmlConnecte() : htmlDeconnecte()}
        ${ui.erreur ? `<p class="cpte-err">${esc(ui.erreur)}</p>` : ''}
        ${ui.message ? `<p class="cpte-ok">${esc(ui.message)}</p>` : ''}
      </div>
      ${ui.avatarOuvert ? htmlAvatars() : ''}`;
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
            <small class="cpte-note ${ui.pseudoEtat ?? ''}">${
              ui.pseudoEtat === 'libre' ? t('cptePseudoLibre')
              : ui.pseudoEtat === 'pris' ? t('cptePseudoPris')
              : ui.pseudoEtat === 'invalide' ? t('cptePseudoInvalide')
              : t('cptePseudoAide')}</small>
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

  function htmlConnecte() {
    const p = etat.profil ?? {};
    return `
      <div class="cpte-moi">
        <button class="cpte-avatar" data-cpte-avatar aria-label="${t('cpteChangerPhoto')}">
          <img src="${avatarUrl(p.avatar ?? 25, p.avatar_shiny)}" alt="" />
        </button>
        <div class="cpte-ident">
          <b>${esc(p.pseudo ?? '—')}</b>
          <small>${esc(etat.user.email ?? '')}</small>
        </div>
      </div>

      ${ui.pseudoOuvert ? `
        <form class="cpte-form" data-cpte-pseudo>
          <label class="bs-field">
            <span>${t('cptePseudo')}</span>
            <input class="bs-name" type="text" name="pseudo" maxlength="16" minlength="3"
                   value="${esc(p.pseudo ?? '')}" autocomplete="off" />
            <small class="cpte-note ${ui.pseudoEtat ?? ''}">${
              ui.pseudoEtat === 'libre' ? t('cptePseudoLibre')
              : ui.pseudoEtat === 'pris' ? t('cptePseudoPris')
              : ui.pseudoEtat === 'invalide' ? t('cptePseudoInvalide')
              : t('cptePseudoAide')}</small>
          </label>
          <button class="btn primaire" type="submit" ${ui.occupe ? 'disabled' : ''}>${t('cpteEnregistrer')}</button>
        </form>` : ''}

      <div class="reg-lignes">
        <button class="reg-ligne" data-cpte-avatar>
          ${ICO.plus}<span><b>${t('cpteChangerPhoto')}</b><small>${t('cpteAvatarAide')}</small></span>
        </button>
        <button class="reg-ligne" data-cpte-pseudo-ouvre>
          ${ICO.plus}<span><b>${t('cpteChangerPseudo')}</b><small>${t('cptePseudoAide')}</small></span>
        </button>
      </div>

      <div class="cpte-liens">
        <button data-cpte-sortir>${t('cpteDeconnexion')}</button>
        <button class="danger" data-cpte-supprimer>${t('cpteSupprimer')}</button>
      </div>
      <p class="reg-aide">${t('cpteSupprimerAide')}</p>`;
  }

  // Le sélecteur d'avatar réutilise le CATALOGUE du sélecteur de Pokémon : même
  // recherche, mêmes sprites, aucun téléversement. L'avatar est une CLÉ, pas une
  // image — il s'affiche donc hors ligne, et ne coûte rien à stocker.
  function htmlAvatars() {
    const q = ui.avatarQ.trim().toLowerCase();
    const res = (q ? CATALOGUE.filter((e) => e.cle.includes(q)) : CATALOGUE).slice(0, 120);
    return `
      <div class="reg-bloc cpte-avatars">
        <h3>${t('cpteChoisirAvatar')}</h3>
        <label class="bs-field">
          <span>${t('rechercher')}</span>
          <input class="bs-name" type="text" data-cpte-avatarq value="${esc(ui.avatarQ)}"
                 placeholder="${t('placeholderPokemon')}" autocomplete="off" />
        </label>
        <div class="picks">
          ${res.map((e) => `
            <button class="pick" data-cpte-pick="${esc(String(e.id))}">
              <img src="${sprites.still(e.sprite)}" alt="" loading="lazy" />
              <span>${esc(e.name)}</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  // ------------------------------------------------------------ interactions
  function branche(app) {
    app.addEventListener('click', async (e) => {
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
      if (e.target.closest('[data-cpte-avatar]')) {
        ui.avatarOuvert = !ui.avatarOuvert;
        return rend();
      }
      if (e.target.closest('[data-cpte-pseudo-ouvre]')) {
        ui.pseudoOuvert = !ui.pseudoOuvert;
        ui.pseudoEtat = null;
        return rend();
      }
      if (e.target.closest('[data-cpte-sortir]')) { await deconnecte(); return rend(); }

      const pick = e.target.closest('[data-cpte-pick]');
      if (pick) return lance(async () => {
        const r = await changeAvatar(pick.dataset.cptePick, false, t);
        if (r.ok) ui.avatarOuvert = false;
        return r;
      });

      if (e.target.closest('[data-cpte-oubli]')) {
        const champ = app.querySelector('[data-cpte-form] [name="email"]');
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

    app.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-cpte-form], [data-cpte-pseudo]');
      if (!form) return;
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));

      if (form.hasAttribute('data-cpte-pseudo')) {
        return lance(async () => {
          const r = await changePseudo(String(d.pseudo ?? '').trim(), t);
          if (r.ok) { ui.pseudoOuvert = false; ui.pseudoEtat = null; }
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
    app.addEventListener('input', (e) => {
      const q = e.target.closest('[data-cpte-avatarq]');
      if (q) { ui.avatarQ = q.value; return majAvatars(app); }

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

  function majAvatars(app) {
    const zone = app.querySelector('.cpte-avatars .picks');
    if (!zone) return;
    const q = ui.avatarQ.trim().toLowerCase();
    const res = (q ? CATALOGUE.filter((e) => e.cle.includes(q)) : CATALOGUE).slice(0, 120);
    zone.innerHTML = res.map((e) => `
      <button class="pick" data-cpte-pick="${esc(String(e.id))}">
        <img src="${sprites.still(e.sprite)}" alt="" loading="lazy" />
        <span>${esc(e.name)}</span>
      </button>`).join('');
  }

  // Enveloppe commune : état occupé, erreur affichée, rendu à la fin. Sans elle,
  // chaque action répéterait les mêmes six lignes.
  async function lance(action) {
    if (ui.occupe) return;
    ui.occupe = true;
    ui.erreur = ui.message = null;
    rend();
    try {
      const r = await action();
      if (r?.erreur) ui.erreur = r.erreur;
    } catch (e) {
      ui.erreur = String(e?.message ?? e);
    } finally {
      ui.occupe = false;
      rend();
    }
  }

  return { htmlCompte, branche, demarre };
}
