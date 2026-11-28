-- Enforce message privacy pairwise across every member in a group.
-- A group's participants must all be eligible to receive from each other when
-- it is created. The send policy re-checks current settings on each new message.

CREATE OR REPLACE FUNCTION public.create_gocat_group_conversation(
  p_title text,
  p_member_ids text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_creator_id text := (SELECT auth.uid())::text;
  v_title text := btrim(COALESCE(p_title, ''));
  v_member_ids text[];
  v_all_member_ids text[];
  v_conversation_id uuid;
BEGIN
  IF v_creator_id IS NULL THEN RAISE EXCEPTION 'Sign in to create a group chat.'; END IF;
  IF public.is_gocat_banned() THEN RAISE EXCEPTION 'This account cannot create group chats.'; END IF;
  IF char_length(v_title) < 1 OR char_length(v_title) > 60 THEN
    RAISE EXCEPTION 'Group names must be between 1 and 60 characters.';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT btrim(requested.user_id) ORDER BY btrim(requested.user_id)), ARRAY[]::text[])
    INTO v_member_ids
  FROM unnest(COALESCE(p_member_ids, ARRAY[]::text[])) AS requested(user_id)
  WHERE btrim(requested.user_id) <> '';

  IF cardinality(v_member_ids) < 1 OR cardinality(v_member_ids) > 49 THEN
    RAISE EXCEPTION 'Choose between 1 and 49 people for this group.';
  END IF;
  IF v_creator_id = ANY(v_member_ids) THEN RAISE EXCEPTION 'You are already included in this group.'; END IF;

  v_all_member_ids := array_append(v_member_ids, v_creator_id);

  IF EXISTS (
    SELECT 1
    FROM unnest(v_all_member_ids) AS sender(user_id)
    CROSS JOIN unnest(v_all_member_ids) AS receiver(user_id)
    JOIN public.users target ON target.id = receiver.user_id
    WHERE sender.user_id <> receiver.user_id
      AND NOT (
        target.allow_messages_from = 'everyone'
        OR (
          target.allow_messages_from = 'followers'
          AND EXISTS (
            SELECT 1 FROM public.follows relation
            WHERE relation.follower_id = sender.user_id
              AND relation.following_id = receiver.user_id
          )
        )
        OR (
          target.allow_messages_from = 'mutuals'
          AND public.are_mutual_followers(sender.user_id, receiver.user_id)
        )
      )
  ) THEN
    RAISE EXCEPTION 'Group not created: every member must allow messages from every other member under their privacy settings.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_all_member_ids) AS requested(user_id)
    LEFT JOIN public.users target ON target.id = requested.user_id
    WHERE target.id IS NULL OR COALESCE(target.is_banned, false)
  ) THEN
    RAISE EXCEPTION 'One or more selected accounts are unavailable.';
  END IF;

  INSERT INTO public.conversations (title, created_by)
  VALUES (v_title, v_creator_id)
  RETURNING id INTO v_conversation_id;
  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (v_conversation_id, v_creator_id, 'owner');
  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  SELECT v_conversation_id, requested.user_id, 'member'
  FROM unnest(v_member_ids) AS requested(user_id);
  RETURN v_conversation_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_gocat_group_conversation(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_gocat_group_conversation(text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION private.gocat_group_sender_allowed(
  p_conversation_id uuid,
  p_sender_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND p_sender_id = (SELECT auth.uid())::text
    AND private.gocat_is_conversation_member(p_conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.conversation_members sender_member
      WHERE sender_member.conversation_id = p_conversation_id
        AND sender_member.user_id = p_sender_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_members recipient_member
      JOIN public.users target ON target.id = recipient_member.user_id
      WHERE recipient_member.conversation_id = p_conversation_id
        AND recipient_member.user_id <> p_sender_id
        AND NOT (
          target.allow_messages_from = 'everyone'
          OR (
            target.allow_messages_from = 'followers'
            AND EXISTS (
              SELECT 1 FROM public.follows relation
              WHERE relation.follower_id = p_sender_id
                AND relation.following_id = target.id
            )
          )
          OR (
            target.allow_messages_from = 'mutuals'
            AND public.are_mutual_followers(p_sender_id, target.id)
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION private.gocat_group_sender_allowed(uuid, text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.gocat_group_sender_allowed(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "GoCat group members can send group messages" ON public.messages;
CREATE POLICY "GoCat group members can send group messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  conversation_id IS NOT NULL
  AND recipient_id IS NULL
  AND sender_id = (SELECT auth.uid())::text
  AND private.gocat_is_conversation_member(conversation_id)
  AND private.gocat_group_sender_allowed(conversation_id, sender_id)
);
