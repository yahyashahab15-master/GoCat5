-- Preflight checks keep GoCat's direct-message and voice UI aligned with RLS.
-- They return only a yes/no result; they do not expose another user's privacy fields.

CREATE OR REPLACE FUNCTION public.gocat_can_message_user(p_target_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND p_target_id IS NOT NULL
    AND p_target_id <> (SELECT auth.uid())::text
    AND NOT public.is_gocat_banned()
    AND EXISTS (
      SELECT 1
      FROM public.users AS recipient
      WHERE recipient.id = p_target_id
        AND COALESCE(recipient.is_banned, false) = false
        AND (
          recipient.allow_messages_from = 'everyone'
          OR (
            recipient.allow_messages_from = 'followers'
            AND EXISTS (
              SELECT 1 FROM public.follows AS relation
              WHERE relation.follower_id = recipient.id
                AND relation.following_id = (SELECT auth.uid())::text
            )
          )
          OR (
            recipient.allow_messages_from = 'mutuals'
            AND public.are_mutual_followers((SELECT auth.uid())::text, recipient.id)
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION public.gocat_can_message_user(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gocat_can_message_user(text) TO authenticated;

-- "People you follow" means people followed BY the recipient account.
DROP POLICY IF EXISTS "GoCat message recipient audience" ON public.messages;
CREATE POLICY "GoCat message recipient audience"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  conversation_id IS NULL
  AND recipient_id IS NOT NULL
  AND sender_id = (SELECT auth.uid())::text
  AND NOT public.is_gocat_banned()
  AND EXISTS (
    SELECT 1
    FROM public.users AS recipient
    WHERE recipient.id = messages.recipient_id
      AND COALESCE(recipient.is_banned, false) = false
      AND (
        recipient.allow_messages_from = 'everyone'
        OR (
          recipient.allow_messages_from = 'followers'
          AND EXISTS (
            SELECT 1 FROM public.follows AS relation
            WHERE relation.follower_id = recipient.id
              AND relation.following_id = messages.sender_id
          )
        )
        OR (
          recipient.allow_messages_from = 'mutuals'
          AND public.are_mutual_followers(messages.sender_id, messages.recipient_id)
        )
      )
  )
);

-- Calls require the same bilateral privacy checks enforced on call invitations.
CREATE OR REPLACE FUNCTION public.gocat_can_call_user(p_target_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    p_target_id IS NOT NULL
    AND (SELECT auth.uid()) IS NOT NULL
    AND p_target_id <> (SELECT auth.uid())::text
    AND private.gocat_voice_pair_allowed(
      LEAST((SELECT auth.uid())::text, p_target_id),
      GREATEST((SELECT auth.uid())::text, p_target_id)
    );
$function$;

REVOKE ALL ON FUNCTION public.gocat_can_call_user(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gocat_can_call_user(text) TO authenticated;

-- Voice-note permissions support direct chats and groups without disclosing settings.
CREATE OR REPLACE FUNCTION public.gocat_can_send_voice_message(
  p_recipient_id text DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND NOT public.is_gocat_banned()
    AND CASE
      WHEN p_conversation_id IS NOT NULL THEN
        private.gocat_group_voice_message_allowed(p_conversation_id, (SELECT auth.uid())::text)
      WHEN p_recipient_id IS NOT NULL THEN
        private.gocat_voice_message_pair_allowed((SELECT auth.uid())::text, p_recipient_id)
      ELSE false
    END;
$function$;

REVOKE ALL ON FUNCTION public.gocat_can_send_voice_message(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gocat_can_send_voice_message(text, uuid) TO authenticated;
