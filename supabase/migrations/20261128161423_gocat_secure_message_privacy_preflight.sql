-- Avoid table-level users SELECT in message RLS. Check privacy inside a
-- SECURITY DEFINER helper so callers never need direct access to private columns.

CREATE OR REPLACE FUNCTION private.gocat_direct_message_allowed(
  p_sender_id text,
  p_recipient_id text
)
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
      FROM public.users AS recipient
      WHERE recipient.id = p_recipient_id
        AND COALESCE(recipient.is_banned, false) = false
        AND (
          recipient.allow_messages_from = 'everyone'
          OR (
            recipient.allow_messages_from = 'followers'
            AND EXISTS (
              SELECT 1
              FROM public.follows AS relation
              WHERE relation.follower_id = recipient.id
                AND relation.following_id = p_sender_id
            )
          )
          OR (
            recipient.allow_messages_from = 'mutuals'
            AND public.are_mutual_followers(p_sender_id, recipient.id)
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION private.gocat_direct_message_allowed(text, text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.gocat_direct_message_allowed(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gocat_can_message_user(p_target_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.gocat_direct_message_allowed((SELECT auth.uid())::text, p_target_id);
$function$;

REVOKE ALL ON FUNCTION public.gocat_can_message_user(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gocat_can_message_user(text) TO authenticated;

DROP POLICY IF EXISTS "GoCat message recipient audience" ON public.messages;
CREATE POLICY "GoCat message recipient audience"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  conversation_id IS NULL
  AND recipient_id IS NOT NULL
  AND private.gocat_direct_message_allowed(sender_id, recipient_id)
);
