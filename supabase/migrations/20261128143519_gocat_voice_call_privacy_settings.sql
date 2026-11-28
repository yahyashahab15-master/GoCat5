ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS allow_voice_calls_from text NOT NULL DEFAULT 'mutuals';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_allow_voice_calls_from_check;
ALTER TABLE public.users ADD CONSTRAINT users_allow_voice_calls_from_check
  CHECK (allow_voice_calls_from IN ('everyone', 'followers', 'mutuals', 'nobody'));
GRANT SELECT (allow_voice_calls_from), UPDATE (allow_voice_calls_from)
ON public.users TO authenticated;

CREATE OR REPLACE FUNCTION private.gocat_voice_pair_allowed(p_user_a text, p_user_b text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND p_user_a IS NOT NULL AND p_user_b IS NOT NULL
    AND p_user_a < p_user_b
    AND (SELECT auth.uid())::text IN (p_user_a, p_user_b)
    AND NOT public.is_gocat_banned()
    AND EXISTS (
      SELECT 1 FROM public.users user_a
      JOIN public.users user_b ON user_b.id = p_user_b
      WHERE user_a.id = p_user_a
        AND COALESCE(user_a.is_banned, false) = false
        AND COALESCE(user_b.is_banned, false) = false
        AND (
          user_a.allow_messages_from = 'everyone'
          OR (user_a.allow_messages_from = 'followers' AND EXISTS (
            SELECT 1 FROM public.follows relation
            WHERE relation.follower_id = user_b.id AND relation.following_id = user_a.id
          ))
          OR (user_a.allow_messages_from = 'mutuals' AND public.are_mutual_followers(user_b.id, user_a.id))
        )
        AND (
          user_b.allow_messages_from = 'everyone'
          OR (user_b.allow_messages_from = 'followers' AND EXISTS (
            SELECT 1 FROM public.follows relation
            WHERE relation.follower_id = user_a.id AND relation.following_id = user_b.id
          ))
          OR (user_b.allow_messages_from = 'mutuals' AND public.are_mutual_followers(user_a.id, user_b.id))
        )
        AND (
          user_a.allow_voice_calls_from = 'everyone'
          OR (user_a.allow_voice_calls_from = 'followers' AND EXISTS (
            SELECT 1 FROM public.follows relation
            WHERE relation.follower_id = user_b.id AND relation.following_id = user_a.id
          ))
          OR (user_a.allow_voice_calls_from = 'mutuals' AND public.are_mutual_followers(user_b.id, user_a.id))
        )
        AND (
          user_b.allow_voice_calls_from = 'everyone'
          OR (user_b.allow_voice_calls_from = 'followers' AND EXISTS (
            SELECT 1 FROM public.follows relation
            WHERE relation.follower_id = user_a.id AND relation.following_id = user_b.id
          ))
          OR (user_b.allow_voice_calls_from = 'mutuals' AND public.are_mutual_followers(user_a.id, user_b.id))
        )
        AND EXISTS (
          SELECT 1 FROM public.messages existing_message
          WHERE existing_message.conversation_id IS NULL
            AND (
              (existing_message.sender_id = user_a.id AND existing_message.recipient_id = user_b.id)
              OR (existing_message.sender_id = user_b.id AND existing_message.recipient_id = user_a.id)
            )
        )
    );
$function$;
REVOKE ALL ON FUNCTION private.gocat_voice_pair_allowed(text, text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.gocat_voice_pair_allowed(text, text) TO authenticated;
