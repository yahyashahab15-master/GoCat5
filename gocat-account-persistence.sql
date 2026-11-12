-- GoCat account persistence and profile privacy.
-- This is the database migration already applied to the connected GoCat Supabase project.
-- Keep RLS enabled: these policies allow each account to access only its own activity.

CREATE TABLE IF NOT EXISTS public.watch_history (
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id text NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  watched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watch_history_pkey PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS watch_history_user_watched_idx
  ON public.watch_history (user_id, watched_at DESC);
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "GoCat users read their own watch history" ON public.watch_history;
CREATE POLICY "GoCat users read their own watch history"
  ON public.watch_history FOR SELECT TO authenticated
  USING ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "GoCat users add to their own watch history" ON public.watch_history;
CREATE POLICY "GoCat users add to their own watch history"
  ON public.watch_history FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "GoCat users update their own watch history" ON public.watch_history;
CREATE POLICY "GoCat users update their own watch history"
  ON public.watch_history FOR UPDATE TO authenticated
  USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "GoCat users delete their own watch history" ON public.watch_history;
CREATE POLICY "GoCat users delete their own watch history"
  ON public.watch_history FOR DELETE TO authenticated
  USING ((SELECT auth.uid())::text = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_history TO authenticated;
REVOKE ALL ON public.watch_history FROM anon;

CREATE TABLE IF NOT EXISTS public.gocat_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  icon text NOT NULL DEFAULT 'bell',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS gocat_notifications_user_created_idx
  ON public.gocat_notifications (user_id, created_at DESC);
ALTER TABLE public.gocat_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "GoCat users read their own notifications" ON public.gocat_notifications;
CREATE POLICY "GoCat users read their own notifications"
  ON public.gocat_notifications FOR SELECT TO authenticated
  USING ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "GoCat users create their own notifications" ON public.gocat_notifications;
CREATE POLICY "GoCat users create their own notifications"
  ON public.gocat_notifications FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "GoCat users update their own notifications" ON public.gocat_notifications;
CREATE POLICY "GoCat users update their own notifications"
  ON public.gocat_notifications FOR UPDATE TO authenticated
  USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "GoCat users delete their own notifications" ON public.gocat_notifications;
CREATE POLICY "GoCat users delete their own notifications"
  ON public.gocat_notifications FOR DELETE TO authenticated
  USING ((SELECT auth.uid())::text = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gocat_notifications TO authenticated;
REVOKE ALL ON public.gocat_notifications FROM anon;

-- The app reads public profiles from this table; account credentials belong in Auth.
REVOKE SELECT ON TABLE public.users FROM anon, authenticated;
GRANT SELECT (id, username, bio, avatar_path, created_at)
  ON TABLE public.users TO anon, authenticated;
REVOKE INSERT, UPDATE ON TABLE public.users FROM anon, authenticated;
GRANT INSERT (id, username, email, created_at) ON TABLE public.users TO authenticated;
GRANT UPDATE (username, bio, avatar_path) ON TABLE public.users TO authenticated;

REVOKE ALL ON FUNCTION public.is_gocat_banned() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_gocat_banned() TO authenticated;

-- Enable account activity subscriptions through Supabase Realtime when available.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'watch_history'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_history;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'gocat_notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.gocat_notifications;
    END IF;
  END IF;
END
$$;


-- Make ban checks restrictive so they combine with ownership/admin policies using AND.
-- Without AS RESTRICTIVE, permissive policies are OR-ed and an ownership policy could
-- accidentally allow a banned account to continue writing.
DO $$
DECLARE
  target_table text;
  tables_to_guard text[] := ARRAY[
    'users','videos','likes','comments','follows','posts',
    'post_likes','post_comments','messages','video_views',
    'watch_history','gocat_notifications'
  ];
BEGIN
  FOREACH target_table IN ARRAY tables_to_guard LOOP
    IF to_regclass(format('public.%I', target_table)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
        'GoCat banned accounts blocked', target_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_gocat_banned()) WITH CHECK (NOT public.is_gocat_banned())',
        'GoCat banned accounts blocked', target_table
      );
    END IF;
  END LOOP;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "GoCat banned accounts blocked" ON storage.objects;
    CREATE POLICY "GoCat banned accounts blocked"
      ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
      USING (NOT public.is_gocat_banned())
      WITH CHECK (NOT public.is_gocat_banned());
  END IF;
END
$$;
