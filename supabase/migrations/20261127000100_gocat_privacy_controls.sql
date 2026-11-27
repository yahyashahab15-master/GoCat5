-- GoCat account, content and interaction privacy controls.
-- These rules are enforced in Supabase, not only by the browser UI.

alter table public.users
  add column if not exists is_private boolean not null default false,
  add column if not exists show_followers boolean not null default true,
  add column if not exists show_following boolean not null default true,
  add column if not exists allow_messages_from text not null default 'mutuals',
  add column if not exists allow_comments_from text not null default 'everyone',
  add column if not exists show_activity_status boolean not null default true,
  add column if not exists send_read_receipts boolean not null default true,
  add column if not exists account_discoverable boolean not null default true,
  add column if not exists default_video_visibility text not null default 'public';

alter table public.users
  drop constraint if exists users_allow_messages_from_check,
  add constraint users_allow_messages_from_check
    check (allow_messages_from in ('everyone','followers','mutuals','nobody')),
  drop constraint if exists users_allow_comments_from_check,
  add constraint users_allow_comments_from_check
    check (allow_comments_from in ('everyone','followers','nobody')),
  drop constraint if exists users_default_video_visibility_check,
  add constraint users_default_video_visibility_check
    check (default_video_visibility in ('public','followers','private'));

grant select (is_private, show_followers, show_following, allow_messages_from,
  allow_comments_from, show_activity_status, send_read_receipts,
  account_discoverable, default_video_visibility)
on public.users to anon, authenticated;
grant update (is_private, show_followers, show_following, allow_messages_from,
  allow_comments_from, show_activity_status, send_read_receipts,
  account_discoverable, default_video_visibility)
on public.users to authenticated;

alter table public.videos add column if not exists visibility text not null default 'public';
alter table public.videos drop constraint if exists videos_visibility_check;
alter table public.videos add constraint videos_visibility_check
  check (visibility in ('public','followers','private'));

alter table public.posts add column if not exists visibility text not null default 'public';
alter table public.posts drop constraint if exists posts_visibility_check;
alter table public.posts add constraint posts_visibility_check
  check (visibility in ('public','followers','private'));

create index if not exists follows_following_id_privacy_idx on public.follows(following_id);
create index if not exists videos_owner_visibility_idx on public.videos(owner_id, visibility);
create index if not exists posts_user_visibility_idx on public.posts(user_id, visibility);

create table if not exists public.gocat_follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id text not null references public.users(id) on delete cascade,
  target_id text not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (requester_id, target_id),
  check (requester_id <> target_id)
);
create index if not exists gocat_follow_requests_target_status_idx
  on public.gocat_follow_requests(target_id, status, created_at desc);
alter table public.gocat_follow_requests enable row level security;
revoke all on public.gocat_follow_requests from anon;
grant select, insert, update, delete on public.gocat_follow_requests to authenticated;

drop policy if exists "GoCat follow requests are visible to their two users" on public.gocat_follow_requests;
create policy "GoCat follow requests are visible to their two users"
on public.gocat_follow_requests for select to authenticated
using (requester_id = (select auth.uid())::text or target_id = (select auth.uid())::text);

drop policy if exists "GoCat users can request to follow private accounts" on public.gocat_follow_requests;
create policy "GoCat users can request to follow private accounts"
on public.gocat_follow_requests for insert to authenticated
with check (
  requester_id = (select auth.uid())::text
  and exists (select 1 from public.users target
    where target.id = target_id and target.is_private = true)
);

drop policy if exists "GoCat target can respond to follow requests" on public.gocat_follow_requests;
create policy "GoCat target can respond to follow requests"
on public.gocat_follow_requests for update to authenticated
using (target_id = (select auth.uid())::text and status = 'pending')
with check (target_id = (select auth.uid())::text and status in ('accepted','declined'));

drop policy if exists "GoCat either user can cancel a follow request" on public.gocat_follow_requests;
create policy "GoCat either user can cancel a follow request"
on public.gocat_follow_requests for delete to authenticated
using (requester_id = (select auth.uid())::text or target_id = (select auth.uid())::text);

drop policy if exists "GoCat private account follow gate" on public.follows;
create policy "GoCat private account follow gate"
on public.follows as restrictive for insert to authenticated
with check (
  follower_id = (select auth.uid())::text
  and (
    not exists (select 1 from public.users target
      where target.id = following_id and target.is_private = true)
    or exists (select 1 from public.gocat_follow_requests request
      where request.requester_id = follower_id
        and request.target_id = following_id
        and request.status = 'accepted')
  )
);

drop policy if exists "GoCat follower-list privacy gate" on public.follows;
create policy "GoCat follower-list privacy gate"
on public.follows as restrictive for select to anon, authenticated
using (
  follower_id = (select auth.uid())::text
  or following_id = (select auth.uid())::text
  or (
    coalesce((select profile.show_following from public.users profile where profile.id = follower_id), true)
    and coalesce((select profile.show_followers from public.users profile where profile.id = following_id), true)
  )
);

drop policy if exists "GoCat video account and item privacy" on public.videos;
create policy "GoCat video account and item privacy"
on public.videos as restrictive for select to anon, authenticated
using (
  owner_id = (select auth.uid())::text
  or (
    visibility = 'public'
    and not coalesce((select profile.is_private from public.users profile where profile.id = owner_id), false)
  )
  or (
    visibility in ('public','followers')
    and exists (select 1 from public.follows relation
      where relation.follower_id = (select auth.uid())::text
        and relation.following_id = owner_id)
  )
);

