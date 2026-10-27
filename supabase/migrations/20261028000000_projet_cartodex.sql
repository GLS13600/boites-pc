-- Installe Unydex dans le projet Supabase de CARTODEX (surhoceznpqkpgllitnp), repris
-- pour l'application fusionnée le 28/10/2026. Les trois migrations précédentes visaient
-- l'ancien projet d'Unydex et NE DOIVENT PAS être rejouées ici : ce fichier les remplace,
-- en un seul passage rejouable.
--
-- CE QUI EXISTAIT DÉJÀ, ET QU'ON NE TOUCHE PAS :
--   - `public.collections (user_id, data, updated_at)` : les sauvegardes de Cartodex. Le
--     nom est le même que la table d'Unydex, les colonnes non. L'application la LIT une
--     fois à la connexion pour reprendre la collection d'un compte Cartodex
--     (`src/sync.js`), et n'y écrit jamais : l'ancienne appli peut continuer à tourner.
--   - `public.card_favorites` et ses fonctions `card_fav_*` : les favoris de Cartodex,
--     comptés par `favoris_carte` tant que le compte n'a pas rejoint Unydex.
--   - `public.delete_user()` : la suppression de compte de Cartodex. Les clés étrangères
--     sont toutes en cascade, celle d'Unydex aussi.
--
-- D'OÙ `collections_unydex` : même rôle que `public.collections` dans l'ancien projet
-- (toute la progression, un objet JSON par compte — voir 20261001000000_comptes.sql).

-- ---------------------------------------------------------------- profils
create table if not exists public.profils (
  id           uuid primary key references auth.users (id) on delete cascade,
  pseudo       text not null,
  avatar       text not null default '25',
  avatar_shiny boolean not null default false,
  cree_le      timestamptz not null default now(),
  modifie_le   timestamptz not null default now(),
  constraint pseudo_valide check (pseudo ~ '^[A-Za-z0-9_-]{3,16}$')
);
create unique index if not exists profils_pseudo_unique on public.profils (lower(pseudo));
alter table public.profils enable row level security;

-- Lecture réservée au propriétaire d'emblée (voir 20261004000000_profils_non_publics.sql).
drop policy if exists "chacun lit son profil" on public.profils;
create policy "chacun lit son profil" on public.profils for select using ((select auth.uid()) = id);
drop policy if exists "chacun modifie son profil" on public.profils;
create policy "chacun modifie son profil" on public.profils for update
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "chacun crée son profil" on public.profils;
create policy "chacun crée son profil" on public.profils for insert with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------- collection d'Unydex
create table if not exists public.collections_unydex (
  id         uuid primary key references auth.users (id) on delete cascade,
  donnees    jsonb not null default '{}'::jsonb,
  modifie_le timestamptz not null default now(),
  appareil   text,
  -- Même garde-fou que la table de Cartodex : 5 Mo par compte.
  constraint donnees_taille check (pg_column_size(donnees) < 5242880)
);
alter table public.collections_unydex enable row level security;

drop policy if exists "chacun lit sa collection" on public.collections_unydex;
create policy "chacun lit sa collection" on public.collections_unydex for select
  using ((select auth.uid()) = id);
drop policy if exists "chacun écrit sa collection" on public.collections_unydex;
create policy "chacun écrit sa collection" on public.collections_unydex for insert
  with check ((select auth.uid()) = id);
drop policy if exists "chacun met à jour sa collection" on public.collections_unydex;
create policy "chacun met à jour sa collection" on public.collections_unydex for update
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------- horodatage
create or replace function public.touche_modifie_le()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.modifie_le = now();
  return new;
end;
$$;
drop trigger if exists profils_modifie_le on public.profils;
create trigger profils_modifie_le before update on public.profils
  for each row execute function public.touche_modifie_le();

-- ---------------------------------------------------------------- pseudo libre ?
create or replace function public.pseudo_disponible(nom text)
returns boolean language sql security definer set search_path = public stable as $$
  select not exists (select 1 from public.profils where lower(pseudo) = lower(nom));
