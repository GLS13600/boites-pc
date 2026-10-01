-- Comptes utilisateurs : profil et collection synchronisée.
--
-- À appliquer par `supabase db push`, ou par un copier-coller dans l'éditeur SQL du
-- tableau de bord. Le fichier est écrit pour être rejouable : chaque objet est créé
-- « if not exists » ou remplacé.
--
-- PRINCIPE DE SÉCURITÉ : la clé « anon » part dans le bundle, elle est donc publique.
-- Ce n'est PAS elle qui protège les données — c'est la sécurité au niveau des lignes
-- (RLS), activée sur les deux tables, qui garantit qu'un utilisateur ne lit et
-- n'écrit que ses propres lignes. Toute table ajoutée plus tard doit l'activer aussi.

-- L'unicité du pseudo est insensible à la casse — « Sacha » et « sacha » sont le même
-- pseudo — mais SANS l'extension `citext` : son installation demande des droits que le
-- rôle de l'éditeur SQL n'a pas toujours sur un projet neuf, et elle faisait échouer
-- toute la migration dès la première ligne. Un index unique sur `lower(pseudo)` donne
-- le même résultat, en SQL standard et sans extension.

-- ---------------------------------------------------------------- profils
--
-- Une ligne par compte, créée automatiquement à l'inscription par le déclencheur
-- plus bas. `id` référence `auth.users` : supprimer le compte supprime le profil.
create table if not exists public.profils (
  id          uuid primary key references auth.users (id) on delete cascade,
  pseudo      text not null,
  -- L'avatar est une CLÉ DE POKÉMON (« 25 », « 10034 », « deerling-winter »), pas une
  -- image : les 5 291 sprites sont déjà embarqués dans l'application. Rien à
  -- téléverser, rien à stocker, rien à payer — et l'avatar s'affiche hors ligne.
  avatar      text not null default '25',
  -- L'avatar suit la vue chromatique si l'utilisateur le veut.
  avatar_shiny boolean not null default false,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now(),

  -- 3 à 16 caractères : lettres, chiffres, tiret, souligné. Pas d'espace — un pseudo
  -- se tape et se partage. La contrainte vit ICI et pas seulement dans l'interface :
  -- le client n'est jamais une barrière de sécurité.
  constraint pseudo_valide check (pseudo ~ '^[A-Za-z0-9_-]{3,16}$')
);

-- L'index porte sur `lower(pseudo)` : c'est LUI qui rend l'unicité insensible à la
-- casse, et c'est la seule garantie qui compte — le contrôle côté client n'est qu'une
-- politesse, deux inscriptions simultanées se départagent ici.
create unique index if not exists profils_pseudo_unique on public.profils (lower(pseudo));

alter table public.profils enable row level security;

-- Un profil est LISIBLE PAR TOUS : c'est ce qui permet de dire « ce pseudo est déjà
-- pris » et, plus tard, d'afficher le pseudo d'un autre dresseur. Rien de sensible
-- n'y vit — ni e-mail, ni jeton. L'e-mail reste dans `auth.users`, inaccessible.
drop policy if exists "profils lisibles par tous" on public.profils;
create policy "profils lisibles par tous"
  on public.profils for select
  using (true);

drop policy if exists "chacun modifie son profil" on public.profils;
create policy "chacun modifie son profil"
  on public.profils for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "chacun crée son profil" on public.profils;
create policy "chacun crée son profil"
  on public.profils for insert
  with check (auth.uid() = id);

-- ---------------------------------------------------------------- collection
--
-- TOUTE la progression, dans une seule ligne par compte et un seul objet JSON : les
-- captures normales et chromatiques, les boîtes, l'ordre, les onglets, les équipes.
--
-- Pourquoi du JSON plutôt que des tables normalisées : c'est EXACTEMENT la charge que
-- l'application sait déjà produire et relire (`exportTout` / `importTout`), donc la
-- synchronisation n'a rien à traduire. Une table `captures(user_id, cle)` aurait
-- demandé 1 025 lignes par compte, un diff à chaque capture, et aurait dupliqué une
-- logique de fusion qui existe déjà. On ne gagne un schéma normalisé que si l'on
-- interroge les données champ par champ — ce que personne ne fait ici.
create table if not exists public.collections (
  id         uuid primary key references auth.users (id) on delete cascade,
  donnees    jsonb not null default '{}'::jsonb,
  -- Horodatage de l'appareil qui a écrit en dernier. C'est l'arbitre du « dernier
  -- écrit gagne » : voir `src/sync.js`, qui compare avant d'envoyer.
  modifie_le timestamptz not null default now(),
  -- De quel appareil vient la dernière écriture, pour pouvoir le dire à
  -- l'utilisateur plutôt que d'écraser en silence.
  appareil   text
);

