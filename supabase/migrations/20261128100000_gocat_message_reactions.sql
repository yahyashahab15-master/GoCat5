-- Per-message emoji reactions with participant-only access.
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍','❤️','😂','😮','🎉','🔥','👏','🙌')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.message_reactions FROM anon, public;
GRANT SELECT, INSERT, DELETE ON TABLE public.message_reactions TO authenticated;

DROP POLICY IF EXISTS "GoCat participants can read message reactions" ON public.message_reactions;
CREATE POLICY "GoCat participants can read message reactions"
ON public.message_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages message
    WHERE message.id = message_reactions.message_id
      AND (message.sender_id = (SELECT auth.uid())::text
        OR message.recipient_id = (SELECT auth.uid())::text)
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
      AND (message.sender_id = (SELECT auth.uid())::text
        OR message.recipient_id = (SELECT auth.uid())::text)
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
      AND (message.sender_id = (SELECT auth.uid())::text
        OR message.recipient_id = (SELECT auth.uid())::text)
  )
);

DROP POLICY IF EXISTS "GoCat block banned message reactions" ON public.message_reactions;
CREATE POLICY "GoCat block banned message reactions"
ON public.message_reactions AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.is_gocat_banned())
WITH CHECK (NOT public.is_gocat_banned());

CREATE INDEX IF NOT EXISTS message_reactions_message_id_idx
ON public.message_reactions (message_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END
$$;