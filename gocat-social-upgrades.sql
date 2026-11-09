-- GoCat social and creator upgrades. Applied to the live project on 2026-11-09.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_path text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id text;
ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS parent_id uuid;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='comments_parent_id_fkey' AND conrelid='public.comments'::regclass) THEN
  ALTER TABLE public.comments ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY(parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='post_comments_parent_id_fkey' AND conrelid='public.post_comments'::regclass) THEN
  ALTER TABLE public.post_comments ADD CONSTRAINT post_comments_parent_id_fkey FOREIGN KEY(parent_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS post_comments_parent_id_idx ON public.post_comments(parent_id);
DROP POLICY IF EXISTS "Signed-in users can add GoCat video comments" ON public.comments;
DROP POLICY IF EXISTS "gocat_comments_insert" ON public.comments;
CREATE POLICY "GoCat users can add comments and same-thread replies" ON public.comments FOR INSERT TO authenticated
 WITH CHECK(user_id=(SELECT auth.uid())::text AND (parent_id IS NULL OR EXISTS(SELECT 1 FROM public.comments p WHERE p.id=comments.parent_id AND p.video_id=comments.video_id)));
DROP POLICY IF EXISTS "Signed-in users can comment on GoCat posts" ON public.post_comments;
CREATE POLICY "GoCat users can add post comments and same-thread replies" ON public.post_comments FOR INSERT TO authenticated
 WITH CHECK(user_id=(SELECT auth.uid()) AND (parent_id IS NULL OR EXISTS(SELECT 1 FROM public.post_comments p WHERE p.id=post_comments.parent_id AND p.post_id=post_comments.post_id)));
CREATE TABLE IF NOT EXISTS public.video_views(video_id text NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,view_date date NOT NULL DEFAULT CURRENT_DATE,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(video_id,user_id,view_date));
ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "GoCat users can record their own video views" ON public.video_views;
CREATE POLICY "GoCat users can record their own video views" ON public.video_views FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid())::text);
GRANT INSERT ON public.video_views TO authenticated;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bump_video_view_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN UPDATE public.videos SET views=COALESCE(views,0)+1 WHERE id=NEW.video_id; RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION private.bump_video_view_count() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS gocat_increment_video_views ON public.video_views;
CREATE TRIGGER gocat_increment_video_views AFTER INSERT ON public.video_views FOR EACH ROW EXECUTE FUNCTION private.bump_video_view_count();
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
REVOKE UPDATE ON public.messages FROM anon,authenticated;
GRANT UPDATE(is_read,read_at) ON public.messages TO authenticated;
DROP POLICY IF EXISTS "GoCat recipients can mark messages read" ON public.messages;
CREATE POLICY "GoCat recipients can mark messages read" ON public.messages FOR UPDATE TO authenticated USING(recipient_id=(SELECT auth.uid())::text) WITH CHECK(recipient_id=(SELECT auth.uid())::text);
CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx ON public.messages(sender_id,recipient_id,created_at);
CREATE INDEX IF NOT EXISTS messages_unread_recipient_idx ON public.messages(recipient_id,is_read) WHERE is_read=false;
CREATE OR REPLACE FUNCTION public.are_mutual_followers(user_a text,user_b text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (user_a=(SELECT auth.uid())::text OR user_b=(SELECT auth.uid())::text)
 AND EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_id::text=user_a AND f.following_id::text=user_b)
 AND EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_id::text=user_b AND f.following_id::text=user_a); $;
CREATE INDEX IF NOT EXISTS video_views_user_id_idx ON public.video_views(user_id);
REVOKE ALL ON FUNCTION public.are_mutual_followers(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.are_mutual_followers(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.is_gocat_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_gocat_admin() TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('profile-avatars','profile-avatars',true,2097152,ARRAY['image/jpeg','image/png','image/webp'])
 ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=2097152,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
DROP POLICY IF EXISTS "GoCat profile avatars are publicly readable" ON storage.objects;
CREATE POLICY "GoCat profile avatars are publicly readable" ON storage.objects FOR SELECT TO public USING(bucket_id='profile-avatars');
DROP POLICY IF EXISTS "GoCat users upload their own profile avatars" ON storage.objects;
CREATE POLICY "GoCat users upload their own profile avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='profile-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
DROP POLICY IF EXISTS "GoCat users update their own profile avatars" ON storage.objects;
CREATE POLICY "GoCat users update their own profile avatars" ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='profile-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text) WITH CHECK(bucket_id='profile-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
DROP POLICY IF EXISTS "GoCat users delete their own profile avatars" ON storage.objects;
CREATE POLICY "GoCat users delete their own profile avatars" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='profile-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='post_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
  END IF;
END $;