alter table public.collections enable row level security;

-- Celle-ci n'est PAS publique : la collection n'appartient qu'à son propriétaire.
drop policy if exists "chacun lit sa collection" on public.collections;
create policy "chacun lit sa collection"
  on public.collections for select
  using (auth.uid() = id);

drop policy if exists "chacun écrit sa collection" on public.collections;
create policy "chacun écrit sa collection"
  on public.collections for insert
  with check (auth.uid() = id);

drop policy if exists "chacun met à jour sa collection" on public.collections;
create policy "chacun met à jour sa collection"
  on public.collections for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------- horodatage
create or replace function public.touche_modifie_le()
returns trigger
language plpgsql
as $$
begin
  new.modifie_le = now();
  return new;
end;
$$;

drop trigger if exists profils_modifie_le on public.profils;
create trigger profils_modifie_le
  before update on public.profils
  for each row execute function public.touche_modifie_le();

-- ---------------------------------------------------------------- pseudo libre ?
--
-- Appelée AVANT l'inscription, donc par un visiteur non connecté : c'est pour cela
-- qu'elle est exécutable par `anon`. Elle ne révèle rien de plus que la politique de
-- lecture des profils, qui est déjà publique.
--
-- `security definer` avec un `search_path` figé : sans ce verrou, un utilisateur
-- pourrait placer un schéma à lui devant `public` et détourner la fonction.
create or replace function public.pseudo_disponible(nom text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.profils where lower(pseudo) = lower(nom));
$$;

grant execute on function public.pseudo_disponible(text) to anon, authenticated;

-- ---------------------------------------------------------------- à l'inscription
--
-- Crée le profil dès la création du compte, quel que soit le chemin — e-mail,
-- Google ou Apple. Sans ce déclencheur, un compte Google arriverait sans profil et
-- l'application devrait rattraper le cas à chaque connexion.
--
-- Le pseudo vient, dans l'ordre : de celui saisi à l'inscription, du nom donné par
-- le fournisseur OAuth, sinon de la partie locale de l'e-mail. Il est nettoyé pour
-- respecter la contrainte, et suffixé tant qu'il est pris — un compte Google ne doit
-- jamais échouer parce qu'un homonyme existe.
create or replace function public.cree_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  souhaite text;
  essai    text;
  n        int := 0;
begin
  souhaite := coalesce(
    new.raw_user_meta_data ->> 'pseudo',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, 'dresseur'), '@', 1)
  );

  -- On ne garde que ce que la contrainte accepte, puis on complète si c'est trop court.
  souhaite := regexp_replace(souhaite, '[^A-Za-z0-9_-]', '', 'g');
  souhaite := left(souhaite, 16);
  if length(souhaite) < 3 then
    souhaite := 'Dresseur';
  end if;

  essai := souhaite;
  while exists (select 1 from public.profils where lower(pseudo) = lower(essai)) loop
    n := n + 1;
    -- On tronque la base pour que le suffixe tienne dans les 16 caractères.
    essai := left(souhaite, 16 - length(n::text) - 1) || '-' || n::text;
    -- Garde-fou : on ne boucle pas indéfiniment si quelque chose tourne mal.
    exit when n > 9999;
  end loop;

  insert into public.profils (id, pseudo, avatar)
  values (
    new.id,
    essai,
    coalesce(new.raw_user_meta_data ->> 'avatar', '25')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists au_nouveau_compte on auth.users;
create trigger au_nouveau_compte
  after insert on auth.users
  for each row execute function public.cree_profil();

-- ---------------------------------------------------------------- suppression
--
-- L'App Store EXIGE que la suppression du compte se fasse depuis l'application
-- (règle 5.1.1(v)) : il ne suffit pas de renvoyer vers un formulaire web.
--
-- `auth.users` n'est pas modifiable par le client, d'où cette fonction : elle
-- supprime l'utilisateur AUTHENTIFIÉ, et lui seul — `auth.uid()` ne peut pas être
-- forgé, il vient du jeton vérifié par PostgREST. Les deux tables suivent par leur
-- `on delete cascade`.
create or replace function public.supprime_mon_compte()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  moi uuid := auth.uid();
begin
  if moi is null then
    raise exception 'Aucun compte connecté.';
  end if;
  delete from auth.users where id = moi;
end;
$$;

revoke execute on function public.supprime_mon_compte() from anon;
grant execute on function public.supprime_mon_compte() to authenticated;