drop policy if exists "GoCat post account and item privacy" on public.posts;
create policy "GoCat post account and item privacy"
on public.posts as restrictive for select to anon, authenticated
using (
  user_id = (select auth.uid())::text
  or (
    visibility = 'public'
    and not coalesce((select profile.is_private from public.users profile where profile.id = user_id), false)
  )
  or (
    visibility in ('public','followers')
    and exists (select 1 from public.follows relation
      where relation.follower_id = (select auth.uid())::text
        and relation.following_id = user_id)
  )
);

drop policy if exists "GoCat comments follow video visibility" on public.comments;
create policy "GoCat comments follow video visibility"
on public.comments as restrictive for select to anon, authenticated
using (exists (select 1 from public.videos video where video.id = video_id));

drop policy if exists "GoCat post comments follow post visibility" on public.post_comments;
create policy "GoCat post comments follow post visibility"
on public.post_comments as restrictive for select to anon, authenticated
using (exists (select 1 from public.posts post where post.id = post_id));

drop policy if exists "GoCat video comments audience" on public.comments;
create policy "GoCat video comments audience"
on public.comments as restrictive for insert to authenticated
with check (exists (
  select 1 from public.videos video
  join public.users owner on owner.id = video.owner_id
  where video.id = video_id and (
    owner.allow_comments_from = 'everyone'
    or (owner.allow_comments_from = 'followers' and exists (
      select 1 from public.follows relation
      where relation.follower_id = (select auth.uid())::text
        and relation.following_id = video.owner_id))
    or video.owner_id = (select auth.uid())::text
  )
));

drop policy if exists "GoCat post comments audience" on public.post_comments;
create policy "GoCat post comments audience"
on public.post_comments as restrictive for insert to authenticated
with check (exists (
  select 1 from public.posts post
  join public.users owner on owner.id = post.user_id
  where post.id = post_id and (
    owner.allow_comments_from = 'everyone'
    or (owner.allow_comments_from = 'followers' and exists (
      select 1 from public.follows relation
      where relation.follower_id = (select auth.uid())::text
        and relation.following_id = post.user_id))
    or post.user_id = (select auth.uid())::text
  )
));

drop policy if exists "Send to mutual followers" on public.messages;
drop policy if exists "GoCat message recipient audience" on public.messages;
create policy "GoCat message recipient audience"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())::text
  and exists (select 1 from public.users recipient
    where recipient.id = recipient_id
      and (
        recipient.allow_messages_from = 'everyone'
        or (recipient.allow_messages_from = 'followers' and exists (
          select 1 from public.follows relation
          where relation.follower_id = sender_id and relation.following_id = recipient_id))
        or (recipient.allow_messages_from = 'mutuals'
          and public.are_mutual_followers(sender_id, recipient_id))
      ))
);

drop policy if exists "GoCat message read receipt preference" on public.messages;
create policy "GoCat message read receipt preference"
on public.messages as restrictive for update to authenticated
using (
  recipient_id = (select auth.uid())::text
  and coalesce((select profile.send_read_receipts from public.users profile
    where profile.id = (select auth.uid())::text), true)
)
with check (
  recipient_id = (select auth.uid())::text
  and coalesce((select profile.send_read_receipts from public.users profile
    where profile.id = (select auth.uid())::text), true)
);

create or replace function public.gocat_respond_follow_request(p_request_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_row record;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to respond to follow requests';
  end if;
  update public.gocat_follow_requests
     set status = case when p_accept then 'accepted' else 'declined' end
   where id = p_request_id
     and target_id = (select auth.uid())::text
     and status = 'pending'
  returning requester_id, target_id into request_row;
  if not found then return false; end if;
  if p_accept then
    insert into public.follows (follower_id, following_id)
    values (request_row.requester_id, request_row.target_id)
    on conflict (follower_id, following_id) do nothing;
  end if;
  return true;
end;
$function$;
revoke all on function public.gocat_respond_follow_request(uuid, boolean) from public, anon;
grant execute on function public.gocat_respond_follow_request(uuid, boolean) to authenticated;

drop policy if exists "GoCat private account story visibility" on public.stories;
create policy "GoCat private account story visibility"
on public.stories as restrictive for select to anon, authenticated
using (
  user_id = (select auth.uid())::text
  or not coalesce((select profile.is_private from public.users profile where profile.id = user_id), false)
  or exists (select 1 from public.follows relation
    where relation.follower_id = (select auth.uid())::text
      and relation.following_id = user_id)
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('gocat-private-videos', 'gocat-private-videos', false, 524288000)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "GoCat upload private videos" on storage.objects;
create policy "GoCat upload private videos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'gocat-private-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.is_gocat_banned()
);

drop policy if exists "GoCat read private videos by item access" on storage.objects;
create policy "GoCat read private videos by item access"
on storage.objects for select to authenticated
using (
  bucket_id = 'gocat-private-videos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.videos video
      where video.storage_path = name or video.thumbnail_path = name)
  )
);

drop policy if exists "GoCat delete own private videos" on storage.objects;
create policy "GoCat delete own private videos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'gocat-private-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
