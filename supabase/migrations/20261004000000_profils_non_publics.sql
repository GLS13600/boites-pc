-- Restreint la lecture de `public.profils` à son propriétaire.
--
-- CE QUI ÉTAIT OUVERT. La politique d'origine autorisait la lecture par tous
-- (`using (true)`), au motif de pouvoir répondre « ce pseudo est déjà pris ». La clé
-- publiable étant embarquée dans l'application, donc publique par conception, toute
-- personne la relevant dans le bundle pouvait interroger la table et en obtenir la
-- liste complète : identifiant de compte, pseudonyme, avatar, date de création et
-- date de dernière activité, pour l'ensemble des utilisateurs.
--
-- Vérifié avant correction, requête anonyme sur `/rest/v1/profils` :
--   HTTP 200, et la ligne complète du seul compte existant.
--
-- Ce n'est pas une faille d'écriture — les politiques d'insertion et de mise à jour
-- étaient correctes, et une tentative d'écriture anonyme était bien refusée — mais
-- c'est une divulgation : énumération des comptes, et exposition d'un rythme d'usage
-- par `modifie_le`.
--
-- POURQUOI LA RESTRICTION NE COÛTE RIEN. La vérification de disponibilité d'un
-- pseudonyme ne passe pas par cette table : elle passe par la fonction
-- `pseudo_disponible(text)`, déclarée `security definer`, qui rend un simple booléen
-- sans rien divulguer d'autre. L'application ne lit jamais que SON propre profil
-- (`litProfil`). La politique publique était donc redondante.
--
-- À rejouer sans risque : la politique est remplacée, pas ajoutée.

drop policy if exists "profils lisibles par tous" on public.profils;

drop policy if exists "chacun lit son profil" on public.profils;
create policy "chacun lit son profil"
  on public.profils for select
  using (auth.uid() = id);

-- La fonction de disponibilité reste accessible sans session : elle est appelée avant
-- l'inscription, donc par un visiteur non connecté. Elle ne révèle rien de plus que
-- l'existence d'un pseudonyme donné, ce qui est le strict nécessaire pour afficher
-- « ce pseudo est déjà pris » — et ne permet aucune énumération, puisqu'il faut
-- proposer le pseudonyme pour savoir s'il est libre.
grant execute on function public.pseudo_disponible(text) to anon, authenticated;
