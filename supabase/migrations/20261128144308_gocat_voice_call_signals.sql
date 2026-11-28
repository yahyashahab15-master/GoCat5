CREATE TABLE IF NOT EXISTS public.gocat_voice_call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.gocat_voice_call_invites(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN ('ready','offer','answer','ice')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gocat_voice_call_signals_call_created_idx
  ON public.gocat_voice_call_signals (call_id, created_at ASC);
ALTER TABLE public.gocat_voice_call_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gocat_voice_call_signals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.gocat_voice_call_signals TO authenticated;

DROP POLICY IF EXISTS "GoCat voice participants read call signals" ON public.gocat_voice_call_signals;
CREATE POLICY "GoCat voice participants read call signals"
ON public.gocat_voice_call_signals FOR SELECT TO authenticated
USING (
  NOT public.is_gocat_banned()
  AND EXISTS (
    SELECT 1 FROM public.gocat_voice_call_invites invite
    WHERE invite.id = call_id AND invite.status = 'accepted'
      AND (invite.caller_id = (SELECT auth.uid())::text OR invite.callee_id = (SELECT auth.uid())::text)
  )
);

DROP POLICY IF EXISTS "GoCat voice participants send call signals" ON public.gocat_voice_call_signals;
CREATE POLICY "GoCat voice participants send call signals"
ON public.gocat_voice_call_signals FOR INSERT TO authenticated
WITH CHECK (
  sender_id = (SELECT auth.uid())::text
  AND NOT public.is_gocat_banned()
  AND signal_type IN ('ready','offer','answer','ice')
  AND EXISTS (
    SELECT 1 FROM public.gocat_voice_call_invites invite
    WHERE invite.id = call_id AND invite.status = 'accepted'
      AND (invite.caller_id = sender_id OR invite.callee_id = sender_id)
  )
);

CREATE OR REPLACE FUNCTION private.gocat_clear_voice_call_signals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IN ('declined','cancelled','ended') THEN
    DELETE FROM public.gocat_voice_call_signals WHERE call_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.gocat_clear_voice_call_signals() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS gocat_clear_voice_call_signals ON public.gocat_voice_call_invites;
CREATE TRIGGER gocat_clear_voice_call_signals
AFTER UPDATE OF status ON public.gocat_voice_call_invites
FOR EACH ROW WHEN (NEW.status IN ('declined','cancelled','ended'))
EXECUTE FUNCTION private.gocat_clear_voice_call_signals();

DO $publication$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'gocat_voice_call_signals'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gocat_voice_call_signals;
  END IF;
END
$publication$;

DROP POLICY IF EXISTS "GoCat voice participants receive private call broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "GoCat voice participants send private call broadcasts" ON realtime.messages;
DROP FUNCTION IF EXISTS private.gocat_voice_realtime_allowed(text, text);
