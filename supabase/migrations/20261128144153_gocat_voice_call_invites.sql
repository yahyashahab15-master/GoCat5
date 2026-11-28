CREATE TABLE IF NOT EXISTS public.gocat_voice_call_invites (
  id uuid PRIMARY KEY,
  caller_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  callee_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing','ringing','accepted','declined','cancelled','ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT gocat_voice_call_distinct_participants CHECK (caller_id <> callee_id),
  CONSTRAINT gocat_voice_call_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS gocat_voice_call_invites_callee_status_idx
  ON public.gocat_voice_call_invites (callee_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS gocat_voice_call_invites_caller_status_idx
  ON public.gocat_voice_call_invites (caller_id, status, created_at DESC);

ALTER TABLE public.gocat_voice_call_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gocat_voice_call_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.gocat_voice_call_invites TO authenticated;
GRANT UPDATE (status) ON TABLE public.gocat_voice_call_invites TO authenticated;

DROP POLICY IF EXISTS "GoCat voice participants read own call invitations" ON public.gocat_voice_call_invites;
CREATE POLICY "GoCat voice participants read own call invitations"
ON public.gocat_voice_call_invites FOR SELECT TO authenticated
USING (
  NOT public.is_gocat_banned()
  AND (caller_id = (SELECT auth.uid())::text OR callee_id = (SELECT auth.uid())::text)
);

DROP POLICY IF EXISTS "GoCat users create permitted voice invitations" ON public.gocat_voice_call_invites;
CREATE POLICY "GoCat users create permitted voice invitations"
ON public.gocat_voice_call_invites FOR INSERT TO authenticated
WITH CHECK (
  caller_id = (SELECT auth.uid())::text
  AND status = 'preparing'
  AND expires_at > now()
  AND expires_at <= now() + interval '1 minute'
  AND NOT public.is_gocat_banned()
  AND private.gocat_voice_pair_allowed(LEAST(caller_id, callee_id), GREATEST(caller_id, callee_id))
);

DROP POLICY IF EXISTS "GoCat callers prepare ring or cancel voice calls" ON public.gocat_voice_call_invites;
CREATE POLICY "GoCat callers prepare ring or cancel voice calls"
ON public.gocat_voice_call_invites FOR UPDATE TO authenticated
USING (caller_id = (SELECT auth.uid())::text AND status IN ('preparing','ringing') AND NOT public.is_gocat_banned())
WITH CHECK (caller_id = (SELECT auth.uid())::text AND status IN ('ringing','cancelled') AND NOT public.is_gocat_banned());

DROP POLICY IF EXISTS "GoCat callees accept or decline voice calls" ON public.gocat_voice_call_invites;
CREATE POLICY "GoCat callees accept or decline voice calls"
ON public.gocat_voice_call_invites FOR UPDATE TO authenticated
USING (callee_id = (SELECT auth.uid())::text AND status = 'ringing' AND expires_at > now() AND NOT public.is_gocat_banned())
WITH CHECK (callee_id = (SELECT auth.uid())::text AND status IN ('accepted','declined') AND NOT public.is_gocat_banned());

DROP POLICY IF EXISTS "GoCat call participants end accepted calls" ON public.gocat_voice_call_invites;
CREATE POLICY "GoCat call participants end accepted calls"
ON public.gocat_voice_call_invites FOR UPDATE TO authenticated
USING (status = 'accepted' AND (caller_id = (SELECT auth.uid())::text OR callee_id = (SELECT auth.uid())::text) AND NOT public.is_gocat_banned())
WITH CHECK (status = 'ended' AND (caller_id = (SELECT auth.uid())::text OR callee_id = (SELECT auth.uid())::text) AND NOT public.is_gocat_banned());

DO $publication$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'gocat_voice_call_invites'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gocat_voice_call_invites;
  END IF;
END
$publication$;
