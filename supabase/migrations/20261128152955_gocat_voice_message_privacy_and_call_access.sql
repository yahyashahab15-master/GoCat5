ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS allow_voice_messages_from text NOT NULL DEFAULT 'mutuals';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_allow_voice_messages_from_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_allow_voice_messages_from_check
  CHECK (allow_voice_messages_from IN ('everyone', 'followers', 'mutuals', 'nobody'));

GRANT UPDATE (allow_voice_messages_from) ON public.users TO authenticated;
REVOKE SELECT (allow_voice_messages_from) ON public.users FROM authenticated;

CREATE OR REPLACE FUNCTION public.gocat_get_my_voice_message_privacy()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT user_row.allow_voice_messages_from
  FROM public.users AS user_row
  WHERE user_row.id = (SELECT auth.uid())::text
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.gocat_get_my_voice_message_privacy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gocat_get_my_voice_message_privacy() TO authenticated;

CREATE OR REPLACE FUNCTION private.gocat_voice_pair_allowed(p_user_a text, p_user_b text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND p_user_a IS NOT NULL
    AND p_user_b IS NOT NULL
    AND p_user_a < p_user_b
    AND (SELECT auth.uid())::text IN (p_user_a, p_user_b)
    AND NOT public.is_gocat_banned()
    AND EXISTS (
      SELECT 1
      FROM public.users AS user_a
      JOIN public.users AS user_b ON user_b.id = p_user_b
      WHERE user_a.id = p_user_a
        AND COALESCE(user_a.is_banned, false) = false
        AND COALESCE(user_b.is_banned, false) = false
        AND (
          user_a.allow_voice_calls_from = 'everyone'
          OR (
            user_a.allow_voice_calls_from = 'followers'
            AND EXISTS (
              SELECT 1 FROM public.follows AS relation
              WHERE relation.follower_id = user_b.id
                AND relation.following_id = user_a.id
            )
          )
          OR (
            user_a.allow_voice_calls_from = 'mutuals'
            AND public.are_mutual_followers(user_b.id, user_a.id)
          )
        )
        AND (
          user_b.allow_voice_calls_from = 'everyone'
          OR (
            user_b.allow_voice_calls_from = 'followers'
            AND EXISTS (
              SELECT 1 FROM public.follows AS relation
              WHERE relation.follower_id = user_a.id
                AND relation.following_id = user_b.id
            )
          )
          OR (
            user_b.allow_voice_calls_from = 'mutuals'
            AND public.are_mutual_followers(user_a.id, user_b.id)
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION private.gocat_voice_pair_allowed(text, text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.gocat_voice_pair_allowed(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.gocat_voice_message_pair_allowed(p_sender_id text, p_recipient_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND p_sender_id = (SELECT auth.uid())::text
    AND p_recipient_id IS NOT NULL
    AND p_sender_id <> p_recipient_id
    AND NOT public.is_gocat_banned()
    AND EXISTS (
      SELECT 1
      FROM public.users AS sender
      JOIN public.users AS recipient ON recipient.id = p_recipient_id
      WHERE sender.id = p_sender_id
        AND COALESCE(sender.is_banned, false) = false
        AND COALESCE(recipient.is_banned, false) = false
        AND (
          recipient.allow_voice_messages_from = 'everyone'
          OR (
            recipient.allow_voice_messages_from = 'followers'
            AND EXISTS (
              SELECT 1 FROM public.follows AS relation
              WHERE relation.follower_id = sender.id
                AND relation.following_id = recipient.id
            )
          )
          OR (
            recipient.allow_voice_messages_from = 'mutuals'
            AND public.are_mutual_followers(sender.id, recipient.id)
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION private.gocat_voice_message_pair_allowed(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.gocat_voice_message_pair_allowed(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.gocat_group_voice_message_allowed(p_conversation_id uuid, p_sender_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND p_sender_id = (SELECT auth.uid())::text
    AND NOT public.is_gocat_banned()
    AND private.gocat_is_conversation_member(p_conversation_id)
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members AS sender_member
      WHERE sender_member.conversation_id = p_conversation_id
        AND sender_member.user_id = p_sender_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_members AS recipient_member
      JOIN public.users AS recipient ON recipient.id = recipient_member.user_id
      WHERE recipient_member.conversation_id = p_conversation_id
        AND recipient_member.user_id <> p_sender_id
        AND NOT (
          recipient.allow_voice_messages_from = 'everyone'
          OR (
            recipient.allow_voice_messages_from = 'followers'
            AND EXISTS (
              SELECT 1 FROM public.follows AS relation
              WHERE relation.follower_id = p_sender_id
                AND relation.following_id = recipient.id
            )
          )
          OR (
            recipient.allow_voice_messages_from = 'mutuals'
            AND public.are_mutual_followers(p_sender_id, recipient.id)
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION private.gocat_group_voice_message_allowed(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.gocat_group_voice_message_allowed(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "GoCat voice messages respect recipient privacy" ON public.messages;
CREATE POLICY "GoCat voice messages respect recipient privacy"
ON public.messages
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  lower(COALESCE(attachment_mime, '')) NOT LIKE 'audio/%'
  OR (
    conversation_id IS NULL
    AND recipient_id IS NOT NULL
    AND private.gocat_voice_message_pair_allowed(sender_id, recipient_id)
  )
  OR (
    conversation_id IS NOT NULL
    AND private.gocat_group_voice_message_allowed(conversation_id, sender_id)
  )
);