-- GoCat Stories: 24-hour image/video sharing backed by private Supabase Storage.
BEGIN;

CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  media_path text NOT NULL UNIQUE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 180),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT stories_expiry_window CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '24 hours'
  ),
  CONSTRAINT stories_media_path_owner_folder CHECK (media_path LIKE user_id || '/stories/%')
);
CREATE INDEX IF NOT EXISTS stories_active_feed_idx ON public.stories (expires_at, created_at DESC);
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.stories TO anon, authenticated;
GRANT INSERT, DELETE ON public.stories TO authenticated;

DROP POLICY IF EXISTS "GoCat public users read active stories" ON public.stories;
CREATE POLICY "GoCat public users read active stories" ON public.stories FOR SELECT TO anon, authenticated
USING (expires_at > now() AND EXISTS (
  SELECT 1 FROM public.users u WHERE u.id = stories.user_id AND NOT u.is_banned
));

DROP POLICY IF EXISTS "GoCat users create their own stories" ON public.stories;
CREATE POLICY "GoCat users create their own stories" ON public.stories FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())::text
  AND media_path LIKE (SELECT auth.uid())::text || '/stories/%'
  AND expires_at > now()
  AND expires_at <= now() + interval '24 hours 1 minute'
  AND created_at >= now() - interval '1 minute'
  AND NOT public.is_gocat_banned()
);

DROP POLICY IF EXISTS "GoCat users or admins delete stories" ON public.stories;
CREATE POLICY "GoCat users or admins delete stories" ON public.stories FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid())::text OR public.is_gocat_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('story-media', 'story-media', false, 26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "GoCat active stories media read" ON storage.objects;
CREATE POLICY "GoCat active stories media read" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'story-media' AND EXISTS (
  SELECT 1 FROM public.stories s WHERE s.media_path = storage.objects.name AND s.expires_at > now()
));

DROP POLICY IF EXISTS "GoCat users upload own story media" ON storage.objects;
CREATE POLICY "GoCat users upload own story media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'story-media'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[2] = 'stories'
  AND NOT public.is_gocat_banned()
);

DROP POLICY IF EXISTS "GoCat users or admins delete story media" ON storage.objects;
CREATE POLICY "GoCat users or admins delete story media" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'story-media'
  AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR public.is_gocat_admin())
);

DO $realtime$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stories') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stories';
  END IF;
END;
$realtime$;

COMMIT;
