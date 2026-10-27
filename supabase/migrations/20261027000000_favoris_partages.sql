-- Le compteur PARTAGÉ des favoris de cartes : combien de dresseurs ont mis une carte
-- en favori. Héritage de Cartodex, fondu dans Unydex le 27/10/2026.
--
-- POURQUOI PAS DE TABLE. Cartodex tenait une table `card_favorites`, alimentée à chaque
-- toucher du cœur — une seconde écriture à tenir d'accord avec la collection. Ici, le
-- favori voyage DÉJÀ avec la collection synchronisée (`collections.donnees`, champ
-- `cartes.<id>.fav`) : il suffit de compter les collections qui le portent. Un favori
-- posé hors ligne, ou venu d'une sauvegarde Cartodex, compte dès que la collection est
-- envoyée ; un compte supprimé cesse de compter par la cascade déjà en place.
--
-- CE QUI EST RENDU. Un nombre, jamais une identité : la fonction ne renvoie que le
-- décompte des AUTRES comptes. Le sien, l'application le lit dans sa collection locale,
-- qui est la source de vérité — l'affichage suit donc le cœur à l'instant, sans attendre
-- l'envoi de la collection.
--
-- `security definer` : la fonction lit toutes les collections, que la sécurité au niveau
-- des lignes réserve à leur propriétaire. Elle n'en rend qu'un agrégat, et son chemin de
-- recherche est figé, comme `pseudo_disponible`.
--
-- Réservée aux comptes connectés : l'application n'adresse rien à Supabase pour qui n'a
-- pas de compte, et ce compteur ne fait pas exception.
--
-- VOLUME. Sans index, chaque appel parcourt la table des collections. C'est négligeable
-- pour quelques milliers de comptes ; au-delà, un index GIN sur `donnees`
-- (`jsonb_path_ops`, qui sert l'opérateur `@>`) est la première chose à ajouter — au prix
-- d'une réindexation du document à chaque synchronisation.
--
-- À rejouer sans risque : la fonction est remplacée, pas ajoutée.

create or replace function public.favoris_carte(carte text)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select case
    -- Le même gabarit qu'un identifiant de carte côté application : le reste n'a rien
    -- à compter.
    when carte !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then 0::bigint
    else (
      select count(*)
      from public.collections
      where id is distinct from auth.uid()
        and donnees @> jsonb_build_object(
              'cartes', jsonb_build_object(carte, jsonb_build_object('fav', true)))
    )
  end;
$$;

revoke execute on function public.favoris_carte(text) from public, anon;
grant execute on function public.favoris_carte(text) to authenticated;
