-- GoCat Communities foundation.
-- Creates public communities, public member lists, and member-only community posting.
-- Main GoCat video / Reel / post tables are not modified.

BEGIN;

CREATE TABLE IF NOT EXISTS public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 50),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  category text NOT NULL DEFAULT 'Other',
  created_by text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS communities_name_lower_unique
  ON public.communities (lower(name));
CREATE INDEX IF NOT EXISTS communities_created_at_idx
  ON public.communities (created_at DESC);

CREATE TABLE IF NOT EXISTS public.community_members (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_members_user_idx
  ON public.community_members (user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_posts_feed_idx
  ON public.community_posts (community_id, created_at DESC);

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.communities, public.community_members, public.community_posts TO anon, authenticated;
GRANT UPDATE ON public.communities TO authenticated;
GRANT INSERT ON public.community_members, public.community_posts TO authenticated;
GRANT DELETE ON public.community_members, public.community_posts TO authenticated;

DROP POLICY IF EXISTS "GoCat public communities read" ON public.communities;
CREATE POLICY "GoCat public communities read"
  ON public.communities FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "GoCat owners update communities" ON public.communities;
CREATE POLICY "GoCat owners update communities"
  ON public.communities FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid())::text)
  WITH CHECK (created_by = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "GoCat public community members read" ON public.community_members;
CREATE POLICY "GoCat public community members read"
  ON public.community_members FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "GoCat users join public communities" ON public.community_members;
CREATE POLICY "GoCat users join public communities"
  ON public.community_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
    )
    AND NOT public.is_gocat_banned()
  );

DROP POLICY IF EXISTS "GoCat users or owners remove community members" ON public.community_members;
CREATE POLICY "GoCat users or owners remove community members"
  ON public.community_members FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
        AND c.created_by = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "GoCat public community posts read" ON public.community_posts;
CREATE POLICY "GoCat public community posts read"
  ON public.community_posts FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "GoCat members create community posts" ON public.community_posts;
CREATE POLICY "GoCat members create community posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.community_members m
      WHERE m.community_id = community_posts.community_id
        AND m.user_id = (SELECT auth.uid())::text
    )
    AND NOT public.is_gocat_banned()
  );

DROP POLICY IF EXISTS "GoCat authors or community owners delete community posts" ON public.community_posts;
CREATE POLICY "GoCat authors or community owners delete community posts"
  ON public.community_posts FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_posts.community_id
        AND c.created_by = (SELECT auth.uid())::text
    )
  );

CREATE OR REPLACE FUNCTION public.gocat_create_community(
  p_name text,
  p_slug text,
  p_description text DEFAULT '',
  p_category text DEFAULT 'Other'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  new_community_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Sign in to create a community';
  END IF;

  IF public.is_gocat_banned() THEN
    RAISE EXCEPTION 'This account cannot create communities';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 3 AND 50 THEN
    RAISE EXCEPTION 'Community name must be 3 to 50 characters';
  END IF;

  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(p_slug) > 64 THEN
    RAISE EXCEPTION 'Invalid community address';
  END IF;

  IF char_length(coalesce(p_description, '')) > 500 THEN
    RAISE EXCEPTION 'Community description must be 500 characters or fewer';
  END IF;

  INSERT INTO public.communities (name, slug, description, category, created_by)
  VALUES (btrim(p_name), p_slug, coalesce(btrim(p_description), ''), coalesce(nullif(btrim(p_category), ''), 'Other'), (SELECT auth.uid())::text)
  RETURNING id INTO new_community_id;

  INSERT INTO public.community_members (community_id, user_id)
  VALUES (new_community_id, (SELECT auth.uid())::text);

  RETURN new_community_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.gocat_create_community(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gocat_create_community(text, text, text, text) TO authenticated;

COMMIT;