$$;
grant execute on function public.pseudo_disponible(text) to anon, authenticated;

-- ---------------------------------------------------------------- un pseudo propre
-- Partagé par le déclencheur d'inscription et la reprise des comptes existants.
create or replace function public.pseudo_pour(souhaite text)
returns text language plpgsql security definer set search_path = public as $$
declare
  base  text := left(regexp_replace(coalesce(souhaite, ''), '[^A-Za-z0-9_-]', '', 'g'), 16);
  essai text;
  n     int := 0;
begin
  if length(base) < 3 then base := 'Dresseur'; end if;
  essai := base;
  while exists (select 1 from public.profils where lower(pseudo) = lower(essai)) loop
    n := n + 1;
    essai := left(base, 16 - length(n::text) - 1) || '-' || n::text;
    exit when n > 9999;
  end loop;
  return essai;
end;
$$;
revoke execute on function public.pseudo_pour(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- à l'inscription
-- Cartodex rangeait le pseudo dans les métadonnées (`pseudo`), avec `first_name` :
-- les deux sont essayés avant le nom du fournisseur et l'e-mail.
create or replace function public.cree_profil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, pseudo, avatar)
  values (
    new.id,
    public.pseudo_pour(coalesce(
      new.raw_user_meta_data ->> 'pseudo',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'first_name',
      split_part(coalesce(new.email, 'dresseur'), '@', 1))),
    coalesce(new.raw_user_meta_data ->> 'avatar', '25')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.cree_profil() from public, anon, authenticated;
drop trigger if exists au_nouveau_compte on auth.users;
create trigger au_nouveau_compte after insert on auth.users
  for each row execute function public.cree_profil();

-- Les comptes créés par Cartodex n'ont pas de profil : on le leur donne, une fois.
insert into public.profils (id, pseudo)
select u.id, public.pseudo_pour(coalesce(
  u.raw_user_meta_data ->> 'pseudo',
  u.raw_user_meta_data ->> 'full_name',
  u.raw_user_meta_data ->> 'name',
  u.raw_user_meta_data ->> 'first_name',
  split_part(coalesce(u.email, 'dresseur'), '@', 1)))
from auth.users u
where not exists (select 1 from public.profils p where p.id = u.id)
order by u.created_at;

-- ---------------------------------------------------------------- suppression
-- Les trois tables suivent `auth.users` en cascade : la sauvegarde de Cartodex part
-- avec le compte, comme celle d'Unydex et les favoris.
create or replace function public.supprime_mon_compte()
returns void language plpgsql security definer set search_path = public, auth as $$
declare moi uuid := auth.uid();
begin
  if moi is null then raise exception 'Aucun compte connecté.'; end if;
  delete from auth.users where id = moi;
end;
$$;
revoke execute on function public.supprime_mon_compte() from public, anon;
grant execute on function public.supprime_mon_compte() to authenticated;

-- ---------------------------------------------------------------- favoris partagés
-- Les AUTRES comptes : ceux d'Unydex par leur collection synchronisée, ceux restés sur
-- Cartodex par `card_favorites` — tant qu'ils n'ont pas de collection Unydex, après
-- quoi c'est elle qui fait foi (un favori retiré dans Unydex ne doit plus compter).
create or replace function public.favoris_carte(carte text)
returns bigint language sql security definer set search_path = public stable as $$
  select case
    when carte !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then 0::bigint
    else (
      select count(*) from (
        select c.id from public.collections_unydex c
        where c.id is distinct from auth.uid()
          and c.donnees @> jsonb_build_object('cartes',
                jsonb_build_object(carte, jsonb_build_object('fav', true)))
        union
        select f.user_id from public.card_favorites f
        where f.card_id = carte
          and f.user_id is distinct from auth.uid()
          and not exists (select 1 from public.collections_unydex c where c.id = f.user_id)
      ) s
    )
  end;
$$;
revoke execute on function public.favoris_carte(text) from public, anon;
grant execute on function public.favoris_carte(text) to authenticated;
