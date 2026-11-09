-- GoCat database fixes
-- Run this once in Supabase SQL Editor.
-- GoCat stores created_at as Unix milliseconds (BIGINT), matching Date.now().

-- Fix timestamp defaults on every existing public table that stores created_at as BIGINT.
DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'created_at'
          AND data_type = 'bigint'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT ((extract(epoch FROM now()) * 1000)::bigint)',
            target.table_name
        );
    END LOOP;
END
$$;

-- Let signed-in users create their own GoCat profile rows.
-- Existing public-profile SELECT rules are left unchanged.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read GoCat profiles" ON public.users;
CREATE POLICY "Signed-in users can read GoCat profiles"
    ON public.users
    FOR SELECT
    TO authenticated
    USING (true);

GRANT SELECT ON public.users TO authenticated;

DROP POLICY IF EXISTS "Users can create their own GoCat profile" ON public.users;
CREATE POLICY "Users can create their own GoCat profile"
    ON public.users
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = id::text);

DROP POLICY IF EXISTS "Users can update their own GoCat profile" ON public.users;
CREATE POLICY "Users can update their own GoCat profile"
    ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = id::text)
    WITH CHECK (auth.uid()::text = id::text);

GRANT INSERT, UPDATE ON public.users TO authenticated;

-- Allow visitors to read video comments and signed-in users to add their own.
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read GoCat video comments" ON public.comments;
CREATE POLICY "Anyone can read GoCat video comments"
    ON public.comments
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Signed-in users can add GoCat video comments" ON public.comments;
CREATE POLICY "Signed-in users can add GoCat video comments"
    ON public.comments
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = user_id::text);

GRANT SELECT ON public.comments TO anon, authenticated;
GRANT INSERT ON public.comments TO authenticated;

-- Create post_comments with exactly the same post_id data type as posts.id.
-- This avoids guessing whether the existing posts.id column is UUID or BIGINT.
CREATE TABLE IF NOT EXISTS public.post_comments AS
SELECT id AS post_id
FROM public.posts
WITH NO DATA;

ALTER TABLE public.post_comments
    ADD COLUMN IF NOT EXISTS user_id uuid,
    ADD COLUMN IF NOT EXISTS content text,
    ADD COLUMN IF NOT EXISTS created_at bigint
        DEFAULT ((extract(epoch FROM now()) * 1000)::bigint);

CREATE INDEX IF NOT EXISTS post_comments_post_id_created_at_idx
    ON public.post_comments (post_id, created_at);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read GoCat post comments" ON public.post_comments;
CREATE POLICY "Anyone can read GoCat post comments"
    ON public.post_comments
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Signed-in users can comment on GoCat posts" ON public.post_comments;
CREATE POLICY "Signed-in users can comment on GoCat posts"
    ON public.post_comments
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can delete their own GoCat post comments" ON public.post_comments;
CREATE POLICY "Users can delete their own GoCat post comments"
    ON public.post_comments
    FOR DELETE
    TO authenticated
    USING (auth.uid()::text = user_id::text);

GRANT SELECT ON public.post_comments TO anon, authenticated;
GRANT INSERT, DELETE ON public.post_comments TO authenticated;

-- Allow each signed-in author to edit only their own post text.
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update their own GoCat posts" ON public.posts;
CREATE POLICY "Users can update their own GoCat posts"
    ON public.posts
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = user_id::text)
    WITH CHECK (auth.uid()::text = user_id::text);

GRANT UPDATE ON public.posts TO authenticated;


-- Ensure post_comments has a stable primary key and real foreign keys.
-- Safe for existing rows: the current rows were checked for null/orphan references.
ALTER TABLE public.post_comments
    ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.post_comments
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

UPDATE public.post_comments
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.post_comments
    ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.post_comments'::regclass
          AND contype = 'p'
    ) THEN
        ALTER TABLE public.post_comments
            ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.post_comments'::regclass
          AND conname = 'post_comments_post_id_fkey'
    ) THEN
        ALTER TABLE public.post_comments
            ADD CONSTRAINT post_comments_post_id_fkey
            FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.post_comments'::regclass
          AND conname = 'post_comments_user_id_fkey'
    ) THEN
        ALTER TABLE public.post_comments
            ADD CONSTRAINT post_comments_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS post_comments_user_id_idx
    ON public.post_comments(user_id);
