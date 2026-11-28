-- Add group chats without rewriting existing direct-message rows.
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  created_by text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid
  REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.messages ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_conversation_recipient_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_conversation_recipient_check
  CHECK (
    (conversation_id IS NULL AND recipient_id IS NOT NULL)
    OR
    (conversation_id IS NOT NULL AND recipient_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS conversation_members_user_joined_idx
  ON public.conversation_members (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at ASC)
  WHERE conversation_id IS NOT NULL;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conversations, public.conversation_members FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.conversations, public.conversation_members TO authenticated;

CREATE OR REPLACE FUNCTION private.gocat_is_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.conversation_members member_row
       WHERE member_row.conversation_id = p_conversation_id
         AND member_row.user_id = (SELECT auth.uid())::text
     );
$function$;
REVOKE ALL ON FUNCTION private.gocat_is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.gocat_is_conversation_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "GoCat group members can read conversations" ON public.conversations;
CREATE POLICY "GoCat group members can read conversations"
ON public.conversations FOR SELECT TO authenticated
USING (private.gocat_is_conversation_member(id));

DROP POLICY IF EXISTS "GoCat group members can read membership" ON public.conversation_members;
CREATE POLICY "GoCat group members can read membership"
ON public.conversation_members FOR SELECT TO authenticated
USING (private.gocat_is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "GoCat banned users cannot read group conversations" ON public.conversations;
CREATE POLICY "GoCat banned users cannot read group conversations"
ON public.conversations AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.is_gocat_banned())
WITH CHECK (NOT public.is_gocat_banned());

DROP POLICY IF EXISTS "GoCat banned users cannot read group memberships" ON public.conversation_members;
CREATE POLICY "GoCat banned users cannot read group memberships"
ON public.conversation_members AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.is_gocat_banned())
WITH CHECK (NOT public.is_gocat_banned());

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

  IF EXISTS (
    SELECT 1
    FROM unnest(v_member_ids) AS requested(user_id)
    LEFT JOIN public.users target ON target.id = requested.user_id
    WHERE target.id IS NULL
       OR COALESCE(target.is_banned, false)
       OR NOT (
         target.allow_messages_from = 'everyone'
         OR (
           target.allow_messages_from = 'followers'
           AND EXISTS (
             SELECT 1 FROM public.follows relation
             WHERE relation.follower_id = v_creator_id
               AND relation.following_id = target.id
           )
         )
         OR (
           target.allow_messages_from = 'mutuals'
           AND public.are_mutual_followers(v_creator_id, target.id)
         )
       )
  ) THEN
    RAISE EXCEPTION 'One or more selected people do not accept messages from your account.';
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

DROP POLICY IF EXISTS "GoCat group members can read group messages" ON public.messages;
CREATE POLICY "GoCat group members can read group messages"
ON public.messages FOR SELECT TO authenticated
USING (conversation_id IS NOT NULL AND private.gocat_is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "GoCat group members can send group messages" ON public.messages;
CREATE POLICY "GoCat group members can send group messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  conversation_id IS NOT NULL
  AND recipient_id IS NULL
  AND sender_id = (SELECT auth.uid())::text
  AND private.gocat_is_conversation_member(conversation_id)
);

DROP POLICY IF EXISTS "GoCat participants can read message reactions" ON public.message_reactions;
CREATE POLICY "GoCat participants can read message reactions"
ON public.message_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages message
    WHERE message.id = message_reactions.message_id
      AND (
        (message.conversation_id IS NULL AND
          (message.sender_id = (SELECT auth.uid())::text OR message.recipient_id = (SELECT auth.uid())::text))
        OR
        (message.conversation_id IS NOT NULL AND private.gocat_is_conversation_member(message.conversation_id))
      )
  )
);

DROP POLICY IF EXISTS "GoCat participants can add message reactions" ON public.message_reactions;
CREATE POLICY "GoCat participants can add message reactions"
ON public.message_reactions FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1 FROM public.messages message
    WHERE message.id = message_reactions.message_id
      AND (
        (message.conversation_id IS NULL AND
          (message.sender_id = (SELECT auth.uid())::text OR message.recipient_id = (SELECT auth.uid())::text))
        OR
        (message.conversation_id IS NOT NULL AND private.gocat_is_conversation_member(message.conversation_id))
      )
  )
);

DROP POLICY IF EXISTS "GoCat users can remove their message reactions" ON public.message_reactions;
CREATE POLICY "GoCat users can remove their message reactions"
ON public.message_reactions FOR DELETE TO authenticated
USING (
  user_id = (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1 FROM public.messages message
    WHERE message.id = message_reactions.message_id
      AND (
        (message.conversation_id IS NULL AND
          (message.sender_id = (SELECT auth.uid())::text OR message.recipient_id = (SELECT auth.uid())::text))
        OR
        (message.conversation_id IS NOT NULL AND private.gocat_is_conversation_member(message.conversation_id))
      )
  )
);

DROP POLICY IF EXISTS "GoCat chat participants read attachments" ON storage.objects;
CREATE POLICY "GoCat chat participants read attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND EXISTS (
    SELECT 1 FROM public.messages message
    WHERE message.attachment_path = objects.name
      AND (
        (message.conversation_id IS NULL AND
          (message.sender_id = (SELECT auth.uid())::text OR message.recipient_id = (SELECT auth.uid())::text))
        OR
        (message.conversation_id IS NOT NULL AND private.gocat_is_conversation_member(message.conversation_id))
      )
  )
  AND NOT public.is_gocat_banned()
);

CREATE OR REPLACE FUNCTION private.gocat_touch_group_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE public.conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.gocat_touch_group_conversation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS gocat_touch_group_conversation ON public.messages;
CREATE TRIGGER gocat_touch_group_conversation
AFTER INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.conversation_id IS NOT NULL)
EXECUTE FUNCTION private.gocat_touch_group_conversation();
