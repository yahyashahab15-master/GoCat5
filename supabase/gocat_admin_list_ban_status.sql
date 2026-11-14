-- GoCat admin-only moderation status lookup.
-- Public profile reads must use explicit safe columns:
-- id, username, bio, avatar_path, created_at.
-- This function keeps is_banned private from ordinary clients.

CREATE OR REPLACE FUNCTION public.gocat_admin_list_ban_status()
RETURNS TABLE (user_id text, is_banned boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.gocat_admins AS a
       WHERE a.user_id = (SELECT auth.uid())
     ) THEN
    RAISE EXCEPTION 'Only GoCat admins can view moderation status';
  END IF;

  RETURN QUERY
  SELECT u.id, u.is_banned
  FROM public.users AS u
  ORDER BY u.username;
END;
$function$;

REVOKE ALL ON FUNCTION public.gocat_admin_list_ban_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gocat_admin_list_ban_status() TO authenticated;
