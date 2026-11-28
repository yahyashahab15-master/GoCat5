-- Gate private-account follower/following relationships while keeping the
-- relationship-list policy safe from recursive queries against public.follows.

CREATE OR REPLACE FUNCTION private.gocat_viewer_follows_target(target_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND target_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.follows relation
       WHERE relation.follower_id = (SELECT auth.uid())::text
         AND relation.following_id = target_user_id
     );
$$;
REVOKE ALL ON FUNCTION private.gocat_viewer_follows_target(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.gocat_viewer_follows_target(text) TO anon, authenticated;

DROP POLICY IF EXISTS "GoCat privacy enforce follow-list visibility" ON public.follows;
CREATE POLICY "GoCat privacy enforce follow-list visibility"
ON public.follows AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  follower_id = (SELECT auth.uid())::text
  OR following_id = (SELECT auth.uid())::text
  OR (
    COALESCE(
      (SELECT profile.show_following FROM public.users profile WHERE profile.id = follows.follower_id),
      true
    )
    AND COALESCE(
      (SELECT profile.show_followers FROM public.users profile WHERE profile.id = follows.following_id),
      true
    )
    AND (
      NOT COALESCE(
        (SELECT profile.is_private FROM public.users profile WHERE profile.id = follows.follower_id),
        false
      )
      OR private.gocat_viewer_follows_target(follows.follower_id)
    )
    AND (
      NOT COALESCE(
        (SELECT profile.is_private FROM public.users profile WHERE profile.id = follows.following_id),
        false
      )
      OR private.gocat_viewer_follows_target(follows.following_id)
    )
  )
);

REVOKE ALL ON FUNCTION public.gocat_respond_follow_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gocat_respond_follow_request(uuid, boolean) TO authenticated;
