-- GoCat privacy enforcement. Restrictive policies prevent older permissive
-- "read everything" policies from bypassing the privacy rules.

DROP POLICY IF EXISTS "GoCat privacy enforce video visibility" ON public.videos;
CREATE POLICY "GoCat privacy enforce video visibility"
ON public.videos AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  owner_id = (SELECT auth.uid())::text
  OR (
    visibility = 'public'
    AND NOT COALESCE(
      (SELECT profile.is_private FROM public.users profile WHERE profile.id = videos.owner_id),
      false
    )
  )
  OR (
    visibility IN ('public', 'followers')
    AND EXISTS (
      SELECT 1 FROM public.follows relation
      WHERE relation.follower_id = (SELECT auth.uid())::text
        AND relation.following_id = videos.owner_id
    )
  )
);

DROP POLICY IF EXISTS "GoCat privacy enforce post visibility" ON public.posts;
CREATE POLICY "GoCat privacy enforce post visibility"
ON public.posts AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  user_id = (SELECT auth.uid())::text
  OR (
    visibility = 'public'
    AND NOT COALESCE(
      (SELECT profile.is_private FROM public.users profile WHERE profile.id = posts.user_id),
      false
    )
  )
  OR (
    visibility IN ('public', 'followers')
    AND EXISTS (
      SELECT 1 FROM public.follows relation
      WHERE relation.follower_id = (SELECT auth.uid())::text
        AND relation.following_id = posts.user_id
    )
  )
);

DROP POLICY IF EXISTS "GoCat privacy enforce video comments" ON public.comments;
CREATE POLICY "GoCat privacy enforce video comments"
ON public.comments AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM public.videos video WHERE video.id = comments.video_id)
);

DROP POLICY IF EXISTS "GoCat privacy enforce post comments" ON public.post_comments;
CREATE POLICY "GoCat privacy enforce post comments"
ON public.post_comments AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM public.posts post WHERE post.id = post_comments.post_id)
);

DROP POLICY IF EXISTS "GoCat privacy enforce video comment audience" ON public.comments;
CREATE POLICY "GoCat privacy enforce video comment audience"
ON public.comments AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())::text
  AND (
    parent_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.comments parent
      WHERE parent.id = comments.parent_id AND parent.video_id = comments.video_id
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.videos video
    JOIN public.users owner ON owner.id = video.owner_id
    WHERE video.id = comments.video_id
      AND (
        owner.id = (SELECT auth.uid())::text
        OR owner.allow_comments_from = 'everyone'
        OR (
          owner.allow_comments_from = 'followers'
          AND EXISTS (
            SELECT 1 FROM public.follows relation
            WHERE relation.follower_id = (SELECT auth.uid())::text
              AND relation.following_id = video.owner_id
          )
        )
      )
  )
);

DROP POLICY IF EXISTS "GoCat privacy enforce post comment audience" ON public.post_comments;
CREATE POLICY "GoCat privacy enforce post comment audience"
ON public.post_comments AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND (
    parent_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.post_comments parent
      WHERE parent.id = post_comments.parent_id AND parent.post_id = post_comments.post_id
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.posts post
    JOIN public.users owner ON owner.id = post.user_id
    WHERE post.id = post_comments.post_id
      AND (
        owner.id = (SELECT auth.uid())::text
        OR owner.allow_comments_from = 'everyone'
        OR (
          owner.allow_comments_from = 'followers'
          AND EXISTS (
            SELECT 1 FROM public.follows relation
            WHERE relation.follower_id = (SELECT auth.uid())::text
              AND relation.following_id = post.user_id
          )
        )
      )
  )
);

DROP POLICY IF EXISTS "GoCat privacy enforce follow-list visibility" ON public.follows;
CREATE POLICY "GoCat privacy enforce follow-list visibility"
ON public.follows AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  follower_id = (SELECT auth.uid())::text
  OR following_id = (SELECT auth.uid())::text
  OR (
    COALESCE(
      (SELECT profile.show_following FROM public.users profile WHERE profile.id = follows.follower_id),
      true
    )
    AND COALESCE(
      (SELECT profile.show_followers FROM public.users profile WHERE profile.id = follows.following_id),
      true
    )
  )
);

DROP POLICY IF EXISTS "GoCat privacy enforce private follow approval" ON public.follows;
CREATE POLICY "GoCat privacy enforce private follow approval"
ON public.follows AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  follower_id = (SELECT auth.uid())::text
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.users target
      WHERE target.id = follows.following_id AND target.is_private = true
    )
    OR EXISTS (
      SELECT 1 FROM public.gocat_follow_requests request
      WHERE request.requester_id = follows.follower_id
        AND request.target_id = follows.following_id
        AND request.status = 'accepted'
    )
  )
);

DROP POLICY IF EXISTS "GoCat privacy enforce active story audience" ON public.stories;
CREATE POLICY "GoCat privacy enforce active story audience"
ON public.stories AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  expires_at > now()
  AND private.gocat_story_owner_is_active(user_id)
  AND (
    user_id = (SELECT auth.uid())::text
    OR NOT COALESCE(
      (SELECT profile.is_private FROM public.users profile WHERE profile.id = stories.user_id),
      false
    )
    OR EXISTS (
      SELECT 1 FROM public.follows relation
      WHERE relation.follower_id = (SELECT auth.uid())::text
        AND relation.following_id = stories.user_id
    )
  )
);

DROP POLICY IF EXISTS "GoCat privacy enforce read receipt preference" ON public.messages;
CREATE POLICY "GoCat privacy enforce read receipt preference"
ON public.messages AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  recipient_id = (SELECT auth.uid())::text
  AND COALESCE(
    (SELECT profile.send_read_receipts FROM public.users profile WHERE profile.id = (SELECT auth.uid())::text),
    true
  )
)
WITH CHECK (
  recipient_id = (SELECT auth.uid())::text
  AND COALESCE(
    (SELECT profile.send_read_receipts FROM public.users profile WHERE profile.id = (SELECT auth.uid())::text),
    true
  )
);
